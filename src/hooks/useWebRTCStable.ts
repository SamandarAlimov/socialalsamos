import { useCallback, useEffect, useRef, useState } from "react";
import { getIceServers } from "@/lib/iceServers";
import {
  attachStablePeerMedia,
  replaceStablePeerTrack,
  type PeerMediaSenders,
} from "@/lib/webrtcStableMedia";
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";

interface Participant {
  id: string;
  stream: MediaStream | null;
  isMuted: boolean;
  isVideoOn: boolean;
  isScreenSharing: boolean;
  isHandRaised: boolean;
}

interface ConnectionQuality {
  bitrate: number;
  packetLoss: number;
  latency: number;
  quality: "excellent" | "good" | "poor" | "disconnected";
}

type SignalPayload = {
  from: string;
  to?: string;
  signalId?: string;
  sdp?: RTCSessionDescriptionInit;
  candidate?: RTCIceCandidateInit;
  mediaState?: {
    isMuted: boolean;
    isVideoOn: boolean;
    isScreenSharing: boolean;
    isHandRaised: boolean;
  };
};

type PersistedSignalType = "offer" | "answer" | "ice" | "leave";
type BroadcastSignalType = PersistedSignalType | "media";

type PersistedSignalRow = {
  id: string;
  sender_id: string;
  target_user_id: string | null;
  type: string;
  payload: Json;
  created_at?: string;
};

const PEER_CONFIG: RTCConfiguration = {
  iceServers: getIceServers(),
};

const QUALITY_CHECK_INTERVAL = 5000;
const MAX_SIGNALING_RECONNECT_ATTEMPTS = 8;
const MAX_SIGNALING_RECONNECT_DELAY = 15000;
const MAX_ICE_RESTART_ATTEMPTS = 4;
const SIGNAL_DEDUPE_LIMIT = 2000;
// Persisted signaling exists only as a short delivery safety net. Replaying an
// old offer/answer generation into a newly-created RTCPeerConnection is unsafe.
const SIGNAL_BACKLOG_WINDOW_MS = 120_000;

function emptyQuality(): ConnectionQuality {
  return { bitrate: 0, packetLoss: 0, latency: 0, quality: "disconnected" };
}

function isMLineOrderError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? "");
  return /m-lines?.*order|order of m-lines/i.test(message);
}

export function useWebRTC(roomId: string | null) {
  const { user } = useAuth();
  const { toast } = useToast();

  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [screenStream, setScreenStream] = useState<MediaStream | null>(null);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isReconnecting, setIsReconnecting] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOn, setIsVideoOn] = useState(true);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [isHandRaised, setIsHandRaised] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [connectionQuality, setConnectionQuality] = useState<ConnectionQuality>(emptyQuality);

  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const peerConnectionsRef = useRef<Map<string, RTCPeerConnection>>(new Map());
  const peerSendersRef = useRef<Map<string, PeerMediaSenders>>(new Map());
  const remoteStreamsRef = useRef<Map<string, MediaStream>>(new Map());
  const pendingCandidatesRef = useRef<Map<string, RTCIceCandidateInit[]>>(new Map());

  const localStreamRef = useRef<MediaStream | null>(null);
  const screenStreamRef = useRef<MediaStream | null>(null);
  const currentRoomRef = useRef<string | null>(null);
  const leavingRoomRef = useRef(false);
  const joiningRoomRef = useRef<Promise<void> | null>(null);
  const backlogSinceRef = useRef<string | null>(null);

  const qualityIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const qualityPreviousRef = useRef<Map<string, { bytes: number; at: number }>>(new Map());
  const reconnectTimersRef = useRef<Map<string, number>>(new Map());
  const restartAttemptsRef = useRef<Map<string, number>>(new Map());
  const channelReconnectAttemptRef = useRef(0);
  const channelReconnectTimerRef = useRef<number | null>(null);
  const seenSignalIdsRef = useRef<Set<string>>(new Set());

  // Perfect-negotiation state, isolated per peer.
  const makingOfferRef = useRef<Map<string, boolean>>(new Map());
  const ignoreOfferRef = useRef<Map<string, boolean>>(new Map());
  const isSettingRemoteAnswerPendingRef = useRef<Map<string, boolean>>(new Map());
  const negotiationQueueRef = useRef<Map<string, Promise<void>>>(new Map());
  const renegotiateAfterStableRef = useRef<Map<string, boolean>>(new Map());
  const initialOfferAllowedRef = useRef<Map<string, boolean>>(new Map());

  const callStartedStampedRef = useRef(false);

  const stampCallStartedAt = useCallback(async () => {
    if (!roomId || callStartedStampedRef.current) return;
    callStartedStampedRef.current = true;
    try {
      await supabase
        .from("video_calls")
        .update({ started_at: new Date().toISOString() })
        .eq("id", roomId)
        .is("started_at", null);
    } catch {
      // The media path must not fail because a cosmetic timer stamp failed.
    }
  }, [roomId]);

  const calculateQuality = useCallback(
    (bitrate: number, packetLoss: number, latency: number): ConnectionQuality["quality"] => {
      if (bitrate === 0) return "disconnected";
      if (packetLoss < 1 && latency < 100 && bitrate > 500_000) return "excellent";
      if (packetLoss < 5 && latency < 200 && bitrate > 200_000) return "good";
      return "poor";
    },
    [],
  );

  const stopQualityMonitoring = useCallback(() => {
    if (qualityIntervalRef.current) {
      clearInterval(qualityIntervalRef.current);
      qualityIntervalRef.current = null;
    }
    qualityPreviousRef.current.clear();
  }, []);

  const startQualityMonitoring = useCallback(() => {
    if (qualityIntervalRef.current) return;

    const collect = async () => {
      const peers = Array.from(peerConnectionsRef.current.entries()).filter(
        ([, pc]) => pc.connectionState !== "closed",
      );
      if (peers.length === 0) {
        setConnectionQuality(emptyQuality());
        return;
      }

      let totalBitrate = 0;
      let totalPacketLoss = 0;
      let totalLatency = 0;
      let latencySamples = 0;
      let lossSamples = 0;

      for (const [peerId, pc] of peers) {
        try {
          const stats = await pc.getStats();
          let bytes = 0;
          let packetsLost = 0;
          let packetsTotal = 0;

          stats.forEach((report) => {
            const row = report as RTCStats & Record<string, unknown>;
            if (
              row.type === "candidate-pair" &&
              row.state === "succeeded" &&
              typeof row.currentRoundTripTime === "number"
            ) {
              totalLatency += row.currentRoundTripTime * 1000;
              latencySamples += 1;
            }

            if ((row.type === "outbound-rtp" || row.type === "inbound-rtp") && !row.isRemote) {
              bytes += Number(row.bytesSent ?? row.bytesReceived ?? 0);
              packetsLost += Math.max(0, Number(row.packetsLost ?? 0));
              packetsTotal += Math.max(0, Number(row.packetsSent ?? row.packetsReceived ?? 0));
            }
          });

          const now = Date.now();
          const previous = qualityPreviousRef.current.get(peerId);
          if (previous && now > previous.at && bytes >= previous.bytes) {
            totalBitrate += ((bytes - previous.bytes) * 8 * 1000) / (now - previous.at);
          }
          qualityPreviousRef.current.set(peerId, { bytes, at: now });

          if (packetsTotal > 0) {
            totalPacketLoss += (packetsLost / (packetsTotal + packetsLost)) * 100;
            lossSamples += 1;
          }
        } catch {
          // One broken stats report must not interrupt the call.
        }
      }

      const latency = latencySamples ? totalLatency / latencySamples : 0;
      const packetLoss = lossSamples ? totalPacketLoss / lossSamples : 0;
      const bitrate = peers.length ? totalBitrate / peers.length : 0;
      setConnectionQuality({
        bitrate,
        packetLoss,
        latency,
        quality: calculateQuality(bitrate, packetLoss, latency),
      });
    };

    void collect();
    qualityIntervalRef.current = setInterval(collect, QUALITY_CHECK_INTERVAL);
  }, [calculateQuality]);

  const isPoliteForPeer = useCallback(
    (peerId: string) => !user?.id || user.id.localeCompare(peerId) < 0,
    [user?.id],
  );

  const shouldInitiatePeer = useCallback(
    (peerId: string) => Boolean(user?.id && user.id.localeCompare(peerId) < 0),
    [user?.id],
  );

  const markSignalSeen = useCallback((signalId?: string | null) => {
    if (!signalId) return false;
    if (seenSignalIdsRef.current.has(signalId)) return true;
    seenSignalIdsRef.current.add(signalId);
    if (seenSignalIdsRef.current.size > SIGNAL_DEDUPE_LIMIT) {
      const oldest = seenSignalIdsRef.current.values().next().value as string | undefined;
      if (oldest) seenSignalIdsRef.current.delete(oldest);
    }
    return false;
  }, []);

  const persistSignal = useCallback(
    async (event: PersistedSignalType, payload: SignalPayload) => {
      if (!roomId || !user?.id) return;
      const { error: persistError } = await supabase.from("call_signals").insert({
        call_id: roomId,
        sender_id: user.id,
        target_user_id: payload.to ?? null,
        type: event,
        payload: payload as unknown as Json,
      });
      if (persistError) console.warn("[WebRTC] persistSignal failed", persistError);
    },
    [roomId, user?.id],
  );

  const sendSignal = useCallback(
    async (event: BroadcastSignalType, payload: SignalPayload) => {
      const frame: SignalPayload =
        event === "media"
          ? payload
          : {
              ...payload,
              signalId:
                payload.signalId ||
                (typeof crypto !== "undefined" && "randomUUID" in crypto
                  ? crypto.randomUUID()
                  : `${Date.now()}-${Math.random().toString(36).slice(2)}`),
            };

      const channel = channelRef.current;
      if (channel) {
        const status = await channel.send({ type: "broadcast", event, payload: frame });
        if (status !== "ok" && !leavingRoomRef.current) {
          console.warn("[WebRTC] broadcast signal failed", event, status);
        }
      }

      if (event !== "media") void persistSignal(event, frame);
    },
    [persistSignal],
  );

  const enqueuePeerNegotiation = useCallback(
    (peerId: string, task: () => Promise<void>) => {
      const previous = negotiationQueueRef.current.get(peerId) ?? Promise.resolve();
      const next = previous.catch(() => undefined).then(task);
      negotiationQueueRef.current.set(peerId, next);
      void next.finally(() => {
        if (negotiationQueueRef.current.get(peerId) === next) {
          negotiationQueueRef.current.delete(peerId);
        }
      });
      return next;
    },
    [],
  );

  const closePeer = useCallback((peerId: string) => {
    const timer = reconnectTimersRef.current.get(peerId);
    if (timer) window.clearTimeout(timer);
    reconnectTimersRef.current.delete(peerId);
    restartAttemptsRef.current.delete(peerId);

    const pc = peerConnectionsRef.current.get(peerId);
    if (pc) {
      pc.onnegotiationneeded = null;
      pc.onicecandidate = null;
      pc.ontrack = null;
      pc.onconnectionstatechange = null;
      pc.oniceconnectionstatechange = null;
      pc.onsignalingstatechange = null;
      pc.close();
    }

    peerConnectionsRef.current.delete(peerId);
    peerSendersRef.current.delete(peerId);
    remoteStreamsRef.current.delete(peerId);
    pendingCandidatesRef.current.delete(peerId);
    makingOfferRef.current.delete(peerId);
    ignoreOfferRef.current.delete(peerId);
    isSettingRemoteAnswerPendingRef.current.delete(peerId);
    negotiationQueueRef.current.delete(peerId);
    renegotiateAfterStableRef.current.delete(peerId);
    initialOfferAllowedRef.current.delete(peerId);
    qualityPreviousRef.current.delete(peerId);

    setParticipants((previous) => previous.filter((participant) => participant.id !== peerId));
  }, []);

  const scheduleIceRestart = useCallback((peerId: string, pc: RTCPeerConnection) => {
    if (leavingRoomRef.current || pc.connectionState === "closed") return;

    const previousTimer = reconnectTimersRef.current.get(peerId);
    if (previousTimer) window.clearTimeout(previousTimer);

    const attempt = restartAttemptsRef.current.get(peerId) ?? 0;
    if (attempt >= MAX_ICE_RESTART_ATTEMPTS) {
      setError("Peer connection could not be restored");
      setIsReconnecting(false);
      return;
    }

    setIsReconnecting(true);
    const delay = Math.min(1000 * 2 ** attempt, 8000);
    const timer = window.setTimeout(() => {
      reconnectTimersRef.current.delete(peerId);
      if (pc.connectionState === "closed") return;
      if (
        pc.connectionState === "failed" ||
        pc.connectionState === "disconnected" ||
        pc.iceConnectionState === "failed" ||
        pc.iceConnectionState === "disconnected"
      ) {
        restartAttemptsRef.current.set(peerId, attempt + 1);
        if (pc.signalingState !== "stable") {
          renegotiateAfterStableRef.current.set(peerId, true);
          return;
        }
        try {
          pc.restartIce();
        } catch (restartError) {
          console.warn("[WebRTC] ICE restart failed", restartError);
        }
      }
    }, delay);
    reconnectTimersRef.current.set(peerId, timer);
  }, []);

  const negotiatePeer = useCallback(
    (peerId: string, pc: RTCPeerConnection) =>
      enqueuePeerNegotiation(peerId, async () => {
        if (!user?.id || pc.connectionState === "closed") return;

        // The answerer creates the same fixed transceivers but must not emit an
        // initial competing offer before the incoming offer is applied.
        if (!pc.remoteDescription && !initialOfferAllowedRef.current.get(peerId)) return;

        if (pc.signalingState !== "stable") {
          renegotiateAfterStableRef.current.set(peerId, true);
          return;
        }

        try {
          makingOfferRef.current.set(peerId, true);
          const offer = await pc.createOffer();
          if (String(pc.connectionState) === "closed" || String(pc.signalingState) !== "stable") {
            renegotiateAfterStableRef.current.set(peerId, true);
            return;
          }
          await pc.setLocalDescription(offer);
          await sendSignal("offer", {
            from: user.id,
            to: peerId,
            sdp: pc.localDescription ?? offer,
          });
        } catch (negotiationError) {
          if (String(pc.signalingState) !== "closed") {
            if (isMLineOrderError(negotiationError)) {
              console.error(
                "[WebRTC] invariant violation: stable audio/video m-line order was rejected",
                negotiationError,
              );
            } else {
              console.error("[WebRTC] negotiationneeded error", negotiationError);
            }
          }
        } finally {
          makingOfferRef.current.set(peerId, false);
        }
      }),
    [enqueuePeerNegotiation, sendSignal, user?.id],
  );

  const ensurePeerConnection = useCallback(
    (peerId: string, stream: MediaStream, allowInitialOffer: boolean) => {
      const existing = peerConnectionsRef.current.get(peerId);
      if (existing && existing.connectionState !== "closed") {
        if (allowInitialOffer) initialOfferAllowedRef.current.set(peerId, true);
        return existing;
      }

      const pc = new RTCPeerConnection(PEER_CONFIG);
      peerConnectionsRef.current.set(peerId, pc);
      initialOfferAllowedRef.current.set(peerId, allowInitialOffer);
      makingOfferRef.current.set(peerId, false);
      ignoreOfferRef.current.set(peerId, false);
      isSettingRemoteAnswerPendingRef.current.set(peerId, false);

      pc.onnegotiationneeded = () => {
        void negotiatePeer(peerId, pc);
      };

      pc.onsignalingstatechange = () => {
        if (
          pc.signalingState === "stable" &&
          renegotiateAfterStableRef.current.get(peerId) &&
          pc.connectionState !== "closed"
        ) {
          renegotiateAfterStableRef.current.set(peerId, false);
          void negotiatePeer(peerId, pc);
        }
      };

      pc.onicecandidate = (event) => {
        if (!event.candidate || !user?.id) return;
        void sendSignal("ice", {
          from: user.id,
          to: peerId,
          candidate: event.candidate.toJSON(),
        });
      };

      pc.ontrack = (event) => {
        let remote = event.streams?.[0] ?? remoteStreamsRef.current.get(peerId) ?? null;
        if (!remote) {
          remote = new MediaStream();
          remoteStreamsRef.current.set(peerId, remote);
        }
        if (!event.streams?.[0] && !remote.getTracks().some((track) => track.id === event.track.id)) {
          remote.addTrack(event.track);
        }
        if (event.streams?.[0]) remoteStreamsRef.current.set(peerId, remote);

        setParticipants((previous) => {
          const current = previous.find((participant) => participant.id === peerId);
          if (current) {
            return previous.map((participant) =>
              participant.id === peerId ? { ...participant, stream: remote } : participant,
            );
          }
          return [
            ...previous,
            {
              id: peerId,
              stream: remote,
              isMuted: false,
              isVideoOn: true,
              isScreenSharing: false,
              isHandRaised: false,
            },
          ];
        });
      };

      pc.onconnectionstatechange = () => {
        if (pc.connectionState === "connected") {
          const timer = reconnectTimersRef.current.get(peerId);
          if (timer) window.clearTimeout(timer);
          reconnectTimersRef.current.delete(peerId);
          restartAttemptsRef.current.delete(peerId);
          setIsConnected(true);
          setIsReconnecting(false);
          setError(null);
          void stampCallStartedAt();
          return;
        }

        if (pc.connectionState === "failed" || pc.connectionState === "disconnected") {
          scheduleIceRestart(peerId, pc);
        }
      };

      pc.oniceconnectionstatechange = () => {
        if (pc.iceConnectionState === "connected" || pc.iceConnectionState === "completed") {
          setIsReconnecting(false);
          return;
        }
        if (pc.iceConnectionState === "failed" || pc.iceConnectionState === "disconnected") {
          scheduleIceRestart(peerId, pc);
        }
      };

      // Critical invariant: every peer owns exactly two transceivers, always in
      // audio -> video order. No addTrack()/addTransceiver() is allowed later.
      peerSendersRef.current.set(peerId, attachStablePeerMedia(pc, stream));
      return pc;
    },
    [negotiatePeer, scheduleIceRestart, sendSignal, stampCallStartedAt, user?.id],
  );

  const flushPendingCandidates = useCallback(async (peerId: string, pc: RTCPeerConnection) => {
    const pending = pendingCandidatesRef.current.get(peerId) ?? [];
    pendingCandidatesRef.current.delete(peerId);
    for (const candidate of pending) {
      try {
        await pc.addIceCandidate(new RTCIceCandidate(candidate));
      } catch (candidateError) {
        if (!ignoreOfferRef.current.get(peerId)) {
          console.debug("[WebRTC] stale ICE candidate discarded", candidateError);
        }
      }
    }
  }, []);

  const handleOffer = useCallback(
    async (from: string, sdp: RTCSessionDescriptionInit) => {
      const stream = localStreamRef.current;
      if (!stream || !user?.id) return;

      const pc = ensurePeerConnection(from, stream, false);
      await enqueuePeerNegotiation(from, async () => {
        if (pc.connectionState === "closed") return;

        const makingOffer = makingOfferRef.current.get(from) ?? false;
        const settingRemoteAnswer = isSettingRemoteAnswerPendingRef.current.get(from) ?? false;
        const readyForOffer = !makingOffer && (pc.signalingState === "stable" || settingRemoteAnswer);
        const offerCollision = !readyForOffer;
        const polite = isPoliteForPeer(from);
        const shouldIgnore = !polite && offerCollision;

        ignoreOfferRef.current.set(from, shouldIgnore);
        if (shouldIgnore) return;

        try {
          if (offerCollision && pc.signalingState !== "stable") {
            await pc.setLocalDescription({ type: "rollback" });
          }

          await pc.setRemoteDescription(new RTCSessionDescription(sdp));
          ignoreOfferRef.current.set(from, false);
          await flushPendingCandidates(from, pc);

          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          await sendSignal("answer", {
            from: user.id,
            to: from,
            sdp: pc.localDescription ?? answer,
          });
        } catch (offerError) {
          console.error("[WebRTC] handleOffer error", offerError);
        }
      });
    },
    [
      enqueuePeerNegotiation,
      ensurePeerConnection,
      flushPendingCandidates,
      isPoliteForPeer,
      sendSignal,
      user?.id,
    ],
  );

  const handleAnswer = useCallback(
    async (from: string, sdp: RTCSessionDescriptionInit) => {
      const pc = peerConnectionsRef.current.get(from);
      if (!pc) return;

      await enqueuePeerNegotiation(from, async () => {
        if (pc.connectionState === "closed") return;
        if (pc.signalingState !== "have-local-offer") {
          console.debug("[WebRTC] stale answer ignored", from, pc.signalingState);
          return;
        }

        try {
          isSettingRemoteAnswerPendingRef.current.set(from, true);
          await pc.setRemoteDescription(new RTCSessionDescription(sdp));
          ignoreOfferRef.current.set(from, false);
          await flushPendingCandidates(from, pc);
        } catch (answerError) {
          console.error("[WebRTC] handleAnswer error", answerError);
        } finally {
          isSettingRemoteAnswerPendingRef.current.set(from, false);
        }
      });
    },
    [enqueuePeerNegotiation, flushPendingCandidates],
  );

  const handleIce = useCallback(async (from: string, candidate: RTCIceCandidateInit) => {
    const pc = peerConnectionsRef.current.get(from);
    if (!pc || ignoreOfferRef.current.get(from)) return;

    if (!pc.remoteDescription) {
      const pending = pendingCandidatesRef.current.get(from) ?? [];
      pending.push(candidate);
      pendingCandidatesRef.current.set(from, pending);
      return;
    }

    try {
      await pc.addIceCandidate(new RTCIceCandidate(candidate));
    } catch (candidateError) {
      if (!ignoreOfferRef.current.get(from)) {
        console.debug("[WebRTC] stale ICE candidate discarded", candidateError);
      }
    }
  }, []);

  const startLocalStream = useCallback(
    async (video = true, audio = true): Promise<MediaStream | null> => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: video
            ? {
                width: { ideal: 1280, max: 1920 },
                height: { ideal: 720, max: 1080 },
                frameRate: { ideal: 30, max: 60 },
                facingMode: "user",
              }
            : false,
          audio: audio
            ? {
                echoCancellation: true,
                noiseSuppression: true,
                autoGainControl: true,
                sampleRate: 48_000,
              }
            : false,
        });

        localStreamRef.current?.getTracks().forEach((track) => track.stop());
        localStreamRef.current = stream;
        setLocalStream(stream);
        setIsVideoOn(video);
        setIsMuted(false);
        return stream;
      } catch (mediaError) {
        console.error("[WebRTC] getUserMedia error", mediaError);
        const name = mediaError instanceof DOMException ? mediaError.name : "";
        let message = "Failed to access camera/microphone.";
        if (name === "NotAllowedError") message = "Camera/microphone access denied. Please allow permissions.";
        if (name === "NotFoundError") message = "No camera/microphone found.";
        if (name === "NotReadableError") message = "Camera/microphone is in use by another application.";
        setError(message);
        toast({ title: "Media Error", description: message, variant: "destructive" });
        return null;
      }
    },
    [toast],
  );

  const handlePersistedSignal = useCallback(
    async (row: PersistedSignalRow) => {
      if (!user?.id || row.sender_id === user.id) return;
      if (row.target_user_id && row.target_user_id !== user.id) return;

      const payload = (row.payload || {}) as unknown as SignalPayload;
      if (markSignalSeen(payload.signalId || row.id)) return;
      if (row.type === "offer" && payload.sdp) await handleOffer(row.sender_id, payload.sdp);
      if (row.type === "answer" && payload.sdp) await handleAnswer(row.sender_id, payload.sdp);
      if (row.type === "ice" && payload.candidate) await handleIce(row.sender_id, payload.candidate);
      if (row.type === "leave") closePeer(row.sender_id);
    },
    [closePeer, handleAnswer, handleIce, handleOffer, markSignalSeen, user?.id],
  );

  const joinRoom = useCallback(
    async (video = true) => {
      if (!roomId || !user?.id) return;
      if (currentRoomRef.current === roomId && channelRef.current) return;
      if (joiningRoomRef.current) return joiningRoomRef.current;

      const run = (async () => {
        leavingRoomRef.current = false;
        currentRoomRef.current = roomId;
        callStartedStampedRef.current = false;
        channelReconnectAttemptRef.current = 0;
        backlogSinceRef.current = new Date(Date.now() - SIGNAL_BACKLOG_WINDOW_MS).toISOString();
        setIsConnecting(true);
        setIsReconnecting(false);
        setError(null);

        const stream = await startLocalStream(video, true);
        if (!stream) {
          currentRoomRef.current = null;
          setIsConnecting(false);
          return;
        }

        if (channelReconnectTimerRef.current !== null) {
          window.clearTimeout(channelReconnectTimerRef.current);
          channelReconnectTimerRef.current = null;
        }
        if (channelRef.current) {
          await supabase.removeChannel(channelRef.current);
          channelRef.current = null;
        }

        const channel = supabase.channel(`webrtc:${roomId}`, {
          config: {
            presence: { key: user.id },
            broadcast: { self: false },
          },
        });
        channelRef.current = channel;

        const scheduleChannelReconnect = () => {
          if (leavingRoomRef.current || currentRoomRef.current !== roomId) return;
          if (channelReconnectTimerRef.current !== null) return;
          if (channelReconnectAttemptRef.current >= MAX_SIGNALING_RECONNECT_ATTEMPTS) {
            setIsReconnecting(false);
            setError("Signaling connection could not be restored");
            return;
          }

          channelReconnectAttemptRef.current += 1;
          const attempt = channelReconnectAttemptRef.current;
          const delay = Math.min(1000 * 2 ** (attempt - 1), MAX_SIGNALING_RECONNECT_DELAY);
          setIsReconnecting(true);
          console.warn(
            `[WebRTC] Realtime signaling retry ${attempt}/${MAX_SIGNALING_RECONNECT_ATTEMPTS} in ${delay}ms`,
          );

          channelReconnectTimerRef.current = window.setTimeout(() => {
            channelReconnectTimerRef.current = null;
            if (leavingRoomRef.current || currentRoomRef.current !== roomId) return;
            try {
              channel.subscribe(handleChannelStatus);
            } catch (subscribeError) {
              console.error("[WebRTC] signaling resubscribe failed", subscribeError);
              scheduleChannelReconnect();
            }
          }, delay);
        };

        const replayBacklog = async () => {
          let query = supabase
            .from("call_signals")
            .select("id, sender_id, target_user_id, type, payload, created_at")
            .eq("call_id", roomId)
            .neq("sender_id", user.id)
            .or(`target_user_id.is.null,target_user_id.eq.${user.id}`)
            .order("created_at", { ascending: true })
            .limit(300);
          if (backlogSinceRef.current) query = query.gte("created_at", backlogSinceRef.current);

          const { data: backlog, error: backlogError } = await query;
          if (backlogError || !backlog) return;
          for (const row of backlog) await handlePersistedSignal(row as PersistedSignalRow);
        };

        const handleChannelStatus = async (status: string) => {
          if (status === "SUBSCRIBED") {
            channelReconnectAttemptRef.current = 0;
            setIsConnecting(false);
            setIsReconnecting(false);
            setError(null);
            try {
              await channel.track({ online_at: new Date().toISOString() });
            } catch (trackError) {
              console.warn("[WebRTC] presence track failed", trackError);
            }
            await replayBacklog();
            startQualityMonitoring();
            return;
          }

          if (
            (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") &&
            !leavingRoomRef.current
          ) {
            setIsConnecting(false);
            setIsReconnecting(true);
            setError("Signaling connection error");
            scheduleChannelReconnect();
          }
        };

        channel
          .on("presence", { event: "sync" }, () => {
            const ids = Object.keys(channel.presenceState()).filter((id) => id !== user.id);
            setParticipants((previous) => {
              const known = new Set(previous.map((participant) => participant.id));
              const next = [...previous];
              for (const peerId of ids) {
                if (!known.has(peerId)) {
                  next.push({
                    id: peerId,
                    stream: null,
                    isMuted: false,
                    isVideoOn: true,
                    isScreenSharing: false,
                    isHandRaised: false,
                  });
                }
              }
              return next;
            });

            // Exactly one side initiates each peer pair. This removes initial
            // glare instead of merely trying to recover from it afterwards.
            for (const peerId of ids) {
              if (shouldInitiatePeer(peerId)) ensurePeerConnection(peerId, stream, true);
            }
          })
          .on("presence", { event: "leave" }, ({ key }) => {
            if (key && key !== user.id) closePeer(key);
          })
          .on("broadcast", { event: "offer" }, async ({ payload }) => {
            const frame = payload as SignalPayload;
            if (frame.to && frame.to !== user.id) return;
            if (frame.from === user.id || !frame.sdp || markSignalSeen(frame.signalId)) return;
            await handleOffer(frame.from, frame.sdp);
          })
          .on("broadcast", { event: "answer" }, async ({ payload }) => {
            const frame = payload as SignalPayload;
            if (frame.to && frame.to !== user.id) return;
            if (frame.from === user.id || !frame.sdp || markSignalSeen(frame.signalId)) return;
            await handleAnswer(frame.from, frame.sdp);
          })
          .on("broadcast", { event: "ice" }, async ({ payload }) => {
            const frame = payload as SignalPayload;
            if (frame.to && frame.to !== user.id) return;
            if (frame.from === user.id || !frame.candidate || markSignalSeen(frame.signalId)) return;
            await handleIce(frame.from, frame.candidate);
          })
          .on("broadcast", { event: "media" }, ({ payload }) => {
            const frame = payload as SignalPayload;
            if (frame.to && frame.to !== user.id) return;
            if (frame.from === user.id || !frame.mediaState) return;
            setParticipants((previous) =>
              previous.map((participant) =>
                participant.id === frame.from ? { ...participant, ...frame.mediaState } : participant,
              ),
            );
          })
          .on("broadcast", { event: "leave" }, ({ payload }) => {
            const frame = payload as SignalPayload;
            if (markSignalSeen(frame.signalId)) return;
            if (frame.from && frame.from !== user.id) closePeer(frame.from);
          })
          .on(
            "postgres_changes",
            {
              event: "INSERT",
              schema: "public",
              table: "call_signals",
              filter: `call_id=eq.${roomId}`,
            },
            async ({ new: row }) => {
              await handlePersistedSignal(row as unknown as PersistedSignalRow);
            },
          );

        channel.subscribe(handleChannelStatus);
      })();

      joiningRoomRef.current = run;
      try {
        await run;
      } finally {
        if (joiningRoomRef.current === run) joiningRoomRef.current = null;
      }
    },
    [
      closePeer,
      ensurePeerConnection,
      handleAnswer,
      handleIce,
      handleOffer,
      handlePersistedSignal,
      markSignalSeen,
      roomId,
      shouldInitiatePeer,
      startLocalStream,
      startQualityMonitoring,
      user?.id,
    ],
  );

  const leaveRoom = useCallback(() => {
    leavingRoomRef.current = true;
    joiningRoomRef.current = null;

    if (channelReconnectTimerRef.current !== null) {
      window.clearTimeout(channelReconnectTimerRef.current);
      channelReconnectTimerRef.current = null;
    }
    channelReconnectAttemptRef.current = 0;

    if (user?.id) void sendSignal("leave", { from: user.id });
    stopQualityMonitoring();

    reconnectTimersRef.current.forEach((timer) => window.clearTimeout(timer));
    reconnectTimersRef.current.clear();
    restartAttemptsRef.current.clear();

    peerConnectionsRef.current.forEach((pc) => pc.close());
    peerConnectionsRef.current.clear();
    peerSendersRef.current.clear();
    remoteStreamsRef.current.clear();
    pendingCandidatesRef.current.clear();
    makingOfferRef.current.clear();
    ignoreOfferRef.current.clear();
    isSettingRemoteAnswerPendingRef.current.clear();
    negotiationQueueRef.current.clear();
    renegotiateAfterStableRef.current.clear();
    initialOfferAllowedRef.current.clear();
    seenSignalIdsRef.current.clear();

    localStreamRef.current?.getTracks().forEach((track) => track.stop());
    screenStreamRef.current?.getTracks().forEach((track) => track.stop());
    localStreamRef.current = null;
    screenStreamRef.current = null;
    setLocalStream(null);
    setScreenStream(null);
    setParticipants([]);
    setIsConnected(false);
    setIsConnecting(false);
    setIsReconnecting(false);
    setIsMuted(false);
    setIsVideoOn(true);
    setIsScreenSharing(false);
    setIsHandRaised(false);
    setError(null);
    setConnectionQuality(emptyQuality());

    if (channelRef.current) {
      void supabase.removeChannel(channelRef.current);
      channelRef.current = null;
    }
    currentRoomRef.current = null;
    backlogSinceRef.current = null;
  }, [sendSignal, stopQualityMonitoring, user?.id]);

  const broadcastMediaState = useCallback(
    (next: SignalPayload["mediaState"]) => {
      if (!user?.id || !next) return;
      void sendSignal("media", { from: user.id, mediaState: next });
    },
    [sendSignal, user?.id],
  );

  const replaceTrackForAllPeers = useCallback(
    async (kind: "audio" | "video", track: MediaStreamTrack | null) => {
      await Promise.all(
        Array.from(peerSendersRef.current.values()).map((senders) =>
          replaceStablePeerTrack(senders, kind, track),
        ),
      );
    },
    [],
  );

  const toggleMute = useCallback(() => {
    const track = localStreamRef.current?.getAudioTracks()[0];
    if (!track) return;
    track.enabled = !track.enabled;
    const nextMuted = !track.enabled;
    setIsMuted(nextMuted);
    broadcastMediaState({ isMuted: nextMuted, isVideoOn, isScreenSharing, isHandRaised });
  }, [broadcastMediaState, isHandRaised, isScreenSharing, isVideoOn]);

  const toggleVideo = useCallback(() => {
    const track = localStreamRef.current?.getVideoTracks()[0];
    if (!track) return;
    track.enabled = !track.enabled;
    const nextVideo = track.enabled;
    setIsVideoOn(nextVideo);
    broadcastMediaState({ isMuted, isVideoOn: nextVideo, isScreenSharing, isHandRaised });
  }, [broadcastMediaState, isHandRaised, isMuted, isScreenSharing]);

  const restoreCameraAfterScreenShare = useCallback(async () => {
    const cameraTrack = localStreamRef.current?.getVideoTracks()[0] ?? null;
    await replaceTrackForAllPeers("video", cameraTrack);
    screenStreamRef.current = null;
    setScreenStream(null);
    setIsScreenSharing(false);
    broadcastMediaState({ isMuted, isVideoOn, isScreenSharing: false, isHandRaised });
  }, [broadcastMediaState, isHandRaised, isMuted, isVideoOn, replaceTrackForAllPeers]);

  const toggleScreenShare = useCallback(async () => {
    if (isScreenSharing && screenStreamRef.current) {
      screenStreamRef.current.getTracks().forEach((track) => track.stop());
      await restoreCameraAfterScreenShare();
      return;
    }

    try {
      const nextScreen = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
      const screenTrack = nextScreen.getVideoTracks()[0];
      if (!screenTrack) {
        nextScreen.getTracks().forEach((track) => track.stop());
        return;
      }

      screenStreamRef.current = nextScreen;
      setScreenStream(nextScreen);
      setIsScreenSharing(true);
      await replaceTrackForAllPeers("video", screenTrack);
      broadcastMediaState({ isMuted, isVideoOn, isScreenSharing: true, isHandRaised });

      screenTrack.onended = () => {
        if (screenStreamRef.current !== nextScreen) return;
        void restoreCameraAfterScreenShare();
      };
    } catch (screenError) {
      console.error("[WebRTC] screen share error", screenError);
    }
  }, [
    broadcastMediaState,
    isHandRaised,
    isMuted,
    isScreenSharing,
    isVideoOn,
    replaceTrackForAllPeers,
    restoreCameraAfterScreenShare,
  ]);

  const selectCamera = useCallback(
    async (deviceId: string): Promise<boolean> => {
      if (!localStreamRef.current || !deviceId) return false;
      try {
        const replacement = await navigator.mediaDevices.getUserMedia({
          video: {
            deviceId: { exact: deviceId },
            width: { ideal: 1280, max: 1920 },
            height: { ideal: 720, max: 1080 },
            frameRate: { ideal: 30, max: 60 },
          },
          audio: false,
        });
        const nextTrack = replacement.getVideoTracks()[0];
        if (!nextTrack) {
          replacement.getTracks().forEach((track) => track.stop());
          return false;
        }
        nextTrack.enabled = isVideoOn;

        if (!isScreenSharing) await replaceTrackForAllPeers("video", nextTrack);

        const previous = localStreamRef.current;
        const previousVideo = previous.getVideoTracks()[0];
        const nextStream = new MediaStream([...previous.getAudioTracks(), nextTrack]);
        previousVideo?.stop();
        localStreamRef.current = nextStream;
        setLocalStream(nextStream);
        return true;
      } catch (cameraError) {
        console.warn("[WebRTC] camera selection failed", cameraError);
        return false;
      }
    },
    [isScreenSharing, isVideoOn, replaceTrackForAllPeers],
  );

  const selectMicrophone = useCallback(
    async (deviceId: string): Promise<boolean> => {
      if (!localStreamRef.current || !deviceId) return false;
      try {
        const replacement = await navigator.mediaDevices.getUserMedia({
          video: false,
          audio: {
            deviceId: { exact: deviceId },
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
            sampleRate: 48_000,
          },
        });
        const nextTrack = replacement.getAudioTracks()[0];
        if (!nextTrack) {
          replacement.getTracks().forEach((track) => track.stop());
          return false;
        }
        nextTrack.enabled = !isMuted;
        await replaceTrackForAllPeers("audio", nextTrack);

        const previous = localStreamRef.current;
        const previousAudio = previous.getAudioTracks()[0];
        const nextStream = new MediaStream([...previous.getVideoTracks(), nextTrack]);
        previousAudio?.stop();
        localStreamRef.current = nextStream;
        setLocalStream(nextStream);
        return true;
      } catch (microphoneError) {
        console.warn("[WebRTC] microphone selection failed", microphoneError);
        return false;
      }
    },
    [isMuted, replaceTrackForAllPeers],
  );

  const switchCamera = useCallback(async (): Promise<boolean> => {
    if (!localStreamRef.current || !isVideoOn) return false;
    try {
      const devices = (await navigator.mediaDevices.enumerateDevices()).filter(
        (device) => device.kind === "videoinput",
      );
      if (devices.length < 2) return false;
      const currentTrack = localStreamRef.current.getVideoTracks()[0];
      const currentId = currentTrack?.getSettings().deviceId;
      const currentIndex = Math.max(0, devices.findIndex((device) => device.deviceId === currentId));
      return selectCamera(devices[(currentIndex + 1) % devices.length].deviceId);
    } catch (cameraError) {
      console.warn("[WebRTC] camera switch failed", cameraError);
      return false;
    }
  }, [isVideoOn, selectCamera]);

  const toggleHandRaise = useCallback(() => {
    const next = !isHandRaised;
    setIsHandRaised(next);
    broadcastMediaState({ isMuted, isVideoOn, isScreenSharing, isHandRaised: next });
  }, [broadcastMediaState, isHandRaised, isMuted, isScreenSharing, isVideoOn]);

  useEffect(() => {
    return () => {
      if (currentRoomRef.current) leaveRoom();
    };
  }, [leaveRoom]);

  return {
    localStream,
    screenStream,
    participants,
    isConnected,
    isConnecting,
    isReconnecting,
    isMuted,
    isVideoOn,
    isScreenSharing,
    isHandRaised,
    error,
    connectionQuality,
    joinRoom,
    leaveRoom,
    closePeer,
    toggleMute,
    toggleVideo,
    toggleScreenShare,
    selectCamera,
    selectMicrophone,
    switchCamera,
    toggleHandRaise,
  };
}

import { useCallback, useEffect, useRef, useState } from "react";
import { getIceServers, loadIceServers } from "@/lib/iceServers";
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

export type WebRTCTopology = "mesh" | "broadcast";

export interface UseWebRTCOptions {
  /**
   * mesh: every participant can publish and receives every other participant.
   * broadcast: host publishes to viewers; viewers only receive from the host.
   */
  topology?: WebRTCTopology;
  /** Required for broadcast topology. */
  hostId?: string | null;
  /**
   * Persist SDP/ICE in call_signals as a late-join/reconnect safety net.
   * Channel live rooms are ephemeral and intentionally disable persistence.
   */
  persistSignals?: boolean;
  /** Explicitly override whether this client sends microphone/camera media. */
  publishMedia?: boolean;
}

const DEFAULT_ICE_SERVERS = getIceServers();
const QUALITY_CHECK_INTERVAL = 5000;
const ICE_RESTART_LIMIT = 4;
const INITIAL_OFFER_KICK_MS = 120;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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

function makeSignalId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function useWebRTC(roomId: string | null, options: UseWebRTCOptions = {}) {
  const { user } = useAuth();
  const { toast } = useToast();

  const topology = options.topology ?? "mesh";
  const hostId = options.hostId ?? null;
  const persistSignalsEnabled = options.persistSignals ?? true;
  const canPublishMedia =
    options.publishMedia ?? (topology !== "broadcast" || (!!user?.id && user.id === hostId));

  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [screenStream, setScreenStream] = useState<MediaStream | null>(null);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isReconnecting, setIsReconnecting] = useState(false);
  const [isMuted, setIsMuted] = useState(!canPublishMedia);
  const [isVideoOn, setIsVideoOn] = useState(canPublishMedia);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [isHandRaised, setIsHandRaised] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [connectionQuality, setConnectionQuality] = useState<ConnectionQuality>({
    bitrate: 0,
    packetLoss: 0,
    latency: 0,
    quality: "disconnected",
  });

  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const peerConnectionsRef = useRef<Map<string, RTCPeerConnection>>(new Map());
  const remoteStreamsRef = useRef<Map<string, MediaStream>>(new Map());
  const pendingCandidatesRef = useRef<Map<string, RTCIceCandidateInit[]>>(new Map());
  const makingOfferRef = useRef<Map<string, boolean>>(new Map());
  const ignoreOfferRef = useRef<Map<string, boolean>>(new Map());
  const settingRemoteAnswerRef = useRef<Map<string, boolean>>(new Map());
  const negotiationQueueRef = useRef<Map<string, Promise<void>>>(new Map());
  const seenSignalIdsRef = useRef<Set<string>>(new Set());
  const restartAttemptsRef = useRef<Map<string, number>>(new Map());
  const reconnectTimersRef = useRef<Map<string, number>>(new Map());
  const initialOfferTimersRef = useRef<Map<string, number>>(new Map());
  const qualityPreviousRef = useRef<Map<string, { bytes: number; at: number }>>(new Map());
  const qualityIntervalRef = useRef<ReturnType<typeof window.setInterval> | null>(null);
  const currentRoomRef = useRef<string | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const screenStreamRef = useRef<MediaStream | null>(null);
  const leavingRoomRef = useRef(false);
  const iceServersRef = useRef<RTCIceServer[] | null>(null);
  const callStartedStampedRef = useRef(false);

  const shouldPersistSignals = useCallback(() => {
    return !!roomId && persistSignalsEnabled && UUID_RE.test(roomId);
  }, [persistSignalsEnabled, roomId]);

  const shouldConnectToPeer = useCallback(
    (peerId: string) => {
      if (!user?.id || peerId === user.id) return false;
      if (topology !== "broadcast") return true;
      if (!hostId) return false;
      if (user.id === hostId) return peerId !== hostId;
      return peerId === hostId;
    },
    [hostId, topology, user?.id]
  );

  const shouldInitiatePeer = useCallback(
    (peerId: string) => {
      if (!user?.id) return false;
      if (topology === "broadcast") return !!hostId && user.id === hostId;
      // This is the role used by the previously stable native transport:
      // exactly the lexicographically lower id starts the first offer.
      return user.id.localeCompare(peerId) < 0;
    },
    [hostId, topology, user?.id]
  );

  const isPoliteForPeer = useCallback(
    (peerId: string) => !shouldInitiatePeer(peerId),
    [shouldInitiatePeer]
  );

  const recomputeConnected = useCallback(() => {
    const connected = Array.from(peerConnectionsRef.current.values()).some(
      (pc) => pc.connectionState === "connected"
    );
    setIsConnected(connected);
    if (!connected && peerConnectionsRef.current.size === 0) {
      setConnectionQuality({ bitrate: 0, packetLoss: 0, latency: 0, quality: "disconnected" });
    }
  }, []);

  const stampCallStartedAt = useCallback(async () => {
    if (!roomId || !shouldPersistSignals() || callStartedStampedRef.current) return;
    callStartedStampedRef.current = true;
    try {
      await supabase
        .from("video_calls")
        .update({ started_at: new Date().toISOString() })
        .eq("id", roomId)
        .is("started_at", null);
    } catch {
      // Starting media must never depend on the timer write.
    }
  }, [roomId, shouldPersistSignals]);

  const markSignalSeen = useCallback((signalId?: string | null) => {
    if (!signalId) return false;
    if (seenSignalIdsRef.current.has(signalId)) return true;
    seenSignalIdsRef.current.add(signalId);
    if (seenSignalIdsRef.current.size > 2000) {
      const oldest = seenSignalIdsRef.current.values().next().value as string | undefined;
      if (oldest) seenSignalIdsRef.current.delete(oldest);
    }
    return false;
  }, []);

  const persistSignal = useCallback(
    async (event: "offer" | "answer" | "ice" | "leave", payload: SignalPayload) => {
      if (!roomId || !user?.id || !shouldPersistSignals()) return;
      const { error: persistError } = await supabase.from("call_signals").insert({
        call_id: roomId,
        sender_id: user.id,
        target_user_id: payload.to ?? null,
        type: event,
        payload: payload as unknown as Json,
      });
      if (persistError) console.warn("[WebRTC] call_signals persistence failed", persistError);
    },
    [roomId, shouldPersistSignals, user?.id]
  );

  const sendSignal = useCallback(
    async (event: "offer" | "answer" | "ice" | "media" | "leave", payload: SignalPayload) => {
      const frame: SignalPayload =
        event === "media" ? payload : { ...payload, signalId: payload.signalId ?? makeSignalId() };

      const channel = channelRef.current;
      if (channel) {
        try {
          const status = await channel.send({ type: "broadcast", event, payload: frame });
          if (status !== "ok" && !leavingRoomRef.current) {
            console.warn("[WebRTC] realtime signal send failed", event, status);
          }
        } catch (sendError) {
          if (!leavingRoomRef.current) console.warn("[WebRTC] realtime signal error", sendError);
        }
      }

      if (event !== "media") void persistSignal(event, frame);
    },
    [persistSignal]
  );

  const enqueuePeerNegotiation = useCallback((peerId: string, task: () => Promise<void>) => {
    const previous = negotiationQueueRef.current.get(peerId) ?? Promise.resolve();
    const next = previous.catch(() => undefined).then(task);
    negotiationQueueRef.current.set(peerId, next);
    void next.finally(() => {
      if (negotiationQueueRef.current.get(peerId) === next) negotiationQueueRef.current.delete(peerId);
    });
    return next;
  }, []);

  const closePeer = useCallback(
    (peerId: string) => {
      const initialTimer = initialOfferTimersRef.current.get(peerId);
      if (initialTimer) window.clearTimeout(initialTimer);
      initialOfferTimersRef.current.delete(peerId);

      const reconnectTimer = reconnectTimersRef.current.get(peerId);
      if (reconnectTimer) window.clearTimeout(reconnectTimer);
      reconnectTimersRef.current.delete(peerId);

      const pc = peerConnectionsRef.current.get(peerId);
      if (pc) {
        pc.onnegotiationneeded = null;
        pc.onicecandidate = null;
        pc.ontrack = null;
        pc.onconnectionstatechange = null;
        pc.oniceconnectionstatechange = null;
        pc.close();
      }

      peerConnectionsRef.current.delete(peerId);
      remoteStreamsRef.current.delete(peerId);
      pendingCandidatesRef.current.delete(peerId);
      makingOfferRef.current.delete(peerId);
      ignoreOfferRef.current.delete(peerId);
      settingRemoteAnswerRef.current.delete(peerId);
      negotiationQueueRef.current.delete(peerId);
      restartAttemptsRef.current.delete(peerId);
      qualityPreviousRef.current.delete(peerId);
      setParticipants((prev) => prev.filter((participant) => participant.id !== peerId));
      window.setTimeout(recomputeConnected, 0);
    },
    [recomputeConnected]
  );

  const negotiatePeer = useCallback(
    (peerId: string, pc: RTCPeerConnection, iceRestart = false) =>
      enqueuePeerNegotiation(peerId, async () => {
        if (!user?.id || leavingRoomRef.current || pc.connectionState === "closed") return;
        if (!shouldConnectToPeer(peerId)) return;
        if (pc.signalingState !== "stable") return;

        // Only one side starts the very first offer. After a connection exists,
        // either side may renegotiate (for example after restartIce()).
        if (!pc.currentRemoteDescription && !shouldInitiatePeer(peerId)) return;
        if (makingOfferRef.current.get(peerId)) return;

        try {
          makingOfferRef.current.set(peerId, true);
          const offer = await pc.createOffer(iceRestart ? { iceRestart: true } : undefined);
          if (pc.signalingState !== "stable") return;
          await pc.setLocalDescription(offer);
          if (!pc.localDescription) return;
          await sendSignal("offer", {
            from: user.id,
            to: peerId,
            sdp: pc.localDescription,
          });
        } catch (negotiationError) {
          if (!leavingRoomRef.current) console.error("[WebRTC] offer negotiation failed", negotiationError);
        } finally {
          makingOfferRef.current.set(peerId, false);
        }
      }),
    [enqueuePeerNegotiation, sendSignal, shouldConnectToPeer, shouldInitiatePeer, user?.id]
  );

  const scheduleIceRestart = useCallback(
    (peerId: string, pc: RTCPeerConnection) => {
      if (leavingRoomRef.current || pc.connectionState === "closed") return;
      const prior = reconnectTimersRef.current.get(peerId);
      if (prior) window.clearTimeout(prior);

      const attempt = restartAttemptsRef.current.get(peerId) ?? 0;
      if (attempt >= ICE_RESTART_LIMIT) {
        setError("Media connection could not be restored");
        setIsReconnecting(false);
        recomputeConnected();
        return;
      }

      setIsReconnecting(true);
      const delay = Math.min(800 * 2 ** attempt, 6000);
      const timer = window.setTimeout(() => {
        reconnectTimersRef.current.delete(peerId);
        if (pc.connectionState === "connected") return;
        restartAttemptsRef.current.set(peerId, attempt + 1);
        try {
          pc.restartIce();
          void negotiatePeer(peerId, pc, true);
        } catch (restartError) {
          console.warn("[WebRTC] ICE restart failed", restartError);
        }
      }, delay);
      reconnectTimersRef.current.set(peerId, timer);
    },
    [negotiatePeer, recomputeConnected]
  );

  const ensurePeerConnection = useCallback(
    (peerId: string, stream: MediaStream) => {
      if (!shouldConnectToPeer(peerId)) return null;
      const existing = peerConnectionsRef.current.get(peerId);
      if (existing) return existing;

      const pc = new RTCPeerConnection({
        iceServers: iceServersRef.current ?? DEFAULT_ICE_SERVERS,
        iceCandidatePoolSize: 4,
        bundlePolicy: "max-bundle",
      });
      peerConnectionsRef.current.set(peerId, pc);

      pc.onnegotiationneeded = () => {
        void negotiatePeer(peerId, pc);
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
        if (!remote.getTracks().some((track) => track.id === event.track.id)) remote.addTrack(event.track);
        remoteStreamsRef.current.set(peerId, remote);

        event.track.onended = () => {
          const current = remoteStreamsRef.current.get(peerId);
          if (!current) return;
          const liveTracks = current.getTracks().filter((track) => track.readyState === "live");
          if (liveTracks.length === 0) {
            setParticipants((prev) =>
              prev.map((participant) =>
                participant.id === peerId ? { ...participant, stream: null } : participant
              )
            );
          }
        };

        setParticipants((prev) => {
          const found = prev.find((participant) => participant.id === peerId);
          if (found) {
            return prev.map((participant) =>
              participant.id === peerId ? { ...participant, stream: remote } : participant
            );
          }
          return [
            ...prev,
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
          recomputeConnected();
          scheduleIceRestart(peerId, pc);
        }
        if (pc.connectionState === "closed") recomputeConnected();
      };

      pc.oniceconnectionstatechange = () => {
        if (pc.iceConnectionState === "connected" || pc.iceConnectionState === "completed") {
          setIsReconnecting(false);
          return;
        }
        if (pc.iceConnectionState === "failed") scheduleIceRestart(peerId, pc);
      };

      if (canPublishMedia) {
        stream.getTracks().forEach((track) => pc.addTrack(track, stream));
      }

      // Browsers normally fire negotiationneeded after addTrack(), but the old
      // Alsamos transport also kicked the initial offer from presence sync.
      // Keep that safety path, serialized through negotiatePeer, so a missed
      // event cannot leave both users "active" with no SDP/media connection.
      if (shouldInitiatePeer(peerId)) {
        const timer = window.setTimeout(() => {
          initialOfferTimersRef.current.delete(peerId);
          if (
            pc.connectionState !== "closed" &&
            pc.signalingState === "stable" &&
            !pc.currentLocalDescription &&
            !pc.currentRemoteDescription
          ) {
            void negotiatePeer(peerId, pc);
          }
        }, INITIAL_OFFER_KICK_MS);
        initialOfferTimersRef.current.set(peerId, timer);
      }

      return pc;
    },
    [
      canPublishMedia,
      negotiatePeer,
      recomputeConnected,
      scheduleIceRestart,
      sendSignal,
      shouldConnectToPeer,
      shouldInitiatePeer,
      stampCallStartedAt,
      user?.id,
    ]
  );

  const flushPendingCandidates = useCallback(async (peerId: string, pc: RTCPeerConnection) => {
    const pending = pendingCandidatesRef.current.get(peerId) ?? [];
    for (const candidate of pending) {
      try {
        await pc.addIceCandidate(new RTCIceCandidate(candidate));
      } catch {
        // A stale ICE generation can be discarded safely.
      }
    }
    pendingCandidatesRef.current.delete(peerId);
  }, []);

  const handleOffer = useCallback(
    async (from: string, sdp: RTCSessionDescriptionInit) => {
      if (!shouldConnectToPeer(from) || !user?.id) return;
      const stream = localStreamRef.current ?? new MediaStream();
      const pc = ensurePeerConnection(from, stream);
      if (!pc) return;

      await enqueuePeerNegotiation(from, async () => {
        if (pc.connectionState === "closed") return;
        const makingOffer = makingOfferRef.current.get(from) ?? false;
        const settingAnswer = settingRemoteAnswerRef.current.get(from) ?? false;
        const readyForOffer = !makingOffer && (pc.signalingState === "stable" || settingAnswer);
        const collision = !readyForOffer;
        const polite = isPoliteForPeer(from);
        const ignore = !polite && collision;
        ignoreOfferRef.current.set(from, ignore);
        if (ignore) return;

        try {
          if (collision && pc.signalingState !== "stable") {
            await pc.setLocalDescription({ type: "rollback" });
          }
          await pc.setRemoteDescription(new RTCSessionDescription(sdp));
          ignoreOfferRef.current.set(from, false);
          await flushPendingCandidates(from, pc);

          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          if (!pc.localDescription) return;
          await sendSignal("answer", {
            from: user.id,
            to: from,
            sdp: pc.localDescription,
          });
        } catch (offerError) {
          if (!leavingRoomRef.current) console.error("[WebRTC] handling offer failed", offerError);
        }
      });
    },
    [
      enqueuePeerNegotiation,
      ensurePeerConnection,
      flushPendingCandidates,
      isPoliteForPeer,
      sendSignal,
      shouldConnectToPeer,
      user?.id,
    ]
  );

  const handleAnswer = useCallback(
    async (from: string, sdp: RTCSessionDescriptionInit) => {
      if (!shouldConnectToPeer(from)) return;
      const pc = peerConnectionsRef.current.get(from);
      if (!pc) return;

      await enqueuePeerNegotiation(from, async () => {
        if (pc.connectionState === "closed" || pc.signalingState !== "have-local-offer") return;
        try {
          settingRemoteAnswerRef.current.set(from, true);
          await pc.setRemoteDescription(new RTCSessionDescription(sdp));
          ignoreOfferRef.current.set(from, false);
          await flushPendingCandidates(from, pc);
        } catch (answerError) {
          if (!leavingRoomRef.current) console.error("[WebRTC] handling answer failed", answerError);
        } finally {
          settingRemoteAnswerRef.current.set(from, false);
        }
      });
    },
    [enqueuePeerNegotiation, flushPendingCandidates, shouldConnectToPeer]
  );

  const handleIce = useCallback(
    async (from: string, candidate: RTCIceCandidateInit) => {
      if (!shouldConnectToPeer(from) || ignoreOfferRef.current.get(from)) return;
      const pc = peerConnectionsRef.current.get(from);
      if (!pc || !pc.remoteDescription) {
        const pending = pendingCandidatesRef.current.get(from) ?? [];
        pending.push(candidate);
        pendingCandidatesRef.current.set(from, pending);
        return;
      }
      try {
        await pc.addIceCandidate(new RTCIceCandidate(candidate));
      } catch (candidateError) {
        if (!ignoreOfferRef.current.get(from) && !leavingRoomRef.current) {
          console.warn("[WebRTC] ICE candidate rejected", candidateError);
        }
      }
    },
    [shouldConnectToPeer]
  );

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
                sampleRate: 48000,
              }
            : false,
        });
        localStreamRef.current = stream;
        setLocalStream(stream);
        setIsVideoOn(video);
        setIsMuted(false);
        return stream;
      } catch (mediaError: any) {
        console.error("[WebRTC] getUserMedia failed", mediaError);
        let message = "Kamera yoki mikrofonga ulanib bo'lmadi.";
        if (mediaError?.name === "NotAllowedError") message = "Kamera/mikrofon ruxsati berilmagan.";
        if (mediaError?.name === "NotFoundError") message = "Kamera yoki mikrofon topilmadi.";
        if (mediaError?.name === "NotReadableError") message = "Kamera/mikrofon boshqa dastur tomonidan band.";
        setError(message);
        toast({ title: "Media xatosi", description: message, variant: "destructive" });
        return null;
      }
    },
    [toast]
  );

  const calculateQuality = useCallback(
    (bitrate: number, packetLoss: number, latency: number): ConnectionQuality["quality"] => {
      if (!isConnected && bitrate <= 0) return "disconnected";
      if (packetLoss < 1 && latency < 100 && bitrate > 500000) return "excellent";
      if (packetLoss < 5 && latency < 220 && bitrate > 160000) return "good";
      return bitrate > 0 ? "poor" : "disconnected";
    },
    [isConnected]
  );

  const startQualityMonitoring = useCallback(() => {
    if (qualityIntervalRef.current !== null) return;
    const collect = async () => {
      const peers = Array.from(peerConnectionsRef.current.entries()).filter(
        ([, pc]) => pc.connectionState !== "closed"
      );
      if (peers.length === 0) {
        setConnectionQuality({ bitrate: 0, packetLoss: 0, latency: 0, quality: "disconnected" });
        return;
      }

      let bitrateTotal = 0;
      let latencyTotal = 0;
      let latencyCount = 0;
      let lossTotal = 0;
      let lossCount = 0;

      for (const [peerId, pc] of peers) {
        try {
          const stats = await pc.getStats();
          let bytes = 0;
          let lost = 0;
          let packets = 0;
          stats.forEach((report) => {
            if (
              report.type === "candidate-pair" &&
              report.state === "succeeded" &&
              typeof (report as any).currentRoundTripTime === "number"
            ) {
              latencyTotal += Number((report as any).currentRoundTripTime) * 1000;
              latencyCount += 1;
            }
            if (
              (report.type === "outbound-rtp" || report.type === "inbound-rtp") &&
              !(report as any).isRemote
            ) {
              bytes += Number((report as any).bytesSent ?? (report as any).bytesReceived ?? 0);
              lost += Math.max(0, Number((report as any).packetsLost ?? 0));
              packets += Math.max(0, Number((report as any).packetsSent ?? (report as any).packetsReceived ?? 0));
            }
          });
          const now = Date.now();
          const previous = qualityPreviousRef.current.get(peerId);
          if (previous && now > previous.at && bytes >= previous.bytes) {
            bitrateTotal += ((bytes - previous.bytes) * 8 * 1000) / (now - previous.at);
          }
          qualityPreviousRef.current.set(peerId, { bytes, at: now });
          if (packets > 0) {
            lossTotal += (lost / (packets + lost)) * 100;
            lossCount += 1;
          }
        } catch {
          // One peer failing getStats must not affect the rest of the call.
        }
      }

      const bitrate = bitrateTotal / Math.max(1, peers.length);
      const packetLoss = lossCount ? lossTotal / lossCount : 0;
      const latency = latencyCount ? latencyTotal / latencyCount : 0;
      setConnectionQuality({
        bitrate,
        packetLoss,
        latency,
        quality: calculateQuality(bitrate, packetLoss, latency),
      });
    };

    void collect();
    qualityIntervalRef.current = window.setInterval(collect, QUALITY_CHECK_INTERVAL);
  }, [calculateQuality]);

  const stopQualityMonitoring = useCallback(() => {
    if (qualityIntervalRef.current !== null) {
      window.clearInterval(qualityIntervalRef.current);
      qualityIntervalRef.current = null;
    }
    qualityPreviousRef.current.clear();
  }, []);

  const joinRoom = useCallback(
    async (video = true) => {
      if (!roomId || !user?.id) return;
      if (currentRoomRef.current === roomId && channelRef.current) return;
      if (topology === "broadcast" && !hostId) {
        setError("Jonli efir hosti topilmadi");
        return;
      }

      leavingRoomRef.current = false;
      setIsConnecting(true);
      setIsReconnecting(false);
      setError(null);
      currentRoomRef.current = roomId;
      callStartedStampedRef.current = false;
      iceServersRef.current = await loadIceServers();

      let stream: MediaStream;
      if (canPublishMedia) {
        const captured = await startLocalStream(video, true);
        if (!captured) {
          currentRoomRef.current = null;
          setIsConnecting(false);
          return;
        }
        stream = captured;
      } else {
        stream = new MediaStream();
        localStreamRef.current = stream;
        setLocalStream(stream);
        setIsMuted(true);
        setIsVideoOn(false);
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

      channel
        .on("presence", { event: "sync" }, () => {
          const state = channel.presenceState();
          const ids = Object.keys(state).filter((peerId) => shouldConnectToPeer(peerId));

          setParticipants((prev) => {
            const nextIds = new Set(ids);
            const kept = prev.filter((participant) => nextIds.has(participant.id));
            const existing = new Set(kept.map((participant) => participant.id));
            for (const peerId of ids) {
              if (!existing.has(peerId)) {
                kept.push({
                  id: peerId,
                  stream: remoteStreamsRef.current.get(peerId) ?? null,
                  isMuted: false,
                  isVideoOn: true,
                  isScreenSharing: false,
                  isHandRaised: false,
                });
              }
              ensurePeerConnection(peerId, stream);
            }
            return kept;
          });

          for (const peerId of Array.from(peerConnectionsRef.current.keys())) {
            if (!ids.includes(peerId)) closePeer(peerId);
          }
        })
        .on("presence", { event: "leave" }, ({ key, leftPresences }) => {
          const peerId = typeof key === "string" ? key : (leftPresences as any[])?.[0]?.key;
          if (peerId && peerId !== user.id) closePeer(peerId);
        })
        .on("broadcast", { event: "offer" }, async ({ payload }) => {
          const signal = payload as SignalPayload;
          if (signal.to && signal.to !== user.id) return;
          if (signal.from === user.id || !signal.sdp || !shouldConnectToPeer(signal.from)) return;
          if (markSignalSeen(signal.signalId)) return;
          await handleOffer(signal.from, signal.sdp);
        })
        .on("broadcast", { event: "answer" }, async ({ payload }) => {
          const signal = payload as SignalPayload;
          if (signal.to && signal.to !== user.id) return;
          if (signal.from === user.id || !signal.sdp || !shouldConnectToPeer(signal.from)) return;
          if (markSignalSeen(signal.signalId)) return;
          await handleAnswer(signal.from, signal.sdp);
        })
        .on("broadcast", { event: "ice" }, async ({ payload }) => {
          const signal = payload as SignalPayload;
          if (signal.to && signal.to !== user.id) return;
          if (signal.from === user.id || !signal.candidate || !shouldConnectToPeer(signal.from)) return;
          if (markSignalSeen(signal.signalId)) return;
          await handleIce(signal.from, signal.candidate);
        })
        .on("broadcast", { event: "media" }, ({ payload }) => {
          const signal = payload as SignalPayload;
          if (signal.to && signal.to !== user.id) return;
          if (signal.from === user.id || !signal.mediaState || !shouldConnectToPeer(signal.from)) return;
          setParticipants((prev) =>
            prev.map((participant) =>
              participant.id === signal.from ? { ...participant, ...signal.mediaState } : participant
            )
          );
        })
        .on("broadcast", { event: "leave" }, ({ payload }) => {
          const signal = payload as SignalPayload;
          if (markSignalSeen(signal.signalId)) return;
          if (signal.from && signal.from !== user.id) closePeer(signal.from);
        });

      if (shouldPersistSignals()) {
        channel.on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "call_signals",
            filter: `call_id=eq.${roomId}`,
          },
          async ({ new: row }) => {
            const signalRow = row as {
              id: string;
              sender_id: string;
              target_user_id: string | null;
              type: string;
              payload: Json;
            };
            if (signalRow.sender_id === user.id) return;
            if (signalRow.target_user_id && signalRow.target_user_id !== user.id) return;
            if (!shouldConnectToPeer(signalRow.sender_id)) return;
            const payload = (signalRow.payload ?? {}) as unknown as SignalPayload;
            if (markSignalSeen(payload.signalId ?? signalRow.id)) return;
            if (signalRow.type === "offer" && payload.sdp) await handleOffer(signalRow.sender_id, payload.sdp);
            if (signalRow.type === "answer" && payload.sdp) await handleAnswer(signalRow.sender_id, payload.sdp);
            if (signalRow.type === "ice" && payload.candidate) await handleIce(signalRow.sender_id, payload.candidate);
            if (signalRow.type === "leave") closePeer(signalRow.sender_id);
          }
        );
      }

      channelRef.current = channel;
      channel.subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
          setIsConnecting(false);
          setIsReconnecting(false);
          setError(null);
          try {
            await channel.track({
              online_at: new Date().toISOString(),
              topology,
              role:
                topology === "broadcast"
                  ? user.id === hostId
                    ? "broadcaster"
                    : "viewer"
                  : "participant",
            });
          } catch (trackError) {
            console.warn("[WebRTC] presence track failed", trackError);
          }

          if (shouldPersistSignals()) {
            const { data: backlog, error: backlogError } = await supabase
              .from("call_signals")
              .select("id, sender_id, target_user_id, type, payload, created_at")
              .eq("call_id", roomId)
              .neq("sender_id", user.id)
              .or(`target_user_id.is.null,target_user_id.eq.${user.id}`)
              .order("created_at", { ascending: true })
              .limit(200);

            if (!backlogError && backlog) {
              for (const row of backlog) {
                if (!shouldConnectToPeer(row.sender_id)) continue;
                const payload = (row.payload ?? {}) as unknown as SignalPayload;
                if (markSignalSeen(payload.signalId ?? row.id)) continue;
                const pc = peerConnectionsRef.current.get(row.sender_id);
                const negotiated = !!pc?.currentRemoteDescription;
                if (row.type === "offer" && payload.sdp && !negotiated) await handleOffer(row.sender_id, payload.sdp);
                if (row.type === "answer" && payload.sdp && pc?.signalingState === "have-local-offer") {
                  await handleAnswer(row.sender_id, payload.sdp);
                }
                if (row.type === "ice" && payload.candidate) await handleIce(row.sender_id, payload.candidate);
                if (row.type === "leave") closePeer(row.sender_id);
              }
            }
          }

          startQualityMonitoring();
          return;
        }

        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          setIsConnecting(false);
          setIsReconnecting(true);
          setError("Realtime signaling vaqtincha uzildi");
        }
        if (status === "CLOSED" && !leavingRoomRef.current) {
          setIsConnecting(false);
          setIsReconnecting(true);
          setError("Realtime signaling uzildi");
        }
      });
    },
    [
      canPublishMedia,
      closePeer,
      ensurePeerConnection,
      handleAnswer,
      handleIce,
      handleOffer,
      hostId,
      markSignalSeen,
      roomId,
      shouldConnectToPeer,
      shouldPersistSignals,
      startLocalStream,
      startQualityMonitoring,
      topology,
      user?.id,
    ]
  );

  const leaveRoom = useCallback(() => {
    leavingRoomRef.current = true;
    if (user?.id) void sendSignal("leave", { from: user.id });
    stopQualityMonitoring();

    initialOfferTimersRef.current.forEach((timer) => window.clearTimeout(timer));
    initialOfferTimersRef.current.clear();
    reconnectTimersRef.current.forEach((timer) => window.clearTimeout(timer));
    reconnectTimersRef.current.clear();

    peerConnectionsRef.current.forEach((pc) => pc.close());
    peerConnectionsRef.current.clear();
    remoteStreamsRef.current.clear();
    pendingCandidatesRef.current.clear();
    makingOfferRef.current.clear();
    ignoreOfferRef.current.clear();
    settingRemoteAnswerRef.current.clear();
    negotiationQueueRef.current.clear();
    seenSignalIdsRef.current.clear();
    restartAttemptsRef.current.clear();

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
    setIsMuted(!canPublishMedia);
    setIsVideoOn(canPublishMedia);
    setIsScreenSharing(false);
    setIsHandRaised(false);
    setError(null);
    setConnectionQuality({ bitrate: 0, packetLoss: 0, latency: 0, quality: "disconnected" });

    if (channelRef.current) {
      void supabase.removeChannel(channelRef.current);
      channelRef.current = null;
    }
    currentRoomRef.current = null;
    callStartedStampedRef.current = false;
  }, [canPublishMedia, sendSignal, stopQualityMonitoring, user?.id]);

  const broadcastMediaState = useCallback(
    (next: { isMuted: boolean; isVideoOn: boolean; isScreenSharing: boolean; isHandRaised: boolean }) => {
      if (!user?.id) return;
      void sendSignal("media", { from: user.id, mediaState: next });
    },
    [sendSignal, user?.id]
  );

  const toggleMute = useCallback(() => {
    if (!canPublishMedia) return;
    const track = localStreamRef.current?.getAudioTracks()[0];
    if (!track) return;
    track.enabled = !track.enabled;
    const nextMuted = !track.enabled;
    setIsMuted(nextMuted);
    broadcastMediaState({ next: undefined } as never);
    broadcastMediaState({
      isMuted: nextMuted,
      isVideoOn,
      isScreenSharing,
      isHandRaised,
    });
  }, [broadcastMediaState, canPublishMedia, isHandRaised, isScreenSharing, isVideoOn]);

  const toggleVideo = useCallback(() => {
    if (!canPublishMedia) return;
    const track = localStreamRef.current?.getVideoTracks()[0];
    if (!track) return;
    track.enabled = !track.enabled;
    const nextVideo = track.enabled;
    setIsVideoOn(nextVideo);
    broadcastMediaState({
      isMuted,
      isVideoOn: nextVideo,
      isScreenSharing,
      isHandRaised,
    });
  }, [broadcastMediaState, canPublishMedia, isHandRaised, isMuted, isScreenSharing]);

  const toggleScreenShare = useCallback(async () => {
    if (!canPublishMedia) return;
    if (isScreenSharing && screenStreamRef.current) {
      screenStreamRef.current.getTracks().forEach((track) => track.stop());
      screenStreamRef.current = null;
      setScreenStream(null);
      setIsScreenSharing(false);
      const camera = localStreamRef.current?.getVideoTracks()[0] ?? null;
      await Promise.all(
        Array.from(peerConnectionsRef.current.values()).map(async (pc) => {
          const sender = pc.getSenders().find((item) => item.track?.kind === "video");
          if (sender) await sender.replaceTrack(camera);
        })
      );
      broadcastMediaState({ isMuted, isVideoOn, isScreenSharing: false, isHandRaised });
      return;
    }

    try {
      const display = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
      const screenTrack = display.getVideoTracks()[0];
      if (!screenTrack) return;
      screenStreamRef.current = display;
      setScreenStream(display);
      setIsScreenSharing(true);
      await Promise.all(
        Array.from(peerConnectionsRef.current.values()).map(async (pc) => {
          const sender = pc.getSenders().find((item) => item.track?.kind === "video");
          if (sender) await sender.replaceTrack(screenTrack);
        })
      );
      screenTrack.onended = () => {
        screenStreamRef.current = null;
        setScreenStream(null);
        setIsScreenSharing(false);
        const camera = localStreamRef.current?.getVideoTracks()[0] ?? null;
        void Promise.all(
          Array.from(peerConnectionsRef.current.values()).map(async (pc) => {
            const sender = pc.getSenders().find((item) => item.track?.kind === "video");
            if (sender) await sender.replaceTrack(camera);
          })
        );
        broadcastMediaState({ isMuted, isVideoOn, isScreenSharing: false, isHandRaised });
      };
      broadcastMediaState({ isMuted, isVideoOn, isScreenSharing: true, isHandRaised });
    } catch (screenError) {
      console.warn("[WebRTC] screen sharing failed", screenError);
    }
  }, [broadcastMediaState, canPublishMedia, isHandRaised, isMuted, isScreenSharing, isVideoOn]);

  const selectCamera = useCallback(
    async (deviceId: string): Promise<boolean> => {
      if (!canPublishMedia || !localStreamRef.current || !deviceId) return false;
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
        if (!nextTrack) return false;
        nextTrack.enabled = isVideoOn;
        if (!isScreenSharing) {
          await Promise.all(
            Array.from(peerConnectionsRef.current.values()).map(async (pc) => {
              const sender = pc.getSenders().find((item) => item.track?.kind === "video");
              if (sender) await sender.replaceTrack(nextTrack);
            })
          );
        }
        const previous = localStreamRef.current;
        previous.getVideoTracks()[0]?.stop();
        const nextStream = new MediaStream([...previous.getAudioTracks(), nextTrack]);
        localStreamRef.current = nextStream;
        setLocalStream(nextStream);
        return true;
      } catch (cameraError) {
        console.warn("[WebRTC] camera selection failed", cameraError);
        return false;
      }
    },
    [canPublishMedia, isScreenSharing, isVideoOn]
  );

  const selectMicrophone = useCallback(
    async (deviceId: string): Promise<boolean> => {
      if (!canPublishMedia || !localStreamRef.current || !deviceId) return false;
      try {
        const replacement = await navigator.mediaDevices.getUserMedia({
          video: false,
          audio: {
            deviceId: { exact: deviceId },
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
            sampleRate: 48000,
          },
        });
        const nextTrack = replacement.getAudioTracks()[0];
        if (!nextTrack) return false;
        nextTrack.enabled = !isMuted;
        await Promise.all(
          Array.from(peerConnectionsRef.current.values()).map(async (pc) => {
            const sender = pc.getSenders().find((item) => item.track?.kind === "audio");
            if (sender) await sender.replaceTrack(nextTrack);
          })
        );
        const previous = localStreamRef.current;
        previous.getAudioTracks()[0]?.stop();
        const nextStream = new MediaStream([...previous.getVideoTracks(), nextTrack]);
        localStreamRef.current = nextStream;
        setLocalStream(nextStream);
        return true;
      } catch (microphoneError) {
        console.warn("[WebRTC] microphone selection failed", microphoneError);
        return false;
      }
    },
    [canPublishMedia, isMuted]
  );

  const switchCamera = useCallback(async (): Promise<boolean> => {
    if (!canPublishMedia || !localStreamRef.current || !isVideoOn) return false;
    try {
      const cameras = (await navigator.mediaDevices.enumerateDevices()).filter(
        (device) => device.kind === "videoinput"
      );
      if (cameras.length < 2) return false;
      const currentId = localStreamRef.current.getVideoTracks()[0]?.getSettings().deviceId;
      const index = Math.max(0, cameras.findIndex((camera) => camera.deviceId === currentId));
      return selectCamera(cameras[(index + 1) % cameras.length].deviceId);
    } catch {
      return false;
    }
  }, [canPublishMedia, isVideoOn, selectCamera]);

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

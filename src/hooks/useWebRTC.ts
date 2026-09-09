import { useCallback, useEffect, useRef, useState } from "react";
import { getIceServers, loadIceServers } from "@/lib/iceServers";
import {
  isFreshNativeSignal,
  shouldInitiateNativePeer,
  type NativeWebRTCTopology,
} from "@/lib/webrtcSignalPolicy";
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

export type WebRTCTopology = NativeWebRTCTopology;

export interface UseWebRTCOptions {
  /** mesh = small group P2P, broadcast = one host to many viewers. */
  topology?: WebRTCTopology;
  /** Required for broadcast topology. */
  hostId?: string | null;
  /**
   * Optional database fallback for SDP/ICE. Native Realtime broadcast is the
   * primary path; persistence is off by default so stale SDP from an older
   * browser session cannot poison a fresh call.
   */
  persistSignals?: boolean;
  /** Explicitly override whether this client publishes camera/microphone. */
  publishMedia?: boolean;
}

type SignalEvent = "ready" | "offer" | "answer" | "ice" | "media" | "leave";
type PersistedSignalEvent = "offer" | "answer" | "ice";

type SignalPayload = {
  from: string;
  to?: string;
  signalId?: string;
  sessionId?: string;
  sentAt?: number;
  sdp?: RTCSessionDescriptionInit;
  candidate?: RTCIceCandidateInit;
  mediaState?: {
    isMuted: boolean;
    isVideoOn: boolean;
    isScreenSharing: boolean;
    isHandRaised: boolean;
  };
};

const DEFAULT_ICE_SERVERS = getIceServers();
const QUALITY_CHECK_INTERVAL = 5000;
const ICE_RESTART_LIMIT = 4;
const ICE_RESTART_BASE_DELAY = 900;
const PEER_CONNECTION_TIMEOUT = 18_000;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function makeSignalId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function candidateType(candidate: RTCIceCandidate | RTCIceCandidateInit | null | undefined) {
  if (!candidate) return "unknown";
  const typed = candidate as RTCIceCandidate;
  if (typed.type) return typed.type;
  const text = candidate.candidate ?? "";
  const match = text.match(/\styp\s(host|srflx|prflx|relay)(?:\s|$)/i);
  return match?.[1]?.toLowerCase() ?? "unknown";
}

export function useWebRTC(roomId: string | null, options: UseWebRTCOptions = {}) {
  const { user } = useAuth();
  const { toast } = useToast();

  const topology = options.topology ?? "mesh";
  const hostId = options.hostId ?? null;
  const persistSignalsEnabled = options.persistSignals ?? false;
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
  const negotiationQueuesRef = useRef<Map<string, Promise<void>>>(new Map());
  const makingOfferRef = useRef<Set<string>>(new Set());
  const seenSignalIdsRef = useRef<Set<string>>(new Set());
  const readyPeersRef = useRef<Set<string>>(new Set());
  const presencePeersRef = useRef<Set<string>>(new Set());
  const peerSessionsRef = useRef<Map<string, string>>(new Map());
  const restartAttemptsRef = useRef<Map<string, number>>(new Map());
  const restartTimersRef = useRef<Map<string, number>>(new Map());
  const connectionWatchdogsRef = useRef<Map<string, number>>(new Map());
  const qualityPreviousRef = useRef<Map<string, { bytes: number; at: number }>>(new Map());
  const qualityIntervalRef = useRef<ReturnType<typeof window.setInterval> | null>(null);
  const currentRoomRef = useRef<string | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const screenStreamRef = useRef<MediaStream | null>(null);
  const iceServersRef = useRef<RTCIceServer[] | null>(null);
  const sessionIdRef = useRef<string | null>(null);
  const joinedAtRef = useRef(0);
  const leavingRoomRef = useRef(false);
  const callStartedStampedRef = useRef(false);

  const isDatabaseCall = useCallback(
    () => !!roomId && UUID_RE.test(roomId),
    [roomId],
  );

  const shouldPersistSignals = useCallback(
    () => isDatabaseCall() && persistSignalsEnabled,
    [isDatabaseCall, persistSignalsEnabled],
  );

  const shouldConnectToPeer = useCallback(
    (peerId: string) => {
      if (!user?.id || !peerId || peerId === user.id) return false;
      if (topology !== "broadcast") return true;
      if (!hostId) return false;
      return user.id === hostId ? peerId !== hostId : peerId === hostId;
    },
    [hostId, topology, user?.id],
  );

  const shouldInitiatePeer = useCallback(
    (peerId: string) =>
      !!user?.id && shouldInitiateNativePeer(user.id, peerId, topology, hostId),
    [hostId, topology, user?.id],
  );

  const markSignalSeen = useCallback((signalId?: string | null) => {
    if (!signalId) return false;
    if (seenSignalIdsRef.current.has(signalId)) return true;
    seenSignalIdsRef.current.add(signalId);
    if (seenSignalIdsRef.current.size > 2000) {
      const first = seenSignalIdsRef.current.values().next().value as string | undefined;
      if (first) seenSignalIdsRef.current.delete(first);
    }
    return false;
  }, []);

  const stampCallStartedAt = useCallback(async () => {
    if (!roomId || !isDatabaseCall() || callStartedStampedRef.current) return;
    callStartedStampedRef.current = true;
    const { error: startedAtError } = await supabase
      .from("video_calls")
      .update({ started_at: new Date().toISOString() })
      .eq("id", roomId)
      .is("started_at", null);
    if (startedAtError) {
      // Media is authoritative. A timer write must never tear down a working call.
      console.warn("[WebRTC] could not stamp started_at", startedAtError);
    }
  }, [isDatabaseCall, roomId]);

  const persistSignal = useCallback(
    async (event: PersistedSignalEvent, payload: SignalPayload) => {
      if (!roomId || !user?.id || !shouldPersistSignals()) return;
      const { error: persistError } = await supabase.from("call_signals").insert({
        call_id: roomId,
        sender_id: user.id,
        target_user_id: payload.to ?? null,
        type: event,
        payload: payload as unknown as Json,
      });
      if (persistError && !leavingRoomRef.current) {
        console.warn("[WebRTC] optional call_signals fallback failed", persistError);
      }
    },
    [roomId, shouldPersistSignals, user?.id],
  );

  const sendSignal = useCallback(
    async (event: SignalEvent, payload: SignalPayload) => {
      const frame: SignalPayload = {
        ...payload,
        signalId: payload.signalId ?? makeSignalId(),
        sessionId: payload.sessionId ?? sessionIdRef.current ?? undefined,
        sentAt: payload.sentAt ?? Date.now(),
      };

      const channel = channelRef.current;
      if (channel) {
        try {
          const status = await channel.send({ type: "broadcast", event, payload: frame });
          if (status !== "ok" && !leavingRoomRef.current) {
            console.warn("[WebRTC] Realtime signal send failed", { event, status, to: frame.to });
          }
        } catch (sendError) {
          if (!leavingRoomRef.current) {
            console.warn("[WebRTC] Realtime signal error", { event, sendError });
          }
        }
      }

      if (event === "offer" || event === "answer" || event === "ice") {
        void persistSignal(event, frame);
      }
    },
    [persistSignal],
  );

  const enqueueNegotiation = useCallback((peerId: string, task: () => Promise<void>) => {
    const previous = negotiationQueuesRef.current.get(peerId) ?? Promise.resolve();
    const next = previous.catch(() => undefined).then(task);
    negotiationQueuesRef.current.set(peerId, next);
    void next.finally(() => {
      if (negotiationQueuesRef.current.get(peerId) === next) {
        negotiationQueuesRef.current.delete(peerId);
      }
    });
    return next;
  }, []);

  const recomputeConnected = useCallback(() => {
    const connected = Array.from(peerConnectionsRef.current.values()).some(
      (pc) => pc.connectionState === "connected",
    );
    setIsConnected(connected);
    if (!connected && peerConnectionsRef.current.size === 0) {
      setConnectionQuality({ bitrate: 0, packetLoss: 0, latency: 0, quality: "disconnected" });
    }
  }, []);

  const clearPeerTimers = useCallback((peerId: string) => {
    const restartTimer = restartTimersRef.current.get(peerId);
    if (restartTimer) window.clearTimeout(restartTimer);
    restartTimersRef.current.delete(peerId);

    const watchdog = connectionWatchdogsRef.current.get(peerId);
    if (watchdog) window.clearTimeout(watchdog);
    connectionWatchdogsRef.current.delete(peerId);
  }, []);

  const closePeer = useCallback(
    (peerId: string) => {
      clearPeerTimers(peerId);
      const pc = peerConnectionsRef.current.get(peerId);
      if (pc) {
        pc.onicecandidate = null;
        pc.ontrack = null;
        pc.onconnectionstatechange = null;
        pc.oniceconnectionstatechange = null;
        pc.onnegotiationneeded = null;
        pc.close();
      }
      peerConnectionsRef.current.delete(peerId);
      remoteStreamsRef.current.delete(peerId);
      pendingCandidatesRef.current.delete(peerId);
      negotiationQueuesRef.current.delete(peerId);
      makingOfferRef.current.delete(peerId);
      readyPeersRef.current.delete(peerId);
      presencePeersRef.current.delete(peerId);
      peerSessionsRef.current.delete(peerId);
      restartAttemptsRef.current.delete(peerId);
      qualityPreviousRef.current.delete(peerId);
      setParticipants((prev) => prev.filter((participant) => participant.id !== peerId));
      window.setTimeout(recomputeConnected, 0);
    },
    [clearPeerTimers, recomputeConnected],
  );

  const negotiatePeer = useCallback(
    (peerId: string, pc: RTCPeerConnection, iceRestart = false) =>
      enqueueNegotiation(peerId, async () => {
        if (!user?.id || leavingRoomRef.current || pc.connectionState === "closed") return;
        if (!shouldConnectToPeer(peerId) || !shouldInitiatePeer(peerId)) return;
        if (!readyPeersRef.current.has(peerId)) return;
        if (pc.signalingState !== "stable" || makingOfferRef.current.has(peerId)) return;

        try {
          makingOfferRef.current.add(peerId);
          const offer = await pc.createOffer(iceRestart ? { iceRestart: true } : undefined);
          if (pc.signalingState !== "stable" || pc.connectionState === "closed") return;
          await pc.setLocalDescription(offer);
          if (!pc.localDescription) return;
          console.info("[WebRTC] sending offer", { peerId, iceRestart });
          await sendSignal("offer", {
            from: user.id,
            to: peerId,
            sdp: pc.localDescription,
          });
        } catch (negotiationError) {
          if (!leavingRoomRef.current) {
            console.error("[WebRTC] offer negotiation failed", { peerId, negotiationError });
          }
        } finally {
          makingOfferRef.current.delete(peerId);
        }
      }),
    [enqueueNegotiation, sendSignal, shouldConnectToPeer, shouldInitiatePeer, user?.id],
  );

  const scheduleIceRestart = useCallback(
    (peerId: string, pc: RTCPeerConnection) => {
      if (leavingRoomRef.current || pc.connectionState === "closed") return;
      if (restartTimersRef.current.has(peerId)) return;

      const attempt = restartAttemptsRef.current.get(peerId) ?? 0;
      if (attempt >= ICE_RESTART_LIMIT) {
        setIsReconnecting(false);
        setError(
          "Media aloqasi tiklanmadi. Bu tarmoq to'g'ridan-to'g'ri WebRTC yo'lini bloklayotgan bo'lishi mumkin.",
        );
        recomputeConnected();
        return;
      }

      setIsReconnecting(true);
      const delay = Math.min(ICE_RESTART_BASE_DELAY * 2 ** attempt, 7000);
      const timer = window.setTimeout(() => {
        restartTimersRef.current.delete(peerId);
        if (pc.connectionState === "connected" || pc.connectionState === "closed") return;
        restartAttemptsRef.current.set(peerId, attempt + 1);

        if (shouldInitiatePeer(peerId)) {
          try {
            pc.restartIce();
          } catch {
            // createOffer({ iceRestart: true }) below is enough on browsers that
            // do not expose restartIce reliably.
          }
          void negotiatePeer(peerId, pc, true);
        } else if (user?.id) {
          // The designated offerer owns renegotiation. A fresh ready frame asks
          // it to restart without allowing offer glare.
          void sendSignal("ready", { from: user.id, to: peerId });
        }
      }, delay);
      restartTimersRef.current.set(peerId, timer);
    },
    [negotiatePeer, recomputeConnected, sendSignal, shouldInitiatePeer, user?.id],
  );

  const armConnectionWatchdog = useCallback((peerId: string, pc: RTCPeerConnection) => {
    const existing = connectionWatchdogsRef.current.get(peerId);
    if (existing) window.clearTimeout(existing);

    const timer = window.setTimeout(() => {
      connectionWatchdogsRef.current.delete(peerId);
      if (pc.connectionState === "connected" || pc.connectionState === "closed") return;
      console.warn("[WebRTC] peer connection timeout", {
        peerId,
        connectionState: pc.connectionState,
        iceConnectionState: pc.iceConnectionState,
        iceGatheringState: pc.iceGatheringState,
      });
      setError(
        "Suhbatdosh topildi, lekin P2P media yo'li ochilmadi. Tarmoq relay (TURN) talab qilishi mumkin.",
      );
    }, PEER_CONNECTION_TIMEOUT);
    connectionWatchdogsRef.current.set(peerId, timer);
  }, []);

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
      console.info("[WebRTC] peer connection created", { peerId, topology });

      if (canPublishMedia) {
        stream.getTracks().forEach((track) => pc.addTrack(track, stream));
      }

      pc.onnegotiationneeded = () => {
        if (readyPeersRef.current.has(peerId) && shouldInitiatePeer(peerId)) {
          void negotiatePeer(peerId, pc);
        }
      };

      pc.onicecandidate = (event) => {
        if (!event.candidate || !user?.id) return;
        console.info("[WebRTC] local ICE candidate", {
          peerId,
          type: candidateType(event.candidate),
          protocol: event.candidate.protocol,
        });
        void sendSignal("ice", {
          from: user.id,
          to: peerId,
          candidate: event.candidate.toJSON(),
        });
      };

      pc.ontrack = (event) => {
        let remote = event.streams?.[0] ?? remoteStreamsRef.current.get(peerId) ?? null;
        if (!remote) remote = new MediaStream();
        if (!remote.getTracks().some((track) => track.id === event.track.id)) {
          remote.addTrack(event.track);
        }
        remoteStreamsRef.current.set(peerId, remote);

        event.track.onended = () => {
          const current = remoteStreamsRef.current.get(peerId);
          if (!current) return;
          if (current.getTracks().every((track) => track.readyState === "ended")) {
            setParticipants((prev) =>
              prev.map((participant) =>
                participant.id === peerId ? { ...participant, stream: null } : participant,
              ),
            );
          }
        };

        setParticipants((prev) => {
          const found = prev.some((participant) => participant.id === peerId);
          if (found) {
            return prev.map((participant) =>
              participant.id === peerId ? { ...participant, stream: remote } : participant,
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
        console.info("[WebRTC] connection state", { peerId, state: pc.connectionState });
        if (pc.connectionState === "connected") {
          clearPeerTimers(peerId);
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
        console.info("[WebRTC] ICE state", { peerId, state: pc.iceConnectionState });
        if (pc.iceConnectionState === "connected" || pc.iceConnectionState === "completed") {
          setIsReconnecting(false);
        } else if (pc.iceConnectionState === "failed") {
          scheduleIceRestart(peerId, pc);
        }
      };

      return pc;
    },
    [
      canPublishMedia,
      clearPeerTimers,
      negotiatePeer,
      recomputeConnected,
      scheduleIceRestart,
      sendSignal,
      shouldConnectToPeer,
      shouldInitiatePeer,
      stampCallStartedAt,
      topology,
      user?.id,
    ],
  );

  const flushPendingCandidates = useCallback(async (peerId: string, pc: RTCPeerConnection) => {
    const pending = pendingCandidatesRef.current.get(peerId) ?? [];
    pendingCandidatesRef.current.delete(peerId);
    for (const candidate of pending) {
      try {
        await pc.addIceCandidate(new RTCIceCandidate(candidate));
      } catch (candidateError) {
        console.warn("[WebRTC] queued ICE candidate rejected", { peerId, candidateError });
      }
    }
  }, []);

  const registerPeerSession = useCallback(
    (peerId: string, sessionId?: string) => {
      if (!sessionId) return;
      const previous = peerSessionsRef.current.get(peerId);
      if (previous && previous !== sessionId) {
        console.info("[WebRTC] peer browser session changed; rebuilding connection", { peerId });
        closePeer(peerId);
      }
      peerSessionsRef.current.set(peerId, sessionId);
    },
    [closePeer],
  );

  const handleOffer = useCallback(
    async (from: string, signal: SignalPayload) => {
      if (!user?.id || !signal.sdp || !shouldConnectToPeer(from)) return;
      registerPeerSession(from, signal.sessionId);
      readyPeersRef.current.add(from);
      const pc = ensurePeerConnection(from, localStreamRef.current ?? new MediaStream());
      if (!pc) return;
      armConnectionWatchdog(from, pc);

      await enqueueNegotiation(from, async () => {
        if (pc.connectionState === "closed") return;
        try {
          if (pc.signalingState !== "stable") {
            // Deterministic offer ownership makes glare rare, but rollback safely
            // if an older browser build sent an overlapping offer.
            await pc.setLocalDescription({ type: "rollback" });
          }
          await pc.setRemoteDescription(new RTCSessionDescription(signal.sdp!));
          await flushPendingCandidates(from, pc);
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          if (!pc.localDescription) return;
          console.info("[WebRTC] sending answer", { peerId: from });
          await sendSignal("answer", {
            from: user.id,
            to: from,
            sdp: pc.localDescription,
          });
        } catch (offerError) {
          if (!leavingRoomRef.current) {
            console.error("[WebRTC] handling offer failed", { peerId: from, offerError });
          }
        }
      });
    },
    [
      armConnectionWatchdog,
      enqueueNegotiation,
      ensurePeerConnection,
      flushPendingCandidates,
      registerPeerSession,
      sendSignal,
      shouldConnectToPeer,
      user?.id,
    ],
  );

  const handleAnswer = useCallback(
    async (from: string, signal: SignalPayload) => {
      if (!signal.sdp || !shouldConnectToPeer(from)) return;
      registerPeerSession(from, signal.sessionId);
      const pc = peerConnectionsRef.current.get(from);
      if (!pc) return;

      await enqueueNegotiation(from, async () => {
        if (pc.connectionState === "closed" || pc.signalingState !== "have-local-offer") return;
        try {
          await pc.setRemoteDescription(new RTCSessionDescription(signal.sdp!));
          await flushPendingCandidates(from, pc);
          console.info("[WebRTC] answer applied", { peerId: from });
        } catch (answerError) {
          if (!leavingRoomRef.current) {
            console.error("[WebRTC] handling answer failed", { peerId: from, answerError });
          }
        }
      });
    },
    [enqueueNegotiation, flushPendingCandidates, registerPeerSession, shouldConnectToPeer],
  );

  const handleIce = useCallback(
    async (from: string, signal: SignalPayload) => {
      if (!signal.candidate || !shouldConnectToPeer(from)) return;
      registerPeerSession(from, signal.sessionId);
      const pc = peerConnectionsRef.current.get(from);
      console.info("[WebRTC] remote ICE candidate", {
        peerId: from,
        type: candidateType(signal.candidate),
      });
      if (!pc || !pc.remoteDescription) {
        const pending = pendingCandidatesRef.current.get(from) ?? [];
        pending.push(signal.candidate);
        pendingCandidatesRef.current.set(from, pending);
        return;
      }
      try {
        await pc.addIceCandidate(new RTCIceCandidate(signal.candidate));
      } catch (candidateError) {
        if (!leavingRoomRef.current) {
          console.warn("[WebRTC] remote ICE candidate rejected", { peerId: from, candidateError });
        }
      }
    },
    [registerPeerSession, shouldConnectToPeer],
  );

  const handleReady = useCallback(
    async (from: string, signal: SignalPayload) => {
      if (!user?.id || !shouldConnectToPeer(from)) return;
      registerPeerSession(from, signal.sessionId);
      const wasReady = readyPeersRef.current.has(from);
      readyPeersRef.current.add(from);
      const pc = ensurePeerConnection(from, localStreamRef.current ?? new MediaStream());
      if (!pc) return;
      armConnectionWatchdog(from, pc);

      console.info("[WebRTC] peer ready", {
        peerId: from,
        initiator: shouldInitiatePeer(from),
        state: pc.connectionState,
      });

      if (!wasReady) {
        // One acknowledgement closes the race where one browser subscribed a few
        // milliseconds after the other's first broadcast.
        await sendSignal("ready", { from: user.id, to: from });
      }

      if (!shouldInitiatePeer(from)) return;
      if (pc.connectionState === "connected") return;
      if (pc.signalingState !== "stable") return;

      const needsRestart =
        !!pc.currentRemoteDescription &&
        (pc.connectionState === "failed" || pc.connectionState === "disconnected");
      void negotiatePeer(from, pc, needsRestart);
    },
    [
      armConnectionWatchdog,
      ensurePeerConnection,
      negotiatePeer,
      registerPeerSession,
      sendSignal,
      shouldConnectToPeer,
      shouldInitiatePeer,
      user?.id,
    ],
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
        if (mediaError?.name === "NotReadableError") {
          message = "Kamera/mikrofon boshqa dastur tomonidan band.";
        }
        setError(message);
        toast({ title: "Media xatosi", description: message, variant: "destructive" });
        return null;
      }
    },
    [toast],
  );

  const startQualityMonitoring = useCallback(() => {
    if (qualityIntervalRef.current !== null) return;

    const collect = async () => {
      const peers = Array.from(peerConnectionsRef.current.entries()).filter(
        ([, pc]) => pc.connectionState !== "closed",
      );
      const connectedPeers = peers.filter(([, pc]) => pc.connectionState === "connected");
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
              packets += Math.max(
                0,
                Number((report as any).packetsSent ?? (report as any).packetsReceived ?? 0),
              );
            }
          });

          const now = Date.now();
          const previous = qualityPreviousRef.current.get(peerId);
          if (previous && now > previous.at && bytes >= previous.bytes) {
            bitrateTotal += ((bytes - previous.bytes) * 8 * 1000) / (now - previous.at);
          }
          qualityPreviousRef.current.set(peerId, { bytes, at: now });
          if (packets + lost > 0) {
            lossTotal += (lost / (packets + lost)) * 100;
            lossCount += 1;
          }
        } catch {
          // One peer failing getStats must not affect the whole call.
        }
      }

      const bitrate = bitrateTotal / Math.max(1, connectedPeers.length || peers.length);
      const packetLoss = lossCount ? lossTotal / lossCount : 0;
      const latency = latencyCount ? latencyTotal / latencyCount : 0;
      let quality: ConnectionQuality["quality"] = "disconnected";
      if (connectedPeers.length > 0) {
        if (packetLoss < 1 && latency < 100 && bitrate > 500_000) quality = "excellent";
        else if (packetLoss < 5 && latency < 220 && bitrate > 160_000) quality = "good";
        else quality = "poor";
      }
      setConnectionQuality({ bitrate, packetLoss, latency, quality });
    };

    void collect();
    qualityIntervalRef.current = window.setInterval(collect, QUALITY_CHECK_INTERVAL);
  }, []);

  const stopQualityMonitoring = useCallback(() => {
    if (qualityIntervalRef.current !== null) {
      window.clearInterval(qualityIntervalRef.current);
      qualityIntervalRef.current = null;
    }
    qualityPreviousRef.current.clear();
  }, []);

  const cleanupRoom = useCallback(() => {
    leavingRoomRef.current = true;
    stopQualityMonitoring();

    restartTimersRef.current.forEach((timer) => window.clearTimeout(timer));
    restartTimersRef.current.clear();
    connectionWatchdogsRef.current.forEach((timer) => window.clearTimeout(timer));
    connectionWatchdogsRef.current.clear();

    peerConnectionsRef.current.forEach((pc) => {
      pc.onicecandidate = null;
      pc.ontrack = null;
      pc.onconnectionstatechange = null;
      pc.oniceconnectionstatechange = null;
      pc.onnegotiationneeded = null;
      pc.close();
    });
    peerConnectionsRef.current.clear();
    remoteStreamsRef.current.clear();
    pendingCandidatesRef.current.clear();
    negotiationQueuesRef.current.clear();
    makingOfferRef.current.clear();
    seenSignalIdsRef.current.clear();
    readyPeersRef.current.clear();
    presencePeersRef.current.clear();
    peerSessionsRef.current.clear();
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
    setConnectionQuality({ bitrate: 0, packetLoss: 0, latency: 0, quality: "disconnected" });

    const channel = channelRef.current;
    channelRef.current = null;
    if (channel) void supabase.removeChannel(channel);

    currentRoomRef.current = null;
    sessionIdRef.current = null;
    joinedAtRef.current = 0;
    callStartedStampedRef.current = false;
  }, [canPublishMedia, stopQualityMonitoring]);

  const joinRoom = useCallback(
    async (video = true) => {
      if (!roomId || !user?.id) return;
      if (currentRoomRef.current === roomId && channelRef.current) return;
      if (topology === "broadcast" && !hostId) {
        setError("Jonli efir hosti topilmadi");
        return;
      }

      if (currentRoomRef.current && currentRoomRef.current !== roomId) cleanupRoom();
      leavingRoomRef.current = false;
      setIsConnecting(true);
      setIsReconnecting(false);
      setError(null);
      currentRoomRef.current = roomId;
      sessionIdRef.current = makeSignalId();
      joinedAtRef.current = Date.now();
      callStartedStampedRef.current = false;
      iceServersRef.current = await loadIceServers();

      let stream: MediaStream;
      if (canPublishMedia) {
        const captured = await startLocalStream(video, true);
        if (!captured) {
          currentRoomRef.current = null;
          sessionIdRef.current = null;
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

      const channel = supabase.channel(`webrtc:${roomId}`, {
        config: {
          presence: { key: user.id },
          broadcast: { self: false },
        },
      });
      channelRef.current = channel;

      const syncPresence = () => {
        const state = channel.presenceState();
        const peerIds = Object.keys(state).filter((peerId) => shouldConnectToPeer(peerId));
        const nextPeerSet = new Set(peerIds);
        const previousPeerSet = presencePeersRef.current;

        // IMPORTANT: WebRTC side effects happen outside React state updaters.
        // React may replay updater callbacks; creating RTCPeerConnections there
        // caused duplicate/racy negotiation in the old implementation.
        for (const peerId of peerIds) {
          const pc = ensurePeerConnection(peerId, stream);
          if (!pc) continue;
          if (!previousPeerSet.has(peerId)) {
            console.info("[WebRTC] presence peer discovered", { peerId });
            void sendSignal("ready", { from: user.id, to: peerId });
          }
        }

        for (const peerId of previousPeerSet) {
          if (!nextPeerSet.has(peerId)) closePeer(peerId);
        }
        presencePeersRef.current = nextPeerSet;

        setParticipants((prev) => {
          const byId = new Map(prev.map((participant) => [participant.id, participant]));
          return peerIds.map(
            (peerId) =>
              byId.get(peerId) ?? {
                id: peerId,
                stream: remoteStreamsRef.current.get(peerId) ?? null,
                isMuted: false,
                isVideoOn: true,
                isScreenSharing: false,
                isHandRaised: false,
              },
          );
        });
      };

      const acceptSignal = (signal: SignalPayload) => {
        if (!signal?.from || signal.from === user.id) return false;
        if (signal.to && signal.to !== user.id) return false;
        if (!shouldConnectToPeer(signal.from)) return false;
        return !markSignalSeen(signal.signalId);
      };

      channel
        .on("presence", { event: "sync" }, syncPresence)
        .on("presence", { event: "join" }, syncPresence)
        .on("presence", { event: "leave" }, syncPresence)
        .on("broadcast", { event: "ready" }, async ({ payload }) => {
          const signal = payload as SignalPayload;
          if (!acceptSignal(signal)) return;
          await handleReady(signal.from, signal);
        })
        .on("broadcast", { event: "offer" }, async ({ payload }) => {
          const signal = payload as SignalPayload;
          if (!acceptSignal(signal) || !signal.sdp) return;
          await handleOffer(signal.from, signal);
        })
        .on("broadcast", { event: "answer" }, async ({ payload }) => {
          const signal = payload as SignalPayload;
          if (!acceptSignal(signal) || !signal.sdp) return;
          await handleAnswer(signal.from, signal);
        })
        .on("broadcast", { event: "ice" }, async ({ payload }) => {
          const signal = payload as SignalPayload;
          if (!acceptSignal(signal) || !signal.candidate) return;
          await handleIce(signal.from, signal);
        })
        .on("broadcast", { event: "media" }, ({ payload }) => {
          const signal = payload as SignalPayload;
          if (!acceptSignal(signal) || !signal.mediaState) return;
          setParticipants((prev) =>
            prev.map((participant) =>
              participant.id === signal.from
                ? { ...participant, ...signal.mediaState }
                : participant,
            ),
          );
        })
        .on("broadcast", { event: "leave" }, ({ payload }) => {
          const signal = payload as SignalPayload;
          if (!acceptSignal(signal)) return;
          closePeer(signal.from);
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
              created_at?: string;
            };
            if (signalRow.sender_id === user.id) return;
            if (signalRow.target_user_id && signalRow.target_user_id !== user.id) return;
            if (!shouldConnectToPeer(signalRow.sender_id)) return;
            const signal = (signalRow.payload ?? {}) as unknown as SignalPayload;
            if (!isFreshNativeSignal(joinedAtRef.current, signal.sentAt, signalRow.created_at)) return;
            if (markSignalSeen(signal.signalId ?? signalRow.id)) return;
            if (signalRow.type === "offer" && signal.sdp) await handleOffer(signalRow.sender_id, signal);
            if (signalRow.type === "answer" && signal.sdp) await handleAnswer(signalRow.sender_id, signal);
            if (signalRow.type === "ice" && signal.candidate) await handleIce(signalRow.sender_id, signal);
          },
        );
      }

      channel.subscribe(async (status) => {
        console.info("[WebRTC] signaling channel status", { roomId, status });
        if (status === "SUBSCRIBED") {
          setIsConnecting(false);
          setIsReconnecting(false);
          setError(null);
          try {
            await channel.track({
              online_at: new Date().toISOString(),
              session_id: sessionIdRef.current,
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

          // This fresh ready frame is the source of truth for negotiation. If the
          // other browser joined earlier it receives this and creates a new offer;
          // no stale database backlog is required for normal calls.
          await sendSignal("ready", { from: user.id });
          syncPresence();

          if (shouldPersistSignals()) {
            const since = new Date(joinedAtRef.current - 15_000).toISOString();
            const { data: backlog, error: backlogError } = await supabase
              .from("call_signals")
              .select("id, sender_id, target_user_id, type, payload, created_at")
              .eq("call_id", roomId)
              .neq("sender_id", user.id)
              .or(`target_user_id.is.null,target_user_id.eq.${user.id}`)
              .gte("created_at", since)
              .order("created_at", { ascending: true })
              .limit(100);

            if (backlogError) {
              console.warn("[WebRTC] optional signal backlog unavailable", backlogError);
            } else {
              for (const row of backlog ?? []) {
                if (!shouldConnectToPeer(row.sender_id)) continue;
                const signal = (row.payload ?? {}) as unknown as SignalPayload;
                if (!isFreshNativeSignal(joinedAtRef.current, signal.sentAt, row.created_at)) continue;
                if (markSignalSeen(signal.signalId ?? row.id)) continue;
                if (row.type === "offer" && signal.sdp) await handleOffer(row.sender_id, signal);
                if (row.type === "answer" && signal.sdp) await handleAnswer(row.sender_id, signal);
                if (row.type === "ice" && signal.candidate) await handleIce(row.sender_id, signal);
              }
            }
          }

          startQualityMonitoring();
          return;
        }

        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          setIsConnecting(false);
          setIsReconnecting(true);
          setError("Realtime signaling vaqtincha uzildi. Qayta ulanmoqda…");
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
      cleanupRoom,
      closePeer,
      ensurePeerConnection,
      handleAnswer,
      handleIce,
      handleOffer,
      handleReady,
      hostId,
      markSignalSeen,
      roomId,
      sendSignal,
      shouldConnectToPeer,
      shouldPersistSignals,
      startLocalStream,
      startQualityMonitoring,
      topology,
      user?.id,
    ],
  );

  const leaveRoom = useCallback(() => {
    leavingRoomRef.current = true;
    if (user?.id && channelRef.current) {
      // Presence leave is the reliable cleanup signal. This frame only speeds up
      // remote UI cleanup and is intentionally never persisted.
      void sendSignal("leave", { from: user.id });
    }
    cleanupRoom();
    setError(null);
  }, [cleanupRoom, sendSignal, user?.id]);

  const broadcastMediaState = useCallback(
    (next: { isMuted: boolean; isVideoOn: boolean; isScreenSharing: boolean; isHandRaised: boolean }) => {
      if (!user?.id) return;
      void sendSignal("media", { from: user.id, mediaState: next });
    },
    [sendSignal, user?.id],
  );

  const toggleMute = useCallback(() => {
    if (!canPublishMedia) return;
    const track = localStreamRef.current?.getAudioTracks()[0];
    if (!track) return;
    track.enabled = !track.enabled;
    const nextMuted = !track.enabled;
    setIsMuted(nextMuted);
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

    const replaceVideoTrack = async (track: MediaStreamTrack | null) => {
      await Promise.all(
        Array.from(peerConnectionsRef.current.values()).map(async (pc) => {
          const sender = pc.getSenders().find((item) => item.track?.kind === "video");
          if (sender) await sender.replaceTrack(track);
        }),
      );
    };

    if (isScreenSharing && screenStreamRef.current) {
      screenStreamRef.current.getTracks().forEach((track) => track.stop());
      screenStreamRef.current = null;
      setScreenStream(null);
      setIsScreenSharing(false);
      await replaceVideoTrack(localStreamRef.current?.getVideoTracks()[0] ?? null);
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
      await replaceVideoTrack(screenTrack);

      screenTrack.onended = () => {
        screenStreamRef.current = null;
        setScreenStream(null);
        setIsScreenSharing(false);
        void replaceVideoTrack(localStreamRef.current?.getVideoTracks()[0] ?? null);
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
            }),
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
    [canPublishMedia, isScreenSharing, isVideoOn],
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
          }),
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
    [canPublishMedia, isMuted],
  );

  const switchCamera = useCallback(async (): Promise<boolean> => {
    if (!canPublishMedia || !localStreamRef.current || !isVideoOn) return false;
    try {
      const cameras = (await navigator.mediaDevices.enumerateDevices()).filter(
        (device) => device.kind === "videoinput",
      );
      if (cameras.length < 2) return false;
      const currentId = localStreamRef.current.getVideoTracks()[0]?.getSettings().deviceId;
      const currentIndex = Math.max(0, cameras.findIndex((camera) => camera.deviceId === currentId));
      return selectCamera(cameras[(currentIndex + 1) % cameras.length].deviceId);
    } catch {
      return false;
    }
  }, [canPublishMedia, isVideoOn, selectCamera]);

  const toggleHandRaise = useCallback(() => {
    const next = !isHandRaised;
    setIsHandRaised(next);
    broadcastMediaState({ isMuted, isVideoOn, isScreenSharing, isHandRaised: next });
  }, [broadcastMediaState, isHandRaised, isMuted, isScreenSharing, isVideoOn]);

  // Unmount cleanup must not depend on a changing callback identity. The old
  // effect depended on leaveRoom; option/callback changes could therefore run
  // cleanup during a live call.
  const cleanupLatestRef = useRef(cleanupRoom);
  cleanupLatestRef.current = cleanupRoom;
  useEffect(() => {
    return () => cleanupLatestRef.current();
  }, []);

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

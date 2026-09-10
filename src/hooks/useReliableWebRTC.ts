import { useCallback, useEffect, useRef, useState } from "react";
import { getIceServers, loadIceServers } from "@/lib/iceServers";
import {
  isFreshNativeSignal,
  shouldInitiateNativePeer,
  type NativeWebRTCTopology,
} from "@/lib/webrtcSignalPolicy";
import {
  WEBRTC_PEER_CONNECTION_TIMEOUT_MS,
  WEBRTC_PRESENCE_LEAVE_GRACE_MS,
  decidePeerSession,
  expandIceServersForReliability,
  hasConfiguredTurnRelay,
  iceRestartDelayMs,
  negotiationMatches,
} from "@/lib/webrtcReliability";
import { shouldReserveVideoTransceiver } from "@/lib/callMediaPolicy";
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
  topology?: WebRTCTopology;
  hostId?: string | null;
  persistSignals?: boolean;
  publishMedia?: boolean;
}

type SignalEvent = "ready" | "offer" | "answer" | "ice" | "media" | "leave";
type PersistedSignalEvent = "offer" | "answer" | "ice";
type RestartReason = "failed" | "disconnected" | "timeout" | "remote-request";

type MediaState = {
  isMuted: boolean;
  isVideoOn: boolean;
  isScreenSharing: boolean;
  isHandRaised: boolean;
};

type SignalPayload = {
  from: string;
  to?: string;
  signalId?: string;
  sessionId?: string;
  sentAt?: number;
  negotiationId?: string;
  restartRequested?: boolean;
  restart?: boolean;
  sdp?: RTCSessionDescriptionInit;
  candidate?: RTCIceCandidateInit;
  mediaState?: MediaState;
};

type CandidateEnvelope = {
  candidate: RTCIceCandidateInit;
  negotiationId?: string;
};

const DEFAULT_ICE_SERVERS = expandIceServersForReliability(getIceServers());
const QUALITY_CHECK_INTERVAL = 5000;
const ICE_RESTART_LIMIT = 3;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DEFAULT_CAMERA_CONSTRAINTS: MediaTrackConstraints = {
  width: { ideal: 1280, max: 1920 },
  height: { ideal: 720, max: 1080 },
  frameRate: { ideal: 30, max: 60 },
  facingMode: "user",
};

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

function isConnectionAlive(pc: RTCPeerConnection) {
  return pc.connectionState === "connected" || pc.iceConnectionState === "connected" || pc.iceConnectionState === "completed";
}

function videoSenderFor(pc: RTCPeerConnection): RTCRtpSender | null {
  const transceiver = pc.getTransceivers().find(
    (item) => item.sender.track?.kind === "video" || item.receiver.track?.kind === "video",
  );
  return transceiver?.sender ?? pc.getSenders().find((item) => item.track?.kind === "video") ?? null;
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
  const [isVideoOn, setIsVideoOn] = useState(false);
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
  const pendingCandidatesRef = useRef<Map<string, CandidateEnvelope[]>>(new Map());
  const negotiationQueuesRef = useRef<Map<string, Promise<void>>>(new Map());
  const makingOfferRef = useRef<Set<string>>(new Set());
  const pendingOfferRef = useRef<Map<string, string>>(new Map());
  const currentNegotiationRef = useRef<Map<string, string>>(new Map());
  const restartInFlightRef = useRef<Set<string>>(new Set());
  const seenSignalIdsRef = useRef<Set<string>>(new Set());
  const readyPeersRef = useRef<Set<string>>(new Set());
  const presencePeersRef = useRef<Set<string>>(new Set());
  const peerSessionsRef = useRef<Map<string, string>>(new Map());
  const peerSessionSeenAtRef = useRef<Map<string, number>>(new Map());
  const restartAttemptsRef = useRef<Map<string, number>>(new Map());
  const restartTimersRef = useRef<Map<string, number>>(new Map());
  const departureTimersRef = useRef<Map<string, number>>(new Map());
  const connectionWatchdogsRef = useRef<Map<string, number>>(new Map());
  const candidateTypesRef = useRef<Map<string, Set<string>>>(new Map());
  const relayMissingPeersRef = useRef<Set<string>>(new Set());
  const qualityPreviousRef = useRef<Map<string, { bytes: number; at: number }>>(new Map());
  const qualityIntervalRef = useRef<ReturnType<typeof window.setInterval> | null>(null);
  const currentRoomRef = useRef<string | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const screenStreamRef = useRef<MediaStream | null>(null);
  const iceServersRef = useRef<RTCIceServer[] | null>(null);
  const relayConfiguredRef = useRef(false);
  const sessionIdRef = useRef<string | null>(null);
  const joinedAtRef = useRef(0);
  const leavingRoomRef = useRef(false);
  const callStartedStampedRef = useRef(false);
  const roomGenerationRef = useRef(0);
  const joiningRoomRef = useRef<{ roomId: string; promise: Promise<void> } | null>(null);
  const handRaisedRef = useRef(false);

  const currentMediaState = useCallback((): MediaState => {
    const audioTrack = localStreamRef.current?.getAudioTracks()[0];
    const videoTrack = localStreamRef.current?.getVideoTracks()[0];
    return {
      isMuted: !audioTrack || !audioTrack.enabled,
      isVideoOn: Boolean(videoTrack && videoTrack.readyState === "live" && videoTrack.enabled),
      isScreenSharing: Boolean(screenStreamRef.current),
      isHandRaised: handRaisedRef.current,
    };
  }, []);

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
    const connected = Array.from(peerConnectionsRef.current.values()).some(isConnectionAlive);
    setIsConnected(connected);
    if (!connected && peerConnectionsRef.current.size === 0) {
      setConnectionQuality({ bitrate: 0, packetLoss: 0, latency: 0, quality: "disconnected" });
    }
  }, []);

  const clearPeerTimers = useCallback((peerId: string) => {
    const restartTimer = restartTimersRef.current.get(peerId);
    if (restartTimer) window.clearTimeout(restartTimer);
    restartTimersRef.current.delete(peerId);

    const departureTimer = departureTimersRef.current.get(peerId);
    if (departureTimer) window.clearTimeout(departureTimer);
    departureTimersRef.current.delete(peerId);

    const watchdog = connectionWatchdogsRef.current.get(peerId);
    if (watchdog) window.clearTimeout(watchdog);
    connectionWatchdogsRef.current.delete(peerId);
  }, []);

  const closePeer = useCallback(
    (peerId: string, preservePresence = false) => {
      clearPeerTimers(peerId);
      const pc = peerConnectionsRef.current.get(peerId);
      if (pc) {
        pc.onicecandidate = null;
        pc.onicegatheringstatechange = null;
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
      pendingOfferRef.current.delete(peerId);
      currentNegotiationRef.current.delete(peerId);
      restartInFlightRef.current.delete(peerId);
      readyPeersRef.current.delete(peerId);
      if (!preservePresence) presencePeersRef.current.delete(peerId);
      peerSessionsRef.current.delete(peerId);
      peerSessionSeenAtRef.current.delete(peerId);
      restartAttemptsRef.current.delete(peerId);
      candidateTypesRef.current.delete(peerId);
      relayMissingPeersRef.current.delete(peerId);
      qualityPreviousRef.current.delete(peerId);
      setParticipants((prev) => prev.filter((participant) => participant.id !== peerId));
      window.setTimeout(recomputeConnected, 0);
    },
    [clearPeerTimers, recomputeConnected],
  );

  const registerPeerSession = useCallback(
    (
      peerId: string,
      sessionId?: string,
      sentAt?: number,
      authoritative = false,
    ) => {
      const previousSession = peerSessionsRef.current.get(peerId);
      const previousSeenAt = peerSessionSeenAtRef.current.get(peerId);
      const decision = decidePeerSession(
        previousSession,
        previousSeenAt,
        sessionId,
        sentAt,
        authoritative,
      );

      if (decision === "reject") {
        console.info("[WebRTC] stale peer session signal ignored", {
          peerId,
          authoritative,
        });
        return false;
      }

      if (decision === "replace" && sessionId) {
        if (previousSession && previousSession !== sessionId) {
          console.info("[WebRTC] newer peer browser session detected; rebuilding", { peerId });
          closePeer(peerId, true);
        }
        peerSessionsRef.current.set(peerId, sessionId);
        peerSessionSeenAtRef.current.set(
          peerId,
          typeof sentAt === "number" && Number.isFinite(sentAt) ? sentAt : Date.now(),
        );
        return true;
      }

      if (sessionId && typeof sentAt === "number" && Number.isFinite(sentAt)) {
        peerSessionSeenAtRef.current.set(peerId, Math.max(previousSeenAt ?? 0, sentAt));
      }
      return true;
    },
    [closePeer],
  );

  const flushPendingCandidates = useCallback(
    async (peerId: string, pc: RTCPeerConnection, negotiationId?: string) => {
      const pending = pendingCandidatesRef.current.get(peerId) ?? [];
      pendingCandidatesRef.current.delete(peerId);
      const keep: CandidateEnvelope[] = [];

      for (const item of pending) {
        if (!negotiationMatches(negotiationId, item.negotiationId)) {
          keep.push(item);
          continue;
        }
        try {
          await pc.addIceCandidate(new RTCIceCandidate(item.candidate));
        } catch (candidateError) {
          if (!leavingRoomRef.current) {
            console.warn("[WebRTC] queued ICE candidate rejected", { peerId, candidateError });
          }
        }
      }

      if (keep.length > 0) {
        pendingCandidatesRef.current.set(peerId, keep.slice(-128));
      }
    },
    [],
  );

  const negotiatePeer = useCallback(
    (peerId: string, pc: RTCPeerConnection, iceRestart = false) =>
      enqueueNegotiation(peerId, async () => {
        if (!user?.id || leavingRoomRef.current || pc.connectionState === "closed") return;
        if (!shouldConnectToPeer(peerId) || !shouldInitiatePeer(peerId)) return;
        if (!readyPeersRef.current.has(peerId)) return;
        if (pc.signalingState !== "stable" || makingOfferRef.current.has(peerId)) return;
        if (!iceRestart && (pc.localDescription || pc.remoteDescription)) return;
        if (!iceRestart && restartInFlightRef.current.has(peerId)) return;

        const negotiationId = makeSignalId();
        try {
          makingOfferRef.current.add(peerId);
          if (iceRestart) restartInFlightRef.current.add(peerId);
          currentNegotiationRef.current.set(peerId, negotiationId);
          pendingOfferRef.current.set(peerId, negotiationId);

          const offer = await pc.createOffer(iceRestart ? { iceRestart: true } : undefined);
          if (pc.signalingState !== "stable" || pc.connectionState === "closed") return;
          await pc.setLocalDescription(offer);
          if (!pc.localDescription) return;

          console.info("[WebRTC] sending offer", {
            peerId,
            iceRestart,
            negotiationId,
          });
          await sendSignal("offer", {
            from: user.id,
            to: peerId,
            negotiationId,
            restart: iceRestart,
            sdp: pc.localDescription,
          });
        } catch (negotiationError) {
          if (pendingOfferRef.current.get(peerId) === negotiationId) {
            pendingOfferRef.current.delete(peerId);
          }
          if (currentNegotiationRef.current.get(peerId) === negotiationId) {
            currentNegotiationRef.current.delete(peerId);
          }
          restartInFlightRef.current.delete(peerId);
          if (!leavingRoomRef.current) {
            console.error("[WebRTC] offer negotiation failed", { peerId, negotiationError });
          }
        } finally {
          makingOfferRef.current.delete(peerId);
        }
      }),
    [enqueueNegotiation, sendSignal, shouldConnectToPeer, shouldInitiatePeer, user?.id],
  );

  const transportFailureMessage = useCallback((peerId: string) => {
    if (relayConfiguredRef.current && relayMissingPeersRef.current.has(peerId)) {
      return "TURN relay sozlangan, lekin brauzer relay candidate olmadi. TURN server, credential yoki TCP/TLS portini tekshiring.";
    }
    if (!relayConfiguredRef.current) {
      return "Media yo'li ochilmadi. Ishonchli internet qo'ng'irog'i uchun production TURN relay kerak.";
    }
    return "Media aloqasi tiklanmadi. Tarmoq WebRTC trafikini bloklayotgan bo'lishi mumkin.";
  }, []);

  const scheduleIceRestart = useCallback(
    (peerId: string, pc: RTCPeerConnection, reason: RestartReason) => {
      if (leavingRoomRef.current || pc.connectionState === "closed" || isConnectionAlive(pc)) return;
      if (restartTimersRef.current.has(peerId)) return;

      const attempt = restartAttemptsRef.current.get(peerId) ?? 0;
      if (attempt >= ICE_RESTART_LIMIT) {
        setIsReconnecting(false);
        setError(transportFailureMessage(peerId));
        recomputeConnected();
        return;
      }

      setIsReconnecting(true);
      const delay = iceRestartDelayMs(attempt, reason);
      const timer = window.setTimeout(() => {
        restartTimersRef.current.delete(peerId);
        if (leavingRoomRef.current || pc.connectionState === "closed" || isConnectionAlive(pc)) return;

        if (
          pc.signalingState !== "stable" ||
          makingOfferRef.current.has(peerId) ||
          pendingOfferRef.current.has(peerId)
        ) {
          return;
        }

        restartAttemptsRef.current.set(peerId, attempt + 1);
        if (shouldInitiatePeer(peerId)) {
          void negotiatePeer(peerId, pc, true);
        } else if (user?.id) {
          void sendSignal("ready", {
            from: user.id,
            to: peerId,
            restartRequested: true,
          });
        }
      }, delay);
      restartTimersRef.current.set(peerId, timer);
    },
    [negotiatePeer, recomputeConnected, sendSignal, shouldInitiatePeer, transportFailureMessage, user?.id],
  );

  const armConnectionWatchdog = useCallback(
    (peerId: string, pc: RTCPeerConnection) => {
      const existing = connectionWatchdogsRef.current.get(peerId);
      if (existing) window.clearTimeout(existing);

      const timer = window.setTimeout(() => {
        connectionWatchdogsRef.current.delete(peerId);
        if (pc.connectionState === "closed" || isConnectionAlive(pc)) return;
        console.warn("[WebRTC] peer connection timeout", {
          peerId,
          connectionState: pc.connectionState,
          iceConnectionState: pc.iceConnectionState,
          iceGatheringState: pc.iceGatheringState,
          candidateTypes: Array.from(candidateTypesRef.current.get(peerId) ?? []),
        });
        setError(transportFailureMessage(peerId));
        scheduleIceRestart(peerId, pc, "timeout");
      }, WEBRTC_PEER_CONNECTION_TIMEOUT_MS);
      connectionWatchdogsRef.current.set(peerId, timer);
    },
    [scheduleIceRestart, transportFailureMessage],
  );

  const ensurePeerConnection = useCallback(
    (peerId: string, stream: MediaStream) => {
      if (!shouldConnectToPeer(peerId)) return null;
      const existing = peerConnectionsRef.current.get(peerId);
      if (existing) return existing;

      const iceServers = iceServersRef.current ?? DEFAULT_ICE_SERVERS;
      const pc = new RTCPeerConnection({
        iceServers,
        iceCandidatePoolSize: 2,
        bundlePolicy: "max-bundle",
        rtcpMuxPolicy: "require",
        iceTransportPolicy: "all",
      });
      peerConnectionsRef.current.set(peerId, pc);
      candidateTypesRef.current.set(peerId, new Set());
      console.info("[WebRTC] peer connection created", {
        peerId,
        topology,
        turnConfigured: relayConfiguredRef.current,
      });

      if (canPublishMedia) {
        stream.getTracks().forEach((track) => pc.addTrack(track, stream));
        const hasVideoTransceiver = pc.getTransceivers().some(
          (item) => item.sender.track?.kind === "video" || item.receiver.track?.kind === "video",
        );
        if (shouldReserveVideoTransceiver(canPublishMedia, hasVideoTransceiver)) {
          pc.addTransceiver("video", { direction: "sendrecv" });
        }
      }

      pc.onnegotiationneeded = null;

      pc.onicecandidate = (event) => {
        if (!event.candidate || !user?.id) return;
        const type = candidateType(event.candidate);
        const types = candidateTypesRef.current.get(peerId) ?? new Set<string>();
        types.add(type);
        candidateTypesRef.current.set(peerId, types);
        if (type === "relay") relayMissingPeersRef.current.delete(peerId);

        console.info("[WebRTC] local ICE candidate", {
          peerId,
          type,
          protocol: event.candidate.protocol,
        });
        void sendSignal("ice", {
          from: user.id,
          to: peerId,
          negotiationId: currentNegotiationRef.current.get(peerId),
          candidate: event.candidate.toJSON(),
        });
      };

      pc.onicegatheringstatechange = () => {
        if (pc.iceGatheringState !== "complete") return;
        const types = candidateTypesRef.current.get(peerId) ?? new Set<string>();
        if (relayConfiguredRef.current && !types.has("relay")) {
          relayMissingPeersRef.current.add(peerId);
          console.warn("[ICE] TURN is configured but no relay candidate was gathered", {
            peerId,
            candidateTypes: Array.from(types),
          });
        }
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
              isVideoOn: false,
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
          restartInFlightRef.current.delete(peerId);
          pendingOfferRef.current.delete(peerId);
          setIsConnected(true);
          setIsReconnecting(false);
          setError(null);
          void stampCallStartedAt();
          return;
        }
        if (pc.connectionState === "disconnected") {
          recomputeConnected();
          scheduleIceRestart(peerId, pc, "disconnected");
        } else if (pc.connectionState === "failed") {
          recomputeConnected();
          restartInFlightRef.current.delete(peerId);
          pendingOfferRef.current.delete(peerId);
          scheduleIceRestart(peerId, pc, "failed");
        } else if (pc.connectionState === "closed") {
          recomputeConnected();
        }
      };

      pc.oniceconnectionstatechange = () => {
        console.info("[WebRTC] ICE state", { peerId, state: pc.iceConnectionState });
        if (pc.iceConnectionState === "connected" || pc.iceConnectionState === "completed") {
          setIsReconnecting(false);
          setError(null);
        } else if (pc.iceConnectionState === "failed") {
          restartInFlightRef.current.delete(peerId);
          pendingOfferRef.current.delete(peerId);
          scheduleIceRestart(peerId, pc, "failed");
        }
      };

      return pc;
    },
    [
      canPublishMedia,
      clearPeerTimers,
      recomputeConnected,
      scheduleIceRestart,
      sendSignal,
      shouldConnectToPeer,
      stampCallStartedAt,
      topology,
      user?.id,
    ],
  );

  const handleOffer = useCallback(
    async (from: string, signal: SignalPayload) => {
      if (!user?.id || !signal.sdp || !shouldConnectToPeer(from)) return;
      if (!registerPeerSession(from, signal.sessionId, signal.sentAt, false)) return;

      readyPeersRef.current.add(from);
      const pc = ensurePeerConnection(from, localStreamRef.current ?? new MediaStream());
      if (!pc) return;
      const negotiationId = signal.negotiationId ?? makeSignalId();

      await enqueueNegotiation(from, async () => {
        if (pc.connectionState === "closed") return;

        if (
          shouldInitiatePeer(from) &&
          (pc.signalingState === "have-local-offer" || pc.localDescription)
        ) {
          console.info("[WebRTC] unexpected remote offer ignored", { peerId: from });
          return;
        }

        try {
          if (pc.signalingState !== "stable") {
            await pc.setLocalDescription({ type: "rollback" });
          }

          currentNegotiationRef.current.set(from, negotiationId);
          pendingOfferRef.current.delete(from);
          await pc.setRemoteDescription(new RTCSessionDescription(signal.sdp!));
          await flushPendingCandidates(from, pc, negotiationId);
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          if (!pc.localDescription) return;

          console.info("[WebRTC] sending answer", {
            peerId: from,
            negotiationId,
            restart: !!signal.restart,
          });
          await sendSignal("answer", {
            from: user.id,
            to: from,
            negotiationId,
            restart: !!signal.restart,
            sdp: pc.localDescription,
          });
          armConnectionWatchdog(from, pc);
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
      shouldInitiatePeer,
      user?.id,
    ],
  );

  const handleAnswer = useCallback(
    async (from: string, signal: SignalPayload) => {
      if (!signal.sdp || !shouldConnectToPeer(from)) return;
      if (!registerPeerSession(from, signal.sessionId, signal.sentAt, false)) return;
      const pc = peerConnectionsRef.current.get(from);
      if (!pc) return;

      const expectedNegotiationId = pendingOfferRef.current.get(from);
      if (!negotiationMatches(expectedNegotiationId, signal.negotiationId)) {
        console.info("[WebRTC] stale answer ignored", {
          peerId: from,
          expectedNegotiationId,
          incomingNegotiationId: signal.negotiationId,
        });
        return;
      }

      await enqueueNegotiation(from, async () => {
        if (pc.connectionState === "closed" || pc.signalingState !== "have-local-offer") return;
        try {
          await pc.setRemoteDescription(new RTCSessionDescription(signal.sdp!));
          const activeNegotiationId = signal.negotiationId ?? expectedNegotiationId;
          if (activeNegotiationId) currentNegotiationRef.current.set(from, activeNegotiationId);
          await flushPendingCandidates(from, pc, activeNegotiationId);
          if (!signal.negotiationId || pendingOfferRef.current.get(from) === signal.negotiationId) {
            pendingOfferRef.current.delete(from);
          }
          restartInFlightRef.current.delete(from);
          console.info("[WebRTC] answer applied", {
            peerId: from,
            negotiationId: activeNegotiationId,
          });
          armConnectionWatchdog(from, pc);
        } catch (answerError) {
          if (!leavingRoomRef.current) {
            console.error("[WebRTC] handling answer failed", { peerId: from, answerError });
          }
        }
      });
    },
    [
      armConnectionWatchdog,
      enqueueNegotiation,
      flushPendingCandidates,
      registerPeerSession,
      shouldConnectToPeer,
    ],
  );

  const handleIce = useCallback(
    async (from: string, signal: SignalPayload) => {
      if (!signal.candidate || !shouldConnectToPeer(from)) return;
      if (!registerPeerSession(from, signal.sessionId, signal.sentAt, false)) return;
      const pc = peerConnectionsRef.current.get(from);
      const currentNegotiationId = currentNegotiationRef.current.get(from);

      console.info("[WebRTC] remote ICE candidate", {
        peerId: from,
        type: candidateType(signal.candidate),
        negotiationId: signal.negotiationId,
      });

      if (
        !pc ||
        !pc.remoteDescription ||
        !negotiationMatches(currentNegotiationId, signal.negotiationId)
      ) {
        const pending = pendingCandidatesRef.current.get(from) ?? [];
        pending.push({ candidate: signal.candidate, negotiationId: signal.negotiationId });
        pendingCandidatesRef.current.set(from, pending.slice(-128));
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
      if (!registerPeerSession(from, signal.sessionId, signal.sentAt, true)) return;

      const wasReady = readyPeersRef.current.has(from);
      readyPeersRef.current.add(from);
      const pc = ensurePeerConnection(from, localStreamRef.current ?? new MediaStream());
      if (!pc) return;

      console.info("[WebRTC] peer ready", {
        peerId: from,
        initiator: shouldInitiatePeer(from),
        state: pc.connectionState,
        restartRequested: !!signal.restartRequested,
      });

      if (!wasReady) {
        await sendSignal("ready", { from: user.id, to: from });
      }
      await sendSignal("media", {
        from: user.id,
        to: from,
        mediaState: currentMediaState(),
      });

      if (signal.restartRequested && shouldInitiatePeer(from)) {
        scheduleIceRestart(from, pc, "remote-request");
        return;
      }

      if (!shouldInitiatePeer(from)) return;
      if (isConnectionAlive(pc) || pc.signalingState !== "stable") return;

      if (!pc.localDescription && !pc.remoteDescription) {
        armConnectionWatchdog(from, pc);
        void negotiatePeer(from, pc, false);
      }
    },
    [
      armConnectionWatchdog,
      currentMediaState,
      ensurePeerConnection,
      negotiatePeer,
      registerPeerSession,
      scheduleIceRestart,
      sendSignal,
      shouldConnectToPeer,
      shouldInitiatePeer,
      user?.id,
    ],
  );

  const startLocalStream = useCallback(
    async (video = true, audio = true): Promise<MediaStream | null> => {
      const audioConstraints: MediaTrackConstraints = {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
        sampleRate: 48000,
      };
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: video ? DEFAULT_CAMERA_CONSTRAINTS : false,
          audio: audio ? audioConstraints : false,
        });
        localStreamRef.current = stream;
        setLocalStream(stream);
        setIsVideoOn(video && stream.getVideoTracks().length > 0);
        setIsMuted(false);
        return stream;
      } catch (mediaError: any) {
        if (video && mediaError?.name === "OverconstrainedError") {
          try {
            const fallback = await navigator.mediaDevices.getUserMedia({
              video: true,
              audio: audio ? audioConstraints : false,
            });
            localStreamRef.current = fallback;
            setLocalStream(fallback);
            setIsVideoOn(fallback.getVideoTracks().length > 0);
            setIsMuted(false);
            return fallback;
          } catch {
          }
        }

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
      const connectedPeers = peers.filter(([, pc]) => isConnectionAlive(pc));
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
    roomGenerationRef.current += 1;
    joiningRoomRef.current = null;
    stopQualityMonitoring();

    restartTimersRef.current.forEach((timer) => window.clearTimeout(timer));
    restartTimersRef.current.clear();
    departureTimersRef.current.forEach((timer) => window.clearTimeout(timer));
    departureTimersRef.current.clear();
    connectionWatchdogsRef.current.forEach((timer) => window.clearTimeout(timer));
    connectionWatchdogsRef.current.clear();

    peerConnectionsRef.current.forEach((pc) => {
      pc.onicecandidate = null;
      pc.onicegatheringstatechange = null;
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
    pendingOfferRef.current.clear();
    currentNegotiationRef.current.clear();
    restartInFlightRef.current.clear();
    seenSignalIdsRef.current.clear();
    readyPeersRef.current.clear();
    presencePeersRef.current.clear();
    peerSessionsRef.current.clear();
    peerSessionSeenAtRef.current.clear();
    restartAttemptsRef.current.clear();
    candidateTypesRef.current.clear();
    relayMissingPeersRef.current.clear();

    localStreamRef.current?.getTracks().forEach((track) => track.stop());
    screenStreamRef.current?.getTracks().forEach((track) => track.stop());
    localStreamRef.current = null;
    screenStreamRef.current = null;
    handRaisedRef.current = false;
    setLocalStream(null);
    setScreenStream(null);
    setParticipants([]);
    setIsConnected(false);
    setIsConnecting(false);
    setIsReconnecting(false);
    setIsMuted(!canPublishMedia);
    setIsVideoOn(false);
    setIsScreenSharing(false);
    setIsHandRaised(false);
    setConnectionQuality({ bitrate: 0, packetLoss: 0, latency: 0, quality: "disconnected" });

    const channel = channelRef.current;
    channelRef.current = null;
    if (channel) void supabase.removeChannel(channel);

    currentRoomRef.current = null;
    sessionIdRef.current = null;
    joinedAtRef.current = 0;
    relayConfiguredRef.current = false;
    callStartedStampedRef.current = false;
  }, [canPublishMedia, stopQualityMonitoring]);

  const joinRoom = useCallback(
    async (video = true) => {
      if (!roomId || !user?.id) return;
      if (currentRoomRef.current === roomId && channelRef.current) return;
      if (joiningRoomRef.current?.roomId === roomId) {
        return joiningRoomRef.current.promise;
      }
      if (topology === "broadcast" && !hostId) {
        setError("Jonli efir hosti topilmadi");
        return;
      }

      const task = (async () => {
        if (currentRoomRef.current && currentRoomRef.current !== roomId) cleanupRoom();
        leavingRoomRef.current = false;
        setIsConnecting(true);
        setIsReconnecting(false);
        setError(null);
        currentRoomRef.current = roomId;
        sessionIdRef.current = makeSignalId();
        joinedAtRef.current = Date.now();
        callStartedStampedRef.current = false;
        const generation = ++roomGenerationRef.current;

        const loadedIceServers = expandIceServersForReliability(await loadIceServers());
        if (generation !== roomGenerationRef.current || leavingRoomRef.current) return;
        iceServersRef.current = loadedIceServers;
        relayConfiguredRef.current = hasConfiguredTurnRelay(loadedIceServers);
        console.info("[ICE] WebRTC transport configuration loaded", {
          turnConfigured: relayConfiguredRef.current,
          serverEntries: loadedIceServers.length,
        });

        let stream: MediaStream;
        if (canPublishMedia) {
          const captured = await startLocalStream(video, true);
          if (!captured) {
            if (generation === roomGenerationRef.current) {
              currentRoomRef.current = null;
              sessionIdRef.current = null;
              setIsConnecting(false);
            }
            return;
          }
          if (generation !== roomGenerationRef.current || leavingRoomRef.current) {
            captured.getTracks().forEach((track) => track.stop());
            if (localStreamRef.current === captured) {
              localStreamRef.current = null;
              setLocalStream(null);
            }
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
        if (generation !== roomGenerationRef.current || leavingRoomRef.current) {
          void supabase.removeChannel(channel);
          return;
        }
        channelRef.current = channel;

        const syncPresence = () => {
          const state = channel.presenceState();
          const peerIds = Object.keys(state).filter((peerId) => shouldConnectToPeer(peerId));
          const nextPeerSet = new Set(peerIds);
          const previousPeerSet = new Set(presencePeersRef.current);
          presencePeersRef.current = nextPeerSet;

          for (const peerId of peerIds) {
            const departureTimer = departureTimersRef.current.get(peerId);
            if (departureTimer) window.clearTimeout(departureTimer);
            departureTimersRef.current.delete(peerId);

            const pc = ensurePeerConnection(peerId, stream);
            if (!pc) continue;
            if (!previousPeerSet.has(peerId)) {
              console.info("[WebRTC] presence peer discovered", { peerId });
              void sendSignal("ready", { from: user.id, to: peerId });
            }
          }

          for (const peerId of previousPeerSet) {
            if (nextPeerSet.has(peerId) || departureTimersRef.current.has(peerId)) continue;
            const timer = window.setTimeout(() => {
              departureTimersRef.current.delete(peerId);
              if (presencePeersRef.current.has(peerId)) return;
              console.info("[WebRTC] peer presence expired after grace period", { peerId });
              closePeer(peerId);
            }, WEBRTC_PRESENCE_LEAVE_GRACE_MS);
            departureTimersRef.current.set(peerId, timer);
          }

          setParticipants((prev) => {
            const byId = new Map(prev.map((participant) => [participant.id, participant]));
            const next = [...prev];
            for (const peerId of peerIds) {
              if (byId.has(peerId)) continue;
              next.push({
                id: peerId,
                stream: remoteStreamsRef.current.get(peerId) ?? null,
                isMuted: false,
                isVideoOn: false,
                isScreenSharing: false,
                isHandRaised: false,
              });
            }
            return next;
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
          if (generation !== roomGenerationRef.current) return;

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

            await sendSignal("ready", { from: user.id });
            await sendSignal("media", { from: user.id, mediaState: currentMediaState() });
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
      })();

      joiningRoomRef.current = { roomId, promise: task };
      try {
        await task;
      } finally {
        if (joiningRoomRef.current?.promise === task) joiningRoomRef.current = null;
      }
    },
    [
      canPublishMedia,
      cleanupRoom,
      closePeer,
      currentMediaState,
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
      void sendSignal("leave", { from: user.id });
    }
    cleanupRoom();
    setError(null);
  }, [cleanupRoom, sendSignal, user?.id]);

  const broadcastMediaState = useCallback(
    (next: MediaState) => {
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

  const replaceOutgoingVideoTrack = useCallback(async (track: MediaStreamTrack | null) => {
    await Promise.all(
      Array.from(peerConnectionsRef.current.entries()).map(async ([peerId, pc]) => {
        const sender = videoSenderFor(pc);
        if (!sender) {
          console.warn("[WebRTC] video sender is unavailable for media upgrade", { peerId });
          return;
        }
        try {
          await sender.replaceTrack(track);
        } catch (replaceError) {
          console.warn("[WebRTC] video track replacement failed", { peerId, replaceError });
        }
      }),
    );
  }, []);

  const toggleVideo = useCallback(async () => {
    if (!canPublishMedia) return;

    const existingTrack = localStreamRef.current?.getVideoTracks()[0];
    if (existingTrack && existingTrack.readyState === "live") {
      existingTrack.enabled = !existingTrack.enabled;
      const nextVideo = existingTrack.enabled;
      setIsVideoOn(nextVideo);
      broadcastMediaState({
        isMuted,
        isVideoOn: nextVideo,
        isScreenSharing,
        isHandRaised,
      });
      return;
    }

    if (!navigator.mediaDevices?.getUserMedia) {
      toast({
        title: "Kamera mavjud emas",
        description: "Bu qurilma brauzeri kamerani qo'llab-quvvatlamaydi.",
        variant: "destructive",
      });
      return;
    }

    try {
      let cameraStream: MediaStream;
      try {
        cameraStream = await navigator.mediaDevices.getUserMedia({
          video: DEFAULT_CAMERA_CONSTRAINTS,
          audio: false,
        });
      } catch (cameraError: any) {
        if (cameraError?.name !== "OverconstrainedError") throw cameraError;
        cameraStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      }

      const cameraTrack = cameraStream.getVideoTracks()[0];
      if (!cameraTrack) throw new Error("Camera track is unavailable");
      cameraTrack.enabled = true;

      const previous = localStreamRef.current ?? new MediaStream();
      previous.getVideoTracks().forEach((track) => track.stop());
      const nextStream = new MediaStream([...previous.getAudioTracks(), cameraTrack]);
      localStreamRef.current = nextStream;
      setLocalStream(nextStream);

      if (!isScreenSharing) {
        await replaceOutgoingVideoTrack(cameraTrack);
      }

      setIsVideoOn(true);
      setError(null);
      broadcastMediaState({
        isMuted,
        isVideoOn: true,
        isScreenSharing,
        isHandRaised,
      });
    } catch (cameraError: any) {
      console.warn("[WebRTC] camera enable failed", cameraError);
      let message = "Kamerani yoqib bo'lmadi.";
      if (cameraError?.name === "NotAllowedError") {
        message = "Kameraga ruxsat berilmagan. Brauzer sayt sozlamalaridan kamera ruxsatini yoqing.";
      } else if (cameraError?.name === "NotFoundError") {
        message = "Kamera topilmadi.";
      } else if (cameraError?.name === "NotReadableError") {
        message = "Kamera boshqa dastur tomonidan band.";
      }
      toast({ title: "Kamera", description: message, variant: "destructive" });
    }
  }, [
    broadcastMediaState,
    canPublishMedia,
    isHandRaised,
    isMuted,
    isScreenSharing,
    replaceOutgoingVideoTrack,
    toast,
  ]);

  const toggleScreenShare = useCallback(async () => {
    if (!canPublishMedia) return;

    if (isScreenSharing && screenStreamRef.current) {
      screenStreamRef.current.getTracks().forEach((track) => track.stop());
      screenStreamRef.current = null;
      setScreenStream(null);
      setIsScreenSharing(false);
      await replaceOutgoingVideoTrack(localStreamRef.current?.getVideoTracks()[0] ?? null);
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
      await replaceOutgoingVideoTrack(screenTrack);

      screenTrack.onended = () => {
        screenStreamRef.current = null;
        setScreenStream(null);
        setIsScreenSharing(false);
        void replaceOutgoingVideoTrack(localStreamRef.current?.getVideoTracks()[0] ?? null);
        broadcastMediaState({ isMuted, isVideoOn, isScreenSharing: false, isHandRaised });
      };
      broadcastMediaState({ isMuted, isVideoOn, isScreenSharing: true, isHandRaised });
    } catch (screenError) {
      console.warn("[WebRTC] screen sharing failed", screenError);
    }
  }, [
    broadcastMediaState,
    canPublishMedia,
    isHandRaised,
    isMuted,
    isScreenSharing,
    isVideoOn,
    replaceOutgoingVideoTrack,
  ]);

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
          await replaceOutgoingVideoTrack(nextTrack);
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
    [canPublishMedia, isScreenSharing, isVideoOn, replaceOutgoingVideoTrack],
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
    handRaisedRef.current = next;
    setIsHandRaised(next);
    broadcastMediaState({ isMuted, isVideoOn, isScreenSharing, isHandRaised: next });
  }, [broadcastMediaState, isHandRaised, isMuted, isScreenSharing, isVideoOn]);

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

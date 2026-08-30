import { useState, useEffect, useRef, useCallback } from "react";
import { getIceServers } from "@/lib/iceServers";
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

interface WebRTCConfig {
  iceServers: RTCIceServer[];
}

const DEFAULT_CONFIG: WebRTCConfig = {
  iceServers: getIceServers(),
};

const QUALITY_CHECK_INTERVAL = 5000;

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
  const [connectionQuality, setConnectionQuality] = useState<ConnectionQuality>({
    bitrate: 0,
    packetLoss: 0,
    latency: 0,
    quality: "disconnected",
  });

  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const peerConnectionsRef = useRef<Map<string, RTCPeerConnection>>(new Map());
  const pendingCandidatesRef = useRef<Map<string, RTCIceCandidateInit[]>>(new Map());
  const qualityIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const qualityPreviousRef = useRef<Map<string, { bytes: number; at: number }>>(new Map());
  const currentRoomRef = useRef<string | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const leavingRoomRef = useRef(false);
  const reconnectTimersRef = useRef<Map<string, number>>(new Map());
  const restartAttemptsRef = useRef<Map<string, number>>(new Map());
  const seenSignalIdsRef = useRef<Set<string>>(new Set());

  // Perfect-negotiation helpers
  const makingOfferRef = useRef<Map<string, boolean>>(new Map());
  const ignoreOfferRef = useRef<Map<string, boolean>>(new Map());

  // Shared call timer start (persisted once to backend so both clients match)
  const callStartedStampedRef = useRef(false);
  const stampCallStartedAt = useCallback(async () => {
    if (!roomId) return;
    if (callStartedStampedRef.current) return;
    callStartedStampedRef.current = true;

    const startedAt = new Date().toISOString();
    try {
      await supabase
        .from('video_calls')
        .update({ started_at: startedAt })
        .eq('id', roomId)
        .is('started_at', null);
    } catch {
      // ignore
    }
  }, [roomId]);

  const calculateQuality = useCallback(
    (bitrate: number, packetLoss: number, latency: number): ConnectionQuality["quality"] => {
      if (bitrate === 0) return "disconnected";
      if (packetLoss < 1 && latency < 100 && bitrate > 500000) return "excellent";
      if (packetLoss < 5 && latency < 200 && bitrate > 200000) return "good";
      return "poor";
    },
    []
  );

  const startQualityMonitoring = useCallback(() => {
    if (qualityIntervalRef.current) return;

    const collect = async () => {
      const pcs = Array.from(peerConnectionsRef.current.entries());
      if (pcs.length === 0) {
        setConnectionQuality({ bitrate: 0, packetLoss: 0, latency: 0, quality: "disconnected" });
        return;
      }

      let totalBitrate = 0;
      let totalPacketLoss = 0;
      let totalLatency = 0;
      let latencySamples = 0;
      let lossSamples = 0;

      for (const [peerId, pc] of pcs) {
        try {
          const stats = await pc.getStats();
          let bytes = 0;
          let packetsLost = 0;
          let packetsTotal = 0;

          stats.forEach((report) => {
            if (
              report.type === "candidate-pair" &&
              report.state === "succeeded" &&
              typeof (report as any).currentRoundTripTime === "number"
            ) {
              totalLatency += ((report as any).currentRoundTripTime as number) * 1000;
              latencySamples += 1;
            }

            if (
              (report.type === "outbound-rtp" || report.type === "inbound-rtp") &&
              !(report as any).isRemote
            ) {
              bytes += Number((report as any).bytesSent ?? (report as any).bytesReceived ?? 0);
              packetsLost += Math.max(0, Number((report as any).packetsLost ?? 0));
              packetsTotal += Math.max(
                0,
                Number((report as any).packetsSent ?? (report as any).packetsReceived ?? 0)
              );
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
          // A single peer failing stats collection must not break the call.
        }
      }

      const avgLatency = latencySamples > 0 ? totalLatency / latencySamples : 0;
      const avgPacketLoss = lossSamples > 0 ? totalPacketLoss / lossSamples : 0;
      const avgBitrate = pcs.length > 0 ? totalBitrate / pcs.length : 0;

      setConnectionQuality({
        bitrate: avgBitrate,
        packetLoss: avgPacketLoss,
        latency: avgLatency,
        quality: calculateQuality(avgBitrate, avgPacketLoss, avgLatency),
      });
    };

    void collect();
    qualityIntervalRef.current = setInterval(collect, QUALITY_CHECK_INTERVAL);
  }, [calculateQuality]);

  const stopQualityMonitoring = useCallback(() => {
    if (qualityIntervalRef.current) {
      clearInterval(qualityIntervalRef.current);
      qualityIntervalRef.current = null;
    }
    qualityPreviousRef.current.clear();
  }, []);

  const isPoliteForPeer = useCallback(
    (peerId: string) => {
      // Deterministic: lower uuid string is "polite" to avoid offer collisions.
      // (Either direction works as long as both sides compute the same rule.)
      if (!user?.id) return true;
      return user.id.localeCompare(peerId) < 0;
    },
    [user?.id]
  );

  /**
   * Durable signaling fallback.
   *
   * Broadcast gives low latency. The same frame is persisted to call_signals so
   * a peer that subscribes a moment late can replay the backlog. Each frame has
   * a client-generated signalId, therefore receiving it from both transports is
   * safe and idempotent.
   */
  const markSignalSeen = useCallback((signalId?: string | null) => {
    if (!signalId) return false;
    if (seenSignalIdsRef.current.has(signalId)) return true;
    seenSignalIdsRef.current.add(signalId);

    // SDP/ICE sessions are short lived. Bound memory even on very long calls.
    if (seenSignalIdsRef.current.size > 2000) {
      const oldest = seenSignalIdsRef.current.values().next().value as string | undefined;
      if (oldest) seenSignalIdsRef.current.delete(oldest);
    }
    return false;
  }, []);

  const persistSignal = useCallback(
    async (event: "offer" | "answer" | "ice" | "leave", payload: SignalPayload) => {
      if (!roomId || !user?.id) return;
      const { error: persistError } = await supabase.from("call_signals").insert({
        call_id: roomId,
        sender_id: user.id,
        target_user_id: payload.to ?? null,
        type: event,
        payload: payload as unknown as Json,
      });
      if (persistError) {
        console.warn("[WebRTC] persistSignal failed", persistError);
      }
    },
    [roomId, user?.id]
  );

  const sendSignal = useCallback(
    async (event: "offer" | "answer" | "ice" | "media" | "leave", payload: SignalPayload) => {
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

      const ch = channelRef.current;
      if (ch) {
        const status = await ch.send({
          type: "broadcast",
          event,
          payload: frame,
        });
        if (status !== "ok" && !leavingRoomRef.current) {
          console.warn("[WebRTC] broadcast signal failed", event, status);
        }
      }

      if (event !== "media") {
        void persistSignal(event, frame);
      }
    },
    [persistSignal]
  );


  const closePeer = useCallback((peerId: string) => {
    const pc = peerConnectionsRef.current.get(peerId);
    if (pc) {
      pc.onicecandidate = null;
      pc.ontrack = null;
      pc.onconnectionstatechange = null;
      pc.oniceconnectionstatechange = null;
      pc.onsignalingstatechange = null;
      pc.close();
    }
    peerConnectionsRef.current.delete(peerId);
    pendingCandidatesRef.current.delete(peerId);
    makingOfferRef.current.delete(peerId);
    ignoreOfferRef.current.delete(peerId);

    setParticipants((prev) => prev.filter((p) => p.id !== peerId));
  }, []);

  const scheduleIceRestart = useCallback((peerId: string, pc: RTCPeerConnection) => {
    if (leavingRoomRef.current || pc.connectionState === "closed") return;

    const previousTimer = reconnectTimersRef.current.get(peerId);
    if (previousTimer) window.clearTimeout(previousTimer);

    const attempt = restartAttemptsRef.current.get(peerId) ?? 0;
    if (attempt >= 4) {
      setError("Peer connection could not be restored");
      setIsReconnecting(false);
      return;
    }

    setIsReconnecting(true);
    const delay = Math.min(1000 * 2 ** attempt, 8000);
    const timer = window.setTimeout(() => {
      reconnectTimersRef.current.delete(peerId);
      if (
        pc.connectionState === "failed" ||
        pc.connectionState === "disconnected" ||
        pc.iceConnectionState === "failed" ||
        pc.iceConnectionState === "disconnected"
      ) {
        restartAttemptsRef.current.set(peerId, attempt + 1);
        try {
          pc.restartIce();
        } catch {
          // A following state transition/backlog signal can still recover it.
        }
      }
    }, delay);
    reconnectTimersRef.current.set(peerId, timer);
  }, []);

  const ensurePeerConnection = useCallback(
    (peerId: string, stream: MediaStream) => {
      const existing = peerConnectionsRef.current.get(peerId);
      if (existing) return existing;

      const pc = new RTCPeerConnection(DEFAULT_CONFIG);

      // Perfect negotiation: respond to negotiationneeded
      pc.onnegotiationneeded = async () => {
        try {
          makingOfferRef.current.set(peerId, true);
          const offer = await pc.createOffer();
          if (pc.signalingState !== "stable") return;
          await pc.setLocalDescription(offer);

          if (!user?.id) return;
          await sendSignal("offer", {
            from: user.id,
            to: peerId,
            sdp: pc.localDescription ?? offer,
          });
        } catch (e) {
          console.error("[WebRTC] negotiationneeded error", e);
        } finally {
          makingOfferRef.current.set(peerId, false);
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
        const remoteFromStreams = event.streams?.[0] ?? null;
        const remote = remoteFromStreams ?? (() => {
          const ms = new MediaStream();
          ms.addTrack(event.track);
          return ms;
        })();

        setParticipants((prev) => {
          const existingP = prev.find((p) => p.id === peerId);
          if (existingP) {
            return prev.map((p) => (p.id === peerId ? { ...p, stream: remote } : p));
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

      // Add local tracks *after* handlers are attached so we don't miss negotiationneeded.
      stream.getTracks().forEach((track) => {
        pc.addTrack(track, stream);
      });

      peerConnectionsRef.current.set(peerId, pc);
      return pc;
    },
    [scheduleIceRestart, sendSignal, stampCallStartedAt, user?.id]
  );

  const handleOffer = useCallback(
    async (from: string, sdp: RTCSessionDescriptionInit) => {
      const stream = localStreamRef.current;
      if (!stream || !user?.id) return;

      const pc = ensurePeerConnection(from, stream);

      const makingOffer = makingOfferRef.current.get(from) ?? false;
      const offerCollision = makingOffer || pc.signalingState !== "stable";
      const polite = isPoliteForPeer(from);

      const shouldIgnore = !polite && offerCollision;
      ignoreOfferRef.current.set(from, shouldIgnore);
      if (shouldIgnore) return;

      try {
        await pc.setRemoteDescription(new RTCSessionDescription(sdp));

        // drain pending ICE
        const pending = pendingCandidatesRef.current.get(from) || [];
        for (const c of pending) {
          try {
            await pc.addIceCandidate(new RTCIceCandidate(c));
          } catch {
            // ignore
          }
        }
        pendingCandidatesRef.current.delete(from);

        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);

        await sendSignal("answer", {
          from: user.id,
          to: from,
          sdp: pc.localDescription ?? answer,
        });
      } catch (e) {
        console.error("[WebRTC] handleOffer error", e);
      }
    },
    [ensurePeerConnection, isPoliteForPeer, sendSignal, user?.id]
  );

  const handleAnswer = useCallback(async (from: string, sdp: RTCSessionDescriptionInit) => {
    const pc = peerConnectionsRef.current.get(from);
    if (!pc) return;

    try {
      await pc.setRemoteDescription(new RTCSessionDescription(sdp));

      const pending = pendingCandidatesRef.current.get(from) || [];
      for (const c of pending) {
        try {
          await pc.addIceCandidate(new RTCIceCandidate(c));
        } catch {
          // ignore
        }
      }
      pendingCandidatesRef.current.delete(from);
    } catch (e) {
      console.error("[WebRTC] handleAnswer error", e);
    }
  }, []);

  const handleIce = useCallback(async (from: string, candidate: RTCIceCandidateInit) => {
    const pc = peerConnectionsRef.current.get(from);
    if (!pc || ignoreOfferRef.current.get(from)) return;

    if (pc.remoteDescription) {
      try {
        await pc.addIceCandidate(new RTCIceCandidate(candidate));
      } catch (e) {
        console.error("[WebRTC] addIceCandidate error", e);
      }
    } else {
      const pending = pendingCandidatesRef.current.get(from) || [];
      pending.push(candidate);
      pendingCandidatesRef.current.set(from, pending);
    }
  }, []);

  const startLocalStream = useCallback(
    async (video = true, audio = true): Promise<MediaStream | null> => {
      try {
        const constraints: MediaStreamConstraints = {
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
        };

        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        setLocalStream(stream);
        localStreamRef.current = stream;
        setIsVideoOn(video);
        setIsMuted(false);
        return stream;
      } catch (err: any) {
        console.error("[WebRTC] getUserMedia error", err);

        let errorMessage = "Failed to access camera/microphone.";
        if (err?.name === "NotAllowedError") errorMessage = "Camera/microphone access denied. Please allow permissions.";
        if (err?.name === "NotFoundError") errorMessage = "No camera/microphone found.";
        if (err?.name === "NotReadableError") errorMessage = "Camera/microphone is in use by another application.";

        setError(errorMessage);
        toast({ title: "Media Error", description: errorMessage, variant: "destructive" });
        return null;
      }
    },
    [toast]
  );

  const joinRoom = useCallback(async (video = true) => {
    if (!roomId || !user?.id) return;

    leavingRoomRef.current = false;
    setIsConnecting(true);
    setIsReconnecting(false);
    setError(null);
    currentRoomRef.current = roomId;

    const stream = await startLocalStream(video, true);
    if (!stream) {
      setIsConnecting(false);
      return;
    }

    // Clean old channel
    if (channelRef.current) {
      await supabase.removeChannel(channelRef.current);
      channelRef.current = null;
    }
    const maybeMakeOffer = async (peerId: string) => {
      // Deterministic initiator to avoid both sides waiting: lower user id initiates.
      if (!user?.id) return;
      if (user.id.localeCompare(peerId) > 0) return;

      const pc = peerConnectionsRef.current.get(peerId);
      if (!pc) return;
      if (pc.signalingState !== "stable") return;

      try {
        makingOfferRef.current.set(peerId, true);
        const offer = await pc.createOffer();
        if (pc.signalingState !== "stable") return;
        await pc.setLocalDescription(offer);
        await sendSignal("offer", {
          from: user.id,
          to: peerId,
          sdp: pc.localDescription ?? offer,
        });
      } catch (e) {
        console.error("[WebRTC] initial offer error", e);
      } finally {
        makingOfferRef.current.set(peerId, false);
      }
    };

    const channel = supabase.channel(`webrtc:${roomId}`, {
      config: {
        presence: { key: user.id },
        broadcast: { self: false },
      },
    });

    channel
      .on("presence", { event: "sync" }, () => {
        const state = channel.presenceState();
        const ids = Object.keys(state).filter((id) => id !== user.id);

        // Add placeholders for discovered peers
        setParticipants((prev) => {
          const existing = new Set(prev.map((p) => p.id));
          const next: Participant[] = [...prev];
          for (const id of ids) {
            if (!existing.has(id)) {
              next.push({
                id,
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

        // Ensure connections exist.
        for (const peerId of ids) {
          ensurePeerConnection(peerId, stream);
        }

        // Kick off an initial offer deterministically so SDP exchange always starts.
        for (const peerId of ids) {
          void maybeMakeOffer(peerId);
        }
      })
      .on("presence", { event: "leave" }, ({ leftPresences }) => {
        for (const p of leftPresences as any[]) {
          const peerId = p?.presence_ref ? p.key : p?.key;
          if (peerId && peerId !== user.id) closePeer(peerId);
        }
      })
      .on("broadcast", { event: "offer" }, async ({ payload }) => {
        const p = payload as SignalPayload;
        if (p.to && p.to !== user.id) return;
        if (p.from === user.id || !p.sdp) return;
        if (markSignalSeen(p.signalId)) return;
        await handleOffer(p.from, p.sdp);
      })
      .on("broadcast", { event: "answer" }, async ({ payload }) => {
        const p = payload as SignalPayload;
        if (p.to && p.to !== user.id) return;
        if (p.from === user.id || !p.sdp) return;
        if (markSignalSeen(p.signalId)) return;
        await handleAnswer(p.from, p.sdp);
      })
      .on("broadcast", { event: "ice" }, async ({ payload }) => {
        const p = payload as SignalPayload;
        if (p.to && p.to !== user.id) return;
        if (p.from === user.id || !p.candidate) return;
        if (markSignalSeen(p.signalId)) return;
        await handleIce(p.from, p.candidate);
      })
      .on("broadcast", { event: "media" }, ({ payload }) => {
        const p = payload as SignalPayload;
        if (p.to && p.to !== user.id) return;
        if (p.from === user.id || !p.mediaState) return;

        setParticipants((prev) =>
          prev.map((pp) =>
            pp.id === p.from
              ? {
                  ...pp,
                  ...p.mediaState,
                }
              : pp
          )
        );
      })
      .on("broadcast", { event: "leave" }, ({ payload }) => {
        const p = payload as SignalPayload;
        if (markSignalSeen(p.signalId)) return;
        if (p.from && p.from !== user.id) closePeer(p.from);
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
          const signal = row as {
            id: string;
            sender_id: string;
            target_user_id: string | null;
            type: string;
            payload: Json;
          };
          if (signal.sender_id === user.id) return;
          if (signal.target_user_id && signal.target_user_id !== user.id) return;

          const payload = (signal.payload || {}) as unknown as SignalPayload;
          if (markSignalSeen(payload.signalId || signal.id)) return;

          if (signal.type === "offer" && payload.sdp) await handleOffer(signal.sender_id, payload.sdp);
          if (signal.type === "answer" && payload.sdp) await handleAnswer(signal.sender_id, payload.sdp);
          if (signal.type === "ice" && payload.candidate) await handleIce(signal.sender_id, payload.candidate);
          if (signal.type === "leave") closePeer(signal.sender_id);
        }
      );

    channelRef.current = channel;

    channel.subscribe(async (s) => {
      if (s === "SUBSCRIBED") {
        await channel.track({ online_at: new Date().toISOString() });

        // Replay recent targeted/broadcast signaling frames that may have been
        // emitted before this client finished subscribing.
        const { data: backlog, error: backlogError } = await supabase
          .from("call_signals")
          .select("id, sender_id, target_user_id, type, payload, created_at")
          .eq("call_id", roomId)
          .neq("sender_id", user.id)
          .or(`target_user_id.is.null,target_user_id.eq.${user.id}`)
          .order("created_at", { ascending: true })
          .limit(300);

        if (!backlogError && backlog) {
          for (const row of backlog) {
            const payload = (row.payload || {}) as unknown as SignalPayload;
            if (markSignalSeen(payload.signalId || row.id)) continue;
            if (row.type === "offer" && payload.sdp) await handleOffer(row.sender_id, payload.sdp);
            if (row.type === "answer" && payload.sdp) await handleAnswer(row.sender_id, payload.sdp);
            if (row.type === "ice" && payload.candidate) await handleIce(row.sender_id, payload.candidate);
            if (row.type === "leave") closePeer(row.sender_id);
          }
        }

        startQualityMonitoring();
        setIsConnecting(false);
      }
      if (
        (s === "CHANNEL_ERROR" || s === "TIMED_OUT" || s === "CLOSED") &&
        !leavingRoomRef.current
      ) {
        setError("Signaling connection error");
        setIsConnecting(false);
        setIsReconnecting(true);
        toast({
          title: "Ulanish uzildi",
          description: "Qo'ng'iroq signal kanali qayta tiklanmoqda.",
          variant: "destructive",
        });
      }
    });
  }, [roomId, user?.id, startLocalStream, ensurePeerConnection, closePeer, handleOffer, handleAnswer, handleIce, startQualityMonitoring, toast, sendSignal, markSignalSeen]);

  const leaveRoom = useCallback(() => {
    leavingRoomRef.current = true;
    if (user?.id) {
      void sendSignal("leave", { from: user.id });
    }

    stopQualityMonitoring();

    // Close all peer connections
    peerConnectionsRef.current.forEach((pc) => pc.close());
    peerConnectionsRef.current.clear();
    pendingCandidatesRef.current.clear();
    makingOfferRef.current.clear();
    ignoreOfferRef.current.clear();
    seenSignalIdsRef.current.clear();
    reconnectTimersRef.current.forEach((timer) => window.clearTimeout(timer));
    reconnectTimersRef.current.clear();
    restartAttemptsRef.current.clear();

    // Stop local stream
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((t) => t.stop());
    }
    if (screenStream) {
      screenStream.getTracks().forEach((t) => t.stop());
    }

    setLocalStream(null);
    localStreamRef.current = null;
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
    setConnectionQuality({ bitrate: 0, packetLoss: 0, latency: 0, quality: "disconnected" });

    // Remove channel
    if (channelRef.current) {
      void supabase.removeChannel(channelRef.current);
      channelRef.current = null;
    }

    currentRoomRef.current = null;
  }, [user?.id, screenStream, sendSignal, stopQualityMonitoring]);

  const broadcastMediaState = useCallback(
    (next: { isMuted: boolean; isVideoOn: boolean; isScreenSharing: boolean; isHandRaised: boolean }) => {
      if (!user?.id) return;
      void sendSignal("media", { from: user.id, mediaState: next });
    },
    [sendSignal, user?.id]
  );

  const toggleMute = useCallback(() => {
    if (!localStreamRef.current) return;
    const track = localStreamRef.current.getAudioTracks()[0];
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
  }, [broadcastMediaState, isHandRaised, isScreenSharing, isVideoOn]);

  const toggleVideo = useCallback(() => {
    if (!localStreamRef.current) return;
    const track = localStreamRef.current.getVideoTracks()[0];
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
  }, [broadcastMediaState, isHandRaised, isMuted, isScreenSharing]);

  const toggleScreenShare = useCallback(async () => {
    if (isScreenSharing && screenStream) {
      screenStream.getTracks().forEach((t) => t.stop());
      setScreenStream(null);
      setIsScreenSharing(false);

      const camTrack = localStreamRef.current?.getVideoTracks()[0];
      if (camTrack) {
        peerConnectionsRef.current.forEach((pc) => {
          const sender = pc.getSenders().find((s) => s.track?.kind === "video");
          sender?.replaceTrack(camTrack);
        });
      }

      broadcastMediaState({ isMuted, isVideoOn, isScreenSharing: false, isHandRaised });
      return;
    }

    try {
      const s = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
      setScreenStream(s);
      setIsScreenSharing(true);

      const screenTrack = s.getVideoTracks()[0];
      peerConnectionsRef.current.forEach((pc) => {
        const sender = pc.getSenders().find((ss) => ss.track?.kind === "video");
        sender?.replaceTrack(screenTrack);
      });

      screenTrack.onended = () => {
        setScreenStream(null);
        setIsScreenSharing(false);
        const camTrack = localStreamRef.current?.getVideoTracks()[0];
        if (camTrack) {
          peerConnectionsRef.current.forEach((pc) => {
            const sender = pc.getSenders().find((ss) => ss.track?.kind === "video");
            sender?.replaceTrack(camTrack);
          });
        }
        broadcastMediaState({ isMuted, isVideoOn, isScreenSharing: false, isHandRaised });
      };

      broadcastMediaState({ isMuted, isVideoOn, isScreenSharing: true, isHandRaised });
    } catch (e) {
      console.error("[WebRTC] screen share error", e);
    }
  }, [broadcastMediaState, isHandRaised, isMuted, isScreenSharing, isVideoOn, screenStream]);

  const switchCamera = useCallback(async (): Promise<boolean> => {
    if (!localStreamRef.current || !isVideoOn) return false;

    try {
      const devices = (await navigator.mediaDevices.enumerateDevices()).filter(
        (device) => device.kind === "videoinput"
      );
      if (devices.length < 2) return false;

      const currentTrack = localStreamRef.current.getVideoTracks()[0];
      const currentId = currentTrack?.getSettings().deviceId;
      const currentIndex = Math.max(0, devices.findIndex((device) => device.deviceId === currentId));
      const nextDevice = devices[(currentIndex + 1) % devices.length];

      const replacement = await navigator.mediaDevices.getUserMedia({
        video: {
          deviceId: { exact: nextDevice.deviceId },
          width: { ideal: 1280, max: 1920 },
          height: { ideal: 720, max: 1080 },
          frameRate: { ideal: 30, max: 60 },
        },
        audio: false,
      });
      const nextTrack = replacement.getVideoTracks()[0];
      if (!nextTrack) return false;

      await Promise.all(
        Array.from(peerConnectionsRef.current.values()).map(async (pc) => {
          const sender = pc.getSenders().find((item) => item.track?.kind === "video");
          if (sender && !isScreenSharing) await sender.replaceTrack(nextTrack);
        })
      );

      const audioTracks = localStreamRef.current.getAudioTracks();
      currentTrack?.stop();
      const nextStream = new MediaStream([...audioTracks, nextTrack]);
      localStreamRef.current = nextStream;
      setLocalStream(nextStream);
      return true;
    } catch (cameraError) {
      console.warn("[WebRTC] camera switch failed", cameraError);
      return false;
    }
  }, [isScreenSharing, isVideoOn]);

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
    switchCamera,
    toggleHandRaise,
  };
}

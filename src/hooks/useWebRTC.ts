import { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
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
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
    { urls: "stun:stun2.l.google.com:19302" },
    { urls: "stun:stun3.l.google.com:19302" },
    { urls: "stun:stun4.l.google.com:19302" },
    // NOTE: For production-grade TURN you should plug in your own provider.
    // These are public demo TURN endpoints (best-effort only).
    {
      urls: "turn:openrelay.metered.ca:80",
      username: "openrelayproject",
      credential: "openrelayproject",
    },
    {
      urls: "turn:openrelay.metered.ca:443",
      username: "openrelayproject",
      credential: "openrelayproject",
    },
    {
      urls: "turn:openrelay.metered.ca:443?transport=tcp",
      username: "openrelayproject",
      credential: "openrelayproject",
    },
  ],
};

const QUALITY_CHECK_INTERVAL = 5000;

type SignalPayload = {
  from: string;
  to?: string;
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
  const currentRoomRef = useRef<string | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);

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
    qualityIntervalRef.current = setInterval(async () => {
      const pcs = Array.from(peerConnectionsRef.current.values());
      if (pcs.length === 0) return;

      let totalBitrate = 0;
      let totalPacketLoss = 0;
      let totalLatency = 0;
      let count = 0;

      for (const pc of pcs) {
        try {
          const stats = await pc.getStats();
          stats.forEach((report) => {
            if (report.type === "candidate-pair" && report.state === "succeeded") {
              if ((report as any).currentRoundTripTime) {
                totalLatency += ((report as any).currentRoundTripTime as number) * 1000;
                count++;
              }
            }
            if (report.type === "outbound-rtp" && (report as any).kind === "video") {
              if ((report as any).bytesSent) {
                totalBitrate += (((report as any).bytesSent as number) * 8) / ((report.timestamp as number) / 1000);
              }
              if ((report as any).packetsLost && (report as any).packetsSent) {
                totalPacketLoss +=
                  (((report as any).packetsLost as number) / ((report as any).packetsSent as number)) * 100;
              }
            }
          });
        } catch {
          // ignore
        }
      }

      if (count > 0) {
        const avgLatency = totalLatency / count;
        const avgBitrate = totalBitrate / pcs.length;
        const avgPacketLoss = totalPacketLoss / pcs.length;
        setConnectionQuality({
          bitrate: avgBitrate,
          packetLoss: avgPacketLoss,
          latency: avgLatency,
          quality: calculateQuality(avgBitrate, avgPacketLoss, avgLatency),
        });
      }
    }, QUALITY_CHECK_INTERVAL);
  }, [calculateQuality]);

  const stopQualityMonitoring = useCallback(() => {
    if (qualityIntervalRef.current) {
      clearInterval(qualityIntervalRef.current);
      qualityIntervalRef.current = null;
    }
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

  const sendSignal = useCallback(
    async (event: "offer" | "answer" | "ice" | "media" | "leave", payload: SignalPayload) => {
      const ch = channelRef.current;
      if (!ch) return;
      await ch.send({
        type: "broadcast",
        event,
        payload,
      });
    },
    []
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
          setIsConnected(true);
          void stampCallStartedAt();
        }
        if (pc.connectionState === "failed") {
          pc.restartIce();
        }
        if (pc.connectionState === "disconnected") {
          setTimeout(() => {
            if (pc.connectionState === "disconnected") pc.restartIce();
          }, 1500);
        }
      };

      pc.oniceconnectionstatechange = () => {
        if (pc.iceConnectionState === "failed") pc.restartIce();
      };

      // Add local tracks *after* handlers are attached so we don't miss negotiationneeded.
      stream.getTracks().forEach((track) => {
        pc.addTrack(track, stream);
      });

      peerConnectionsRef.current.set(peerId, pc);
      return pc;
    },
    [sendSignal, stampCallStartedAt, user?.id]
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

  const joinRoom = useCallback(async () => {
    if (!roomId || !user?.id) return;

    setIsConnecting(true);
    setError(null);
    currentRoomRef.current = roomId;

    const stream = await startLocalStream();
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
        await handleOffer(p.from, p.sdp);
      })
      .on("broadcast", { event: "answer" }, async ({ payload }) => {
        const p = payload as SignalPayload;
        if (p.to && p.to !== user.id) return;
        if (p.from === user.id || !p.sdp) return;
        await handleAnswer(p.from, p.sdp);
      })
      .on("broadcast", { event: "ice" }, async ({ payload }) => {
        const p = payload as SignalPayload;
        if (p.to && p.to !== user.id) return;
        if (p.from === user.id || !p.candidate) return;
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
        if (p.from && p.from !== user.id) closePeer(p.from);
      });

    channelRef.current = channel;

    channel.subscribe(async (s) => {
      if (s === "SUBSCRIBED") {
        await channel.track({ online_at: new Date().toISOString() });
        startQualityMonitoring();
        setIsConnecting(false);

        // (call start time is stamped when peer connection reaches "connected")
      }
      if (s === "CHANNEL_ERROR" || s === "TIMED_OUT" || s === "CLOSED") {
        setError("Signaling connection error");
        setIsConnecting(false);
        toast({
          title: "Connection Error",
          description: "Failed to connect signaling channel.",
          variant: "destructive",
        });
      }
    });
  }, [roomId, user?.id, startLocalStream, ensurePeerConnection, closePeer, handleOffer, handleAnswer, handleIce, startQualityMonitoring, toast, sendSignal]);

  const leaveRoom = useCallback(() => {
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
    isMuted,
    isVideoOn,
    isScreenSharing,
    isHandRaised,
    error,
    connectionQuality,
    joinRoom,
    leaveRoom,
    toggleMute,
    toggleVideo,
    toggleScreenShare,
    toggleHandRaise,
  };
}

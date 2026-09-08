/* eslint-disable @typescript-eslint/no-explicit-any */
import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

type Participant = {
  id: string;
  stream: MediaStream | null;
  isMuted: boolean;
  isVideoOn: boolean;
  isScreenSharing: boolean;
  isHandRaised: boolean;
};

type ConnectionQuality = {
  bitrate: number;
  packetLoss: number;
  latency: number;
  quality: "excellent" | "good" | "poor" | "disconnected";
};

type CallMode = "direct" | "conference" | "group" | "broadcast";

type CallTokenResponse = {
  token: string;
  wsUrl: string;
  roomName: string;
  mode: CallMode;
  canPublish: boolean;
};

declare global {
  interface Window {
    LivekitClient?: any;
    __alsamosLiveKitPromise?: Promise<any>;
  }
}

const LIVEKIT_CLIENT_VERSION = "2.22.3";
const LIVEKIT_CLIENT_SRC =
  `https://cdn.jsdelivr.net/npm/livekit-client@${LIVEKIT_CLIENT_VERSION}/dist/livekit-client.umd.min.js`;

function loadLiveKitClient(): Promise<any> {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("LiveKit browser client is unavailable on the server"));
  }
  if (window.LivekitClient) return Promise.resolve(window.LivekitClient);
  if (window.__alsamosLiveKitPromise) return window.__alsamosLiveKitPromise;

  window.__alsamosLiveKitPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(
      `script[data-alsamos-livekit="${LIVEKIT_CLIENT_VERSION}"]`
    );

    const finish = () => {
      if (window.LivekitClient) resolve(window.LivekitClient);
      else reject(new Error("LiveKit client loaded without exposing window.LivekitClient"));
    };

    if (existing) {
      existing.addEventListener("load", finish, { once: true });
      existing.addEventListener(
        "error",
        () => reject(new Error("LiveKit browser client failed to load")),
        { once: true }
      );
      return;
    }

    const script = document.createElement("script");
    script.src = LIVEKIT_CLIENT_SRC;
    script.async = true;
    script.crossOrigin = "anonymous";
    script.dataset.alsamosLivekit = LIVEKIT_CLIENT_VERSION;
    script.onload = finish;
    script.onerror = () => reject(new Error("LiveKit browser client failed to load"));
    document.head.appendChild(script);
  }).catch((error) => {
    window.__alsamosLiveKitPromise = undefined;
    throw error;
  });

  return window.__alsamosLiveKitPromise;
}

function qualityFromLiveKit(value: unknown): ConnectionQuality["quality"] {
  const normalized = String(value ?? "").toLowerCase();
  if (normalized === "excellent") return "excellent";
  if (normalized === "good") return "good";
  if (normalized === "poor") return "poor";
  if (normalized === "lost") return "disconnected";
  return "good";
}

function mediaStreamForParticipant(participant: any): MediaStream | null {
  if (!participant?.trackPublications) return null;
  const tracks: MediaStreamTrack[] = [];

  for (const publication of participant.trackPublications.values()) {
    const track = publication?.track;
    const mediaTrack = track?.mediaStreamTrack as MediaStreamTrack | undefined;
    if (mediaTrack && mediaTrack.readyState !== "ended") tracks.push(mediaTrack);
  }

  return tracks.length > 0 ? new MediaStream(tracks) : null;
}

function localMediaStream(room: any): MediaStream | null {
  return mediaStreamForParticipant(room?.localParticipant);
}

async function fetchCallToken(callId: string): Promise<CallTokenResponse> {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session?.access_token) {
    throw new Error("Qo'ng'iroq uchun autentifikatsiya sessiyasi topilmadi");
  }

  const response = await fetch("/api/call-token", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${session.access_token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ callId }),
  });

  const raw = await response.text();
  let payload: any = {};
  try {
    payload = raw ? JSON.parse(raw) : {};
  } catch {
    payload = { error: raw };
  }

  if (!response.ok) {
    throw new Error(
      payload?.error ||
        `SFU token server xatoligi (${response.status})`
    );
  }

  if (!payload?.token || !payload?.wsUrl || !payload?.roomName) {
    throw new Error("SFU token server noto'g'ri javob qaytardi");
  }

  return payload as CallTokenResponse;
}

export function useWebRTC(roomId: string | null) {
  const { user } = useAuth();
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [screenStream, setScreenStream] = useState<MediaStream | null>(null);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isReconnecting, setIsReconnecting] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
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

  const roomRef = useRef<any>(null);
  const liveKitRef = useRef<any>(null);
  const activeRoomIdRef = useRef<string | null>(null);
  const joinPromiseRef = useRef<Promise<void> | null>(null);
  const canPublishRef = useRef(true);
  const requestedVideoRef = useRef(true);
  const leavingRef = useRef(false);

  const syncLocalState = useCallback(() => {
    const room = roomRef.current;
    if (!room) return;

    const lp = room.localParticipant;
    setLocalStream(localMediaStream(room));
    setIsMuted(!Boolean(lp?.isMicrophoneEnabled));
    setIsVideoOn(Boolean(lp?.isCameraEnabled));
    setIsScreenSharing(Boolean(lp?.isScreenShareEnabled));

    const screenTracks: MediaStreamTrack[] = [];
    if (lp?.trackPublications) {
      for (const publication of lp.trackPublications.values()) {
        const track = publication?.track;
        const source = String(publication?.source ?? track?.source ?? "").toLowerCase();
        const mediaTrack = track?.mediaStreamTrack as MediaStreamTrack | undefined;
        if (
          mediaTrack &&
          mediaTrack.readyState !== "ended" &&
          source.includes("screen")
        ) {
          screenTracks.push(mediaTrack);
        }
      }
    }
    setScreenStream(screenTracks.length > 0 ? new MediaStream(screenTracks) : null);
  }, []);

  const syncParticipants = useCallback(() => {
    const room = roomRef.current;
    if (!room?.remoteParticipants) {
      setParticipants([]);
      return;
    }

    const next: Participant[] = [];
    for (const participant of room.remoteParticipants.values()) {
      const attrs = participant.attributes ?? {};
      next.push({
        id: participant.identity,
        stream: mediaStreamForParticipant(participant),
        isMuted: !Boolean(participant.isMicrophoneEnabled),
        isVideoOn: Boolean(participant.isCameraEnabled),
        isScreenSharing: Boolean(participant.isScreenShareEnabled),
        isHandRaised: String(attrs["alsamos.hand_raised"] ?? "false") === "true",
      });
    }
    setParticipants(next);
  }, []);

  const detachRoomListeners = useCallback((room: any) => {
    try {
      room?.removeAllListeners?.();
    } catch {
      // Best-effort cleanup. room.disconnect() still tears down transports.
    }
  }, []);

  const leaveRoom = useCallback(() => {
    leavingRef.current = true;
    const room = roomRef.current;
    roomRef.current = null;
    activeRoomIdRef.current = null;
    joinPromiseRef.current = null;

    if (room) {
      detachRoomListeners(room);
      try {
        room.disconnect?.();
      } catch {
        // Connection may already be closed.
      }
    }

    setParticipants([]);
    setLocalStream(null);
    setScreenStream(null);
    setIsConnected(false);
    setIsConnecting(false);
    setIsReconnecting(false);
    setIsMuted(false);
    setIsVideoOn(false);
    setIsScreenSharing(false);
    setIsHandRaised(false);
    setError(null);
    setConnectionQuality({
      bitrate: 0,
      packetLoss: 0,
      latency: 0,
      quality: "disconnected",
    });
  }, [detachRoomListeners]);

  const joinRoom = useCallback(
    async (video = true) => {
      if (!roomId || !user?.id) return;
      if (activeRoomIdRef.current === roomId && roomRef.current) return;
      if (joinPromiseRef.current) return joinPromiseRef.current;

      leavingRef.current = false;
      requestedVideoRef.current = video;
      setIsConnecting(true);
      setIsReconnecting(false);
      setError(null);

      const task = (async () => {
        let room: any = null;
        try {
          const [lk, auth] = await Promise.all([
            loadLiveKitClient(),
            fetchCallToken(roomId),
          ]);

          if (activeRoomIdRef.current && activeRoomIdRef.current !== roomId) {
            leaveRoom();
          }

          liveKitRef.current = lk;
          canPublishRef.current = auth.canPublish;

          room = new lk.Room({
            adaptiveStream: true,
            dynacast: true,
          });

          roomRef.current = room;
          activeRoomIdRef.current = roomId;

          const onRemoteChanged = () => syncParticipants();
          const onLocalChanged = () => syncLocalState();

          room
            .on(lk.RoomEvent.ParticipantConnected, onRemoteChanged)
            .on(lk.RoomEvent.ParticipantDisconnected, onRemoteChanged)
            .on(lk.RoomEvent.TrackSubscribed, onRemoteChanged)
            .on(lk.RoomEvent.TrackUnsubscribed, onRemoteChanged)
            .on(lk.RoomEvent.TrackMuted, onRemoteChanged)
            .on(lk.RoomEvent.TrackUnmuted, onRemoteChanged)
            .on(lk.RoomEvent.ParticipantAttributesChanged, onRemoteChanged)
            .on(lk.RoomEvent.LocalTrackPublished, onLocalChanged)
            .on(lk.RoomEvent.LocalTrackUnpublished, onLocalChanged)
            .on(lk.RoomEvent.Reconnecting, () => {
              setIsReconnecting(true);
              setIsConnected(false);
            })
            .on(lk.RoomEvent.Reconnected, () => {
              setIsReconnecting(false);
              setIsConnected(true);
              setError(null);
              syncParticipants();
              syncLocalState();
            })
            .on(lk.RoomEvent.Connected, () => {
              setIsConnected(true);
              setIsConnecting(false);
              setIsReconnecting(false);
              setError(null);
            })
            .on(lk.RoomEvent.Disconnected, () => {
              if (!leavingRef.current) {
                setIsConnected(false);
                setIsReconnecting(false);
                setError("SFU media aloqasi uzildi");
              }
            })
            .on(
              lk.RoomEvent.ConnectionQualityChanged,
              (quality: unknown, participant: any) => {
                if (participant?.identity !== user.id) return;
                setConnectionQuality((previous) => ({
                  ...previous,
                  quality: qualityFromLiveKit(quality),
                }));
              }
            );

          await room.connect(auth.wsUrl, auth.token, { autoSubscribe: true });

          try {
            await room.startAudio?.();
          } catch {
            // Audio autoplay policy is handled by the media elements/UI.
          }

          if (auth.canPublish) {
            await room.localParticipant.setMicrophoneEnabled(true, {
              echoCancellation: true,
              noiseSuppression: true,
              autoGainControl: true,
            });
            if (video) {
              await room.localParticipant.setCameraEnabled(true, {
                facingMode: "user",
              });
            }
          } else {
            setIsMuted(true);
            setIsVideoOn(false);
          }

          syncLocalState();
          syncParticipants();
          setIsConnected(true);
          setIsConnecting(false);
          setConnectionQuality((previous) => ({
            ...previous,
            quality: qualityFromLiveKit(room.localParticipant?.connectionQuality),
          }));

          console.info(
            `[SFU] Connected to ${auth.mode} room ${auth.roomName} (${auth.canPublish ? "publisher" : "subscriber"})`
          );
        } catch (cause) {
          if (room) {
            detachRoomListeners(room);
            try {
              room.disconnect?.();
            } catch {
              // Ignore cleanup failure.
            }
          }
          if (roomRef.current === room) roomRef.current = null;
          activeRoomIdRef.current = null;

          const message =
            cause instanceof Error ? cause.message : "SFU media aloqasini o'rnatib bo'lmadi";
          console.error("[SFU] Join failed:", cause);
          setError(message);
          setIsConnected(false);
          setIsConnecting(false);
          setIsReconnecting(false);
          setConnectionQuality({
            bitrate: 0,
            packetLoss: 0,
            latency: 0,
            quality: "disconnected",
          });
        } finally {
          joinPromiseRef.current = null;
        }
      })();

      joinPromiseRef.current = task;
      return task;
    },
    [
      detachRoomListeners,
      leaveRoom,
      roomId,
      syncLocalState,
      syncParticipants,
      user?.id,
    ]
  );

  const closePeer = useCallback((peerId: string) => {
    setParticipants((current) => current.filter((participant) => participant.id !== peerId));
  }, []);

  const toggleMute = useCallback(async () => {
    const room = roomRef.current;
    if (!room || !canPublishRef.current) return;

    try {
      const enabled = !Boolean(room.localParticipant.isMicrophoneEnabled);
      await room.localParticipant.setMicrophoneEnabled(enabled, {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      });
      syncLocalState();
    } catch (cause) {
      console.error("[SFU] Microphone toggle failed:", cause);
      setError("Mikrofonni o'zgartirib bo'lmadi");
    }
  }, [syncLocalState]);

  const toggleVideo = useCallback(async () => {
    const room = roomRef.current;
    if (!room || !canPublishRef.current) return;

    try {
      const enabled = !Boolean(room.localParticipant.isCameraEnabled);
      await room.localParticipant.setCameraEnabled(enabled, {
        facingMode: "user",
      });
      syncLocalState();
    } catch (cause) {
      console.error("[SFU] Camera toggle failed:", cause);
      setError("Kamerani o'zgartirib bo'lmadi");
    }
  }, [syncLocalState]);

  const toggleScreenShare = useCallback(async () => {
    const room = roomRef.current;
    if (!room || !canPublishRef.current) return;

    try {
      const enabled = !Boolean(room.localParticipant.isScreenShareEnabled);
      await room.localParticipant.setScreenShareEnabled(enabled, {
        audio: true,
      });
      syncLocalState();
    } catch (cause) {
      console.error("[SFU] Screen share toggle failed:", cause);
      setError("Ekran ulashishni o'zgartirib bo'lmadi");
    }
  }, [syncLocalState]);

  const selectCamera = useCallback(
    async (deviceId: string) => {
      const room = roomRef.current;
      if (!room || !canPublishRef.current || !deviceId) return false;
      try {
        const changed = await room.switchActiveDevice("videoinput", deviceId);
        syncLocalState();
        return changed !== false;
      } catch (cause) {
        console.error("[SFU] Camera switch failed:", cause);
        return false;
      }
    },
    [syncLocalState]
  );

  const selectMicrophone = useCallback(
    async (deviceId: string) => {
      const room = roomRef.current;
      if (!room || !canPublishRef.current || !deviceId) return false;
      try {
        const changed = await room.switchActiveDevice("audioinput", deviceId);
        syncLocalState();
        return changed !== false;
      } catch (cause) {
        console.error("[SFU] Microphone switch failed:", cause);
        return false;
      }
    },
    [syncLocalState]
  );

  const switchCamera = useCallback(async () => {
    const room = roomRef.current;
    if (!room || !canPublishRef.current) return false;

    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const cameras = devices.filter((device) => device.kind === "videoinput");
      if (cameras.length < 2) return false;

      const currentPublication = Array.from(
        room.localParticipant.videoTrackPublications?.values?.() ?? []
      ).find((publication: any) => {
        const source = String(publication?.source ?? publication?.track?.source ?? "").toLowerCase();
        return source.includes("camera");
      }) as any;

      const currentDevice =
        currentPublication?.track?.getDeviceId?.() ??
        currentPublication?.track?.mediaStreamTrack?.getSettings?.().deviceId ??
        "";

      const index = cameras.findIndex((device) => device.deviceId === currentDevice);
      const next = cameras[(index + 1 + cameras.length) % cameras.length];
      if (!next?.deviceId) return false;

      const changed = await room.switchActiveDevice("videoinput", next.deviceId);
      syncLocalState();
      return changed !== false;
    } catch (cause) {
      console.error("[SFU] Camera rotation failed:", cause);
      return false;
    }
  }, [syncLocalState]);

  const toggleHandRaise = useCallback(async () => {
    const room = roomRef.current;
    if (!room) return;

    const next = !isHandRaised;
    setIsHandRaised(next);
    try {
      await room.localParticipant.setAttributes({
        "alsamos.hand_raised": String(next),
      });
    } catch (cause) {
      console.warn("[SFU] Hand raise attribute update failed:", cause);
    }
  }, [isHandRaised]);

  useEffect(() => {
    return () => {
      leavingRef.current = true;
      const room = roomRef.current;
      roomRef.current = null;
      activeRoomIdRef.current = null;
      joinPromiseRef.current = null;
      if (room) {
        detachRoomListeners(room);
        try {
          room.disconnect?.();
        } catch {
          // Best-effort unmount cleanup.
        }
      }
    };
  }, [detachRoomListeners]);

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

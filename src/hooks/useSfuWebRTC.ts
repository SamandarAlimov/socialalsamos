import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { SfuClient } from '@/lib/sfu/SfuClient';

interface Participant { id: string; stream: MediaStream | null; isMuted: boolean; isVideoOn: boolean; isScreenSharing: boolean; isHandRaised: boolean }
interface ConnectionQuality { bitrate: number; packetLoss: number; latency: number; quality: 'excellent' | 'good' | 'poor' | 'disconnected' }
const SFU_URL = String(import.meta.env.VITE_SFU_URL || '').trim();

export function useSfuWebRTC(roomId: string | null) {
  const { user } = useAuth();
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [screenStream, setScreenStream] = useState<MediaStream | null>(null);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isReconnecting] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOn, setIsVideoOn] = useState(true);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [isHandRaised, setIsHandRaised] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [connectionQuality, setConnectionQuality] = useState<ConnectionQuality>({ bitrate: 0, packetLoss: 0, latency: 0, quality: 'disconnected' });
  const clientRef = useRef<SfuClient | null>(null);
  const localRef = useRef<MediaStream | null>(null);
  const screenRef = useRef<MediaStream | null>(null);

  const sendState = useCallback((patch?: Partial<{ isMuted: boolean; isVideoOn: boolean; isScreenSharing: boolean; isHandRaised: boolean }>) => {
    clientRef.current?.sendMediaState({ isMuted, isVideoOn, isScreenSharing, isHandRaised, ...patch });
  }, [isMuted, isVideoOn, isScreenSharing, isHandRaised]);

  const leaveRoom = useCallback(() => {
    clientRef.current?.close(); clientRef.current = null;
    localRef.current?.getTracks().forEach((track) => track.stop()); screenRef.current?.getTracks().forEach((track) => track.stop());
    localRef.current = null; screenRef.current = null; setLocalStream(null); setScreenStream(null); setParticipants([]);
    setIsConnected(false); setIsConnecting(false); setError(null); setIsMuted(false); setIsVideoOn(true); setIsScreenSharing(false); setIsHandRaised(false);
    setConnectionQuality({ bitrate: 0, packetLoss: 0, latency: 0, quality: 'disconnected' });
  }, []);

  const joinRoom = useCallback(async (enableVideo = true) => {
    if (!roomId || !user?.id) return;
    if (!SFU_URL) throw new Error('VITE_SFU_URL is not configured');
    setIsConnecting(true); setError(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error('Not authenticated');
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
        video: enableVideo ? { width: { ideal: 1280, max: 1920 }, height: { ideal: 720, max: 1080 }, frameRate: { ideal: 30, max: 60 } } : false,
      });
      localRef.current = stream; setLocalStream(stream); setIsVideoOn(enableVideo);
      const client = new SfuClient({
        url: SFU_URL, roomId, mode: 'call', role: 'publisher', accessToken: session.access_token,
        onConnectionState: (connected) => { setIsConnected(connected); setConnectionQuality((q) => ({ ...q, quality: connected ? 'good' : 'disconnected' })); },
        onError: setError,
        onRemoteStream: (_peerId, userId, remote) => setParticipants((prev) => {
          const existing = prev.find((p) => p.id === userId);
          if (!remote) return prev.filter((p) => p.id !== userId);
          const next: Participant = existing ? { ...existing, stream: remote } : { id: userId, stream: remote, isMuted: false, isVideoOn: true, isScreenSharing: false, isHandRaised: false };
          return existing ? prev.map((p) => p.id === userId ? next : p) : [...prev, next];
        }),
        onPeerState: (_peerId, userId, state) => setParticipants((prev) => prev.map((p) => p.id === userId ? { ...p, ...state } : p)),
        onPeerLeft: (_peerId, userId) => setParticipants((prev) => prev.filter((p) => p.id !== userId)),
      });
      clientRef.current = client; await client.connect(); await client.publish(stream);
      client.sendMediaState({ isMuted: false, isVideoOn: enableVideo, isScreenSharing: false, isHandRaised: false });
      setIsConnected(true);
      void supabase.from('video_calls').update({ started_at: new Date().toISOString() }).eq('id', roomId).is('started_at', null);
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause); setError(message); leaveRoom(); throw cause;
    } finally { setIsConnecting(false); }
  }, [roomId, user?.id, leaveRoom]);

  const toggleMute = useCallback(() => { const track = localRef.current?.getAudioTracks()[0]; if (!track) return; track.enabled = !track.enabled; const next = !track.enabled; setIsMuted(next); sendState({ isMuted: next }); }, [sendState]);
  const toggleVideo = useCallback(() => { const track = localRef.current?.getVideoTracks()[0]; if (!track) return; track.enabled = !track.enabled; const next = track.enabled; setIsVideoOn(next); sendState({ isVideoOn: next }); }, [sendState]);
  const stopScreen = useCallback(async () => {
    screenRef.current?.getTracks().forEach((track) => track.stop()); screenRef.current = null; setScreenStream(null); setIsScreenSharing(false);
    const camera = localRef.current?.getVideoTracks()[0]; if (camera) await clientRef.current?.replaceTrack('video', camera); sendState({ isScreenSharing: false });
  }, [sendState]);
  const toggleScreenShare = useCallback(async () => {
    if (isScreenSharing) return stopScreen();
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false }); const track = stream.getVideoTracks()[0]; if (!track) return;
      screenRef.current = stream; setScreenStream(stream); setIsScreenSharing(true); await clientRef.current?.replaceTrack('video', track); sendState({ isScreenSharing: true });
      track.onended = () => { void stopScreen(); };
    } catch (cause) { console.warn('[SFU] screen share failed', cause); }
  }, [isScreenSharing, sendState, stopScreen]);
  const selectCamera = useCallback(async (deviceId: string) => {
    if (!deviceId || !localRef.current) return false;
    try {
      const replacement = await navigator.mediaDevices.getUserMedia({ video: { deviceId: { exact: deviceId }, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false });
      const track = replacement.getVideoTracks()[0]; if (!track) return false; track.enabled = isVideoOn;
      const old = localRef.current.getVideoTracks()[0]; const next = new MediaStream([...localRef.current.getAudioTracks(), track]);
      if (!isScreenSharing) await clientRef.current?.replaceTrack('video', track); old?.stop(); localRef.current = next; setLocalStream(next); return true;
    } catch { return false; }
  }, [isScreenSharing, isVideoOn]);
  const selectMicrophone = useCallback(async (deviceId: string) => {
    if (!deviceId || !localRef.current) return false;
    try {
      const replacement = await navigator.mediaDevices.getUserMedia({ video: false, audio: { deviceId: { exact: deviceId }, echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
      const track = replacement.getAudioTracks()[0]; if (!track) return false; track.enabled = !isMuted;
      await clientRef.current?.replaceTrack('audio', track); const old = localRef.current.getAudioTracks()[0]; const next = new MediaStream([...localRef.current.getVideoTracks(), track]);
      old?.stop(); localRef.current = next; setLocalStream(next); return true;
    } catch { return false; }
  }, [isMuted]);
  const switchCamera = useCallback(async () => {
    const devices = (await navigator.mediaDevices.enumerateDevices()).filter((device) => device.kind === 'videoinput'); if (devices.length < 2 || !localRef.current) return false;
    const current = localRef.current.getVideoTracks()[0]?.getSettings().deviceId; const index = Math.max(0, devices.findIndex((device) => device.deviceId === current));
    return selectCamera(devices[(index + 1) % devices.length].deviceId);
  }, [selectCamera]);
  const toggleHandRaise = useCallback(() => { const next = !isHandRaised; setIsHandRaised(next); sendState({ isHandRaised: next }); }, [isHandRaised, sendState]);
  const closePeer = useCallback((peerId: string) => setParticipants((prev) => prev.filter((p) => p.id !== peerId)), []);
  useEffect(() => () => leaveRoom(), [leaveRoom]);

  return { localStream, screenStream, participants, isConnected, isConnecting, isReconnecting, isMuted, isVideoOn, isScreenSharing, isHandRaised, error, connectionQuality, joinRoom, leaveRoom, closePeer, toggleMute, toggleVideo, toggleScreenShare, selectCamera, selectMicrophone, switchCamera, toggleHandRaise };
}

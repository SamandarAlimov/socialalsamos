import { useCallback, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useWebRTC as useMeshWebRTC } from './useWebRTC.mesh';
import { useSfuWebRTC } from './useSfuWebRTC';

const SFU_URL = String(import.meta.env.VITE_SFU_URL || '').trim();
type Backend = 'mesh' | 'sfu';

/** 1:1 stays direct P2P; group/conference calls use the self-hosted SFU. */
export function useWebRTC(roomId: string | null) {
  const mesh = useMeshWebRTC(roomId);
  const sfu = useSfuWebRTC(roomId);
  const [backend, setBackend] = useState<Backend>('mesh');
  const backendRef = useRef<Backend>('mesh');

  const chooseBackend = useCallback(async (): Promise<Backend> => {
    if (!SFU_URL || !roomId) return 'mesh';
    const { data, error } = await supabase.from('video_calls').select('is_group_call').eq('id', roomId).maybeSingle();
    if (error) console.warn('[WebRTC] failed to classify call, using P2P fallback', error);
    return data?.is_group_call === true ? 'sfu' : 'mesh';
  }, [roomId]);

  const joinRoom = useCallback(async (enableVideo = true) => {
    const next = await chooseBackend(); backendRef.current = next; setBackend(next);
    await (next === 'sfu' ? sfu.joinRoom : mesh.joinRoom)(enableVideo);
  }, [chooseBackend, mesh.joinRoom, sfu.joinRoom]);

  const leaveRoom = useCallback(() => {
    if (backendRef.current === 'sfu') sfu.leaveRoom(); else mesh.leaveRoom();
    backendRef.current = 'mesh'; setBackend('mesh');
  }, [mesh.leaveRoom, sfu.leaveRoom]);

  const active = backend === 'sfu' ? sfu : mesh;
  const call = useCallback((name: string, ...args: any[]) => {
    const target: any = backendRef.current === 'sfu' ? sfu : mesh;
    return target[name](...args);
  }, [mesh, sfu]);

  return {
    ...active,
    mediaBackend: backend,
    joinRoom,
    leaveRoom,
    closePeer: (peerId: string) => call('closePeer', peerId),
    toggleMute: () => call('toggleMute'),
    toggleVideo: () => call('toggleVideo'),
    toggleScreenShare: () => call('toggleScreenShare'),
    selectCamera: (deviceId: string) => call('selectCamera', deviceId),
    selectMicrophone: (deviceId: string) => call('selectMicrophone', deviceId),
    switchCamera: () => call('switchCamera'),
    toggleHandRaise: () => call('toggleHandRaise'),
  };
}

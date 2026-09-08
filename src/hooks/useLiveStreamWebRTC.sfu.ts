import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { SfuClient } from '@/lib/sfu/SfuClient';

const SFU_URL = String(import.meta.env.VITE_SFU_URL || '').trim();

export function useLiveStreamBroadcasterSfu(streamId: string | null) {
  const [isConnected, setIsConnected] = useState(false);
  const [viewerCount, setViewerCount] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const clientRef = useRef<SfuClient | null>(null);

  const connect = useCallback(async (stream: MediaStream) => {
    if (!streamId) return;
    if (clientRef.current) { await clientRef.current.replaceStream(stream); return; }
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error('Not authenticated');
      const client = new SfuClient({
        url: SFU_URL, roomId: streamId, mode: 'live', role: 'publisher', accessToken: session.access_token,
        onConnectionState: setIsConnected,
        onPeerCount: (_peers, viewers) => setViewerCount(viewers),
        onError: setError,
      });
      clientRef.current = client; await client.connect(); await client.publish(stream); setIsConnected(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause)); clientRef.current?.close(); clientRef.current = null; setIsConnected(false);
    }
  }, [streamId]);

  const replaceStream = useCallback(async (stream: MediaStream) => { await clientRef.current?.replaceStream(stream); }, []);
  const disconnect = useCallback(() => { clientRef.current?.close(); clientRef.current = null; setIsConnected(false); setViewerCount(0); }, []);
  useEffect(() => () => disconnect(), [disconnect]);
  return { isConnected, viewerCount, error, connect, replaceStream, disconnect };
}

export function useLiveStreamViewerSfu(streamId: string | null) {
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const clientRef = useRef<SfuClient | null>(null);

  const connect = useCallback(async () => {
    if (!streamId || clientRef.current) return;
    setIsConnecting(true); setError(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error('Not authenticated');
      const client = new SfuClient({
        url: SFU_URL, roomId: streamId, mode: 'live', role: 'viewer', accessToken: session.access_token,
        onConnectionState: (value) => { setIsConnected(value); if (value) setIsConnecting(false); },
        onRemoteStream: (_peerId, _userId, stream) => { setRemoteStream(stream); if (stream) { setIsConnected(true); setIsConnecting(false); } },
        onPeerLeft: () => { setRemoteStream(null); setIsConnected(false); setError('Stream ended'); },
        onError: (message) => { setError(message); setIsConnecting(false); },
      });
      clientRef.current = client; await client.connect();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause)); clientRef.current?.close(); clientRef.current = null; setIsConnecting(false);
    }
  }, [streamId]);

  const disconnect = useCallback(() => { clientRef.current?.close(); clientRef.current = null; setRemoteStream(null); setIsConnected(false); setIsConnecting(false); }, []);
  useEffect(() => () => disconnect(), [disconnect]);
  return { remoteStream, isConnected, isConnecting, error, connect, disconnect };
}

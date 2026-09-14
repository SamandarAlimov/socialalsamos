import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { getIceServers } from '@/lib/iceServers';
import { syncLivePeerStream } from '@/lib/liveTrackSync';

const ICE_SERVERS = getIceServers();

interface ViewerConnection {
  pc: RTCPeerConnection;
  viewerId: string;
}

function configureVideoSender(sender: RTCRtpSender) {
  if (sender.track?.kind !== 'video') return;

  const params = sender.getParameters();
  if (!params.encodings || params.encodings.length === 0) {
    params.encodings = [{}];
  }
  params.encodings[0].maxBitrate = 1_500_000;
  void sender.setParameters(params).catch((error) => {
    console.warn('[Broadcaster] Video encoding params were not applied:', error);
  });
}

// Broadcaster hook. Supabase Realtime is used only for signaling/presence;
// media itself stays on WebRTC peer connections.
export function useLiveStreamBroadcaster(streamId: string | null) {
  const [isConnected, setIsConnected] = useState(false);
  const [viewerCount, setViewerCount] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const viewerConnectionsRef = useRef<Map<string, ViewerConnection>>(new Map());
  const userIdRef = useRef<string | null>(null);

  const sendOffer = useCallback(async (viewerId: string, pc: RTCPeerConnection) => {
    const channel = channelRef.current;
    if (!channel || pc.signalingState === 'closed') return;

    const offer = await pc.createOffer({
      offerToReceiveAudio: false,
      offerToReceiveVideo: false,
    });
    await pc.setLocalDescription(offer);

    await channel.send({
      type: 'broadcast',
      event: 'offer',
      payload: {
        sdp: { type: offer.type, sdp: offer.sdp },
        targetViewerId: viewerId,
        broadcasterId: userIdRef.current,
      },
    });
  }, []);

  const createOfferForViewer = useCallback(
    async (viewerId: string) => {
      const localStream = localStreamRef.current;
      if (!localStream || !channelRef.current || !streamId) return;

      const existing = viewerConnectionsRef.current.get(viewerId);
      if (existing && existing.pc.connectionState !== 'closed') {
        return;
      }
      existing?.pc.close();

      try {
        const pc = new RTCPeerConnection({
          iceServers: ICE_SERVERS,
          iceCandidatePoolSize: 10,
        });
        viewerConnectionsRef.current.set(viewerId, { pc, viewerId });

        localStream.getTracks().forEach((track) => {
          const sender = pc.addTrack(track, localStream);
          configureVideoSender(sender);
        });

        pc.onicecandidate = (event) => {
          if (!event.candidate || !channelRef.current) return;
          void channelRef.current.send({
            type: 'broadcast',
            event: 'ice-candidate',
            payload: {
              candidate: event.candidate.toJSON(),
              targetUserId: viewerId,
              fromUserId: userIdRef.current,
            },
          });
        };

        pc.oniceconnectionstatechange = () => {
          if (pc.iceConnectionState === 'failed') {
            pc.restartIce();
          }
        };

        pc.onconnectionstatechange = () => {
          if (pc.connectionState === 'failed') {
            pc.restartIce();
          }
          if (pc.connectionState === 'closed') {
            viewerConnectionsRef.current.delete(viewerId);
          }
        };

        await sendOffer(viewerId, pc);
      } catch (err) {
        console.error('[Broadcaster] Error creating offer:', err);
      }
    },
    [sendOffer, streamId],
  );

  const handleAnswer = useCallback(
    async (viewerId: string, sdp: RTCSessionDescriptionInit) => {
      const connection = viewerConnectionsRef.current.get(viewerId);
      if (!connection || connection.pc.signalingState === 'closed') return;

      try {
        await connection.pc.setRemoteDescription(new RTCSessionDescription(sdp));
      } catch (err) {
        console.error('[Broadcaster] Error handling answer:', err);
      }
    },
    [],
  );

  const handleIceCandidate = useCallback(
    async (fromUserId: string, candidate: RTCIceCandidateInit) => {
      const connection = viewerConnectionsRef.current.get(fromUserId);
      if (!connection || connection.pc.signalingState === 'closed') return;

      try {
        await connection.pc.addIceCandidate(new RTCIceCandidate(candidate));
      } catch (err) {
        console.error('[Broadcaster] Error adding ICE candidate:', err);
      }
    },
    [],
  );

  /**
   * Swap the broadcaster media on every already-connected viewer.
   * Camera flip and screen sharing therefore keep the same peer connection
   * instead of leaving viewers on an ended track.
   */
  const syncStream = useCallback(
    async (nextStream: MediaStream) => {
      localStreamRef.current = nextStream;

      const tasks = Array.from(viewerConnectionsRef.current.values()).map(
        async ({ viewerId, pc }) => {
          if (pc.connectionState === 'closed') return;

          try {
            const result = await syncLivePeerStream(pc, nextStream);
            pc.getSenders().forEach(configureVideoSender);

            if (result.renegotiationRequired) {
              await sendOffer(viewerId, pc);
            }
          } catch (err) {
            console.error(`[Broadcaster] Could not sync media for ${viewerId}:`, err);
          }
        },
      );

      await Promise.all(tasks);
    },
    [sendOffer],
  );

  const connect = useCallback(
    async (localStream: MediaStream) => {
      if (!streamId) return;

      // Calling connect again while signaling is active is intentionally a
      // media update, not a second Realtime subscription.
      if (channelRef.current) {
        await syncStream(localStream);
        return;
      }

      setError(null);
      localStreamRef.current = localStream;

      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();
        if (!session?.user) {
          setError('Not authenticated');
          return;
        }

        userIdRef.current = session.user.id;
        const channel = supabase.channel(`live-stream-${streamId}`, {
          config: {
            broadcast: { self: false },
            presence: { key: session.user.id },
          },
        });
        channelRef.current = channel;

        const syncPresence = () => {
          const state = channel.presenceState();
          const viewerIds = Object.keys(state).filter(
            (key) => key !== session.user.id,
          );
          setViewerCount(viewerIds.length);

          viewerIds.forEach((viewerId) => {
            if (!viewerConnectionsRef.current.has(viewerId)) {
              void createOfferForViewer(viewerId);
            }
          });
        };

        channel.on('presence', { event: 'sync' }, syncPresence);
        channel.on('presence', { event: 'join' }, ({ key }) => {
          if (key !== session.user.id) {
            void createOfferForViewer(key);
          }
        });
        channel.on('presence', { event: 'leave' }, ({ key }) => {
          if (key === session.user.id) return;
          const connection = viewerConnectionsRef.current.get(key);
          connection?.pc.close();
          viewerConnectionsRef.current.delete(key);
        });

        channel.on('broadcast', { event: 'answer' }, ({ payload }) => {
          if (payload.targetBroadcasterId === session.user.id) {
            void handleAnswer(payload.viewerId, payload.sdp);
          }
        });

        channel.on('broadcast', { event: 'ice-candidate' }, ({ payload }) => {
          if (payload.targetUserId === session.user.id) {
            void handleIceCandidate(payload.fromUserId, payload.candidate);
          }
        });

        channel.subscribe(async (status) => {
          if (status === 'SUBSCRIBED') {
            await channel.track({
              role: 'broadcaster',
              joined_at: new Date().toISOString(),
            });
            setIsConnected(true);
          } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
            setError('Live signaling connection failed');
            setIsConnected(false);
          }
        });
      } catch (err) {
        console.error('[Broadcaster] Connection error:', err);
        setError(err instanceof Error ? err.message : 'Connection failed');
      }
    },
    [
      createOfferForViewer,
      handleAnswer,
      handleIceCandidate,
      streamId,
      syncStream,
    ],
  );

  const disconnect = useCallback(() => {
    viewerConnectionsRef.current.forEach(({ pc }) => pc.close());
    viewerConnectionsRef.current.clear();

    const channel = channelRef.current;
    if (channel) {
      void channel.send({
        type: 'broadcast',
        event: 'stream-ended',
        payload: { broadcasterId: userIdRef.current },
      });
      void supabase.removeChannel(channel);
    }

    channelRef.current = null;
    localStreamRef.current = null;
    setIsConnected(false);
    setViewerCount(0);
  }, []);

  useEffect(() => disconnect, [disconnect]);

  return {
    isConnected,
    viewerCount,
    error,
    connect,
    syncStream,
    disconnect,
  };
}

// Viewer hook - receives the broadcaster media over WebRTC and uses the same
// Realtime channel for signaling and presence.
export function useLiveStreamViewer(streamId: string | null) {
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const userIdRef = useRef<string | null>(null);
  const broadcasterIdRef = useRef<string | null>(null);
  const remoteStreamRef = useRef<MediaStream | null>(null);
  const pendingIceRef = useRef<RTCIceCandidateInit[]>([]);

  const publishRemoteStream = useCallback(() => {
    const stream = remoteStreamRef.current;
    if (!stream) return;
    setRemoteStream(new MediaStream(stream.getTracks()));
  }, []);

  const closePeer = useCallback(() => {
    pcRef.current?.close();
    pcRef.current = null;
    broadcasterIdRef.current = null;
    pendingIceRef.current = [];
    remoteStreamRef.current = null;
  }, []);

  const createViewerPeer = useCallback((broadcasterId: string) => {
    const pc = new RTCPeerConnection({
      iceServers: ICE_SERVERS,
      iceCandidatePoolSize: 10,
    });
    pcRef.current = pc;
    broadcasterIdRef.current = broadcasterId;
    remoteStreamRef.current = new MediaStream();

    pc.ontrack = (event) => {
      const stream = remoteStreamRef.current;
      if (!stream) return;

      const existing = stream
        .getTracks()
        .find((track) => track.kind === event.track.kind);
      if (existing && existing !== event.track) {
        stream.removeTrack(existing);
      }
      if (!stream.getTracks().includes(event.track)) {
        stream.addTrack(event.track);
      }

      publishRemoteStream();
      setIsConnected(true);
      setIsConnecting(false);

      event.track.onended = () => {
        const current = remoteStreamRef.current;
        if (!current) return;
        current.removeTrack(event.track);
        publishRemoteStream();
      };
      event.track.onunmute = publishRemoteStream;
    };

    pc.onicecandidate = (event) => {
      if (!event.candidate || !channelRef.current) return;
      void channelRef.current.send({
        type: 'broadcast',
        event: 'ice-candidate',
        payload: {
          candidate: event.candidate.toJSON(),
          targetUserId: broadcasterId,
          fromUserId: userIdRef.current,
        },
      });
    };

    pc.oniceconnectionstatechange = () => {
      if (
        pc.iceConnectionState === 'connected' ||
        pc.iceConnectionState === 'completed'
      ) {
        setIsConnected(true);
        setIsConnecting(false);
      } else if (pc.iceConnectionState === 'failed') {
        setIsConnected(false);
        setError('Connection failed');
        pc.restartIce();
      }
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'failed') {
        setIsConnected(false);
        pc.restartIce();
      }
    };

    return pc;
  }, [publishRemoteStream]);

  const handleOffer = useCallback(
    async (sdp: RTCSessionDescriptionInit, broadcasterId: string) => {
      try {
        let pc = pcRef.current;
        if (
          !pc ||
          pc.signalingState === 'closed' ||
          broadcasterIdRef.current !== broadcasterId
        ) {
          closePeer();
          pc = createViewerPeer(broadcasterId);
        }

        await pc.setRemoteDescription(new RTCSessionDescription(sdp));

        const pending = pendingIceRef.current.splice(0);
        for (const candidate of pending) {
          await pc.addIceCandidate(new RTCIceCandidate(candidate));
        }

        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);

        if (channelRef.current) {
          await channelRef.current.send({
            type: 'broadcast',
            event: 'answer',
            payload: {
              sdp: { type: answer.type, sdp: answer.sdp },
              viewerId: userIdRef.current,
              targetBroadcasterId: broadcasterId,
            },
          });
        }
      } catch (err) {
        console.error('[Viewer] Error handling offer:', err);
        setError('Failed to connect to stream');
        setIsConnecting(false);
      }
    },
    [closePeer, createViewerPeer],
  );

  const handleIceCandidate = useCallback(async (candidate: RTCIceCandidateInit) => {
    const pc = pcRef.current;
    if (!pc || !pc.remoteDescription) {
      pendingIceRef.current.push(candidate);
      return;
    }

    try {
      await pc.addIceCandidate(new RTCIceCandidate(candidate));
    } catch (err) {
      console.error('[Viewer] Error adding ICE candidate:', err);
    }
  }, []);

  const connect = useCallback(async () => {
    if (!streamId || channelRef.current) return;

    setIsConnecting(true);
    setError(null);

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session?.user) {
        setError('Not authenticated');
        setIsConnecting(false);
        return;
      }

      userIdRef.current = session.user.id;
      const channel = supabase.channel(`live-stream-${streamId}`, {
        config: {
          broadcast: { self: false },
          presence: { key: session.user.id },
        },
      });
      channelRef.current = channel;

      channel.on('broadcast', { event: 'offer' }, ({ payload }) => {
        if (payload.targetViewerId === session.user.id) {
          void handleOffer(payload.sdp, payload.broadcasterId);
        }
      });

      channel.on('broadcast', { event: 'ice-candidate' }, ({ payload }) => {
        if (payload.targetUserId === session.user.id) {
          void handleIceCandidate(payload.candidate);
        }
      });

      channel.on('broadcast', { event: 'stream-ended' }, () => {
        closePeer();
        setRemoteStream(null);
        setIsConnected(false);
        setIsConnecting(false);
        setError('Stream ended');
      });

      channel.subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          await channel.track({
            role: 'viewer',
            joined_at: new Date().toISOString(),
          });
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          setError('Live signaling connection failed');
          setIsConnecting(false);
        }
      });
    } catch (err) {
      console.error('[Viewer] Connection error:', err);
      setError(err instanceof Error ? err.message : 'Connection failed');
      setIsConnecting(false);
    }
  }, [closePeer, handleIceCandidate, handleOffer, streamId]);

  const disconnect = useCallback(() => {
    closePeer();

    const channel = channelRef.current;
    if (channel) {
      void supabase.removeChannel(channel);
    }
    channelRef.current = null;

    setRemoteStream(null);
    setIsConnected(false);
    setIsConnecting(false);
  }, [closePeer]);

  useEffect(() => disconnect, [disconnect]);

  return {
    remoteStream,
    isConnected,
    isConnecting,
    error,
    connect,
    disconnect,
  };
}

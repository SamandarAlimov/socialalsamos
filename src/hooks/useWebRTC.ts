import { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';

interface Participant {
  id: string;
  stream: MediaStream | null;
  isMuted: boolean;
  isVideoOn: boolean;
  isScreenSharing: boolean;
  isHandRaised: boolean;
}

interface WebRTCConfig {
  iceServers: RTCIceServer[];
}

const DEFAULT_CONFIG: WebRTCConfig = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
    { urls: 'stun:stun3.l.google.com:19302' },
    { urls: 'stun:stun4.l.google.com:19302' },
  ],
};

export function useWebRTC(roomId: string | null) {
  const { user } = useAuth();
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [screenStream, setScreenStream] = useState<MediaStream | null>(null);
  const [participants, setParticipants] = useState<Map<string, Participant>>(new Map());
  const [isConnected, setIsConnected] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOn, setIsVideoOn] = useState(true);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [isHandRaised, setIsHandRaised] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const peerConnectionsRef = useRef<Map<string, RTCPeerConnection>>(new Map());
  const pendingCandidatesRef = useRef<Map<string, RTCIceCandidateInit[]>>(new Map());

  const createPeerConnection = useCallback((participantId: string) => {
    const pc = new RTCPeerConnection(DEFAULT_CONFIG);

    pc.onicecandidate = (event) => {
      if (event.candidate && wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({
          type: 'ice-candidate',
          targetUserId: participantId,
          userId: user?.id,
          candidate: event.candidate,
        }));
      }
    };

    pc.ontrack = (event) => {
      setParticipants(prev => {
        const updated = new Map(prev);
        const existing = updated.get(participantId) || {
          id: participantId,
          stream: null,
          isMuted: false,
          isVideoOn: true,
          isScreenSharing: false,
          isHandRaised: false,
        };
        updated.set(participantId, {
          ...existing,
          stream: event.streams[0],
        });
        return updated;
      });
    };

    pc.onconnectionstatechange = () => {
      console.log(`Connection state with ${participantId}:`, pc.connectionState);
      if (pc.connectionState === 'failed') {
        // Attempt to restart ICE
        pc.restartIce();
      }
    };

    // Add local stream tracks
    if (localStream) {
      localStream.getTracks().forEach(track => {
        pc.addTrack(track, localStream);
      });
    }

    peerConnectionsRef.current.set(participantId, pc);
    return pc;
  }, [localStream, user?.id]);

  const handleOffer = useCallback(async (fromUserId: string, sdp: RTCSessionDescriptionInit) => {
    let pc = peerConnectionsRef.current.get(fromUserId);
    if (!pc) {
      pc = createPeerConnection(fromUserId);
    }

    await pc.setRemoteDescription(new RTCSessionDescription(sdp));

    // Add any pending ICE candidates
    const pendingCandidates = pendingCandidatesRef.current.get(fromUserId) || [];
    for (const candidate of pendingCandidates) {
      await pc.addIceCandidate(new RTCIceCandidate(candidate));
    }
    pendingCandidatesRef.current.delete(fromUserId);

    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);

    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: 'answer',
        targetUserId: fromUserId,
        userId: user?.id,
        sdp: answer,
      }));
    }
  }, [createPeerConnection, user?.id]);

  const handleAnswer = useCallback(async (fromUserId: string, sdp: RTCSessionDescriptionInit) => {
    const pc = peerConnectionsRef.current.get(fromUserId);
    if (pc) {
      await pc.setRemoteDescription(new RTCSessionDescription(sdp));

      // Add any pending ICE candidates
      const pendingCandidates = pendingCandidatesRef.current.get(fromUserId) || [];
      for (const candidate of pendingCandidates) {
        await pc.addIceCandidate(new RTCIceCandidate(candidate));
      }
      pendingCandidatesRef.current.delete(fromUserId);
    }
  }, []);

  const handleIceCandidate = useCallback(async (fromUserId: string, candidate: RTCIceCandidateInit) => {
    const pc = peerConnectionsRef.current.get(fromUserId);
    if (pc && pc.remoteDescription) {
      await pc.addIceCandidate(new RTCIceCandidate(candidate));
    } else {
      // Queue candidate if remote description not set yet
      const pending = pendingCandidatesRef.current.get(fromUserId) || [];
      pending.push(candidate);
      pendingCandidatesRef.current.set(fromUserId, pending);
    }
  }, []);

  const startLocalStream = useCallback(async (video = true, audio = true) => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: video ? {
          width: { ideal: 1280 },
          height: { ideal: 720 },
          frameRate: { ideal: 30 },
        } : false,
        audio: audio ? {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        } : false,
      });
      setLocalStream(stream);
      setIsVideoOn(video);
      return stream;
    } catch (err) {
      console.error('Error accessing media devices:', err);
      setError('Failed to access camera/microphone');
      return null;
    }
  }, []);

  const joinRoom = useCallback(async () => {
    if (!roomId || !user?.id) return;

    // Start local stream first
    const stream = await startLocalStream();
    if (!stream) return;

    // Connect to signaling server
    const wsUrl = `wss://mbhjganbihamoiqmankv.supabase.co/functions/v1/webrtc-signaling`;
    wsRef.current = new WebSocket(wsUrl);

    wsRef.current.onopen = () => {
      console.log('WebSocket connected');
      wsRef.current?.send(JSON.stringify({
        type: 'join',
        roomId,
        userId: user.id,
      }));
    };

    wsRef.current.onmessage = async (event) => {
      const data = JSON.parse(event.data);
      console.log('Received:', data.type);

      switch (data.type) {
        case 'room-joined':
          setIsConnected(true);
          // Create offers for existing participants
          for (const participantId of data.participants) {
            const pc = createPeerConnection(participantId);
            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);
            wsRef.current?.send(JSON.stringify({
              type: 'offer',
              targetUserId: participantId,
              userId: user.id,
              sdp: offer,
            }));
          }
          break;

        case 'user-joined':
          // New user joined, they will send us an offer
          setParticipants(prev => {
            const updated = new Map(prev);
            updated.set(data.userId, {
              id: data.userId,
              stream: null,
              isMuted: false,
              isVideoOn: true,
              isScreenSharing: false,
              isHandRaised: false,
            });
            return updated;
          });
          break;

        case 'offer':
          await handleOffer(data.fromUserId, data.sdp);
          break;

        case 'answer':
          await handleAnswer(data.fromUserId, data.sdp);
          break;

        case 'ice-candidate':
          await handleIceCandidate(data.fromUserId, data.candidate);
          break;

        case 'media-state-changed':
          setParticipants(prev => {
            const updated = new Map(prev);
            const existing = updated.get(data.userId);
            if (existing) {
              updated.set(data.userId, {
                ...existing,
                isMuted: data.isMuted,
                isVideoOn: data.isVideoOn,
                isScreenSharing: data.isScreenSharing,
                isHandRaised: data.isHandRaised,
              });
            }
            return updated;
          });
          break;

        case 'user-left':
          const pc = peerConnectionsRef.current.get(data.userId);
          if (pc) {
            pc.close();
            peerConnectionsRef.current.delete(data.userId);
          }
          setParticipants(prev => {
            const updated = new Map(prev);
            updated.delete(data.userId);
            return updated;
          });
          break;
      }
    };

    wsRef.current.onerror = (err) => {
      console.error('WebSocket error:', err);
      setError('Connection error');
    };

    wsRef.current.onclose = () => {
      console.log('WebSocket closed');
      setIsConnected(false);
    };
  }, [roomId, user?.id, startLocalStream, createPeerConnection, handleOffer, handleAnswer, handleIceCandidate]);

  const leaveRoom = useCallback(() => {
    // Send leave message
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: 'leave',
        userId: user?.id,
      }));
      wsRef.current.close();
    }

    // Close all peer connections
    peerConnectionsRef.current.forEach(pc => pc.close());
    peerConnectionsRef.current.clear();

    // Stop local stream
    localStream?.getTracks().forEach(track => track.stop());
    screenStream?.getTracks().forEach(track => track.stop());

    setLocalStream(null);
    setScreenStream(null);
    setParticipants(new Map());
    setIsConnected(false);
    setIsMuted(false);
    setIsVideoOn(true);
    setIsScreenSharing(false);
    setIsHandRaised(false);
  }, [user?.id, localStream, screenStream]);

  const toggleMute = useCallback(() => {
    if (localStream) {
      const audioTrack = localStream.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        setIsMuted(!audioTrack.enabled);

        // Notify others
        wsRef.current?.send(JSON.stringify({
          type: 'media-state',
          userId: user?.id,
          isMuted: !audioTrack.enabled,
          isVideoOn,
          isScreenSharing,
          isHandRaised,
        }));
      }
    }
  }, [localStream, user?.id, isVideoOn, isScreenSharing, isHandRaised]);

  const toggleVideo = useCallback(() => {
    if (localStream) {
      const videoTrack = localStream.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.enabled = !videoTrack.enabled;
        setIsVideoOn(videoTrack.enabled);

        // Notify others
        wsRef.current?.send(JSON.stringify({
          type: 'media-state',
          userId: user?.id,
          isMuted,
          isVideoOn: videoTrack.enabled,
          isScreenSharing,
          isHandRaised,
        }));
      }
    }
  }, [localStream, user?.id, isMuted, isScreenSharing, isHandRaised]);

  const toggleScreenShare = useCallback(async () => {
    if (isScreenSharing && screenStream) {
      screenStream.getTracks().forEach(track => track.stop());
      setScreenStream(null);
      setIsScreenSharing(false);

      // Replace screen track with camera track
      if (localStream) {
        const videoTrack = localStream.getVideoTracks()[0];
        peerConnectionsRef.current.forEach(pc => {
          const sender = pc.getSenders().find(s => s.track?.kind === 'video');
          if (sender && videoTrack) {
            sender.replaceTrack(videoTrack);
          }
        });
      }
    } else {
      try {
        const stream = await navigator.mediaDevices.getDisplayMedia({
          video: { cursor: 'always' } as any,
          audio: true,
        });
        setScreenStream(stream);
        setIsScreenSharing(true);

        // Replace camera track with screen track
        const screenTrack = stream.getVideoTracks()[0];
        peerConnectionsRef.current.forEach(pc => {
          const sender = pc.getSenders().find(s => s.track?.kind === 'video');
          if (sender) {
            sender.replaceTrack(screenTrack);
          }
        });

        // Handle screen share stop
        screenTrack.onended = () => {
          toggleScreenShare();
        };
      } catch (err) {
        console.error('Error sharing screen:', err);
      }
    }

    // Notify others
    wsRef.current?.send(JSON.stringify({
      type: 'media-state',
      userId: user?.id,
      isMuted,
      isVideoOn,
      isScreenSharing: !isScreenSharing,
      isHandRaised,
    }));
  }, [isScreenSharing, screenStream, localStream, user?.id, isMuted, isVideoOn, isHandRaised]);

  const toggleHandRaise = useCallback(() => {
    setIsHandRaised(prev => {
      const newValue = !prev;
      wsRef.current?.send(JSON.stringify({
        type: 'media-state',
        userId: user?.id,
        isMuted,
        isVideoOn,
        isScreenSharing,
        isHandRaised: newValue,
      }));
      return newValue;
    });
  }, [user?.id, isMuted, isVideoOn, isScreenSharing]);

  const sendChatMessage = useCallback((message: string) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: 'chat-message',
        userId: user?.id,
        message,
        timestamp: new Date().toISOString(),
      }));
    }
  }, [user?.id]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      leaveRoom();
    };
  }, []);

  return {
    localStream,
    screenStream,
    participants: Array.from(participants.values()),
    isConnected,
    isMuted,
    isVideoOn,
    isScreenSharing,
    isHandRaised,
    error,
    joinRoom,
    leaveRoom,
    toggleMute,
    toggleVideo,
    toggleScreenShare,
    toggleHandRaise,
    sendChatMessage,
  };
}

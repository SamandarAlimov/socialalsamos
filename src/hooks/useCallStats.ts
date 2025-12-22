import { useState, useCallback, useRef, useEffect } from 'react';

export interface CallStats {
  bitrate: number;
  packetLoss: number;
  rtt: number; // Round-trip time in ms
  jitter: number;
  frameRate: number;
  resolution: { width: number; height: number };
  codec: string;
  bytesSent: number;
  bytesReceived: number;
  quality: 'excellent' | 'good' | 'fair' | 'poor' | 'disconnected';
}

export interface ICEDebugInfo {
  iceConnectionState: RTCIceConnectionState;
  iceGatheringState: RTCIceGatheringState;
  signalingState: RTCSignalingState;
  connectionState: RTCPeerConnectionState;
  selectedCandidatePair: {
    local: string;
    remote: string;
    type: string;
  } | null;
  localCandidates: string[];
  remoteCandidates: string[];
  usingTurn: boolean;
}

const STATS_INTERVAL = 2000;

export function useCallStats(peerConnections: Map<string, RTCPeerConnection>) {
  const [stats, setStats] = useState<CallStats>({
    bitrate: 0,
    packetLoss: 0,
    rtt: 0,
    jitter: 0,
    frameRate: 0,
    resolution: { width: 0, height: 0 },
    codec: '',
    bytesSent: 0,
    bytesReceived: 0,
    quality: 'disconnected',
  });

  const [debugInfo, setDebugInfo] = useState<ICEDebugInfo>({
    iceConnectionState: 'new',
    iceGatheringState: 'new',
    signalingState: 'stable',
    connectionState: 'new',
    selectedCandidatePair: null,
    localCandidates: [],
    remoteCandidates: [],
    usingTurn: false,
  });

  const [isReconnecting, setIsReconnecting] = useState(false);
  const prevStatsRef = useRef<Map<string, { bytesSent: number; bytesReceived: number; timestamp: number }>>(new Map());
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  const calculateQuality = useCallback((rtt: number, packetLoss: number, bitrate: number): CallStats['quality'] => {
    if (bitrate === 0) return 'disconnected';
    if (rtt < 50 && packetLoss < 1 && bitrate > 1000000) return 'excellent';
    if (rtt < 100 && packetLoss < 3 && bitrate > 500000) return 'good';
    if (rtt < 200 && packetLoss < 5 && bitrate > 200000) return 'fair';
    return 'poor';
  }, []);

  const collectStats = useCallback(async () => {
    const pcs = Array.from(peerConnections.values());
    if (pcs.length === 0) {
      setStats(prev => ({ ...prev, quality: 'disconnected' }));
      return;
    }

    let totalRtt = 0;
    let totalPacketLoss = 0;
    let totalJitter = 0;
    let totalBitrate = 0;
    let totalBytesSent = 0;
    let totalBytesReceived = 0;
    let frameRate = 0;
    let resolution = { width: 0, height: 0 };
    let codec = '';
    let count = 0;
    let usingTurn = false;

    for (const [peerId, pc] of peerConnections) {
      try {
        const report = await pc.getStats();
        const prevStats = prevStatsRef.current.get(peerId);
        let currentBytesSent = 0;
        let currentBytesReceived = 0;
        
        report.forEach((stat) => {
          // Connection metrics
          if (stat.type === 'candidate-pair' && stat.state === 'succeeded') {
            if (stat.currentRoundTripTime !== undefined) {
              totalRtt += stat.currentRoundTripTime * 1000;
              count++;
            }
            
            // Check if using TURN
            const localCandidate = report.get(stat.localCandidateId);
            if (localCandidate?.candidateType === 'relay') {
              usingTurn = true;
            }
          }

          // Outbound video stats
          if (stat.type === 'outbound-rtp' && stat.kind === 'video') {
            currentBytesSent += stat.bytesSent || 0;
            
            if (stat.framesPerSecond) {
              frameRate = stat.framesPerSecond;
            }
            if (stat.frameWidth && stat.frameHeight) {
              resolution = { width: stat.frameWidth, height: stat.frameHeight };
            }

            // Calculate packet loss
            if (stat.packetsSent && stat.packetsLost !== undefined) {
              const lossRate = (stat.packetsLost / stat.packetsSent) * 100;
              totalPacketLoss += lossRate;
            }
          }

          // Inbound stats
          if (stat.type === 'inbound-rtp' && stat.kind === 'video') {
            currentBytesReceived += stat.bytesReceived || 0;
            if (stat.jitter !== undefined) {
              totalJitter += stat.jitter * 1000;
            }
          }

          // Codec info
          if (stat.type === 'codec' && stat.mimeType?.includes('video')) {
            codec = stat.mimeType.split('/')[1] || '';
          }
        });

        // Calculate bitrate
        if (prevStats) {
          const timeDiff = (Date.now() - prevStats.timestamp) / 1000;
          const bytesDiff = (currentBytesSent - prevStats.bytesSent) + (currentBytesReceived - prevStats.bytesReceived);
          totalBitrate += (bytesDiff * 8) / timeDiff;
        }

        prevStatsRef.current.set(peerId, {
          bytesSent: currentBytesSent,
          bytesReceived: currentBytesReceived,
          timestamp: Date.now(),
        });

        totalBytesSent += currentBytesSent;
        totalBytesReceived += currentBytesReceived;

        // Update debug info for first peer
        if (peerId === pcs[0]?.toString()) {
          const localCandidates: string[] = [];
          const remoteCandidates: string[] = [];
          let selectedPair: ICEDebugInfo['selectedCandidatePair'] = null;

          report.forEach((stat) => {
            if (stat.type === 'local-candidate') {
              localCandidates.push(`${stat.candidateType}:${stat.protocol}:${stat.address}:${stat.port}`);
            }
            if (stat.type === 'remote-candidate') {
              remoteCandidates.push(`${stat.candidateType}:${stat.protocol}:${stat.address}:${stat.port}`);
            }
            if (stat.type === 'candidate-pair' && stat.state === 'succeeded' && stat.nominated) {
              const local = report.get(stat.localCandidateId);
              const remote = report.get(stat.remoteCandidateId);
              selectedPair = {
                local: `${local?.candidateType || 'unknown'}:${local?.protocol || ''}:${local?.address || ''}`,
                remote: `${remote?.candidateType || 'unknown'}:${remote?.protocol || ''}:${remote?.address || ''}`,
                type: local?.candidateType || 'unknown',
              };
            }
          });

          setDebugInfo({
            iceConnectionState: pc.iceConnectionState,
            iceGatheringState: pc.iceGatheringState,
            signalingState: pc.signalingState,
            connectionState: pc.connectionState,
            selectedCandidatePair: selectedPair,
            localCandidates,
            remoteCandidates,
            usingTurn,
          });
        }
      } catch (err) {
        console.error('[CallStats] Error collecting stats:', err);
      }
    }

    const avgRtt = count > 0 ? totalRtt / count : 0;
    const avgPacketLoss = pcs.length > 0 ? totalPacketLoss / pcs.length : 0;
    const avgJitter = pcs.length > 0 ? totalJitter / pcs.length : 0;

    setStats({
      bitrate: totalBitrate,
      packetLoss: avgPacketLoss,
      rtt: avgRtt,
      jitter: avgJitter,
      frameRate,
      resolution,
      codec,
      bytesSent: totalBytesSent,
      bytesReceived: totalBytesReceived,
      quality: calculateQuality(avgRtt, avgPacketLoss, totalBitrate),
    });
  }, [peerConnections, calculateQuality]);

  // Monitor ICE connection state for reconnection
  useEffect(() => {
    const checkReconnecting = () => {
      for (const pc of peerConnections.values()) {
        if (pc.iceConnectionState === 'disconnected' || pc.iceConnectionState === 'checking') {
          setIsReconnecting(true);
          return;
        }
      }
      setIsReconnecting(false);
    };

    const handlers = new Map<RTCPeerConnection, () => void>();
    
    peerConnections.forEach((pc) => {
      const handler = () => checkReconnecting();
      pc.addEventListener('iceconnectionstatechange', handler);
      handlers.set(pc, handler);
    });

    return () => {
      handlers.forEach((handler, pc) => {
        pc.removeEventListener('iceconnectionstatechange', handler);
      });
    };
  }, [peerConnections]);

  // Start/stop stats collection
  const startMonitoring = useCallback(() => {
    if (intervalRef.current) return;
    intervalRef.current = setInterval(collectStats, STATS_INTERVAL);
    collectStats(); // Initial collection
  }, [collectStats]);

  const stopMonitoring = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    prevStatsRef.current.clear();
  }, []);

  useEffect(() => {
    return () => stopMonitoring();
  }, [stopMonitoring]);

  return {
    stats,
    debugInfo,
    isReconnecting,
    startMonitoring,
    stopMonitoring,
  };
}

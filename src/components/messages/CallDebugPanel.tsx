import { useState } from 'react';
import { cn } from '@/lib/utils';
import { ChevronDown, ChevronUp, Bug } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { CallStats, ICEDebugInfo } from '@/hooks/useCallStats';

interface CallDebugPanelProps {
  stats: CallStats;
  debugInfo: ICEDebugInfo;
  className?: string;
}

export function CallDebugPanel({ stats, debugInfo, className }: CallDebugPanelProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  
  // Only show in development mode
  if (import.meta.env.PROD) return null;

  const formatBytes = (bytes: number) => {
    if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
    if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${bytes} B`;
  };

  const getStateColor = (state: string) => {
    switch (state) {
      case 'connected':
      case 'complete':
      case 'stable':
        return 'text-green-400';
      case 'checking':
      case 'new':
        return 'text-yellow-400';
      case 'disconnected':
      case 'failed':
      case 'closed':
        return 'text-red-400';
      default:
        return 'text-gray-400';
    }
  };

  return (
    <div className={cn(
      'absolute top-16 left-4 z-30 bg-black/90 backdrop-blur border border-gray-700 rounded-lg overflow-hidden',
      'text-xs font-mono text-white max-w-sm',
      className
    )}>
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between px-3 py-2 hover:bg-white/5"
      >
        <div className="flex items-center gap-2">
          <Bug className="h-3.5 w-3.5 text-yellow-500" />
          <span className="text-yellow-500 font-semibold">Debug Panel</span>
        </div>
        {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
      </button>

      {isExpanded && (
        <div className="px-3 pb-3 space-y-3 max-h-[60vh] overflow-y-auto">
          {/* Connection States */}
          <section>
            <h4 className="text-gray-400 font-semibold mb-1 border-b border-gray-700 pb-1">Connection States</h4>
            <div className="grid grid-cols-2 gap-x-4 gap-y-0.5">
              <span className="text-gray-500">ICE:</span>
              <span className={getStateColor(debugInfo.iceConnectionState)}>{debugInfo.iceConnectionState}</span>
              
              <span className="text-gray-500">ICE Gathering:</span>
              <span className={getStateColor(debugInfo.iceGatheringState)}>{debugInfo.iceGatheringState}</span>
              
              <span className="text-gray-500">Signaling:</span>
              <span className={getStateColor(debugInfo.signalingState)}>{debugInfo.signalingState}</span>
              
              <span className="text-gray-500">Connection:</span>
              <span className={getStateColor(debugInfo.connectionState)}>{debugInfo.connectionState}</span>
            </div>
          </section>

          {/* Selected Candidate Pair */}
          <section>
            <h4 className="text-gray-400 font-semibold mb-1 border-b border-gray-700 pb-1">Selected Candidate Pair</h4>
            {debugInfo.selectedCandidatePair ? (
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="text-gray-500">Type:</span>
                  <span className={debugInfo.usingTurn ? 'text-yellow-400' : 'text-green-400'}>
                    {debugInfo.selectedCandidatePair.type}
                    {debugInfo.usingTurn && ' (TURN)'}
                  </span>
                </div>
                <div className="text-gray-500 text-[10px]">
                  <div>Local: {debugInfo.selectedCandidatePair.local}</div>
                  <div>Remote: {debugInfo.selectedCandidatePair.remote}</div>
                </div>
              </div>
            ) : (
              <span className="text-gray-500">No pair selected</span>
            )}
          </section>

          {/* Stats */}
          <section>
            <h4 className="text-gray-400 font-semibold mb-1 border-b border-gray-700 pb-1">Performance Stats</h4>
            <div className="grid grid-cols-2 gap-x-4 gap-y-0.5">
              <span className="text-gray-500">Quality:</span>
              <span className={cn(
                stats.quality === 'excellent' && 'text-green-400',
                stats.quality === 'good' && 'text-green-300',
                stats.quality === 'fair' && 'text-yellow-400',
                stats.quality === 'poor' && 'text-red-400',
                stats.quality === 'disconnected' && 'text-gray-400'
              )}>{stats.quality}</span>
              
              <span className="text-gray-500">RTT:</span>
              <span>{Math.round(stats.rtt)}ms</span>
              
              <span className="text-gray-500">Packet Loss:</span>
              <span className={stats.packetLoss > 5 ? 'text-red-400' : ''}>{stats.packetLoss.toFixed(2)}%</span>
              
              <span className="text-gray-500">Jitter:</span>
              <span>{stats.jitter.toFixed(2)}ms</span>
              
              <span className="text-gray-500">Bitrate:</span>
              <span>{(stats.bitrate / 1000).toFixed(0)} Kbps</span>
              
              <span className="text-gray-500">Frame Rate:</span>
              <span>{stats.frameRate} fps</span>
              
              <span className="text-gray-500">Resolution:</span>
              <span>{stats.resolution.width}x{stats.resolution.height}</span>
              
              <span className="text-gray-500">Codec:</span>
              <span>{stats.codec || 'N/A'}</span>
            </div>
          </section>

          {/* Data Transfer */}
          <section>
            <h4 className="text-gray-400 font-semibold mb-1 border-b border-gray-700 pb-1">Data Transfer</h4>
            <div className="grid grid-cols-2 gap-x-4 gap-y-0.5">
              <span className="text-gray-500">Sent:</span>
              <span className="text-blue-400">{formatBytes(stats.bytesSent)}</span>
              
              <span className="text-gray-500">Received:</span>
              <span className="text-green-400">{formatBytes(stats.bytesReceived)}</span>
            </div>
          </section>

          {/* Candidates */}
          <section>
            <h4 className="text-gray-400 font-semibold mb-1 border-b border-gray-700 pb-1">
              ICE Candidates ({debugInfo.localCandidates.length}/{debugInfo.remoteCandidates.length})
            </h4>
            <div className="max-h-24 overflow-y-auto text-[10px] space-y-0.5">
              {debugInfo.localCandidates.slice(0, 5).map((c, i) => (
                <div key={i} className="text-blue-300">L: {c}</div>
              ))}
              {debugInfo.remoteCandidates.slice(0, 5).map((c, i) => (
                <div key={i} className="text-green-300">R: {c}</div>
              ))}
            </div>
          </section>
        </div>
      )}
    </div>
  );
}

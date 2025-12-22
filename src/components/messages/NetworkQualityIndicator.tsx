import { cn } from '@/lib/utils';
import { Wifi, WifiOff, AlertTriangle } from 'lucide-react';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';

interface NetworkQualityIndicatorProps {
  quality: 'excellent' | 'good' | 'fair' | 'poor' | 'disconnected';
  rtt?: number;
  packetLoss?: number;
  bitrate?: number;
  isReconnecting?: boolean;
  showDetails?: boolean;
  className?: string;
}

export function NetworkQualityIndicator({
  quality,
  rtt = 0,
  packetLoss = 0,
  bitrate = 0,
  isReconnecting = false,
  showDetails = false,
  className,
}: NetworkQualityIndicatorProps) {
  const formatBitrate = (bps: number) => {
    if (bps >= 1000000) return `${(bps / 1000000).toFixed(1)} Mbps`;
    if (bps >= 1000) return `${(bps / 1000).toFixed(0)} Kbps`;
    return `${bps.toFixed(0)} bps`;
  };

  const getQualityColor = () => {
    if (isReconnecting) return 'text-yellow-500';
    switch (quality) {
      case 'excellent': return 'text-green-500';
      case 'good': return 'text-green-400';
      case 'fair': return 'text-yellow-500';
      case 'poor': return 'text-red-500';
      case 'disconnected': return 'text-gray-500';
      default: return 'text-gray-500';
    }
  };

  const getQualityBars = () => {
    if (isReconnecting) return 2;
    switch (quality) {
      case 'excellent': return 4;
      case 'good': return 3;
      case 'fair': return 2;
      case 'poor': return 1;
      default: return 0;
    }
  };

  const bars = getQualityBars();

  const content = (
    <div className={cn('flex items-center gap-1.5', className)}>
      {isReconnecting ? (
        <AlertTriangle className={cn('h-4 w-4 animate-pulse', getQualityColor())} />
      ) : quality === 'disconnected' ? (
        <WifiOff className={cn('h-4 w-4', getQualityColor())} />
      ) : (
        <div className="flex items-end gap-0.5 h-4">
          {[1, 2, 3, 4].map((bar) => (
            <div
              key={bar}
              className={cn(
                'w-1 rounded-sm transition-colors',
                bar <= bars ? getQualityColor().replace('text-', 'bg-') : 'bg-gray-600'
              )}
              style={{ height: `${bar * 3 + 2}px` }}
            />
          ))}
        </div>
      )}
      
      {showDetails && (
        <div className="text-xs text-white/80 flex items-center gap-2">
          <span>{Math.round(rtt)}ms</span>
          {packetLoss > 0 && <span className="text-red-400">{packetLoss.toFixed(1)}% loss</span>}
        </div>
      )}
    </div>
  );

  if (!showDetails) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          {content}
        </TooltipTrigger>
        <TooltipContent side="bottom" className="bg-gray-900 border-gray-700">
          <div className="text-sm space-y-1">
            <div className="font-medium capitalize">
              {isReconnecting ? 'Reconnecting...' : `${quality} connection`}
            </div>
            <div className="text-xs text-gray-400 space-y-0.5">
              <div>Latency: {Math.round(rtt)}ms</div>
              <div>Packet Loss: {packetLoss.toFixed(1)}%</div>
              <div>Bitrate: {formatBitrate(bitrate)}</div>
            </div>
          </div>
        </TooltipContent>
      </Tooltip>
    );
  }

  return content;
}

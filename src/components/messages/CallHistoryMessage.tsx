import { Phone, PhoneOff, PhoneMissed, Video, VideoOff } from 'lucide-react';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';

export interface CallHistoryData {
  type: 'audio' | 'video';
  status: 'missed' | 'declined' | 'ended' | 'cancelled';
  duration?: number; // in seconds
  timestamp: string;
  caller_id: string;
  callee_id: string;
}

interface CallHistoryMessageProps {
  callData: CallHistoryData;
  isMine: boolean; // if current user initiated the call
}

export function CallHistoryMessage({ callData, isMine }: CallHistoryMessageProps) {
  const formatDuration = (seconds: number) => {
    const hours = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    
    if (hours > 0) {
      return `${hours}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const getIcon = () => {
    const iconClass = "h-4 w-4";
    
    if (callData.status === 'missed') {
      return callData.type === 'video' 
        ? <VideoOff className={cn(iconClass, "text-red-500")} />
        : <PhoneMissed className={cn(iconClass, "text-red-500")} />;
    }
    
    if (callData.status === 'declined' || callData.status === 'cancelled') {
      return callData.type === 'video'
        ? <VideoOff className={cn(iconClass, "text-destructive")} />
        : <PhoneOff className={cn(iconClass, "text-destructive")} />;
    }
    
    // ended call
    return callData.type === 'video'
      ? <Video className={cn(iconClass, "text-green-500")} />
      : <Phone className={cn(iconClass, "text-green-500")} />;
  };

  const getMessage = () => {
    const callType = callData.type === 'video' ? 'Video call' : 'Voice call';
    
    switch (callData.status) {
      case 'missed':
        return isMine ? `Missed ${callType.toLowerCase()}` : `Missed ${callType.toLowerCase()}`;
      case 'declined':
        return isMine ? `${callType} declined` : `${callType} declined`;
      case 'cancelled':
        return `${callType} cancelled`;
      case 'ended':
        if (callData.duration) {
          return `${callType} — ${formatDuration(callData.duration)}`;
        }
        return `${callType} ended`;
      default:
        return callType;
    }
  };

  const getStatusColor = () => {
    switch (callData.status) {
      case 'missed':
      case 'declined':
      case 'cancelled':
        return 'text-red-500';
      case 'ended':
        return 'text-green-500';
      default:
        return 'text-muted-foreground';
    }
  };

  return (
    <div className="flex items-center justify-center py-2">
      <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-muted/50 text-sm">
        {getIcon()}
        <span className={cn("font-medium", getStatusColor())}>
          {getMessage()}
        </span>
        <span className="text-muted-foreground text-xs">
          {format(new Date(callData.timestamp), 'HH:mm')}
        </span>
      </div>
    </div>
  );
}

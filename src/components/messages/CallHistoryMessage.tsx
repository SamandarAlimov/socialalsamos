import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { Phone, PhoneOff, PhoneIncoming, PhoneOutgoing, Video, VideoOff } from 'lucide-react';

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
    const isSuccessful = callData.status === 'ended';
    const isMissedOrDeclined = callData.status === 'missed' || callData.status === 'declined' || callData.status === 'cancelled';
    
    if (callData.type === 'video') {
      if (isMissedOrDeclined) {
        return <VideoOff className={cn(iconClass, "text-red-500")} />;
      }
      return <Video className={cn(iconClass, isSuccessful ? "text-emerald-500" : "text-muted-foreground")} />;
    } else {
      if (isMissedOrDeclined) {
        return <PhoneOff className={cn(iconClass, "text-red-500")} />;
      }
      if (isSuccessful) {
        return isMine 
          ? <PhoneOutgoing className={cn(iconClass, "text-emerald-500")} />
          : <PhoneIncoming className={cn(iconClass, "text-emerald-500")} />;
      }
      return <Phone className={cn(iconClass, "text-muted-foreground")} />;
    }
  };

  const getMessage = () => {
    const callType = callData.type === 'video' ? 'Video qo\'ng\'iroq' : 'Ovozli qo\'ng\'iroq';
    
    switch (callData.status) {
      case 'missed':
        return isMine ? `${callType} javobsiz` : `O'tkazib yuborilgan ${callType.toLowerCase()}`;
      case 'declined':
        return `${callType} rad etildi`;
      case 'cancelled':
        return `${callType} bekor qilindi`;
      case 'ended':
        if (callData.duration) {
          return `${callType} · ${formatDuration(callData.duration)}`;
        }
        return `${callType} tugadi`;
      default:
        return callType;
    }
  };

  const isSuccessful = callData.status === 'ended';
  const isFailed = callData.status === 'missed' || callData.status === 'declined' || callData.status === 'cancelled';

  return (
    <div className="flex items-center justify-center py-2">
      <div className={cn(
        "inline-flex items-center gap-2.5 px-4 py-2 rounded-full text-xs font-medium transition-colors",
        isSuccessful && "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
        isFailed && "bg-red-500/10 text-red-600 dark:text-red-400",
        !isSuccessful && !isFailed && "bg-muted text-muted-foreground"
      )}>
        <div className={cn(
          "flex items-center justify-center w-6 h-6 rounded-full",
          isSuccessful && "bg-emerald-500/20",
          isFailed && "bg-red-500/20",
          !isSuccessful && !isFailed && "bg-muted-foreground/20"
        )}>
          {getIcon()}
        </div>
        <span>{getMessage()}</span>
        <span className="opacity-60">
          {format(new Date(callData.timestamp), 'HH:mm')}
        </span>
      </div>
    </div>
  );
}

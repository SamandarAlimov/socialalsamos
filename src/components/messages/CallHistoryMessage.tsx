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

// Professional Material Design call icons
const VideoCallIcon = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor">
    <path d="M17 10.5V7c0-.55-.45-1-1-1H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.55 0 1-.45 1-1v-3.5l4 4v-11l-4 4z"/>
  </svg>
);

const VideoCallMissedIcon = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor">
    <path d="M17 10.5V7c0-.55-.45-1-1-1H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.55 0 1-.45 1-1v-3.5l4 4v-11l-4 4z" opacity="0.5"/>
    <rect x="10" y="2" width="2.5" height="14" rx="1" transform="rotate(45 12 9)"/>
  </svg>
);

const AudioCallIcon = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor">
    <path d="M20.01 15.38c-1.23 0-2.42-.2-3.53-.56a.977.977 0 0 0-1.01.24l-1.57 1.97c-2.83-1.35-5.48-3.9-6.89-6.83l1.95-1.66c.27-.28.35-.67.24-1.02-.37-1.11-.56-2.3-.56-3.53 0-.54-.45-.99-.99-.99H4.19C3.65 4 3 4.24 3 5c0 9.39 7.61 17 17 17 .71 0 1-.6 1-1.18v-3.45c0-.54-.45-.99-.99-.99z"/>
  </svg>
);

const AudioCallMissedIcon = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor">
    <path d="M20.01 15.38c-1.23 0-2.42-.2-3.53-.56a.977.977 0 0 0-1.01.24l-1.57 1.97c-2.83-1.35-5.48-3.9-6.89-6.83l1.95-1.66c.27-.28.35-.67.24-1.02-.37-1.11-.56-2.3-.56-3.53 0-.54-.45-.99-.99-.99H4.19C3.65 4 3 4.24 3 5c0 9.39 7.61 17 17 17 .71 0 1-.6 1-1.18v-3.45c0-.54-.45-.99-.99-.99z" opacity="0.5"/>
    <rect x="10" y="2" width="2.5" height="14" rx="1" transform="rotate(45 12 9)"/>
  </svg>
);

const AudioCallEndedIcon = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor">
    <path d="M12 9c-1.6 0-3.15.25-4.6.72v3.1c0 .39-.23.74-.56.9-.98.49-1.87 1.12-2.66 1.85-.18.17-.43.28-.7.28-.28 0-.53-.11-.71-.29L.29 13.08a.956.956 0 0 1-.29-.7c0-.28.11-.53.29-.71C3.34 8.78 7.46 7 12 7s8.66 1.78 11.71 4.67c.18.18.29.43.29.71 0 .28-.11.53-.29.71l-2.48 2.48c-.18.18-.43.29-.71.29-.27 0-.52-.11-.7-.28a11.27 11.27 0 0 0-2.67-1.85.996.996 0 0 1-.56-.9v-3.1C15.15 9.25 13.6 9 12 9z"/>
  </svg>
);

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
    const iconClass = "h-5 w-5";
    
    if (callData.status === 'missed') {
      return callData.type === 'video' 
        ? <VideoCallMissedIcon className={cn(iconClass, "text-red-500")} />
        : <AudioCallMissedIcon className={cn(iconClass, "text-red-500")} />;
    }
    
    if (callData.status === 'declined' || callData.status === 'cancelled') {
      return callData.type === 'video'
        ? <VideoCallMissedIcon className={cn(iconClass, "text-destructive")} />
        : <AudioCallEndedIcon className={cn(iconClass, "text-destructive")} />;
    }
    
    // ended call (successful)
    return callData.type === 'video'
      ? <VideoCallIcon className={cn(iconClass, "text-emerald-500")} />
      : <AudioCallIcon className={cn(iconClass, "text-emerald-500")} />;
  };

  const getMessage = () => {
    const callType = callData.type === 'video' ? 'Video call' : 'Voice call';
    
    switch (callData.status) {
      case 'missed':
        return `Missed ${callType.toLowerCase()}`;
      case 'declined':
        return `${callType} declined`;
      case 'cancelled':
        return `${callType} cancelled`;
      case 'ended':
        if (callData.duration) {
          return `${callType} • ${formatDuration(callData.duration)}`;
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
        return 'text-red-400';
      case 'ended':
        return 'text-emerald-400';
      default:
        return 'text-muted-foreground';
    }
  };

  const getBackgroundStyle = () => {
    switch (callData.status) {
      case 'missed':
      case 'declined':
      case 'cancelled':
        return 'bg-red-500/10 border border-red-500/20';
      case 'ended':
        return 'bg-emerald-500/10 border border-emerald-500/20';
      default:
        return 'bg-muted/50';
    }
  };

  return (
    <div className="flex items-center justify-center py-3">
      <div className={cn(
        "flex items-center gap-3 px-5 py-2.5 rounded-2xl text-sm shadow-sm",
        getBackgroundStyle()
      )}>
        <div className="flex items-center justify-center w-8 h-8 rounded-full bg-background/50">
          {getIcon()}
        </div>
        <div className="flex flex-col">
          <span className={cn("font-medium", getStatusColor())}>
            {getMessage()}
          </span>
          <span className="text-muted-foreground text-xs">
            {format(new Date(callData.timestamp), 'HH:mm')}
          </span>
        </div>
      </div>
    </div>
  );
}

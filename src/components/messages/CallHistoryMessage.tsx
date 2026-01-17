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

// Professional call icons as SVG components
const VideoCallIcon = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M15.6 11.6L22 7v10l-6.4-4.6v-1z" />
    <rect x="2" y="6" width="14" height="12" rx="2" ry="2" />
  </svg>
);

const VideoCallMissedIcon = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="2" y1="2" x2="22" y2="22" />
    <path d="M15.6 11.6L22 7v10l-6.4-4.6v-1z" opacity="0.5" />
    <rect x="2" y="6" width="14" height="12" rx="2" ry="2" opacity="0.5" />
  </svg>
);

const AudioCallIcon = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
  </svg>
);

const AudioCallMissedIcon = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="1" y1="1" x2="23" y2="23" />
    <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91" opacity="0.5" />
  </svg>
);

const AudioCallEndedIcon = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M10.68 13.31a16 16 0 0 0 3.41 2.6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7 2 2 0 0 1 1.72 2v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.42 19.42 0 0 1-3.33-2.67m-2.67-3.34a19.79 19.79 0 0 1-3.07-8.63A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91" />
    <line x1="22" y1="2" x2="2" y2="22" />
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

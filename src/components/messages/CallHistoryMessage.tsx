import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { Phone, PhoneOff, PhoneIncoming, PhoneOutgoing, PhoneMissed, Video, VideoOff } from 'lucide-react';

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
  /** True when the current user initiated the call (outgoing) -> render on the right, like Telegram. */
  isMine: boolean;
}

export function CallHistoryMessage({ callData, isMine }: CallHistoryMessageProps) {
  const isVideo = callData.type === 'video';
  const isSuccessful = callData.status === 'ended';
  const isFailed =
    callData.status === 'missed' || callData.status === 'declined' || callData.status === 'cancelled';

  const formatDuration = (seconds: number) => {
    const hours = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;

    if (hours > 0) {
      return `${hours}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const iconClass = 'h-4 w-4';

  const getIcon = () => {
    if (isVideo) {
      if (isFailed) return <VideoOff className={cn(iconClass, 'text-red-500')} />;
      return (
        <Video
          className={cn(iconClass, isSuccessful ? 'text-emerald-500' : 'text-muted-foreground')}
        />
      );
    }

    if (isFailed) {
      return callData.status === 'missed' ? (
        <PhoneMissed className={cn(iconClass, 'text-red-500')} />
      ) : (
        <PhoneOff className={cn(iconClass, 'text-red-500')} />
      );
    }

    if (isSuccessful) {
      return isMine ? (
        <PhoneOutgoing className={cn(iconClass, 'text-emerald-500')} />
      ) : (
        <PhoneIncoming className={cn(iconClass, 'text-emerald-500')} />
      );
    }

    return <Phone className={cn(iconClass, 'text-muted-foreground')} />;
  };

  /** Telegram always states the call kind (audio vs video) and the direction. */
  const getTitle = () => {
    const kind = isVideo ? "Video qo'ng'iroq" : "Ovozli qo'ng'iroq";

    switch (callData.status) {
      case 'missed':
        return isMine ? `${kind} · javobsiz` : `O'tkazib yuborilgan ${kind.toLowerCase()}`;
      case 'declined':
        return `${kind} rad etildi`;
      case 'cancelled':
        return `${kind} bekor qilindi`;
      case 'ended':
        return `${isMine ? 'Chiquvchi' : 'Kiruvchi'} ${kind.toLowerCase()}`;
      default:
        return kind;
    }
  };

  const getSubtitle = () => {
    if (isSuccessful) {
      return callData.duration ? formatDuration(callData.duration) : "Qo'ng'iroq tugadi";
    }
    if (callData.status === 'missed') return 'Javob berilmadi';
    if (callData.status === 'declined') return 'Rad etildi';
    if (callData.status === 'cancelled') return 'Bekor qilindi';
    return null;
  };

  const subtitle = getSubtitle();

  return (
    <div className={cn('flex w-full px-2 py-1', isMine ? 'justify-end' : 'justify-start')}>
      <div
        className={cn(
          'inline-flex max-w-[85%] items-center gap-3 rounded-2xl px-3 py-2 text-left shadow-sm',
          isMine ? 'rounded-br-md' : 'rounded-bl-md',
          isSuccessful && 'bg-emerald-500/10',
          isFailed && 'bg-red-500/10',
          !isSuccessful && !isFailed && 'bg-muted'
        )}
      >
        <div
          className={cn(
            'flex h-8 w-8 shrink-0 items-center justify-center rounded-full',
            isSuccessful && 'bg-emerald-500/20',
            isFailed && 'bg-red-500/20',
            !isSuccessful && !isFailed && 'bg-muted-foreground/20'
          )}
        >
          {getIcon()}
        </div>

        <div className="min-w-0">
          <p
            className={cn(
              'truncate text-[13px] font-medium leading-tight',
              isSuccessful && 'text-emerald-600 dark:text-emerald-400',
              isFailed && 'text-red-600 dark:text-red-400',
              !isSuccessful && !isFailed && 'text-foreground'
            )}
          >
            {getTitle()}
          </p>
          <p className="mt-0.5 flex items-center gap-1.5 text-[11px] text-muted-foreground">
            {subtitle && <span className="truncate">{subtitle}</span>}
            {subtitle && <span aria-hidden>·</span>}
            <span>{format(new Date(callData.timestamp), 'HH:mm')}</span>
          </p>
        </div>
      </div>
    </div>
  );
}

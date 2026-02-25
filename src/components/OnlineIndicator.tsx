import { cn } from '@/lib/utils';
import { useOnlinePresence } from '@/contexts/OnlinePresenceContext';

interface OnlineIndicatorProps {
  userId: string;
  size?: 'xs' | 'sm' | 'md' | 'lg';
  className?: string;
  /** Position absolute relative to parent */
  absolute?: boolean;
}

const sizeClasses = {
  xs: 'h-2 w-2',
  sm: 'h-2.5 w-2.5 border',
  md: 'h-3 w-3 border-2',
  lg: 'h-4 w-4 border-2',
};

export function OnlineIndicator({ userId, size = 'md', className, absolute = true }: OnlineIndicatorProps) {
  const { isUserOnline } = useOnlinePresence();

  if (!isUserOnline(userId)) return null;

  return (
    <span
      className={cn(
        'bg-green-500 rounded-full border-background block',
        sizeClasses[size],
        absolute && 'absolute bottom-0 right-0',
        className
      )}
    />
  );
}

import { ReactNode } from 'react';
import { Loader2 } from 'lucide-react';
import { usePullToRefresh } from '@/hooks/usePullToRefresh';
import { cn } from '@/lib/utils';

interface PullToRefreshProps {
  children: ReactNode;
  onRefresh: () => Promise<void>;
  className?: string;
  disabled?: boolean;
}

export function PullToRefresh({ 
  children, 
  onRefresh, 
  className,
  disabled = false 
}: PullToRefreshProps) {
  const { containerRef, isRefreshing, pullDistance, progress } = usePullToRefresh({
    onRefresh,
    disabled,
  });

  return (
    <div 
      ref={containerRef}
      className={cn("relative overflow-auto", className)}
    >
      {/* Pull indicator */}
      <div 
        className={cn(
          "absolute left-0 right-0 flex items-center justify-center transition-transform duration-200 z-10",
          isRefreshing ? "opacity-100" : pullDistance > 0 ? "opacity-100" : "opacity-0"
        )}
        style={{ 
          transform: `translateY(${Math.max(pullDistance - 40, isRefreshing ? 16 : -40)}px)`,
          height: '40px',
          top: 0
        }}
      >
        <div 
          className={cn(
            "flex items-center justify-center w-10 h-10 rounded-full bg-primary/10 border border-primary/20",
            isRefreshing && "animate-pulse"
          )}
          style={{
            transform: isRefreshing ? 'rotate(0deg)' : `rotate(${progress * 360}deg)`,
            transition: isRefreshing ? 'none' : 'transform 0.1s'
          }}
        >
          <Loader2 
            className={cn(
              "h-5 w-5 text-primary",
              isRefreshing && "animate-spin"
            )} 
          />
        </div>
      </div>
      
      {/* Content with transform */}
      <div 
        style={{ 
          transform: `translateY(${pullDistance}px)`,
          transition: pullDistance === 0 ? 'transform 0.2s ease-out' : 'none'
        }}
      >
        {children}
      </div>
    </div>
  );
}

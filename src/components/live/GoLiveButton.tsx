import { useState } from 'react';
import { Radio } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { LiveStreamBroadcast } from './LiveStreamBroadcast';

interface GoLiveButtonProps {
  variant?: 'default' | 'story';
}

export function GoLiveButton({ variant = 'default' }: GoLiveButtonProps) {
  const [showBroadcast, setShowBroadcast] = useState(false);

  if (variant === 'story') {
    return (
      <>
        <button
          onClick={() => setShowBroadcast(true)}
          className="flex flex-col items-center gap-1.5 md:gap-2 flex-shrink-0 touch-feedback"
        >
          <div className="relative">
            <div className="h-14 w-14 md:h-16 md:w-16 rounded-full bg-gradient-to-tr from-red-500 to-pink-500 flex items-center justify-center">
              <Radio className="h-6 w-6 md:h-7 md:w-7 text-white" />
            </div>
            <div className="absolute -bottom-0.5 left-1/2 -translate-x-1/2 bg-red-500 text-white text-[8px] font-bold px-1.5 py-0.5 rounded-sm">
              LIVE
            </div>
          </div>
          <span className="text-[10px] md:text-xs text-muted-foreground">
            Go Live
          </span>
        </button>

        {showBroadcast && (
          <LiveStreamBroadcast onClose={() => setShowBroadcast(false)} />
        )}
      </>
    );
  }

  return (
    <>
      <Button
        onClick={() => setShowBroadcast(true)}
        variant="outline"
        className="gap-2"
      >
        <Radio className="h-4 w-4 text-red-500" />
        Go Live
      </Button>

      {showBroadcast && (
        <LiveStreamBroadcast onClose={() => setShowBroadcast(false)} />
      )}
    </>
  );
}

import { useState } from 'react';
import { Users, Radio } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { cn } from '@/lib/utils';
import { LiveStream } from '@/hooks/useLiveStream';
import { LiveStreamViewer } from './LiveStreamViewer';

interface LiveStreamCardProps {
  stream: LiveStream;
  variant?: 'story' | 'card';
}

export function LiveStreamCard({ stream, variant = 'story' }: LiveStreamCardProps) {
  const [showViewer, setShowViewer] = useState(false);

  if (variant === 'story') {
    return (
      <>
        <button
          onClick={() => setShowViewer(true)}
          className="flex flex-col items-center gap-1.5 md:gap-2 flex-shrink-0 touch-feedback"
        >
          <div className="relative">
            <div className="p-0.5 rounded-full bg-gradient-to-tr from-red-500 to-pink-500 animate-pulse">
              <div className="bg-background p-0.5 rounded-full">
                <Avatar className="h-14 w-14 md:h-16 md:w-16">
                  <AvatarImage src={stream.profile?.avatar_url || ''} />
                  <AvatarFallback>
                    {stream.profile?.display_name?.[0] || stream.profile?.username?.[0] || 'U'}
                  </AvatarFallback>
                </Avatar>
              </div>
            </div>
            <div className="absolute -bottom-0.5 left-1/2 -translate-x-1/2 bg-red-500 text-white text-[8px] font-bold px-1.5 py-0.5 rounded-sm flex items-center gap-0.5">
              <Radio className="h-2 w-2" />
              LIVE
            </div>
          </div>
          <span className="text-[10px] md:text-xs text-muted-foreground truncate max-w-[56px] md:max-w-[64px]">
            {stream.profile?.display_name || stream.profile?.username}
          </span>
        </button>

        {showViewer && (
          <LiveStreamViewer
            streamId={stream.id}
            onClose={() => setShowViewer(false)}
          />
        )}
      </>
    );
  }

  return (
    <>
      <div
        onClick={() => setShowViewer(true)}
        className="relative rounded-xl overflow-hidden cursor-pointer group"
      >
        {/* Thumbnail/Preview */}
        <div className="aspect-video bg-gradient-to-br from-purple-900 to-pink-900 flex items-center justify-center">
          <Radio className="h-12 w-12 text-white/50 animate-pulse" />
        </div>

        {/* Overlay */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 to-transparent" />

        {/* Live badge */}
        <div className="absolute top-2 left-2 bg-red-500 text-white text-xs font-bold px-2 py-0.5 rounded flex items-center gap-1">
          <Radio className="h-3 w-3" />
          LIVE
        </div>

        {/* Viewer count */}
        <div className="absolute top-2 right-2 bg-black/50 text-white text-xs px-2 py-0.5 rounded flex items-center gap-1">
          <Users className="h-3 w-3" />
          {stream.viewer_count.toLocaleString()}
        </div>

        {/* User info */}
        <div className="absolute bottom-0 left-0 right-0 p-3">
          <div className="flex items-center gap-2">
            <Avatar className="h-8 w-8 border border-white/20">
              <AvatarImage src={stream.profile?.avatar_url || ''} />
              <AvatarFallback className="text-xs">
                {stream.profile?.display_name?.[0] || 'U'}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <p className="text-white font-semibold text-sm truncate">
                {stream.profile?.display_name || stream.profile?.username}
              </p>
              {stream.title && (
                <p className="text-white/70 text-xs truncate">{stream.title}</p>
              )}
            </div>
          </div>
        </div>

        {/* Hover overlay */}
        <div className="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
          <div className="bg-white/20 rounded-full p-4">
            <Radio className="h-8 w-8 text-white" />
          </div>
        </div>
      </div>

      {showViewer && (
        <LiveStreamViewer
          streamId={stream.id}
          onClose={() => setShowViewer(false)}
        />
      )}
    </>
  );
}

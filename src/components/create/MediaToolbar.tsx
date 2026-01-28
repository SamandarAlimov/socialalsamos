import { Button } from '@/components/ui/button';
import { 
  Image as ImageIcon, 
  Video, 
  Camera,
  BarChart3,
  MapPin,
  AtSign,
  Hash,
  Smile,
  Mic,
  Calendar,
  Music,
  Users,
  Type,
  Sparkles,
  Sticker,
  Link2,
  FileText,
  Wand2
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

interface MediaToolbarProps {
  onImageClick: () => void;
  onVideoClick: () => void;
  onCameraClick: () => void;
  onPollClick: () => void;
  onLocationClick?: () => void;
  onMentionClick?: () => void;
  onHashtagClick?: () => void;
  onEmojiClick?: () => void;
  onMusicClick?: () => void;
  onCollaborateClick?: () => void;
  onTextBackgroundClick?: () => void;
  onFilterClick?: () => void;
  onEffectsClick?: () => void;
  onScheduleClick?: () => void;
  onLinkClick?: () => void;
  hasPoll?: boolean;
  hasMusic?: boolean;
  hasTextBackground?: boolean;
  disabled?: boolean;
  compact?: boolean;
  showAll?: boolean;
  variant?: 'post' | 'story' | 'reel';
}

export function MediaToolbar({
  onImageClick,
  onVideoClick,
  onCameraClick,
  onPollClick,
  onLocationClick,
  onMentionClick,
  onHashtagClick,
  onEmojiClick,
  onMusicClick,
  onCollaborateClick,
  onTextBackgroundClick,
  onFilterClick,
  onEffectsClick,
  onScheduleClick,
  onLinkClick,
  hasPoll,
  hasMusic,
  hasTextBackground,
  disabled,
  compact,
  showAll = false,
  variant = 'post'
}: MediaToolbarProps) {
  const allTools = [
    { 
      icon: ImageIcon, 
      label: 'Photo', 
      onClick: onImageClick, 
      color: 'text-green-500',
      show: true
    },
    { 
      icon: Video, 
      label: 'Video', 
      onClick: onVideoClick, 
      color: 'text-blue-500',
      show: true
    },
    { 
      icon: Camera, 
      label: 'Camera', 
      onClick: onCameraClick, 
      color: 'text-purple-500',
      show: true
    },
    { 
      icon: BarChart3, 
      label: 'Poll', 
      onClick: onPollClick, 
      color: 'text-orange-500', 
      active: hasPoll,
      show: variant === 'post'
    },
    { 
      icon: Sparkles, 
      label: 'Filter', 
      onClick: onFilterClick, 
      color: 'text-pink-500',
      show: !!onFilterClick
    },
    { 
      icon: Wand2, 
      label: 'Effects', 
      onClick: onEffectsClick, 
      color: 'text-violet-500',
      show: !!onEffectsClick
    },
    { 
      icon: Music, 
      label: 'Music', 
      onClick: onMusicClick, 
      color: 'text-rose-500', 
      active: hasMusic,
      show: !!onMusicClick
    },
    { 
      icon: Type, 
      label: 'Text BG', 
      onClick: onTextBackgroundClick, 
      color: 'text-amber-500', 
      active: hasTextBackground,
      show: !!onTextBackgroundClick && (variant === 'story' || variant === 'post')
    },
    { 
      icon: Users, 
      label: 'Collab', 
      onClick: onCollaborateClick, 
      color: 'text-cyan-500',
      show: !!onCollaborateClick
    },
    { 
      icon: AtSign, 
      label: 'Mention', 
      onClick: onMentionClick, 
      color: 'text-indigo-500',
      show: !!onMentionClick
    },
    { 
      icon: Smile, 
      label: 'Emoji', 
      onClick: onEmojiClick, 
      color: 'text-yellow-500',
      show: !!onEmojiClick
    },
    { 
      icon: Hash, 
      label: 'Tag', 
      onClick: onHashtagClick, 
      color: 'text-teal-500',
      show: !!onHashtagClick
    },
    { 
      icon: MapPin, 
      label: 'Location', 
      onClick: onLocationClick, 
      color: 'text-red-500',
      show: !!onLocationClick
    },
    { 
      icon: Link2, 
      label: 'Link', 
      onClick: onLinkClick, 
      color: 'text-slate-500',
      show: !!onLinkClick && variant === 'post'
    },
    { 
      icon: Calendar, 
      label: 'Schedule', 
      onClick: onScheduleClick, 
      color: 'text-emerald-500',
      show: !!onScheduleClick && variant === 'post'
    },
  ];

  const tools = allTools.filter(tool => tool.show);
  const displayTools = showAll ? tools : tools.slice(0, compact ? 8 : 4);

  if (compact) {
    return (
      <TooltipProvider>
        <div className="flex gap-1 overflow-x-auto pb-2 scrollbar-hide">
          {displayTools.map((tool) => (
            <Tooltip key={tool.label}>
              <TooltipTrigger asChild>
                <Button
                  variant={tool.active ? "default" : "ghost"}
                  size="icon"
                  onClick={tool.onClick}
                  disabled={disabled}
                  className={cn(
                    "flex-shrink-0 h-9 w-9",
                    !tool.active && tool.color
                  )}
                >
                  <tool.icon className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>{tool.label}</p>
              </TooltipContent>
            </Tooltip>
          ))}
        </div>
      </TooltipProvider>
    );
  }

  return (
    <div className="grid grid-cols-4 gap-2">
      {displayTools.map((tool) => (
        <Button
          key={tool.label}
          variant={tool.active ? "default" : "outline"}
          size="lg"
          className={cn(
            "h-20 flex-col gap-2",
            !tool.active && tool.color
          )}
          onClick={tool.onClick}
          disabled={disabled}
        >
          <tool.icon className="h-6 w-6" />
          <span className="text-xs">{tool.label}</span>
        </Button>
      ))}
    </div>
  );
}

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
  FileText,
  Calendar
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface MediaToolbarProps {
  onImageClick: () => void;
  onVideoClick: () => void;
  onCameraClick: () => void;
  onPollClick: () => void;
  onLocationClick?: () => void;
  onMentionClick?: () => void;
  onHashtagClick?: () => void;
  onEmojiClick?: () => void;
  onAudioClick?: () => void;
  onScheduleClick?: () => void;
  hasPoll?: boolean;
  disabled?: boolean;
  compact?: boolean;
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
  onAudioClick,
  onScheduleClick,
  hasPoll,
  disabled,
  compact
}: MediaToolbarProps) {
  const tools = [
    { icon: ImageIcon, label: 'Photo', onClick: onImageClick, color: 'text-green-500' },
    { icon: Video, label: 'Video', onClick: onVideoClick, color: 'text-blue-500' },
    { icon: Camera, label: 'Camera', onClick: onCameraClick, color: 'text-purple-500' },
    { icon: BarChart3, label: 'Poll', onClick: onPollClick, color: 'text-orange-500', active: hasPoll },
    { icon: Smile, label: 'Emoji', onClick: onEmojiClick, color: 'text-yellow-500', hide: !onEmojiClick },
    { icon: MapPin, label: 'Location', onClick: onLocationClick, color: 'text-red-500', hide: !onLocationClick },
    { icon: AtSign, label: 'Mention', onClick: onMentionClick, color: 'text-cyan-500', hide: !onMentionClick },
    { icon: Hash, label: 'Tag', onClick: onHashtagClick, color: 'text-indigo-500', hide: !onHashtagClick },
    { icon: Mic, label: 'Audio', onClick: onAudioClick, color: 'text-pink-500', hide: !onAudioClick },
    { icon: Calendar, label: 'Schedule', onClick: onScheduleClick, color: 'text-teal-500', hide: !onScheduleClick },
  ].filter(tool => !tool.hide);

  if (compact) {
    return (
      <div className="flex gap-1 overflow-x-auto pb-2">
        {tools.map((tool) => (
          <Button
            key={tool.label}
            variant={tool.active ? "default" : "ghost"}
            size="icon"
            onClick={tool.onClick}
            disabled={disabled}
            className={cn(
              "flex-shrink-0",
              !tool.active && tool.color
            )}
          >
            <tool.icon className="h-5 w-5" />
          </Button>
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-4 gap-2">
      {tools.slice(0, 4).map((tool) => (
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
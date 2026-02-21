import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Megaphone, Lock, Globe, Users } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Channel } from '@/hooks/useChannels';

interface ChannelCardProps {
  channel: Channel;
  onSelect: (channel: Channel) => void;
  onJoin?: (channelId: string) => void;
  onLeave?: (channelId: string) => void;
  compact?: boolean;
}

export function ChannelCard({ channel, onSelect, onJoin, onLeave, compact }: ChannelCardProps) {
  const formatCount = (n: number) => {
    if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
    if (n >= 1000) return (n / 1000).toFixed(1) + 'K';
    return n.toString();
  };

  return (
    <div
      onClick={() => onSelect(channel)}
      className={cn(
        "flex items-center gap-3 p-3 rounded-xl cursor-pointer transition-all hover:bg-muted/60",
        compact ? "p-2" : "p-3"
      )}
    >
      <Avatar className={cn("flex-shrink-0", compact ? "h-10 w-10" : "h-12 w-12")}>
        <AvatarImage src={channel.avatar_url || ''} />
        <AvatarFallback className="bg-primary/10 text-primary">
          <Megaphone className="h-5 w-5" />
        </AvatarFallback>
      </Avatar>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="font-semibold text-sm truncate">{channel.name}</span>
          {channel.channel_type === 'private' ? (
            <Lock className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
          ) : (
            <Globe className="h-3.5 w-3.5 text-primary flex-shrink-0" />
          )}
        </div>
        {channel.username && (
          <p className="text-xs text-muted-foreground">@{channel.username}</p>
        )}
        <div className="flex items-center gap-2 mt-0.5">
          <span className="text-xs text-muted-foreground flex items-center gap-1">
            <Users className="h-3 w-3" />
            {formatCount(channel.subscriber_count)}
          </span>
          {channel.is_paid && (
            <Badge variant="secondary" className="text-[10px] h-4 px-1">Pullik</Badge>
          )}
        </div>
      </div>

      {!channel.is_member && onJoin && (
        <Button
          size="sm"
          variant="default"
          onClick={e => { e.stopPropagation(); onJoin(channel.id); }}
          className="flex-shrink-0 h-8 text-xs"
        >
          Obuna
        </Button>
      )}

      {channel.is_member && channel.member_role !== 'admin' && onLeave && (
        <Button
          size="sm"
          variant="outline"
          onClick={e => { e.stopPropagation(); onLeave(channel.id); }}
          className="flex-shrink-0 h-8 text-xs"
        >
          Chiqish
        </Button>
      )}

      {channel.member_role === 'admin' && (
        <Badge variant="outline" className="flex-shrink-0 text-[10px]">Admin</Badge>
      )}
    </div>
  );
}

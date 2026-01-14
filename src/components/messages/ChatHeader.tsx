import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { 
  Phone, 
  Video, 
  Search, 
  MoreVertical, 
  Users, 
  Megaphone,
  ArrowLeft,
  Info,
  Bell,
  BellOff,
  Trash2,
  LogOut,
  Users2,
  Clock,
  Bookmark,
} from 'lucide-react';
import { Conversation } from '@/hooks/useMessages';
import { cn } from '@/lib/utils';
import { formatLastSeen } from '@/utils/formatLastSeen';
import { useUserOnlineStatus } from '@/hooks/useRealtimeStatus';
import { VerifiedBadge } from '@/components/VerifiedBadge';
import { useAuth } from '@/contexts/AuthContext';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

interface ChatHeaderProps {
  conversation: Conversation & { is_self_chat?: boolean };
  typingUsers: string[];
  onBack?: () => void;
  onAudioCall: () => void;
  onVideoCall: () => void;
  onSearch?: () => void;
  onViewInfo?: () => void;
  onMute?: () => void;
  onLeave?: () => void;
  onDelete?: () => void;
  onManageMembers?: () => void;
  onViewScheduled?: () => void;
  scheduledCount?: number;
  isMuted?: boolean;
  isAdmin?: boolean;
}

export function ChatHeader({
  conversation,
  typingUsers,
  onBack,
  onAudioCall,
  onVideoCall,
  onSearch,
  onViewInfo,
  onMute,
  onLeave,
  onDelete,
  onManageMembers,
  onViewScheduled,
  scheduledCount,
  isMuted,
  isAdmin,
}: ChatHeaderProps) {
  const { user } = useAuth();
  
  // Check if this is a self-chat (conversation with yourself)
  const isSelfChat = conversation.is_self_chat || 
    (conversation.type === 'private' && conversation.other_participant?.id === user?.id);

  // Get real-time status for private chats (but not for self-chat)
  const otherUserId = conversation.type === 'private' && !isSelfChat ? conversation.other_participant?.id : null;
  const { isOnline: realtimeIsOnline, lastSeen: realtimeLastSeen } = useUserOnlineStatus(otherUserId || null);

  const getName = () => {
    if (isSelfChat) {
      return conversation.other_participant?.display_name || 
             conversation.other_participant?.username || 
             'You';
    }
    if (conversation.type === 'private') {
      return conversation.other_participant?.display_name || 
             conversation.other_participant?.username || 
             'Unknown';
    }
    return conversation.name || 'Unnamed';
  };

  const getAvatar = () => {
    if (conversation.type === 'private') {
      return conversation.other_participant?.avatar_url;
    }
    return conversation.avatar_url;
  };

  const getStatus = () => {
    if (typingUsers.length > 0) {
      return <span className="text-primary animate-pulse">typing...</span>;
    }
    
    if (isSelfChat) {
      return <span className="text-amber-500">save messages to yourself</span>;
    }
    
    if (conversation.type === 'private') {
      // Use real-time status - prioritize presence API result
      if (realtimeIsOnline) {
        return <span className="text-green-500 font-medium">online</span>;
      }
      
      // Fall back to last seen time
      const lastSeenTime = realtimeLastSeen || conversation.other_participant?.last_seen;
      return formatLastSeen(lastSeenTime, false);
    }
    
    if (conversation.type === 'group') {
      return 'group';
    }
    
    if (conversation.type === 'channel') {
      return 'channel';
    }
    
    return null;
  };

  // Use realtime status for online indicator (but not for self-chat)
  const isOnline = conversation.type === 'private' && !isSelfChat && realtimeIsOnline;

  return (
    <div className="h-16 px-4 flex items-center justify-between border-b border-border bg-card/95 backdrop-blur">
      <div className="flex items-center gap-3">
        {onBack && (
          <Button variant="ghost" size="icon" className="md:hidden" onClick={onBack}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
        )}
        
        <button 
          onClick={onViewInfo}
          className="flex items-center gap-3 hover:bg-accent/50 -mx-2 px-2 py-1 rounded-lg transition-colors"
        >
          <div className="relative">
            <Avatar className="h-10 w-10">
              <AvatarImage src={getAvatar() || ''} />
              <AvatarFallback className={cn(
                "text-primary-foreground",
                conversation.type === 'group' && 'bg-blue-500',
                conversation.type === 'channel' && 'bg-violet-500',
                isSelfChat && 'bg-gradient-to-br from-amber-500 to-orange-500',
                conversation.type === 'private' && !isSelfChat && 'bg-primary'
              )}>
                {isSelfChat ? (
                  <Bookmark className="h-5 w-5" />
                ) : conversation.type === 'group' ? (
                  <Users className="h-5 w-5" />
                ) : conversation.type === 'channel' ? (
                  <Megaphone className="h-5 w-5" />
                ) : (
                  getName()[0]?.toUpperCase()
                )}
              </AvatarFallback>
            </Avatar>
            {isOnline && !isSelfChat && (
              <span className="absolute bottom-0 right-0 h-3 w-3 bg-green-500 rounded-full border-2 border-card" />
            )}
            {isSelfChat && (
              <span className="absolute -bottom-0.5 -right-0.5 h-4 w-4 bg-card rounded-full flex items-center justify-center border-2 border-amber-500">
                <Bookmark className="h-2 w-2 text-amber-500 fill-amber-500" />
              </span>
            )}
          </div>
          
          <div className="text-left">
            <div className="flex items-center gap-1">
              <h2 className="font-semibold text-sm">{getName()}</h2>
              {conversation.type === 'private' && conversation.other_participant?.is_verified && (
                <VerifiedBadge size="xs" />
              )}
            </div>
            <p className="text-xs text-muted-foreground">{getStatus()}</p>
          </div>
        </button>
      </div>
      
      <div className="flex items-center gap-1">
        {/* Hide call buttons for self-chat */}
        {!isSelfChat && (
          <>
            <Button variant="ghost" size="icon" onClick={onAudioCall}>
              <Phone className="h-5 w-5 text-muted-foreground" />
            </Button>
            <Button variant="ghost" size="icon" onClick={onVideoCall}>
              <Video className="h-5 w-5 text-muted-foreground" />
            </Button>
          </>
        )}
        {onSearch && (
          <Button variant="ghost" size="icon" onClick={onSearch}>
            <Search className="h-5 w-5 text-muted-foreground" />
          </Button>
        )}
        
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon">
              <MoreVertical className="h-5 w-5 text-muted-foreground" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            {onViewInfo && (
              <DropdownMenuItem onClick={onViewInfo}>
                <Info className="h-4 w-4 mr-2" />
                View Info
              </DropdownMenuItem>
            )}
            {onSearch && (
              <DropdownMenuItem onClick={onSearch}>
                <Search className="h-4 w-4 mr-2" />
                Search
              </DropdownMenuItem>
            )}
            {onViewScheduled && (
              <DropdownMenuItem onClick={onViewScheduled}>
                <Clock className="h-4 w-4 mr-2" />
                Scheduled Messages
                {scheduledCount && scheduledCount > 0 && (
                  <span className="ml-auto text-xs bg-primary text-primary-foreground rounded-full px-1.5">
                    {scheduledCount}
                  </span>
                )}
              </DropdownMenuItem>
            )}
            {onMute && (
              <DropdownMenuItem onClick={onMute}>
                {isMuted ? (
                  <>
                    <Bell className="h-4 w-4 mr-2" />
                    Unmute
                  </>
                ) : (
                  <>
                    <BellOff className="h-4 w-4 mr-2" />
                    Mute
                  </>
                )}
              </DropdownMenuItem>
            )}
            {(conversation.type === 'group' || conversation.type === 'channel') && (
              <>
                {onManageMembers && (
                  <DropdownMenuItem onClick={onManageMembers}>
                    <Users2 className="h-4 w-4 mr-2" />
                    Manage Members
                  </DropdownMenuItem>
                )}
                {onLeave && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={onLeave} className="text-destructive">
                      <LogOut className="h-4 w-4 mr-2" />
                      Leave {conversation.type === 'group' ? 'Group' : 'Channel'}
                    </DropdownMenuItem>
                  </>
                )}
              </>
            )}
            {conversation.type === 'private' && onDelete && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={onDelete} className="text-destructive">
                  <Trash2 className="h-4 w-4 mr-2" />
                  Delete Chat
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}

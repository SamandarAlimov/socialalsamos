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
  Ban,
  Flag,
  Settings2,
  Rocket,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Conversation } from '@/hooks/useMessages';
import { cn } from '@/lib/utils';
import { formatLastSeen } from '@/utils/formatLastSeen';
import { useOnlinePresence } from '@/contexts/OnlinePresenceContext';
import { VerifiedBadge } from '@/components/VerifiedBadge';
import { useAuth } from '@/contexts/AuthContext';
import { useBlockedUsers } from '@/hooks/useMessageSafety';
import { BlockConfirmDialog } from './BlockConfirmDialog';
import { ReportDialog } from './ReportDialog';
import { GroupChannelSettingsSheet } from './GroupChannelSettingsSheet';
import { GoLiveButton } from '@/components/live/GoLiveButton';
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
  const [blockOpen, setBlockOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsTabBoost, setSettingsTabBoost] = useState(false);
  const { blockedIds, refresh: refreshBlocks } = useBlockedUsers();

  const isChannel = conversation.type === 'channel';
  const isGroupOrChannel = conversation.type === 'group' || conversation.type === 'channel';
  const isSelfChat =
    conversation.is_self_chat ||
    (conversation.type === 'private' && conversation.other_participant?.id === user?.id);

  const otherUserId =
    conversation.type === 'private' && !isSelfChat ? conversation.other_participant?.id : null;
  const otherUsername = conversation.other_participant?.username;
  const { isUserOnline } = useOnlinePresence();
  const realtimeIsOnline = otherUserId ? isUserOnline(otherUserId) : false;
  const realtimeLastSeen = conversation.other_participant?.last_seen || null;
  const isBlocked = otherUserId ? blockedIds.has(otherUserId) : false;

  useEffect(() => {
    refreshBlocks();
  }, [otherUserId, refreshBlocks]);

  const getName = () => {
    if (isSelfChat) {
      return (
        conversation.other_participant?.display_name ||
        conversation.other_participant?.username ||
        'Saqlangan xabarlar'
      );
    }
    if (conversation.type === 'private') {
      return (
        conversation.other_participant?.display_name ||
        conversation.other_participant?.username ||
        "Noma'lum"
      );
    }
    return conversation.name || 'Nomsiz';
  };

  const getAvatar = () =>
    conversation.type === 'private'
      ? conversation.other_participant?.avatar_url
      : conversation.avatar_url;

  const getStatus = () => {
    if (typingUsers.length > 0) {
      return <span className="animate-pulse text-primary">yozmoqda...</span>;
    }

    if (isSelfChat) {
      return <span className="text-muted-foreground">o'zingizga xabar saqlash</span>;
    }

    if (conversation.type === 'private') {
      if (realtimeIsOnline) {
        return <span className="font-medium text-green-500">onlayn</span>;
      }
      const lastSeenTime = realtimeLastSeen || conversation.other_participant?.last_seen;
      return formatLastSeen(lastSeenTime, false);
    }

    if (conversation.type === 'group') return 'guruh';
    if (conversation.type === 'channel') return 'kanal';
    return null;
  };

  const isOnline = conversation.type === 'private' && !isSelfChat && realtimeIsOnline;

  // Telegramdek: shaxsiy chatda sarlavha bosilganda profil ochiladi.
  // Guruh/kanalda sarlavha bosilganda sozlamalar (ma'lumot) oynasi ochiladi.
  const profilePath =
    conversation.type === 'private' && !isSelfChat && (otherUsername || otherUserId)
      ? `/user/${otherUsername || otherUserId}`
      : null;

  const handleHeaderClick = () => {
    if (isGroupOrChannel) {
      setSettingsTabBoost(false);
      setSettingsOpen(true);
      return;
    }
    onViewInfo?.();
  };

  const headerInner = (
    <>
      <div className="relative shrink-0">
        <Avatar className="h-9 w-9 sm:h-10 sm:w-10">
          <AvatarImage src={getAvatar() || ''} />
          <AvatarFallback
            className={cn(
              'text-primary-foreground',
              conversation.type === 'group' && 'bg-blue-500',
              conversation.type === 'channel' && 'bg-violet-500',
              isSelfChat && 'bg-muted text-foreground',
              conversation.type === 'private' && !isSelfChat && 'bg-primary'
            )}
          >
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
          <span className="absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-card bg-green-500" />
        )}
        {isSelfChat && (
          <span className="absolute -bottom-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full border-2 border-border bg-card">
            <Bookmark className="h-2 w-2 fill-foreground text-foreground" />
          </span>
        )}
      </div>

      <div className="min-w-0 flex-1 text-left">
        <div className="flex min-w-0 items-center gap-1.5">
          <h2 className="truncate text-sm font-semibold sm:text-[15px]">{getName()}</h2>
          {conversation.type === 'private' && conversation.other_participant?.is_verified && (
            <VerifiedBadge size="xs" />
          )}
        </div>
        <p className="truncate text-xs text-muted-foreground">{getStatus()}</p>
      </div>
    </>
  );

  const headerClasses =
    '-mx-2 flex min-w-0 flex-1 items-center gap-2.5 rounded-xl px-2 py-1 tg-transition hover:bg-muted/60 sm:gap-3';

  return (
    <div className="flex h-14 min-w-0 items-center gap-1 border-b border-border bg-card/95 px-2 backdrop-blur sm:h-16 sm:px-4">
      <div className="flex min-w-0 flex-1 items-center gap-1 sm:gap-2">
        {onBack && (
          <Button
            variant="ghost"
            size="icon"
            className="h-9 w-9 shrink-0 rounded-full md:hidden"
            onClick={onBack}
            aria-label="Orqaga"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
        )}

        {profilePath ? (
          <Link to={profilePath} className={headerClasses}>
            {headerInner}
          </Link>
        ) : (
          <button onClick={handleHeaderClick} className={headerClasses}>
            {headerInner}
          </button>
        )}
      </div>

      <div className="flex shrink-0 items-center">
        {/* Kanallar jonli eshittirish qiladi, 1:1 qo'ng'iroq ishlatmaydi */}
        {isChannel && isAdmin && <GoLiveButton />}

        {!isSelfChat && !isChannel && (
          <>
            <Button
              variant="ghost"
              size="icon"
              onClick={onAudioCall}
              aria-label="Audio qo'ng'iroq"
              title="Audio qo'ng'iroq"
              className="h-9 w-9 rounded-full hover:bg-muted sm:h-10 sm:w-10"
            >
              <Phone className="h-[18px] w-[18px] text-muted-foreground sm:h-5 sm:w-5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={onVideoCall}
              aria-label="Video qo'ng'iroq"
              title="Video qo'ng'iroq"
              className="h-9 w-9 rounded-full hover:bg-muted sm:h-10 sm:w-10"
            >
              <Video className="h-[18px] w-[18px] text-muted-foreground sm:h-5 sm:w-5" />
            </Button>
          </>
        )}
        {onSearch && (
          <Button
            variant="ghost"
            size="icon"
            onClick={onSearch}
            aria-label="Qidirish"
            title="Xabarlar ichida qidirish"
            className="hidden h-9 w-9 rounded-full hover:bg-muted sm:inline-flex sm:h-10 sm:w-10"
          >
            <Search className="h-[18px] w-[18px] text-muted-foreground sm:h-5 sm:w-5" />
          </Button>
        )}

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Boshqa amallar"
              className="h-9 w-9 rounded-full hover:bg-muted sm:h-10 sm:w-10"
            >
              <MoreVertical className="h-[18px] w-[18px] text-muted-foreground sm:h-5 sm:w-5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56 rounded-2xl">
            {onViewInfo && !isGroupOrChannel && (
              <DropdownMenuItem onClick={onViewInfo}>
                <Info className="mr-2 h-4 w-4" />
                Ma'lumot
              </DropdownMenuItem>
            )}
            {onSearch && (
              <DropdownMenuItem onClick={onSearch}>
                <Search className="mr-2 h-4 w-4" />
                Qidirish
              </DropdownMenuItem>
            )}
            {onViewScheduled && (
              <DropdownMenuItem onClick={onViewScheduled}>
                <Clock className="mr-2 h-4 w-4" />
                Rejalashtirilgan xabarlar
                {scheduledCount && scheduledCount > 0 ? (
                  <span className="ml-auto rounded-full bg-primary px-1.5 text-xs text-primary-foreground">
                    {scheduledCount}
                  </span>
                ) : null}
              </DropdownMenuItem>
            )}
            {onMute && (
              <DropdownMenuItem onClick={onMute}>
                {isMuted ? (
                  <>
                    <Bell className="mr-2 h-4 w-4" />
                    Ovozni yoqish
                  </>
                ) : (
                  <>
                    <BellOff className="mr-2 h-4 w-4" />
                    Ovozsiz qilish
                  </>
                )}
              </DropdownMenuItem>
            )}
            {isGroupOrChannel && (
              <>
                <DropdownMenuItem
                  onClick={() => {
                    setSettingsTabBoost(false);
                    setSettingsOpen(true);
                  }}
                >
                  <Settings2 className="mr-2 h-4 w-4" />
                  {isChannel ? 'Kanal sozlamalari' : 'Guruh sozlamalari'}
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => {
                    setSettingsTabBoost(true);
                    setSettingsOpen(true);
                  }}
                >
                  <Rocket className="mr-2 h-4 w-4" />
                  Boost berish
                </DropdownMenuItem>
                {onManageMembers && (
                  <DropdownMenuItem onClick={onManageMembers}>
                    <Users2 className="mr-2 h-4 w-4" />
                    A'zolarni boshqarish
                  </DropdownMenuItem>
                )}
                {onLeave && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={onLeave} className="text-destructive">
                      <LogOut className="mr-2 h-4 w-4" />
                      {conversation.type === 'group' ? 'Guruhdan chiqish' : 'Kanaldan chiqish'}
                    </DropdownMenuItem>
                  </>
                )}
              </>
            )}
            {conversation.type === 'private' && !isSelfChat && otherUserId && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => setReportOpen(true)}>
                  <Flag className="mr-2 h-4 w-4" />
                  Shikoyat qilish
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => setBlockOpen(true)}
                  className="text-destructive"
                >
                  <Ban className="mr-2 h-4 w-4" />
                  {isBlocked ? 'Blokdan chiqarish' : 'Bloklash'}
                </DropdownMenuItem>
              </>
            )}
            {conversation.type === 'private' && onDelete && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={onDelete} className="text-destructive">
                  <Trash2 className="mr-2 h-4 w-4" />
                  Chatni o'chirish
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {isGroupOrChannel && (
        <GroupChannelSettingsSheet
          open={settingsOpen}
          onOpenChange={setSettingsOpen}
          conversationId={conversation.id}
          conversationType={conversation.type === 'channel' ? 'channel' : 'group'}
          isAdmin={Boolean(isAdmin)}
          initialTab={settingsTabBoost ? 'boost' : 'general'}
        />
      )}

      {otherUserId && (
        <>
          <BlockConfirmDialog
            open={blockOpen}
            onOpenChange={setBlockOpen}
            targetId={otherUserId}
            targetName={getName()}
            blocked={isBlocked}
            onDone={refreshBlocks}
          />
          <ReportDialog
            open={reportOpen}
            onOpenChange={setReportOpen}
            userId={otherUserId}
            conversationId={conversation.id}
          />
        </>
      )}
    </div>
  );
}

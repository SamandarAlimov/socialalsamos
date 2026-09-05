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
  WalletCards,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Conversation } from '@/hooks/useMessages';
import { supabase } from '@/integrations/supabase/client';
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
import { WalletTransferDialog } from '@/components/payment/WalletTransferDialog';
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

/** Guruh/kanal a'zolari (id'lar bilan) - onlayn sonini hisoblash uchun */
function useConversationMembers(conversationId: string, enabled: boolean) {
  const [memberIds, setMemberIds] = useState<string[]>([]);

  useEffect(() => {
    if (!enabled || !conversationId) {
      setMemberIds([]);
      return;
    }

    let cancelled = false;

    const load = async () => {
      const { data, error } = await supabase
        .from('conversation_participants')
        .select('user_id')
        .eq('conversation_id', conversationId)
        .limit(2000);

      if (!cancelled && !error && data) {
        setMemberIds(data.map((row) => row.user_id as string));
      }
    };

    load();

    const channel = supabase
      .channel('conv-members-' + conversationId)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'conversation_participants',
          filter: 'conversation_id=eq.' + conversationId,
        },
        () => {
          load();
        }
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [conversationId, enabled]);

  return memberIds;
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
  const [paymentOpen, setPaymentOpen] = useState(false);
  const { blockedIds, refresh: refreshBlocks } = useBlockedUsers();

  const isChannel = conversation.type === 'channel';
  const isGroup = conversation.type === 'group';
  const isGroupOrChannel = isGroup || isChannel;
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
  const canSendMoney = Boolean(otherUserId) && conversation.type === 'private' && !isSelfChat && !isBlocked;

  const memberIds = useConversationMembers(conversation.id, isGroupOrChannel);
  const memberCount = memberIds.length;
  const onlineCount = useMemo(
    () => memberIds.filter((id) => id !== user?.id && isUserOnline(id)).length,
    [memberIds, isUserOnline, user?.id]
  );

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

  /** Telegramdek: "124 obunachi", "12 a'zo, 3 onlayn" */
  const groupSubtitle = () => {
    if (isChannel) {
      if (!memberCount) return 'kanal';
      return memberCount + ' obunachi';
    }
    if (!memberCount) return 'guruh';
    const base = memberCount + " a'zo";
    return onlineCount > 0 ? base + ', ' + onlineCount + ' onlayn' : base;
  };

  const getStatus = () => {
    if (typingUsers.length > 0) {
      const label =
        isGroupOrChannel && typingUsers.length > 1
          ? typingUsers.length + ' kishi yozmoqda...'
          : 'yozmoqda...';
      return <span className="animate-pulse text-muted-foreground">{label}</span>;
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

    if (isGroupOrChannel) return groupSubtitle();
    return null;
  };

  const isOnline = conversation.type === 'private' && !isSelfChat && realtimeIsOnline;

  // Telegramdek: shaxsiy chatda sarlavha bosilganda profil ochiladi.
  // Guruh/kanalda sarlavha bosilganda sozlamalar (ma'lumot) oynasi ochiladi.
  const profilePath =
    conversation.type === 'private' && !isSelfChat && (otherUsername || otherUserId)
      ? '/user/' + (otherUsername || otherUserId)
      : null;

  const handleHeaderClick = () => {
    if (isGroupOrChannel) {
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
              'text-foreground',
              isGroupOrChannel && 'bg-muted',
              isSelfChat && 'bg-muted text-foreground',
              conversation.type === 'private' && !isSelfChat && 'bg-muted'
            )}
          >
            {isSelfChat ? (
              <Bookmark className="h-5 w-5" />
            ) : isGroup ? (
              <Users className="h-5 w-5" />
            ) : isChannel ? (
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
          {isGroupOrChannel && (
            <span className="hidden shrink-0 rounded-full border border-border bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground sm:inline">
              {isChannel ? 'Kanal' : 'Guruh'}
            </span>
          )}
        </div>
        <p className="truncate text-xs text-muted-foreground">{getStatus()}</p>
      </div>
    </>
  );

  const headerClasses =
    '-mx-2 flex min-w-0 flex-1 items-center gap-2.5 rounded-xl px-2 py-1 tg-transition hover:bg-muted/60 sm:gap-3';

  return (
    <div className="relative z-20 flex h-14 min-w-0 items-center gap-1 border-b border-border bg-card/95 px-2 backdrop-blur sm:h-16 sm:px-4">
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

        {canSendMoney && (
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setPaymentOpen(true)}
            aria-label="Pul yuborish"
            title="Pul yuborish"
            className="h-9 w-9 rounded-full hover:bg-muted sm:h-10 sm:w-10"
          >
            <WalletCards className="h-[18px] w-[18px] text-muted-foreground sm:h-5 sm:w-5" />
          </Button>
        )}

        {!isSelfChat && !isChannel && (
          <>
            <Button
              variant="ghost"
              size="icon"
              onClick={onAudioCall}
              aria-label="Audio qo'ng'iroq"
              title={isGroup ? "Guruh qo'ng'irog'i" : "Audio qo'ng'iroq"}
              className="h-9 w-9 rounded-full hover:bg-muted sm:h-10 sm:w-10"
            >
              <Phone className="h-[18px] w-[18px] text-muted-foreground sm:h-5 sm:w-5" />
            </Button>
            {!isGroup && (
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
            )}
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
            {profilePath ? (
              <DropdownMenuItem asChild>
                <Link to={profilePath}>
                  <Info className="mr-2 h-4 w-4" />
                  Ma'lumot
                </Link>
              </DropdownMenuItem>
            ) : onViewInfo && !isGroupOrChannel ? (
              <DropdownMenuItem onClick={onViewInfo}>
                <Info className="mr-2 h-4 w-4" />
                Ma'lumot
              </DropdownMenuItem>
            ) : null}
            {canSendMoney && (
              <DropdownMenuItem onClick={() => setPaymentOpen(true)}>
                <WalletCards className="mr-2 h-4 w-4" />
                Pul yuborish
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
                  <span className="ml-auto rounded-full bg-foreground px-1.5 text-xs text-background">
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
                    setSettingsOpen(true);
                  }}
                >
                  <Settings2 className="mr-2 h-4 w-4" />
                  {isChannel ? 'Kanal sozlamalari' : 'Guruh sozlamalari'}
                </DropdownMenuItem>
                {onManageMembers && (
                  <DropdownMenuItem onClick={onManageMembers}>
                    <Users2 className="mr-2 h-4 w-4" />
                    {isChannel ? 'Obunachilarni boshqarish' : "A'zolarni boshqarish"}
                    {memberCount > 0 && (
                      <span className="ml-auto text-xs text-muted-foreground">{memberCount}</span>
                    )}
                  </DropdownMenuItem>
                )}
                {onLeave && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={onLeave} className="text-destructive">
                      <LogOut className="mr-2 h-4 w-4" />
                      {isGroup ? 'Guruhdan chiqish' : 'Kanaldan chiqish'}
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

      {canSendMoney && (
        <WalletTransferDialog
          open={paymentOpen}
          onOpenChange={setPaymentOpen}
          conversationId={conversation.id}
        />
      )}

      {isGroupOrChannel && (
        <GroupChannelSettingsSheet
          open={settingsOpen}
          onOpenChange={setSettingsOpen}
          conversationId={conversation.id}
          conversationType={isChannel ? 'channel' : 'group'}
          isAdmin={Boolean(isAdmin)}
          initialTab="profile"
          onManageMembers={
            onManageMembers
              ? () => {
                  setSettingsOpen(false);
                  window.setTimeout(() => onManageMembers(), 120);
                }
              : undefined
          }
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

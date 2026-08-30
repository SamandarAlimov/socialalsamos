import { useEffect, useState, useRef, useCallback } from 'react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Users, Megaphone, Pin, PinOff, VolumeX, Volume2, Bookmark, Phone, Video, PhoneMissed, PhoneOff, PhoneIncoming, PhoneOutgoing, VideoOff, Mic, Image, Images, FileText, MapPin, BarChart3, Sticker, Music, BookOpen, Archive, ArchiveRestore, MailOpen, Mail, Check, CheckCheck, AtSign, Link2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { format, isToday, isYesterday, isThisWeek } from 'date-fns';
import { Conversation } from '@/hooks/useMessages';
import { ChatListContextMenu } from './ChatListContextMenu';
import { useHapticFeedback } from '@/hooks/useHapticFeedback';
import { useOnlinePresence } from '@/contexts/OnlinePresenceContext';
import { supabase } from '@/integrations/supabase/client';
import { VerifiedBadge } from '@/components/VerifiedBadge';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '@/contexts/AuthContext';
import { parseArticlePayload, stripFormatting } from '@/lib/messageFormat';
import { albumPreviewText, parseAlbumPayload } from '@/lib/mediaAlbum';

interface ChatListItemProps {
  conversation: Conversation & { is_self_chat?: boolean };
  isSelected: boolean;
  isPinned?: boolean;
  isMuted?: boolean;
  isArchived?: boolean;
  compact?: boolean;
  onClick: () => void;
  onArchive?: () => void;
  onUnarchive?: () => void;
  onPin?: () => void;
  onMute?: () => void;
  onDelete?: () => void;
  onMarkRead?: () => void;
  onMarkUnread?: () => void;
}

/**
 * Telegram uses a neutral (gray) highlight for the active chat row, never an
 * accent color. MUHIM: bu klass qatorning `bg-card` fonidan KEYIN emas, uning
 * O'RNIGA qo'llanishi kerak - aks holda tailwind-merge `bg-card`ni ustun deb
 * biladi va tanlangan chat umuman ajralib turmaydi (desktop/tabletdagi xato).
 */
const SELECTED_ROW = 'bg-muted dark:bg-muted/80';
const DEFAULT_ROW = 'bg-card';
const HOVER_ROW = 'hover:bg-muted/60 active:bg-muted/80';

/** Telegram renders media hints in the same muted tone as the preview text. */
const PREVIEW_ICON = 'h-3.5 w-3.5 shrink-0 text-muted-foreground';

/** Joylashuv va qo'ng'iroq payloadlari (emoji literal o'rniga escape) */
const LOCATION_PREFIX = '\ud83d\udccd LOCATION:';
const CALL_PREFIX = '\ud83d\udcde';
const DOT = '\u00b7';

/** Telegram swipe geometry: each revealed action is a fixed-width column. */
const ACTION_WIDTH = 76;
const OPEN_THRESHOLD = 46;
const FULL_SWIPE_RATIO = 0.92;
const LEFT_ACTION_WIDTH = 84;

/* ------------------------------------------------------------------ *
 * Preview tozalash (Telegramdek)
 *
 * Chat ro'yxatida foydalanuvchi hech qachon xom texnik matnni ko'rmasligi
 * kerak: ichki fayl nomlari ([285B8E71-....png]), markdown/plugin havolalari
 * (plugin://...) va uzun yalang'och URLlar tushunarli yorliqqa aylantiriladi.
 * ------------------------------------------------------------------ */

const MD_LINK_ANY = /\[([^\]\n]+)\]\(([^)\s]*)\)/g;
const FILE_TOKEN_REGEX = /^\[?\s*([^\[\]\/\\]+?)\.([a-z0-9]{2,5})\s*\]?$/i;
const HTTP_URL_REGEX = /https?:\/\/[^\s]+/gi;
const SCHEME_TOKEN_REGEX = /\b[a-z][a-z0-9+.-]*:\/\/[^\s]+/gi;
const OPAQUE_NAME_REGEX = /^[0-9a-f][0-9a-f-]{7,}$/i;

const IMAGE_EXTS = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'heic', 'heif', 'avif', 'bmp', 'svg'];
const VIDEO_EXTS = ['mp4', 'mov', 'webm', 'mkv', 'm4v', '3gp', 'avi'];
const AUDIO_EXTS = ['mp3', 'm4a', 'ogg', 'oga', 'wav', 'opus', 'aac', 'flac'];

type PreviewKind = 'text' | 'image' | 'video' | 'audio' | 'file' | 'link';

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./i, '');
  } catch {
    return url;
  }
}

function cleanPreview(raw: string): { text: string; kind: PreviewKind } {
  let text = (raw || '').trim();
  if (!text) return { text: '', kind: 'text' };

  // Markdown yoki plugin havolasi -> faqat ko'rinadigan nomi qoladi
  text = text.replace(MD_LINK_ANY, '$1').trim();

  const fileMatch = FILE_TOKEN_REGEX.exec(text);
  if (fileMatch) {
    const name = fileMatch[1].trim();
    const ext = fileMatch[2].toLowerCase();

    if (IMAGE_EXTS.includes(ext)) return { text: 'Rasm', kind: 'image' };
    if (VIDEO_EXTS.includes(ext)) return { text: 'Video', kind: 'video' };
    if (AUDIO_EXTS.includes(ext)) return { text: 'Ovozli xabar', kind: 'audio' };

    // Ichki (UUID kabi) nom foydalanuvchiga hech narsa bermaydi
    const isOpaque = OPAQUE_NAME_REGEX.test(name) || name.length > 28;
    return { text: isOpaque ? 'Fayl' : name + '.' + ext, kind: 'file' };
  }

  const urls = text.match(HTTP_URL_REGEX);
  if (urls && urls.length === 1 && text === urls[0]) {
    return { text: hostOf(urls[0]), kind: 'link' };
  }
  if (urls) {
    text = text.replace(HTTP_URL_REGEX, (match) => hostOf(match));
  }

  // Qolgan texnik sxemalar (plugin://, notion://, ...) ko'rinmasligi kerak
  text = text.replace(SCHEME_TOKEN_REGEX, '').replace(/\s+/g, ' ').trim();

  return { text, kind: 'text' };
}

function previewIconFor(kind: PreviewKind): React.ReactNode | undefined {
  switch (kind) {
    case 'image':
      return <Image className={PREVIEW_ICON} />;
    case 'video':
      return <Video className={PREVIEW_ICON} />;
    case 'audio':
      return <Mic className={PREVIEW_ICON} />;
    case 'file':
      return <FileText className={PREVIEW_ICON} />;
    case 'link':
      return <Link2 className={PREVIEW_ICON} />;
    default:
      return undefined;
  }
}

type SwipeAction = {
  key: string;
  label: string;
  icon: React.ReactNode;
  className: string;
  run: () => void;
};

export function ChatListItem({
  conversation,
  isSelected,
  isPinned = false,
  isMuted = false,
  isArchived = false,
  compact = false,
  onClick,
  onArchive,
  onUnarchive,
  onPin,
  onMute,
  onDelete,
  onMarkRead,
  onMarkUnread,
}: ChatListItemProps) {
  const { user } = useAuth();
  const { lightTap } = useHapticFeedback();
  const [isVerified, setIsVerified] = useState(false);
  const [isPulsing, setIsPulsing] = useState(false);
  const prevUnreadCount = useRef(conversation.unread_count ?? 0);

  // Check if this is a self-chat (conversation with yourself)
  const isSelfChat = conversation.is_self_chat ||
    (conversation.type === 'private' && conversation.other_participant?.id === user?.id);

  // Trigger pulse animation when unread count increases
  useEffect(() => {
    const currentCount = conversation.unread_count ?? 0;
    const grew = currentCount > prevUnreadCount.current;
    // MUHIM: oldingi qiymat HAR safar yangilanishi kerak, aks holda hisob
    // kamayganda keyingi o'sish aniqlanmay qoladi.
    prevUnreadCount.current = currentCount;

    if (!grew) return;
    setIsPulsing(true);
    const timer = setTimeout(() => setIsPulsing(false), 600);
    return () => clearTimeout(timer);
  }, [conversation.unread_count]);

  const otherUserId = conversation.type === 'private' ? conversation.other_participant?.id : null;

  // Use the global presence context for online status
  const { isUserOnline } = useOnlinePresence();
  const isOnline = otherUserId ? isUserOnline(otherUserId) : false;

  // Subscribe to profile changes for verification status
  useEffect(() => {
    if (!otherUserId) return;

    setIsVerified(conversation.other_participant?.is_verified || false);

    const profileChannel = supabase
      .channel('profile-verified-' + otherUserId)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'profiles',
          filter: 'id=eq.' + otherUserId,
        },
        (payload) => {
          if (payload.new) {
            setIsVerified((payload.new as { is_verified?: boolean }).is_verified || false);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(profileChannel);
    };
  }, [otherUserId, conversation.other_participant]);

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

  const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    if (isToday(date)) {
      return format(date, 'HH:mm');
    }
    if (isYesterday(date)) {
      return 'Kecha';
    }
    if (isThisWeek(date)) {
      return format(date, 'EEE');
    }
    return format(date, 'dd.MM.yyyy');
  };

  const formatCallDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return mins + ':' + secs.toString().padStart(2, '0');
  };

  /**
   * Telegram-style preview for a call history payload.
   * Audio and video calls are always distinguished, and the direction
   * (incoming / outgoing) is derived from the caller id.
   */
  const formatCallPreview = (callData: {
    type: 'audio' | 'video';
    status?: string;
    duration?: number;
    caller_id?: string;
  }): { text: string; icon: React.ReactNode } => {
    const isVideo = callData.type === 'video';
    const isOutgoing = !!user?.id && callData.caller_id === user.id;
    const label = isVideo ? "Video qo'ng'iroq" : "Ovozli qo'ng'iroq";

    switch (callData.status) {
      case 'missed':
        return {
          text: isOutgoing
            ? label + ' ' + DOT + ' javobsiz'
            : "O'tkazib yuborilgan " + label.toLowerCase(),
          icon: isVideo
            ? <VideoOff className={cn(PREVIEW_ICON, 'text-red-500')} />
            : <PhoneMissed className={cn(PREVIEW_ICON, 'text-red-500')} />,
        };
      case 'declined':
        return {
          text: label + ' ' + DOT + ' rad etildi',
          icon: isVideo
            ? <VideoOff className={cn(PREVIEW_ICON, 'text-red-500')} />
            : <PhoneOff className={cn(PREVIEW_ICON, 'text-red-500')} />,
        };
      case 'cancelled':
        return {
          text: label + ' ' + DOT + ' bekor qilindi',
          icon: isVideo
            ? <VideoOff className={PREVIEW_ICON} />
            : <PhoneOff className={PREVIEW_ICON} />,
        };
      case 'ended': {
        const duration = callData.duration
          ? ' ' + DOT + ' ' + formatCallDuration(callData.duration)
          : '';
        return {
          text: (isOutgoing ? 'Chiquvchi ' : 'Kiruvchi ') + label.toLowerCase() + duration,
          icon: isVideo
            ? <Video className={cn(PREVIEW_ICON, 'text-emerald-500')} />
            : isOutgoing
              ? <PhoneOutgoing className={cn(PREVIEW_ICON, 'text-emerald-500')} />
              : <PhoneIncoming className={cn(PREVIEW_ICON, 'text-emerald-500')} />,
        };
      }
      default:
        return {
          text: label,
          icon: isVideo ? <Video className={PREVIEW_ICON} /> : <Phone className={PREVIEW_ICON} />,
        };
    }
  };

  // Format last message for display (media-only messages, call history JSON, locations, etc.)
  const formatLastMessage = (message: string | null, meta?: Conversation['last_message_meta']): { text: string; icon?: React.ReactNode } => {
    const mediaType = meta?.media_type;
    const hasRealContent = message && message.trim().length > 0;
    const rawCaption = hasRealContent && !message.startsWith('{') ? message : null;
    // Caption ham tozalanadi: ichki fayl nomi caption sifatida kelib qolmasin
    const caption = rawCaption ? cleanPreview(stripFormatting(rawCaption) || rawCaption).text || null : null;

    // Maqola (article) xabari - Telegramdek alohida yorliq bilan
    if (hasRealContent) {
      const article = parseArticlePayload(message as string);
      if (article) {
        return { text: article.title || 'Maqola', icon: <BookOpen className={PREVIEW_ICON} /> };
      }

      // Albom (media group) - "3 ta rasm" yoki caption ko'rinadi
      const album = parseAlbumPayload(message as string);
      if (album) {
        return { text: albumPreviewText(album), icon: <Images className={PREVIEW_ICON} /> };
      }
    }

    if (!hasRealContent || mediaType) {
      switch (mediaType) {
        case 'voice':
          return { text: caption || 'Ovozli xabar', icon: <Mic className={PREVIEW_ICON} /> };
        case 'audio':
          return { text: caption || 'Ovozli xabar', icon: <Mic className={PREVIEW_ICON} /> };
        case 'image':
        case 'photo':
          return { text: caption || 'Rasm', icon: <Image className={PREVIEW_ICON} /> };
        case 'album':
          return { text: caption || 'Albom', icon: <Images className={PREVIEW_ICON} /> };
        case 'video':
          return { text: caption || 'Video', icon: <Video className={PREVIEW_ICON} /> };
        case 'video_note':
          return { text: caption || 'Videoxabar', icon: <Video className={PREVIEW_ICON} /> };
        case 'file':
        case 'document':
          return { text: caption || meta?.media_file_name || 'Fayl', icon: <FileText className={PREVIEW_ICON} /> };
        case 'location':
          return { text: caption || 'Joylashuv', icon: <MapPin className={PREVIEW_ICON} /> };
        case 'poll':
          return { text: caption || "So'rov", icon: <BarChart3 className={PREVIEW_ICON} /> };
        case 'sticker':
          return { text: caption || 'Stiker', icon: <Sticker className={PREVIEW_ICON} /> };
        case 'music':
          return { text: caption || meta?.media_file_name || 'Musiqa', icon: <Music className={PREVIEW_ICON} /> };
        case 'call_history':
          break;
        default:
          if (!hasRealContent) return { text: 'Hozircha xabar yo\u2018q' };
      }
    }

    if (!message) return { text: 'Hozircha xabar yo\u2018q' };

    if (message.startsWith(LOCATION_PREFIX)) {
      return { text: 'Joylashuv', icon: <MapPin className={PREVIEW_ICON} /> };
    }

    if (message.startsWith('{') && message.includes('"type"')) {
      try {
        const callData = JSON.parse(message);
        if (callData.type === 'video' || callData.type === 'audio') {
          return formatCallPreview(callData);
        }
      } catch {
        // Not valid JSON, treat as regular message
      }
    }

    if (message.startsWith(CALL_PREFIX)) {
      return { text: message.replace(CALL_PREFIX, '').trim() || "Qo'ng'iroq", icon: <Phone className={PREVIEW_ICON} /> };
    }

    // Oddiy xabar: formatlash belgilari (**, __, ||, `) va texnik matnlar
    // (fayl nomlari, plugin havolalari, uzun URLlar) preview'da ko'rinmaydi
    const cleaned = cleanPreview(stripFormatting(message) || message);
    return {
      text: cleaned.text || message.replace(/\s+/g, ' ').trim(),
      icon: previewIconFor(cleaned.kind),
    };
  };

  const isUnread = (conversation.unread_count ?? 0) > 0;

  /* ------------------------------------------------------------------ *
   * Telegramdek o'qilganlik belgilari va @ mention indikatori
   * ------------------------------------------------------------------ */
  const lastMeta = conversation.last_message_meta as unknown as
    | {
        sender_id?: string;
        is_read?: boolean;
        read_at?: string | null;
        seen?: boolean;
      }
    | undefined;

  // Faqat O'ZIMIZ yuborgan oxirgi xabar uchun ptichkalar ko'rsatiladi
  const isOwnLastMessage = Boolean(user?.id && lastMeta?.sender_id && lastMeta.sender_id === user.id);
  const lastMessageRead = Boolean(lastMeta?.is_read || lastMeta?.read_at || lastMeta?.seen);
  const rawDraft = conversation.draft?.trim() || '';
  const cleanedDraft = rawDraft ? cleanPreview(stripFormatting(rawDraft) || rawDraft).text : '';
  const draftPreview = cleanedDraft || rawDraft.replace(/\s+/g, ' ').trim();
  const hasDraft = draftPreview.length > 0;

  const myUsername = (
    (user as unknown as { user_metadata?: { username?: string } })?.user_metadata?.username || ''
  ).toLowerCase();
  const hasMention =
    isUnread &&
    myUsername.length > 0 &&
    typeof conversation.last_message === 'string' &&
    conversation.last_message.toLowerCase().includes('@' + myUsername);

  /* ------------------------------------------------------------------ *
   * Telegram-style swipe actions
   * ------------------------------------------------------------------ */
  const rightActions: SwipeAction[] = [];

  if (isUnread && onMarkRead) {
    rightActions.push({
      key: 'read',
      label: "O'qildi",
      icon: <MailOpen className="h-5 w-5" />,
      className: 'bg-sky-500 text-white',
      run: onMarkRead,
    });
  } else if (!isUnread && onMarkUnread) {
    rightActions.push({
      key: 'unread',
      label: "O'qilmagan",
      icon: <Mail className="h-5 w-5" />,
      className: 'bg-sky-500 text-white',
      run: onMarkUnread,
    });
  }

  if (onMute) {
    rightActions.push({
      key: 'mute',
      label: isMuted ? 'Ovoz' : 'Sukut',
      icon: isMuted ? <Volume2 className="h-5 w-5" /> : <VolumeX className="h-5 w-5" />,
      className: 'bg-indigo-500 text-white',
      run: onMute,
    });
  }

  if (isArchived && onUnarchive) {
    rightActions.push({
      key: 'unarchive',
      label: 'Chiqarish',
      icon: <ArchiveRestore className="h-5 w-5" />,
      className: 'bg-amber-500 text-white',
      run: onUnarchive,
    });
  } else if (!isArchived && onArchive) {
    rightActions.push({
      key: 'archive',
      label: 'Arxiv',
      icon: <Archive className="h-5 w-5" />,
      className: 'bg-amber-500 text-white',
      run: onArchive,
    });
  }

  const maxLeftDrag = rightActions.length * ACTION_WIDTH;
  const maxRightDrag = onPin ? LEFT_ACTION_WIDTH : 0;

  const [swipeX, setSwipeX] = useState(0);
  const swipeRef = useRef(0);
  const dragRef = useRef<{ x: number; y: number; base: number; axis: 'none' | 'h' | 'v' }>({
    x: 0,
    y: 0,
    base: 0,
    axis: 'none',
  });

  const setSwipe = useCallback((value: number) => {
    swipeRef.current = value;
    setSwipeX(value);
  }, []);

  const closeSwipe = useCallback(() => setSwipe(0), [setSwipe]);

  useEffect(() => {
    closeSwipe();
  }, [isArchived, isPinned, isMuted, closeSwipe]);

  const handleTouchStart = (e: React.TouchEvent) => {
    if (maxLeftDrag === 0 && maxRightDrag === 0) return;
    const touch = e.touches[0];
    dragRef.current = { x: touch.clientX, y: touch.clientY, base: swipeRef.current, axis: 'none' };
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (maxLeftDrag === 0 && maxRightDrag === 0) return;
    const touch = e.touches[0];
    const dx = touch.clientX - dragRef.current.x;
    const dy = touch.clientY - dragRef.current.y;

    if (dragRef.current.axis === 'none') {
      if (Math.abs(dx) > 8 && Math.abs(dx) > Math.abs(dy)) {
        dragRef.current.axis = 'h';
      } else if (Math.abs(dy) > 10) {
        dragRef.current.axis = 'v';
      }
    }
    if (dragRef.current.axis !== 'h') return;

    let next = dragRef.current.base + dx;
    if (next > maxRightDrag) next = maxRightDrag + (next - maxRightDrag) * 0.25;
    if (next < -maxLeftDrag) next = -maxLeftDrag + (next + maxLeftDrag) * 0.35;
    setSwipe(next);
  };

  const handleTouchEnd = () => {
    if (dragRef.current.axis !== 'h') return;
    const value = swipeRef.current;
    dragRef.current.axis = 'none';

    if (maxLeftDrag > 0 && value <= -(maxLeftDrag + ACTION_WIDTH * FULL_SWIPE_RATIO)) {
      lightTap();
      closeSwipe();
      rightActions[rightActions.length - 1]?.run();
      return;
    }
    if (maxLeftDrag > 0 && value <= -OPEN_THRESHOLD) {
      lightTap();
      setSwipe(-maxLeftDrag);
      return;
    }
    if (maxRightDrag > 0 && value >= OPEN_THRESHOLD) {
      lightTap();
      closeSwipe();
      onPin?.();
      return;
    }
    closeSwipe();
  };

  const handleClick = () => {
    if (Math.abs(swipeRef.current) > 4) {
      closeSwipe();
      return;
    }
    lightTap();
    onClick();
  };

  const runAction = (action: SwipeAction) => {
    lightTap();
    closeSwipe();
    action.run();
  };

  if (compact) {
    return (
      <ChatListContextMenu
        conversation={conversation}
        isPinned={isPinned}
        isMuted={isMuted}
        isArchived={isArchived}
        isUnread={isUnread}
        onArchive={onArchive}
        onUnarchive={onUnarchive}
        onPin={onPin}
        onMute={onMute}
        onDelete={onDelete}
        onMarkRead={onMarkRead}
        onMarkUnread={onMarkUnread}
      >
        <button
          onClick={handleClick}
          title={getName()}
          className={cn(
            'relative w-full flex items-center justify-center py-2 transition-colors',
            isSelected ? SELECTED_ROW : DEFAULT_ROW,
            !isSelected && HOVER_ROW
          )}
        >
          {isSelected && (
            <span className="absolute inset-y-1 left-0 w-[3px] rounded-r-full bg-primary" />
          )}
          <div className="relative">
            <Avatar className={cn('h-11 w-11 ring-2 transition-all', isSelected ? 'ring-muted-foreground/30' : 'ring-transparent')}>
              <AvatarImage src={getAvatar() || ''} />
              <AvatarFallback className="bg-primary text-primary-foreground font-medium text-sm">
                {isSelfChat ? <Bookmark className="h-4 w-4" /> : conversation.type === 'group' ? <Users className="h-4 w-4" /> : conversation.type === 'channel' ? <Megaphone className="h-4 w-4" /> : getName()[0]?.toUpperCase()}
              </AvatarFallback>
            </Avatar>
            {conversation.type === 'private' && isOnline && !isSelfChat && (
              <span className="absolute bottom-0 right-0 h-3 w-3 bg-green-500 rounded-full border-2 border-card" />
            )}
            {isUnread && (
              <Badge className={cn(
                'absolute -top-1 -right-1 h-5 min-w-[20px] rounded-full px-1 text-[10px] flex items-center justify-center',
                isMuted && 'bg-muted-foreground/70 text-background hover:bg-muted-foreground/70'
              )}>
                {(conversation.unread_count ?? 0) > 99 ? '99+' : conversation.unread_count}
              </Badge>
            )}
            {hasMention && (
              <span className="absolute -bottom-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-primary text-primary-foreground">
                <AtSign className="h-2.5 w-2.5" />
              </span>
            )}
          </div>
        </button>
      </ChatListContextMenu>
    );
  }

  return (
    <ChatListContextMenu
      conversation={conversation}
      isPinned={isPinned}
      isMuted={isMuted}
      isArchived={isArchived}
      isUnread={isUnread}
      onArchive={onArchive}
      onUnarchive={onUnarchive}
      onPin={onPin}
      onMute={onMute}
      onDelete={onDelete}
      onMarkRead={onMarkRead}
      onMarkUnread={onMarkUnread}
    >
      <div className="relative overflow-hidden">
        {/* Right-hand swipe actions (revealed by swiping left) */}
        {maxLeftDrag > 0 && swipeX < 0 && (
          <div className="absolute inset-y-0 right-0 flex" style={{ width: Math.min(Math.max(-swipeX, 0), maxLeftDrag + ACTION_WIDTH) }}>
            {rightActions.map((action) => (
              <button
                key={action.key}
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  runAction(action);
                }}
                className={cn(
                  'flex flex-1 min-w-0 flex-col items-center justify-center gap-1 text-[11px] font-medium',
                  action.className
                )}
              >
                {action.icon}
                <span className="truncate px-1">{action.label}</span>
              </button>
            ))}
          </div>
        )}

        {/* Left-hand quick pin (revealed by swiping right) */}
        {maxRightDrag > 0 && swipeX > 0 && (
          <div
            className="absolute inset-y-0 left-0 flex items-center justify-center bg-emerald-500 text-white"
            style={{ width: Math.max(swipeX, 0) }}
          >
            <div className="flex flex-col items-center gap-1 text-[11px] font-medium">
              {isPinned ? <PinOff className="h-5 w-5" /> : <Pin className="h-5 w-5" />}
              <span>{isPinned ? 'Yechish' : 'Qadash'}</span>
            </div>
          </div>
        )}

        <button
          onClick={handleClick}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          onTouchCancel={closeSwipe}
          className={cn(
            'relative w-full px-4 py-3 md:px-3 md:py-2.5 flex items-center gap-3 border-b border-border/30',
            'min-h-[72px] md:min-h-0',
            'transition-[transform,background-color] duration-200',
            isSelected ? SELECTED_ROW : DEFAULT_ROW,
            !isSelected && HOVER_ROW
          )}
          style={{ transform: 'translateX(' + swipeX + 'px)' }}
        >
          {/* Tanlangan chat - Telegram Desktopdek chap tomonda ingichka aksent */}
          {isSelected && (
            <span className="absolute inset-y-0 left-0 hidden w-[3px] rounded-r-full bg-primary md:block" />
          )}

          <div className="relative flex-shrink-0">
            <Avatar className="h-14 w-14 md:h-12 md:w-12">
              <AvatarImage src={getAvatar() || ''} />
              <AvatarFallback
                className={cn(
                  'text-primary-foreground font-medium text-lg md:text-base',
                  conversation.type === 'group' && 'bg-primary',
                  conversation.type === 'channel' && 'bg-primary',
                  isSelfChat && 'bg-primary',
                  conversation.type === 'private' && !isSelfChat && 'bg-primary'
                )}
              >
                {isSelfChat ? (
                  <Bookmark className="h-6 w-6 md:h-5 md:w-5" />
                ) : conversation.type === 'group' ? (
                  <Users className="h-6 w-6 md:h-5 md:w-5" />
                ) : conversation.type === 'channel' ? (
                  <Megaphone className="h-6 w-6 md:h-5 md:w-5" />
                ) : (
                  getName()[0]?.toUpperCase()
                )}
              </AvatarFallback>
            </Avatar>
            {conversation.type === 'private' && isOnline && !isSelfChat && (
              <span className="absolute bottom-0 right-0 h-4 w-4 md:h-3.5 md:w-3.5 bg-green-500 rounded-full border-2 border-card" />
            )}
            {isSelfChat && (
              <span className="absolute -bottom-0.5 -right-0.5 h-5 w-5 md:h-4 md:w-4 bg-card rounded-full flex items-center justify-center border-2 border-amber-500">
                <Bookmark className="h-2.5 w-2.5 md:h-2 md:w-2 text-amber-500 fill-amber-500" />
              </span>
            )}
          </div>

          <div className="flex-1 min-w-0 text-left">
            <div className="flex items-center justify-between mb-0.5 min-w-0">
              <div className="flex items-center gap-1.5 min-w-0 overflow-hidden flex-1">
                <span className="font-medium text-base md:text-sm truncate block">{getName()}</span>
                {conversation.type === 'private' && isVerified && (
                  <VerifiedBadge size="xs" className="md:h-3.5 md:w-3.5" />
                )}
                {conversation.type === 'channel' && (
                  <Megaphone className="h-4 w-4 md:h-3.5 md:w-3.5 text-muted-foreground flex-shrink-0" />
                )}
                {isMuted && (
                  <VolumeX className="h-3.5 w-3.5 md:h-3 md:w-3 text-muted-foreground flex-shrink-0" />
                )}
              </div>
              <div className="flex items-center gap-1 flex-shrink-0 ml-2">
                {/* Telegramdek: o'zimiz yuborgan oxirgi xabarda bitta/ikkita ptichka */}
                {isOwnLastMessage && !hasDraft && (
                  lastMessageRead ? (
                    <CheckCheck className="h-4 w-4 md:h-3.5 md:w-3.5 shrink-0 text-sky-500" />
                  ) : (
                    <Check className="h-4 w-4 md:h-3.5 md:w-3.5 shrink-0 text-muted-foreground" />
                  )
                )}
                <span className="text-sm md:text-xs text-muted-foreground">
                  {(hasDraft ? conversation.draft_updated_at : conversation.last_message_at) &&
                    formatTime(
                      (hasDraft ? conversation.draft_updated_at : conversation.last_message_at) as string
                    )}
                </span>
              </div>
            </div>

            <div className="flex items-center justify-between gap-2 min-w-0">
              <p className={cn(
                'text-sm flex-1 min-w-0 flex items-center gap-1 overflow-hidden',
                isUnread
                  ? 'text-foreground font-medium'
                  : 'text-muted-foreground'
              )}
              >
                {hasDraft ? (
                  <>
                    <span className="shrink-0 font-medium text-destructive">Qoralama:</span>
                    <span className="truncate min-w-0 flex-1 text-muted-foreground">
                      {draftPreview}
                    </span>
                  </>
                ) : (
                  (() => {
                    const formatted = formatLastMessage(
                      conversation.last_message,
                      conversation.last_message_meta
                    );
                    return (
                      <>
                        {formatted.icon}
                        <span className="truncate min-w-0 flex-1">{formatted.text}</span>
                      </>
                    );
                  })()
                )}
              </p>

              <div className="flex items-center gap-1.5 flex-shrink-0">
                {/* @ mention - Telegramda o'qilmagan hisobdan alohida ko'rsatiladi */}
                {hasMention && (
                  <span
                    className="flex h-6 w-6 md:h-5 md:w-5 items-center justify-center rounded-full bg-primary text-primary-foreground"
                    title="Sizni eslab o'tgan"
                  >
                    <AtSign className="h-3.5 w-3.5 md:h-3 md:w-3" />
                  </span>
                )}
                <AnimatePresence>
                  {isUnread && (
                    <motion.div
                      initial={{ scale: 0, opacity: 0 }}
                      animate={{
                        scale: isPulsing ? [1, 1.3, 1] : 1,
                        opacity: 1,
                      }}
                      exit={{ scale: 0, opacity: 0 }}
                      transition={{
                        duration: isPulsing ? 0.4 : 0.2,
                        ease: 'easeOut',
                      }}
                    >
                      <Badge
                        variant="default"
                        className={cn(
                          'h-6 min-w-[24px] md:h-5 md:min-w-[20px] rounded-full px-2 md:px-1.5 text-sm md:text-xs',
                          isPulsing && 'shadow-lg shadow-primary/40',
                          isMuted && 'bg-muted-foreground/70 text-background hover:bg-muted-foreground/70 shadow-none'
                        )}
                      >
                        {(conversation.unread_count ?? 0) > 99 ? '99+' : conversation.unread_count}
                      </Badge>
                    </motion.div>
                  )}
                </AnimatePresence>
                {isPinned && !isUnread && (
                  <Pin className="h-3.5 w-3.5 md:h-3 md:w-3 text-muted-foreground/70 rotate-45" />
                )}
              </div>
            </div>
          </div>
        </button>
      </div>
    </ChatListContextMenu>
  );
}

import { useState, useCallback, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  Check,
  CheckCheck,
  Clock,
  AlertCircle,
  ReplyIcon,
  Forward,
  Pin,
  Square,
  CheckSquare,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { MessageAttachment } from '@/components/MessageAttachment';
import { VoiceMessagePlayer } from '@/components/VoiceMessagePlayer';
import { AnimatedEmoji } from '@/components/emoji/AnimatedEmoji';

import { TelegramStyleContextMenu } from './TelegramStyleContextMenu';
import { TelegramReactions, ReactionGroup } from './TelegramReactions';
import { LocationMessage } from './LocationMessage';
import { GroupReadReceipts } from './GroupReadReceipts';
import { MessageContent } from './MessageContent';
import { SharedPostPreview } from './SharedPostPreview';
import { StoryReplyPreview } from './StoryReplyPreview';
import { CallHistoryMessage, CallHistoryData } from './CallHistoryMessage';
import { BubbleTail } from './BubbleTail';
import { StickerMessage } from './StickerMessage';
import { getEmojiOnlyInfo } from '@/lib/emojiOnly';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useHapticFeedback } from '@/hooks/useHapticFeedback';
import { format } from 'date-fns';

/** Telegramdagi kabi uzoq bosish vaqti */
const LONG_PRESS_MS = 400;
const SWIPE_THRESHOLD = 56;
const MAX_SWIPE = 84;
const DOUBLE_TAP_MS = 300;

interface Message {
  id: string;
  conversation_id: string;
  content: string | null;
  sender_id: string | null;
  media_url: string | null;
  media_type: string | null;
  is_deleted: boolean | null;
  is_edited: boolean | null;
  reply_to_id: string | null;
  story_id?: string | null;
  shared_post_id?: string | null;
  is_read?: boolean;
  created_at: string;
  updated_at?: string;
  status?: 'sending' | 'sent' | 'delivered' | 'read' | 'failed';
  delivered_at?: string;
  read_at?: string;
  tempId?: string;
  sender?: {
    id: string;
    avatar_url: string | null;
    display_name: string | null;
    username: string | null;
  };
  forwarded_from?: {
    sender_name: string;
    original_content: string;
  };
}

import { MediaTrack } from '@/contexts/AudioPlayerContext';

interface EnhancedMessageBubbleProps {
  message: Message;
  isMine: boolean;
  isGroup?: boolean;
  /** 1:1 chatda ikki tomon ham bir-birining xabarini o'chira oladi (Telegramdek) */
  canDeleteForEveryone?: boolean;
  onReply?: (message: Message) => void;
  onForward?: (message: Message) => void;
  onEdit?: (message: Message) => void;
  onDelete?: (messageId: string) => void;
  onPin?: (messageId: string) => void;
  onSelect?: (messageId: string) => void;
  onLongPress?: (messageId: string) => void;
  isPinned?: boolean;
  isSelected?: boolean;
  isSelectionMode?: boolean;
  showAvatar?: boolean;
  showSender?: boolean;
  allMediaTracks?: MediaTrack[];
}

export function EnhancedMessageBubble({
  message,
  isMine,
  isGroup = false,
  canDeleteForEveryone = true,
  onReply,
  onForward,
  onEdit,
  onDelete,
  onPin,
  onSelect,
  onLongPress,
  isPinned = false,
  isSelected = false,
  isSelectionMode = false,
  showAvatar = true,
  showSender = false,
  allMediaTracks = [],
}: EnhancedMessageBubbleProps) {
  const { user } = useAuth();
  const [reactions, setReactions] = useState<ReactionGroup[]>([]);
  const { lightTap, mediumTap, successFeedback } = useHapticFeedback();
  const [contextMenuOpen, setContextMenuOpen] = useState(false);
  const [anchorRect, setAnchorRect] = useState<DOMRect | null>(null);
  const bubbleRef = useRef<HTMLDivElement>(null);

  const openContextMenu = useCallback(() => {
    if (bubbleRef.current) {
      setAnchorRect(bubbleRef.current.getBoundingClientRect());
    }
    setContextMenuOpen(true);
  }, []);

  // Surib javob berish holati
  const [swipeOffset, setSwipeOffset] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const startX = useRef(0);
  const startY = useRef(0);
  const axisRef = useRef<'unknown' | 'horizontal' | 'vertical'>('unknown');
  const hasTriggeredHaptic = useRef(false);

  const lastTapRef = useRef<number>(0);

  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressTriggered = useRef(false);

  const isInteractiveTarget = (target: EventTarget | null) => {
    const el = target as HTMLElement | null;
    return !!el?.closest('a,button,iframe,input,textarea,video,audio,[role="button"]');
  };

  const clearSelection = () => {
    // Brauzerda tasodifan tanlangan matnni tozalaymiz - Telegramdek toza tuyg'u
    const sel = window.getSelection();
    if (sel && sel.toString().length === 0) sel.removeAllRanges();
  };

  const handleLongPressStart = useCallback(
    (x?: number, y?: number) => {
      longPressTriggered.current = false;
      if (longPressTimer.current) clearTimeout(longPressTimer.current);
      longPressTimer.current = setTimeout(() => {
        longPressTriggered.current = true;
        mediumTap();
        clearSelection();
        if (bubbleRef.current) setAnchorRect(bubbleRef.current.getBoundingClientRect());
        // Telegramdek: uzoq bosishda kontekst menyu ochiladi
        setContextMenuOpen(true);
      }, LONG_PRESS_MS);
    },
    [mediumTap]
  );

  const handleLongPressEnd = useCallback(() => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  }, []);

  const addReaction = useCallback(
    async (emoji: string) => {
      if (!user) return;
      lightTap();
      const already = reactions.find((r) => r.emoji === emoji && r.hasReacted);
      if (already) return;
      await supabase.from('message_reactions').insert({
        message_id: message.id,
        user_id: user.id,
        emoji,
      });
    },
    [user, reactions, message.id, lightTap]
  );

  const handleClick = useCallback(
    (e?: React.MouseEvent) => {
      if (isSelectionMode && onSelect) {
        onSelect(message.id);
        lightTap();
        return;
      }
      if (longPressTriggered.current) return;
      if (e && isInteractiveTarget(e.target)) return;

      // Ikki marta bosish - tez reaksiya (Telegramdek)
      const now = Date.now();
      if (now - lastTapRef.current < DOUBLE_TAP_MS) {
        lastTapRef.current = 0;
        addReaction('\u2764\ufe0f');
        successFeedback();
        return;
      }
      lastTapRef.current = now;

      // Agar foydalanuvchi matn tanlagan bo'lsa, menyu ochilmasin
      const selection = window.getSelection();
      if (selection && selection.toString().length > 0) return;

      lightTap();
      openContextMenu();
    },
    [
      isSelectionMode,
      onSelect,
      message.id,
      lightTap,
      openContextMenu,
      addReaction,
      successFeedback,
    ]
  );

  const handleContextMenu = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      openContextMenu();
    },
    [openContextMenu]
  );

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (isInteractiveTarget(e.target)) return;
    startX.current = e.touches[0].clientX;
    startY.current = e.touches[0].clientY;
    axisRef.current = 'unknown';
    hasTriggeredHaptic.current = false;
    setIsDragging(true);
  }, []);

  const handleTouchMove = useCallback(
    (e: React.TouchEvent) => {
      if (!isDragging) return;
      if (isInteractiveTarget(e.target)) return;

      const currentX = e.touches[0].clientX;
      const currentY = e.touches[0].clientY;
      const rawDx = currentX - startX.current;
      const dy = currentY - startY.current;

      // Yo'nalishni aniqlash: vertikal scroll bilan urushmasligi uchun
      if (axisRef.current === 'unknown') {
        if (Math.abs(rawDx) < 8 && Math.abs(dy) < 8) return;
        axisRef.current = Math.abs(rawDx) > Math.abs(dy) ? 'horizontal' : 'vertical';
      }
      if (axisRef.current !== 'horizontal') return;

      // Surish paytida uzoq bosish bekor bo'ladi
      handleLongPressEnd();

      const diff = isMine ? -rawDx : rawDx;
      if (diff <= 0) {
        setSwipeOffset(0);
        return;
      }

      const eased = diff <= SWIPE_THRESHOLD ? diff : SWIPE_THRESHOLD + (diff - SWIPE_THRESHOLD) * 0.35;
      const newOffset = Math.min(eased, MAX_SWIPE);
      setSwipeOffset(newOffset);

      if (newOffset >= SWIPE_THRESHOLD && !hasTriggeredHaptic.current) {
        hasTriggeredHaptic.current = true;
        mediumTap();
      } else if (newOffset < SWIPE_THRESHOLD && hasTriggeredHaptic.current) {
        hasTriggeredHaptic.current = false;
      }
    },
    [isDragging, isMine, mediumTap, handleLongPressEnd]
  );

  const handleTouchEnd = useCallback(() => {
    if (swipeOffset >= SWIPE_THRESHOLD && onReply) {
      successFeedback();
      onReply(message);
    }
    setSwipeOffset(0);
    setIsDragging(false);
    axisRef.current = 'unknown';
  }, [swipeOffset, onReply, message, successFeedback]);

  const fetchReactions = useCallback(async () => {
    const { data, error } = await supabase
      .from('message_reactions')
      .select('*')
      .eq('message_id', message.id);

    if (!error && data) {
      const grouped = data.reduce((groups, reaction) => {
        const existing = groups.find((g: ReactionGroup) => g.emoji === reaction.emoji);
        if (existing) {
          existing.count++;
          existing.users.push(reaction.user_id);
          if (reaction.user_id === user?.id) existing.hasReacted = true;
        } else {
          groups.push({
            emoji: reaction.emoji,
            count: 1,
            users: [reaction.user_id],
            hasReacted: reaction.user_id === user?.id,
          });
        }
        return groups;
      }, [] as ReactionGroup[]);
      setReactions(grouped);
    }
  }, [message.id, user?.id]);

  useEffect(() => {
    fetchReactions();

    const channel = supabase
      .channel(`reactions-${message.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'message_reactions',
          filter: `message_id=eq.${message.id}`,
        },
        () => fetchReactions()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [message.id, fetchReactions]);

  useEffect(() => handleLongPressEnd, [handleLongPressEnd]);

  const toggleReaction = async (emoji: string) => {
    if (!user) return;
    lightTap();
    const hasReacted = reactions.some((r) => r.hasReacted && r.emoji === emoji);

    if (hasReacted) {
      await supabase
        .from('message_reactions')
        .delete()
        .eq('message_id', message.id)
        .eq('user_id', user.id)
        .eq('emoji', emoji);
    } else {
      await supabase.from('message_reactions').insert({
        message_id: message.id,
        user_id: user.id,
        emoji,
      });
    }
  };

  const copyToClipboard = () => {
    if (message.content) {
      navigator.clipboard.writeText(message.content);
      successFeedback();
    }
  };

  const formatTime = (date: string) => format(new Date(date), 'HH:mm');

  const isVoiceMessage = message.media_type === 'audio' && message.media_url;

  /** Stiker va GIF - alohida media turlari, fonsiz ko'rinadi (Telegramdek) */
  const stickerKind: 'sticker' | 'gif' | null =
    message.media_url && (message.media_type === 'sticker' || message.media_type === 'gif')
      ? (message.media_type as 'sticker' | 'gif')
      : null;

  const isCallHistoryMessage = message.media_type === 'call_history';
  const parseCallHistory = (): CallHistoryData | null => {
    if (!isCallHistoryMessage || !message.content) return null;
    try {
      const parsed = JSON.parse(message.content);
      if (parsed.type && parsed.status) return parsed as CallHistoryData;
    } catch {}
    const content = message.content;
    if (content.startsWith('\ud83d\udcde')) {
      const isVideo = content.toLowerCase().includes('video');
      const durationMatch = content.match(/(\d+):(\d+)(?::(\d+))?/);
      let duration: number | undefined;
      if (durationMatch) {
        if (durationMatch[3]) {
          duration =
            parseInt(durationMatch[1]) * 3600 +
            parseInt(durationMatch[2]) * 60 +
            parseInt(durationMatch[3]);
        } else {
          duration = parseInt(durationMatch[1]) * 60 + parseInt(durationMatch[2]);
        }
      }
      return {
        type: isVideo ? 'video' : 'audio',
        status: 'ended',
        duration,
        timestamp: message.created_at,
        caller_id: message.sender_id || '',
        callee_id: '',
      };
    }
    return null;
  };
  const callHistoryData = parseCallHistory();

  const isLocationFromMediaType = message.media_type === 'location' && message.media_url;
  const isLocationFromText = message.content?.startsWith('\ud83d\udccd LOCATION:');
  const isLocationMessage = isLocationFromMediaType || isLocationFromText;

  const parseLocation = (): { latitude: number; longitude: number; address?: string } | null => {
    if (isLocationFromMediaType && message.media_url) {
      try {
        const [lat, lng] = message.media_url.split(',').map(Number);
        return { latitude: lat, longitude: lng, address: message.content || undefined };
      } catch {
        return null;
      }
    }
    if (isLocationFromText && message.content) {
      try {
        const locationPart = message.content.replace('\ud83d\udccd LOCATION:', '');
        const [coords, address] = locationPart.split('|');
        const [lat, lng] = coords.split(',').map(Number);
        if (!isNaN(lat) && !isNaN(lng))
          return { latitude: lat, longitude: lng, address: address || undefined };
      } catch {
        return null;
      }
    }
    return null;
  };
  const locationData = parseLocation();

  const isReadyToReply = swipeOffset >= SWIPE_THRESHOLD;

  const readInfo =
    isMine && (message.status === 'read' || message.is_read)
      ? message.read_at
        ? `O'qildi: ${format(new Date(message.read_at), 'HH:mm')}`
        : "O'qildi"
      : null;

  const senderProfilePath = message.sender?.username
    ? `/user/${message.sender.username}`
    : message.sender?.id
      ? `/user/${message.sender.id}`
      : null;

  const senderLabel = message.sender?.display_name || message.sender?.username || 'Foydalanuvchi';

  const emojiOnly =
    !message.is_deleted &&
    !message.media_url &&
    !message.story_id &&
    !message.shared_post_id &&
    !isLocationMessage &&
    !isCallHistoryMessage &&
    message.content
      ? getEmojiOnlyInfo(message.content)
      : null;

  /**
   * Dumcha (tail) Telegramdagidek faqat ketma-ket xabarlarning ENG OXIRGISIDA
   * chiziladi: kelgan xabarlarda avatar ko'rinadigan qatorga, o'z xabarlarimda
   * har doim (chunki ular guruhda ham o'ng chekkada turadi).
   */
  const showTail = isMine || showAvatar;

  const renderStatusRow = (transparent = false) => (
    <div
      className={cn(
        'mt-1 flex items-center justify-end gap-1.5',
        transparent
          ? 'text-muted-foreground'
          : isMine
            ? 'text-primary-foreground/70'
            : 'text-muted-foreground'
      )}
    >
      <span className="text-[10px] tabular-nums">{formatTime(message.created_at)}</span>
      {message.is_edited && <span className="text-[10px]">tahrirlangan</span>}
      {isMine && (
        <span className="inline-flex items-center">
          {message.status === 'sending' ? (
            <Clock className="h-3 w-3 animate-pulse" />
          ) : message.status === 'failed' ? (
            <AlertCircle className="h-3 w-3 text-destructive" />
          ) : message.status === 'read' || message.is_read ? (
            <CheckCheck className="h-3.5 w-3.5 text-[#0095F6]" />
          ) : message.status === 'delivered' ? (
            <CheckCheck className="h-3.5 w-3.5" />
          ) : (
            <Check className="h-3 w-3" />
          )}
        </span>
      )}
    </div>
  );

  const renderBubbleContent = (isPreview = false) => {
    if (emojiOnly) {
      return (
        <div className={cn('flex flex-col', isMine ? 'items-end' : 'items-start')}>
          <div className="flex items-end gap-1">
            {emojiOnly.emojis.map((emoji, index) => (
              <AnimatedEmoji
                key={`${emoji}-${index}`}
                emoji={emoji}
                size={emojiOnly.size}
                className="select-none"
              />
            ))}
          </div>
          {renderStatusRow(true)}
        </div>
      );
    }

    // Stiker / GIF - karta va dumchasiz, faqat mediasi ko'rinadi
    if (stickerKind && message.media_url) {
      return (
        <div className={cn('flex flex-col', isMine ? 'items-end' : 'items-start')}>
          <StickerMessage url={message.media_url} kind={stickerKind} />
          {renderStatusRow(true)}
        </div>
      );
    }

    return (
      <div className="relative min-w-0 max-w-full">
        {/* Telegramdek dumcha: jo'natuvchi tomonda, karta fonining aynan rangida */}
        {showTail && (
          <BubbleTail isMine={isMine} failed={message.status === 'failed'} />
        )}

        <div
          className={cn(
            'relative z-[1] min-w-0 max-w-full overflow-hidden rounded-2xl px-3.5 py-2',
            isMine
              ? 'rounded-br-[6px] bg-primary text-primary-foreground'
              : 'rounded-bl-[6px] border border-border bg-card text-card-foreground',
            !showTail && (isMine ? 'rounded-br-2xl' : 'rounded-bl-2xl'),
            message.status === 'failed' && 'border-destructive bg-destructive/20'
          )}
          style={{ wordBreak: 'break-word', overflowWrap: 'anywhere' }}
        >
          {message.forwarded_from && (
            <div className="mb-1 flex items-center gap-1 text-xs opacity-70">
              <Forward className="h-3 w-3 shrink-0" />
              <span className="truncate">
                Yo'naltirilgan: {message.forwarded_from.sender_name}
              </span>
            </div>
          )}

          {(isGroup || showSender) &&
            !isMine &&
            message.sender &&
            (senderProfilePath && !isPreview ? (
              <Link
                to={senderProfilePath}
                onClick={(e) => e.stopPropagation()}
                className="mb-1 block truncate text-xs font-semibold text-primary hover:underline"
              >
                {senderLabel}
              </Link>
            ) : (
              <p className="mb-1 truncate text-xs font-semibold text-primary">{senderLabel}</p>
            ))}

          {message.is_deleted ? (
            <p className="text-sm italic opacity-50">Xabar o'chirilgan</p>
          ) : isLocationMessage && locationData ? (
            <LocationMessage
              latitude={locationData.latitude}
              longitude={locationData.longitude}
              address={locationData.address}
              isMine={isMine}
              senderName={message.sender?.display_name || undefined}
            />
          ) : (
            <>
              {message.story_id && <StoryReplyPreview storyId={message.story_id} isMine={isMine} />}
              {message.shared_post_id && (
                <SharedPostPreview postId={message.shared_post_id} isMine={isMine} />
              )}
              {isVoiceMessage ? (
                <VoiceMessagePlayer
                  url={message.media_url!}
                  isMine={isMine}
                  autoPlay={false}
                  messageId={message.id}
                  senderName={
                    message.sender?.display_name || message.sender?.username || undefined
                  }
                  allMediaTracks={isPreview ? [] : allMediaTracks}
                />
              ) : (
                <>
                  {message.content &&
                    !message.content.startsWith('[') &&
                    !message.shared_post_id && (
                      <div className="chat-selectable">
                        <MessageContent content={message.content} isMine={isMine} />
                      </div>
                    )}
                  {message.media_url && message.media_type && (
                    <div
                      className={cn(
                        'min-w-0 max-w-full',
                        message.content ? 'mt-2' : '-mx-1.5 -mt-0.5'
                      )}
                    >
                      <MessageAttachment
                        url={message.media_url}
                        type={message.media_type as 'image' | 'video' | 'audio' | 'document'}
                        isMine={isMine}
                        autoPlay={false}
                        senderName={
                          message.sender?.display_name || message.sender?.username || undefined
                        }
                      />
                    </div>
                  )}
                </>
              )}
            </>
          )}

          {renderStatusRow()}
        </div>
      </div>
    );
  };

  // Qo'ng'iroq tarixi xabari
  if (isCallHistoryMessage && callHistoryData) {
    const callIsMine = callHistoryData.caller_id === user?.id;
    return (
      <div
        ref={bubbleRef}
        className={cn(
          'chat-no-select animate-tg-message-in relative',
          isSelected && 'rounded-lg bg-primary/10'
        )}
        onClick={() => {
          if (isSelectionMode && onSelect) {
            onSelect(message.id);
            lightTap();
          }
        }}
        onTouchStart={(e) => handleLongPressStart(e.touches[0].clientX, e.touches[0].clientY)}
        onTouchEnd={handleLongPressEnd}
        onTouchCancel={handleLongPressEnd}
        onMouseDown={(e) => handleLongPressStart(e.clientX, e.clientY)}
        onMouseUp={handleLongPressEnd}
        onMouseLeave={handleLongPressEnd}
        onContextMenu={handleContextMenu}
      >
        {isSelectionMode && (
          <div className="absolute left-2 top-1/2 z-10 -translate-y-1/2">
            {isSelected ? (
              <CheckSquare className="h-5 w-5 text-primary" />
            ) : (
              <Square className="h-5 w-5 text-muted-foreground" />
            )}
          </div>
        )}
        <CallHistoryMessage callData={callHistoryData} isMine={callIsMine} />
        <TelegramStyleContextMenu
          isOpen={contextMenuOpen}
          onClose={() => setContextMenuOpen(false)}
          isMine={callIsMine}
          anchorRect={anchorRect}
          onReply={() => onReply?.(message)}
          onForward={() => onForward?.(message)}
          onDelete={onDelete ? () => onDelete(message.id) : undefined}
          onSelect={onLongPress ? () => onLongPress(message.id) : undefined}
          isPinned={isPinned}
          onPin={() => onPin?.(message.id)}
          onAddReaction={addReaction}
        />
      </div>
    );
  }

  return (
    <>
      <div
        ref={bubbleRef}
        className={cn(
          'chat-no-select tg-swipe animate-tg-message-in group relative -mx-2 flex rounded-lg px-2 py-0.5',
          isMine ? 'justify-end' : 'justify-start',
          isSelectionMode && 'cursor-pointer hover:bg-primary/5',
          isSelected && 'bg-primary/10'
        )}
        onTouchStart={(e) => {
          if (!isSelectionMode) handleTouchStart(e);
          handleLongPressStart(e.touches[0].clientX, e.touches[0].clientY);
        }}
        onTouchMove={handleTouchMove}
        onTouchEnd={() => {
          handleTouchEnd();
          handleLongPressEnd();
        }}
        onTouchCancel={() => {
          handleTouchEnd();
          handleLongPressEnd();
        }}
        onClick={handleClick}
        onMouseDown={(e) => handleLongPressStart(e.clientX, e.clientY)}
        onMouseUp={handleLongPressEnd}
        onMouseLeave={handleLongPressEnd}
        onContextMenu={handleContextMenu}
      >
        {/* Tanlash belgisi */}
        {isSelectionMode && (
          <div className="flex flex-shrink-0 items-center justify-center self-center pr-2">
            <div
              className={cn(
                'tg-transition flex h-6 w-6 items-center justify-center rounded-full border-2',
                isSelected
                  ? 'scale-100 border-primary bg-primary'
                  : 'scale-90 border-muted-foreground/40 bg-background'
              )}
            >
              {isSelected && <Check className="h-4 w-4 text-primary-foreground" strokeWidth={3} />}
            </div>
          </div>
        )}

        {/* Qadalgan belgisi */}
        {isPinned && (
          <div className={cn('absolute -top-1 z-10', isMine ? 'right-0' : 'left-8')}>
            <div className="flex h-5 w-5 items-center justify-center rounded-full bg-primary/90 shadow-sm">
              <Pin className="h-3 w-3 text-primary-foreground" />
            </div>
          </div>
        )}

        {/* Surib javob berish belgisi */}
        <div
          className={cn(
            'absolute top-1/2 flex -translate-y-1/2 items-center justify-center overflow-hidden',
            isMine ? 'right-0' : 'left-0'
          )}
          style={{
            width: swipeOffset,
            opacity: swipeOffset > 10 ? Math.min(swipeOffset / SWIPE_THRESHOLD, 1) : 0,
          }}
        >
          <div
            className={cn(
              'tg-transition flex h-8 w-8 items-center justify-center rounded-full bg-muted',
              isReadyToReply && 'scale-110'
            )}
          >
            <ReplyIcon className="h-4 w-4 text-foreground" />
          </div>
        </div>

        <div
          className="flex min-w-0 max-w-[85%] items-end gap-2 md:max-w-[75%]"
          style={{
            transform: isMine ? `translateX(-${swipeOffset}px)` : `translateX(${swipeOffset}px)`,
            transition: isDragging
              ? 'none'
              : 'transform 260ms cubic-bezier(0.32, 0.72, 0, 1)',
          }}
        >
          {!isMine &&
            showAvatar &&
            (senderProfilePath ? (
              <Link
                to={senderProfilePath}
                onClick={(e) => e.stopPropagation()}
                className="flex-shrink-0"
                aria-label={senderLabel}
              >
                <Avatar className="tg-transition h-8 w-8 hover:scale-105">
                  <AvatarImage src={message.sender?.avatar_url || ''} />
                  <AvatarFallback className="bg-primary text-xs text-primary-foreground">
                    {message.sender?.display_name?.[0] || message.sender?.username?.[0] || 'U'}
                  </AvatarFallback>
                </Avatar>
              </Link>
            ) : (
              <Avatar className="h-8 w-8 flex-shrink-0">
                <AvatarImage src={message.sender?.avatar_url || ''} />
                <AvatarFallback className="bg-primary text-xs text-primary-foreground">
                  {message.sender?.display_name?.[0] || message.sender?.username?.[0] || 'U'}
                </AvatarFallback>
              </Avatar>
            ))}
          {!isMine && !showAvatar && <div className="w-8 flex-shrink-0" />}

          <div className="flex min-w-0 max-w-full flex-col">
            {renderBubbleContent()}

            {isGroup && isMine && (
              <GroupReadReceipts
                messageId={message.id}
                senderId={message.sender_id}
                isMine={isMine}
              />
            )}

            <TelegramReactions
              reactions={reactions}
              isMine={isMine}
              onToggle={toggleReaction}
              onAdd={addReaction}
            />
          </div>
        </div>
      </div>

      {/* Telegram uslubidagi kontekst menyu */}
      <TelegramStyleContextMenu
        isOpen={contextMenuOpen}
        onClose={() => setContextMenuOpen(false)}
        isMine={isMine}
        anchorRect={anchorRect}
        onReply={() => onReply?.(message)}
        onForward={() => onForward?.(message)}
        onEdit={isMine ? () => onEdit?.(message) : undefined}
        // Telegramdek: 1:1 chatda ikki tomon ham xabarni o'chira oladi
        onDelete={
          onDelete && (isMine || canDeleteForEveryone) ? () => onDelete(message.id) : undefined
        }
        onPin={() => onPin?.(message.id)}
        onSelect={onLongPress ? () => onLongPress(message.id) : undefined}
        isPinned={isPinned}
        onCopy={message.content ? copyToClipboard : undefined}
        hasMedia={!!message.media_url}
        onDownload={
          message.media_url
            ? () => {
                const link = document.createElement('a');
                link.href = message.media_url!;
                link.download = message.media_url!.split('/').pop() || 'yuklama';
                link.target = '_blank';
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
                successFeedback();
              }
            : undefined
        }
        onAddReaction={addReaction}
        readInfo={readInfo}
      />
    </>
  );
}

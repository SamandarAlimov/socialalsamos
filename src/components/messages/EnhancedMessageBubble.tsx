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
import {
  movedBeyondTouchTolerance,
  resolveTouchAxis,
  type TouchAxis,
} from '@/lib/touchGesture';
import { MessageAttachment } from '@/components/MessageAttachment';
import { VideoMessagePlayer } from './VideoMessagePlayer';
import { VoiceMessagePlayer } from '@/components/VoiceMessagePlayer';
import { AnimatedEmoji } from '@/components/emoji/AnimatedEmoji';

import { TelegramStyleContextMenu } from './TelegramStyleContextMenu';
import { TelegramReactions } from './TelegramReactions';
import { LocationMessage } from './LocationMessage';
import { MessagePoll } from './MessagePoll';
import { parseMessageLocation, parseMessagePoll } from '@/lib/messageStructuredPayload';
import { GroupReadReceipts } from './GroupReadReceipts';
import { MessageContent } from './MessageContent';
import { SharedPostPreview } from './SharedPostPreview';
import { StoryReplyPreview } from './StoryReplyPreview';
import { CallHistoryMessage, CallHistoryData } from './CallHistoryMessage';
import { BubbleTail } from './BubbleTail';
import { StickerMessage } from './StickerMessage';
import { ReplyMessagePreview, ReplyTarget } from './ReplyMessagePreview';
import { getEmojiOnlyInfo } from '@/lib/emojiOnly';
import { useAuth } from '@/contexts/AuthContext';
import { useHapticFeedback } from '@/hooks/useHapticFeedback';
import { useMessageReactions } from '@/hooks/useMessageReactions';
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
  metadata?: Record<string, unknown> | null;
  location_payload?: Record<string, unknown> | null;
  live_location_expires_at?: string | null;
  live_location_stopped_at?: string | null;
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
  reply_to?: ReplyTarget | null;
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
  onJumpToMessage?: (messageId: string) => void;
  onRetry?: (message: Message) => void;
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
  onJumpToMessage,
  onRetry,
  isPinned = false,
  isSelected = false,
  isSelectionMode = false,
  showAvatar = true,
  showSender = false,
  allMediaTracks = [],
}: EnhancedMessageBubbleProps) {
  const { user } = useAuth();
  const { lightTap, mediumTap, successFeedback } = useHapticFeedback();
  const {
    reactions,
    addReaction: addReactionPersisted,
    toggleReaction: toggleReactionPersisted,
  } = useMessageReactions(message.id);
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
  const gestureActiveRef = useRef(false);
  const startX = useRef(0);
  const startY = useRef(0);
  const axisRef = useRef<TouchAxis>('unknown');
  const hasTriggeredHaptic = useRef(false);

  const lastTapRef = useRef<number>(0);

  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressTriggered = useRef(false);
  const longPressStartRef = useRef({ x: 0, y: 0 });

  const isInteractiveTarget = (target: EventTarget | null) => {
    const el = target as HTMLElement | null;
    return !!el?.closest(
      'a,button,iframe,input,textarea,video,audio,[role="button"],[role="slider"],[role="option"],[role="switch"],[data-message-interactive="true"]'
    );
  };

  const clearSelection = () => {
    // Brauzerda tasodifan tanlangan matnni tozalaymiz - Telegramdek toza tuyg'u
    const sel = window.getSelection();
    if (sel && sel.toString().length === 0) sel.removeAllRanges();
  };

  const handleLongPressStart = useCallback(
    (x = 0, y = 0) => {
      longPressTriggered.current = false;
      longPressStartRef.current = { x, y };
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

  const handleLongPressMove = useCallback(
    (x: number, y: number) => {
      if (!longPressTimer.current) return;
      const dx = x - longPressStartRef.current.x;
      const dy = y - longPressStartRef.current.y;
      if (movedBeyondTouchTolerance(dx, dy, 8)) handleLongPressEnd();
    },
    [handleLongPressEnd],
  );

  const addReaction = useCallback(
    async (emoji: string) => {
      lightTap();
      await addReactionPersisted(emoji);
    },
    [addReactionPersisted, lightTap]
  );

  const toggleReaction = useCallback(
    async (emoji: string) => {
      lightTap();
      await toggleReactionPersisted(emoji);
    },
    [lightTap, toggleReactionPersisted]
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

      // Telegram tartibi: desktopda left-click, touchda oddiy tap menyu ochmaydi.
      // Menyu faqat right-click yoki long-press orqali ochiladi.
      lightTap();
    },
    [
      isSelectionMode,
      onSelect,
      message.id,
      lightTap,
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
    const touch = e.touches[0];
    if (!touch) return;

    startX.current = touch.clientX;
    startY.current = touch.clientY;
    axisRef.current = 'unknown';
    hasTriggeredHaptic.current = false;
    gestureActiveRef.current = true;

    // Tap/vertical scroll paytida React state o'zgarmaydi.
    setIsDragging(false);
  }, []);

  const handleTouchMove = useCallback(
    (e: React.TouchEvent) => {
      if (!gestureActiveRef.current) return;
      if (isInteractiveTarget(e.target)) return;

      const touch = e.touches[0];
      if (!touch) return;

      const currentX = touch.clientX;
      const currentY = touch.clientY;
      handleLongPressMove(currentX, currentY);
      const rawDx = currentX - startX.current;
      const dy = currentY - startY.current;

      // Yo'nalishni aniqlash: vertikal scroll bilan urushmasligi uchun
      if (axisRef.current === 'unknown') {
        axisRef.current = resolveTouchAxis(rawDx, dy, { threshold: 8 });
        if (axisRef.current === 'unknown') return;

        if (axisRef.current === 'vertical') {
          // Native chat scroll owns the gesture; no drag state/long-press remains.
          setIsDragging(false);
          return;
        }

        setIsDragging(true);
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
    [isMine, mediumTap, handleLongPressEnd, handleLongPressMove]
  );

  const handleTouchEnd = useCallback(() => {
    const wasHorizontal = axisRef.current === 'horizontal';

    if (wasHorizontal && swipeOffset >= SWIPE_THRESHOLD && onReply) {
      successFeedback();
      onReply(message);
    }

    gestureActiveRef.current = false;
    setSwipeOffset(0);
    setIsDragging(false);
    axisRef.current = 'unknown';
  }, [swipeOffset, onReply, message, successFeedback]);

  useEffect(() => handleLongPressEnd, [handleLongPressEnd]);

  const copyToClipboard = () => {
    if (message.content) {
      navigator.clipboard.writeText(message.content);
      successFeedback();
    }
  };

  const formatTime = (date: string) => format(new Date(date), 'HH:mm');

  const isVoiceMessage = message.media_type === 'audio' && message.media_url;

  /**
   * Recorder'dan chiqqan doiraviy videolar generic attachment emas.
   * Yangi xabarlar canonical `video_note` bo'ladi; eski `video_123.webm`
   * yozuvlar ham regressiyasiz video-note sifatida taniladi.
   */
  const isVideoNote = Boolean(
    message.media_url &&
      (message.media_type === 'video_note' ||
        (message.media_type === 'video' &&
          /(?:^|\/)video_\d+\.(?:webm|mp4|mov|m4v)(?:[?#]|$)/i.test(message.media_url)))
  );

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

  // Web + Flutter + legacy xabarlarni bitta canonical parser orqali o'qiymiz.
  const locationData = parseMessageLocation(message);
  const pollData = parseMessagePoll(message);
  const isLocationMessage = Boolean(locationData);

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
    !message.reply_to_id &&
    !isLocationMessage &&
    !isCallHistoryMessage &&
    message.content
      ? getEmojiOnlyInfo(message.content)
      : null;

  /**
   * Dumcha (tail) HAR IKKI TOMONDA ham chiziladi - Telegramdek:
   * kelgan xabarlarda kartaning chap-pastida, o'z xabarlarimda o'ng-pastida.
   * Shu tarzda kartaning pastki qismi har doim jo'natuvchi tomonga qaraydi.
   */
  const showTail = true;

  const renderStatusRow = (transparent = false) => (
    <div
      className={cn(
        'mt-1 flex items-center justify-end gap-1.5',
        transparent
          ? isMine
            ? 'text-emerald-700/75 dark:text-emerald-300/80'
            : 'text-muted-foreground'
          : isMine
            ? 'text-bubble-own-foreground/65'
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
            onRetry ? (
              <button
                type="button"
                className="tg-transition -m-1 flex h-6 w-6 items-center justify-center rounded-full text-destructive hover:bg-destructive/10 active:scale-90"
                onClick={(event) => {
                  event.stopPropagation();
                  onRetry(message);
                }}
                aria-label="Xabarni qayta yuborish"
                title="Qayta yuborish"
              >
                <AlertCircle className="h-3.5 w-3.5" />
              </button>
            ) : (
              <AlertCircle className="h-3 w-3 text-destructive" />
            )
          ) : message.status === 'read' || message.is_read ? (
            <CheckCheck className="h-3.5 w-3.5 text-bubble-own-accent" />
          ) : (
            // Telegram: serverga muvaffaqiyatli yuborilgan xabar bitta ptichka.
            // Legacy `delivered` qiymati ham shu ko'rinishga tushadi.
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

    // Telegram video-note: yashil/to'q bubble kartasiz, mustaqil doiraviy media.
    // Shu bilan video xabar oddiy video attachmentdan vizual jihatdan ajraladi.
    if (isVideoNote && message.media_url) {
      return (
        <div className={cn('flex max-w-[250px] flex-col gap-1', isMine ? 'items-end' : 'items-start')}>
          {message.reply_to_id && message.reply_to && (
            <div className="w-full max-w-[240px] rounded-xl border border-border/60 bg-card/90 p-1 shadow-sm backdrop-blur-sm">
              <ReplyMessagePreview
                reply={message.reply_to}
                isMine={false}
                onJump={isPreview ? undefined : onJumpToMessage}
              />
            </div>
          )}
          <VideoMessagePlayer
            url={message.media_url}
            isMine={isMine}
            messageId={message.id}
            autoPlay={false}
            isWebcamRecording={message.media_url.includes('/video_') || message.media_url.includes('video_')}
          />
          {renderStatusRow(true)}
        </div>
      );
    }

    // Stiker / GIF - karta va dumchasiz, faqat mediasi ko'rinadi
    if (stickerKind && message.media_url && !message.reply_to_id) {
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
            'relative z-[1] min-w-0 max-w-full overflow-hidden rounded-[18px] px-3.5 py-2',
            isMine
              ? 'rounded-br-[5px] border border-bubble-own-accent/15 bg-bubble-own text-bubble-own-foreground shadow-[0_1px_2px_rgba(15,23,42,0.055)]'
              : 'rounded-bl-[5px] border border-border/80 bg-card text-card-foreground shadow-[0_1px_2px_rgba(15,23,42,0.045)]',
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

          {message.reply_to_id && (
            message.reply_to ? (
              <ReplyMessagePreview
                reply={message.reply_to}
                isMine={isMine}
                onJump={isPreview ? undefined : onJumpToMessage}
              />
            ) : (
              <div
                className={cn(
                  'mb-1.5 rounded-lg border-l-[3px] px-2 py-1.5 text-[11px]',
                  isMine
                    ? 'border-bubble-own-accent/70 bg-foreground/5 text-bubble-own-foreground/75'
                    : 'border-muted-foreground/50 bg-muted/70 text-muted-foreground'
                )}
              >
                Javob berilgan xabar
              </div>
            )
          )}

          {(isGroup || showSender) &&
            !isMine &&
            message.sender &&
            (senderProfilePath && !isPreview ? (
              <Link
                to={senderProfilePath}
                onClick={(e) => e.stopPropagation()}
                className="mb-1 block truncate text-xs font-semibold text-link hover:text-link-hover hover:underline"
              >
                {senderLabel}
              </Link>
            ) : (
              <p className="mb-1 truncate text-xs font-semibold text-foreground">{senderLabel}</p>
            ))}

          {message.is_deleted ? (
            <p className="text-sm italic opacity-50">Xabar o'chirilgan</p>
          ) : isLocationMessage && locationData ? (
            <LocationMessage
              latitude={locationData.latitude}
              longitude={locationData.longitude}
              address={locationData.address || locationData.label}
              isMine={isMine}
              senderName={message.sender?.display_name || undefined}
              liveUntil={locationData.live ? locationData.expiresAt : undefined}
            />
          ) : pollData ? (
            <MessagePoll messageId={message.id} poll={pollData} isMine={isMine} />
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
                    !message.shared_post_id &&
                    !pollData &&
                    !isLocationMessage && (
                      <div className="chat-selectable">
                        <MessageContent content={message.content} isMine={isMine} />
                      </div>
                    )}
                  {message.media_url &&
                    message.media_type &&
                    !isLocationMessage &&
                    !pollData && (
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
          isSelected && 'rounded-lg bg-muted'
        )}
        style={{ touchAction: 'pan-y' }}
        onClick={() => {
          if (isSelectionMode && onSelect) {
            onSelect(message.id);
            lightTap();
          }
        }}
        onTouchStart={(e) => {
          if (!isInteractiveTarget(e.target)) {
            handleLongPressStart(e.touches[0].clientX, e.touches[0].clientY);
          }
        }}
        onTouchMove={(e) => {
          const touch = e.touches[0];
          if (touch) handleLongPressMove(touch.clientX, touch.clientY);
        }}
        onTouchEnd={handleLongPressEnd}
        onTouchCancel={handleLongPressEnd}
        onContextMenu={handleContextMenu}
      >
        {isSelectionMode && (
          <div className="absolute left-2 top-1/2 z-10 -translate-y-1/2">
            {isSelected ? (
              <CheckSquare className="h-5 w-5 text-foreground" />
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
          isSelectionMode && 'cursor-pointer hover:bg-muted/60',
          isSelected && 'bg-muted'
        )}
        onTouchStart={(e) => {
          if (isSelectionMode) return;
          handleTouchStart(e);
          if (!isInteractiveTarget(e.target)) {
            handleLongPressStart(e.touches[0].clientX, e.touches[0].clientY);
          }
        }}
        onTouchMove={handleTouchMove}
        onTouchEnd={() => {
          handleTouchEnd();
          handleLongPressEnd();
        }}
        onTouchCancel={() => {
          gestureActiveRef.current = false;
          handleTouchEnd();
          handleLongPressEnd();
        }}
        onClick={handleClick}
        onContextMenu={handleContextMenu}
      >
        {/* Tanlash belgisi */}
        {isSelectionMode && (
          <div className="flex flex-shrink-0 items-center justify-center self-center pr-2">
            <div
              className={cn(
                'tg-transition flex h-6 w-6 items-center justify-center rounded-full border-2',
                isSelected
                  ? 'scale-100 border-foreground bg-foreground'
                  : 'scale-90 border-muted-foreground/40 bg-background'
              )}
            >
              {isSelected && <Check className="h-4 w-4 text-background" strokeWidth={3} />}
            </div>
          </div>
        )}

        {/* Qadalgan belgisi */}
        {isPinned && (
          <div className={cn('absolute -top-1 z-10', isMine ? 'right-0' : 'left-8')}>
            <div className="flex h-5 w-5 items-center justify-center rounded-full bg-muted shadow-sm">
              <Pin className="h-3 w-3 text-foreground" />
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
                  <AvatarFallback className="bg-muted text-xs text-foreground">
                    {message.sender?.display_name?.[0] || message.sender?.username?.[0] || 'U'}
                  </AvatarFallback>
                </Avatar>
              </Link>
            ) : (
              <Avatar className="h-8 w-8 flex-shrink-0">
                <AvatarImage src={message.sender?.avatar_url || ''} />
                <AvatarFallback className="bg-muted text-xs text-foreground">
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

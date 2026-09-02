import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import {
  differenceInMinutes,
  isThisMonth,
  isThisWeek,
  isToday,
  isYesterday,
} from 'date-fns';
import { useTranslation } from 'react-i18next';
import { formatDate } from '@/lib/i18n-format';
import {
  AlertCircle,
  AtSign,
  Bell,
  BellOff,
  Check,
  CheckCheck,
  ChevronRight,
  Clock3,
  Eye,
  Heart,
  Image as ImageIcon,
  Inbox,
  Loader2,
  MessageCircle,
  MoreHorizontal,
  Play,
  RefreshCw,
  Reply,
  Settings,
  Sparkles,
  Trash2,
  UserPlus,
  Users,
  X,
} from 'lucide-react';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useNotifications, type Notification } from '@/hooks/useNotifications';
import { useNotificationPermission } from '@/hooks/useNotificationPermission';
import { PullToRefresh } from '@/components/PullToRefresh';
import { useIsMobile } from '@/hooks/use-mobile';
import { cn } from '@/lib/utils';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { VerifiedBadge } from '@/components/VerifiedBadge';
import { toast } from 'sonner';
import {
  notificationActionText,
  notificationContextLabel,
  notificationNeedsExplicitRead,
  notificationPreviewText,
  notificationTarget,
} from '@/lib/notificationSemantics';

type NotificationFilter =
  | 'all'
  | 'mentions'
  | 'comments'
  | 'collaborations'
  | 'likes'
  | 'follows';

const FILTERS: Array<{ id: NotificationFilter; label: string }> = [
  { id: 'all', label: 'Hammasi' },
  { id: 'mentions', label: 'Eslatishlar' },
  { id: 'comments', label: 'Izohlar' },
  { id: 'collaborations', label: 'Hammualliflik' },
  { id: 'likes', label: 'Yoqtirishlar' },
  { id: 'follows', label: 'Obunalar' },
];

const FILTER_EMPTY_TEXT: Record<NotificationFilter, string> = {
  all: 'Yangi faollik, eslatish, izoh va hammualliflik voqealari shu yerda paydo bo‘ladi.',
  mentions: 'Hozircha sizni post yoki izohlarda hech kim belgilamagan.',
  comments: 'Hozircha yangi izoh yoki javob yo‘q.',
  collaborations: 'Hozircha hammualliflik bo‘yicha yangi voqea yo‘q.',
  likes: 'Hozircha yangi yoqtirishlar yo‘q.',
  follows: 'Hozircha yangi obunachilar yo‘q.',
};

const COLLABORATION_TYPES: Notification['type'][] = [
  'collaboration_invite',
  'collaboration_accepted',
  'collaboration_declined',
  'collaboration_revoked',
  'collaboration_removed',
  'collaboration_left',
];

const COMMENT_TYPES: Notification['type'][] = ['comment', 'reply', 'comment_like'];
const MENTION_TYPES: Notification['type'][] = ['mention', 'comment_mention'];
const VIDEO_PATTERN = /\.(mp4|webm|mov|m4v|ogv)(\?|#|$)/i;

interface GroupedNotification {
  id: string;
  type: Notification['type'];
  notifications: Notification[];
  latestAt: string;
  postId?: string;
  postThumbnail?: string;
  actors: Array<{
    id: string;
    username: string | null;
    displayName: string | null;
    avatar: string | null;
    isVerified: boolean;
  }>;
}

interface TimeGroupedNotifications {
  today: GroupedNotification[];
  yesterday: GroupedNotification[];
  thisWeek: GroupedNotification[];
  thisMonth: GroupedNotification[];
  older: GroupedNotification[];
}

function NotificationIcon({ type }: { type: Notification['type'] }) {
  const common = 'flex h-7 w-7 items-center justify-center rounded-full ring-2 ring-background shadow-sm';
  const icon = 'h-3.5 w-3.5 text-white';

  if (type === 'like' || type === 'comment_like') {
    return (
      <span className={cn(common, 'bg-rose-500')}>
        <Heart className={icon} fill="currentColor" />
      </span>
    );
  }
  if (type === 'comment') {
    return (
      <span className={cn(common, 'bg-sky-500')}>
        <MessageCircle className={icon} fill="currentColor" />
      </span>
    );
  }
  if (type === 'reply') {
    return (
      <span className={cn(common, 'bg-cyan-600')}>
        <Reply className={icon} />
      </span>
    );
  }
  if (type === 'follow') {
    return (
      <span className={cn(common, 'bg-emerald-600')}>
        <UserPlus className={icon} />
      </span>
    );
  }
  if (type === 'mention' || type === 'comment_mention') {
    return (
      <span className={cn(common, 'bg-violet-600')}>
        <AtSign className={icon} />
      </span>
    );
  }
  if (COLLABORATION_TYPES.includes(type)) {
    return (
      <span className={cn(common, 'bg-indigo-600')}>
        <Users className={icon} />
      </span>
    );
  }

  return (
    <span className={cn(common, 'bg-foreground')}>
      <Bell className={icon} />
    </span>
  );
}

function PostThumbnail({
  url,
  onClick,
}: {
  url: string;
  onClick: (event: React.MouseEvent) => void;
}) {
  const [failed, setFailed] = useState(false);
  const isVideo = VIDEO_PATTERN.test(url);
  const base =
    'relative flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-muted ring-1 ring-border/60 transition hover:ring-foreground/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

  if (isVideo) {
    return (
      <button type="button" onClick={onClick} className={cn(base, 'bg-neutral-900')} aria-label="Videoni ochish">
        <Play className="h-4 w-4 text-white" fill="currentColor" />
      </button>
    );
  }

  if (failed) {
    return (
      <button type="button" onClick={onClick} className={base} aria-label="Postni ochish">
        <ImageIcon className="h-5 w-5 text-muted-foreground" />
      </button>
    );
  }

  return (
    <button type="button" onClick={onClick} className={base} aria-label="Postni ochish">
      <img
        src={url}
        alt=""
        loading="lazy"
        decoding="async"
        className="h-full w-full object-cover"
        onError={() => setFailed(true)}
      />
    </button>
  );
}

function consolidateNotifications(notifications: Notification[]): GroupedNotification[] {
  const groups = new Map<string, GroupedNotification>();
  const sorted = [...notifications].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  );

  sorted.forEach((notification) => {
    const data = notification.data as Record<string, unknown>;
    const postId = typeof data?.post_id === 'string' ? data.post_id : undefined;
    const actor = notification.actor;
    const postThumbnail = notification.post?.media_urls?.find(
      (media) => typeof media === 'string' && media.length > 0,
    );
    const isCollaboration = COLLABORATION_TYPES.includes(notification.type);

    // Context-rich eventlar (comment/mention/reply) alohida qoladi.
    // Like/follow va duplicate collaboration eventlarigina birlashtiriladi.
    const canConsolidate =
      notification.type === 'like' ||
      notification.type === 'follow' ||
      notification.type === 'comment_like' ||
      isCollaboration;

    const baseKey = isCollaboration
      ? notification.type + '-' + (postId || 'no-post') + '-' + (actor?.id || 'no-actor')
      : notification.type + '-' + (postId || 'global');

    const key = canConsolidate ? baseKey : baseKey + '-' + notification.id;
    const existing = groups.get(key);

    if (existing) {
      const minutes = differenceInMinutes(
        new Date(existing.latestAt),
        new Date(notification.created_at),
      );
      const maxWindow = isCollaboration ? 60 * 24 * 30 : 30;

      if (minutes <= maxWindow) {
        if (actor && !existing.actors.some((item) => item.id === actor.id)) {
          existing.actors.push({
            id: actor.id,
            username: actor.username,
            displayName: actor.display_name,
            avatar: actor.avatar_url,
            isVerified: Boolean(actor.is_verified),
          });
        }
        existing.notifications.push(notification);
        if (!existing.postThumbnail && postThumbnail) existing.postThumbnail = postThumbnail;
        return;
      }
    }

    groups.set(key, {
      id: notification.id,
      type: notification.type,
      notifications: [notification],
      latestAt: notification.created_at,
      postId,
      postThumbnail,
      actors: actor
        ? [{
            id: actor.id,
            username: actor.username,
            displayName: actor.display_name,
            avatar: actor.avatar_url,
            isVerified: Boolean(actor.is_verified),
          }]
        : [],
    });
  });

  return Array.from(groups.values()).sort(
    (a, b) => new Date(b.latestAt).getTime() - new Date(a.latestAt).getTime(),
  );
}

function GroupedNotificationItem({
  group,
  onMarkAsRead,
  onDelete,
  onRespondCollaboration,
  onBeforeOpen,
  returnTo,
  index,
}: {
  group: GroupedNotification;
  onMarkAsRead: (id: string) => void | Promise<void>;
  onDelete: (id: string) => Promise<void> | void;
  onRespondCollaboration: (collaborationId: string, accept: boolean) => Promise<void>;
  onBeforeOpen: () => void;
  returnTo: string;
  index: number;
}) {
  const navigate = useNavigate();
  const cardRef = useRef<HTMLDivElement>(null);
  const viewTimerRef = useRef<number | null>(null);
  const firstNotification = group.notifications[0];
  const hasUnread = group.notifications.some((item) => !item.is_read);
  const explicitRead = group.notifications.some(notificationNeedsExplicitRead);
  const firstActor = group.actors[0];
  const otherActorsCount = Math.max(0, group.actors.length - 1);
  const collaborationId =
    typeof firstNotification?.data?.collaboration_id === 'string'
      ? firstNotification.data.collaboration_id
      : undefined;
  const [collaborationBusy, setCollaborationBusy] = useState<'accept' | 'decline' | null>(null);
  const { i18n } = useTranslation();

  const markGroupRead = useCallback(() => {
    group.notifications.forEach((notification) => {
      if (!notification.is_read) void onMarkAsRead(notification.id);
    });
  }, [group.notifications, onMarkAsRead]);

  // Passive notification: viewport'da 1.2s davomida 72% ko'rinsa read.
  // Mention/comment/invite kabi actionable eventlar faqat click/action bilan read.
  useEffect(() => {
    if (!hasUnread || explicitRead || !cardRef.current) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && entry.intersectionRatio >= 0.72) {
          if (viewTimerRef.current == null) {
            viewTimerRef.current = window.setTimeout(markGroupRead, 1200);
          }
        } else if (viewTimerRef.current != null) {
          window.clearTimeout(viewTimerRef.current);
          viewTimerRef.current = null;
        }
      },
      { threshold: [0.72] },
    );

    observer.observe(cardRef.current);
    return () => {
      observer.disconnect();
      if (viewTimerRef.current != null) window.clearTimeout(viewTimerRef.current);
    };
  }, [explicitRead, hasUnread, markGroupRead]);

  const formatTime = (dateStr: string) => {
    const date = new Date(dateStr);
    if (Number.isNaN(date.getTime())) return '';

    const minutes = differenceInMinutes(new Date(), date);
    if (minutes < 1) return 'hozir';
    if (minutes < 60) return minutes + ' daq';
    const hours = Math.floor(minutes / 60);
    if (isToday(date)) return hours + ' soat';
    if (isYesterday(date)) return 'kecha ' + formatDate(date, 'HH:mm', i18n.language);
    const days = Math.floor(hours / 24);
    if (days < 7) return days + ' kun';
    return formatDate(date, 'd MMM', i18n.language);
  };

  const target = notificationTarget(firstNotification, returnTo);
  const preview = notificationPreviewText(firstNotification);
  const contextLabel = notificationContextLabel(firstNotification);
  const actorName = firstActor?.displayName || firstActor?.username || 'Foydalanuvchi';
  const othersText =
    otherActorsCount > 0 ? ' va yana ' + otherActorsCount + (otherActorsCount === 1 ? ' kishi' : ' kishi') : '';

  const openTarget = () => {
    markGroupRead();
    if (target) {
      onBeforeOpen();
      navigate(target);
    }
  };

  const handleActorClick = (event: React.MouseEvent) => {
    event.stopPropagation();
    if (!firstActor) return;
    markGroupRead();
    navigate('/user/' + (firstActor.username || firstActor.id));
  };

  const handlePostClick = (event: React.MouseEvent) => {
    event.stopPropagation();
    markGroupRead();
    if (target) {
      onBeforeOpen();
      navigate(target);
    }
  };

  const handleDelete = async (event: React.MouseEvent) => {
    event.stopPropagation();
    try {
      await Promise.all(group.notifications.map((notification) => onDelete(notification.id)));
      toast.success('Bildirishnoma o‘chirildi');
    } catch {
      toast.error('Bildirishnomani o‘chirib bo‘lmadi');
    }
  };

  const handleCollaborationResponse = async (event: React.MouseEvent, accept: boolean) => {
    event.stopPropagation();
    if (!collaborationId || collaborationBusy) return;
    setCollaborationBusy(accept ? 'accept' : 'decline');
    try {
      await onRespondCollaboration(collaborationId, accept);
      markGroupRead();
      toast.success(accept ? 'Hammualliflik qabul qilindi' : 'Taklif rad etildi');
    } catch (error) {
      const reason = error instanceof Error ? error.message : '';
      toast.error(reason || 'Taklifga javob berib bo‘lmadi');
    } finally {
      setCollaborationBusy(null);
    }
  };

  return (
    <motion.div
      ref={cardRef}
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.18, delay: Math.min(index, 7) * 0.025 }}
      role="button"
      tabIndex={0}
      onClick={openTarget}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          openTarget();
        }
      }}
      className={cn(
        'group relative grid cursor-pointer grid-cols-[auto_minmax(0,1fr)_auto] gap-3 rounded-[20px] border px-3.5 py-3.5 outline-none transition-all duration-200 md:px-4',
        hasUnread
          ? 'border-border bg-card shadow-sm hover:border-foreground/15 hover:shadow-md'
          : 'border-transparent bg-card/45 hover:border-border/70 hover:bg-card',
        'focus-visible:ring-2 focus-visible:ring-ring/60',
      )}
    >
      <div className="relative shrink-0">
        <Avatar className="h-12 w-12 ring-1 ring-border/70">
          <AvatarImage src={firstActor?.avatar || undefined} className="object-cover" />
          <AvatarFallback className="bg-muted text-sm font-semibold">
            {(actorName || '?').charAt(0).toUpperCase()}
          </AvatarFallback>
        </Avatar>
        <span className="absolute -bottom-1 -right-1">
          <NotificationIcon type={group.type} />
        </span>
      </div>

      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1">
          <button
            type="button"
            className="inline-flex min-w-0 items-center gap-1 font-semibold text-foreground hover:underline"
            onClick={handleActorClick}
          >
            <span className="max-w-[220px] truncate text-sm">{actorName}</span>
            {firstActor?.isVerified && <VerifiedBadge size="xs" />}
          </button>
          <span className="text-sm leading-snug text-muted-foreground">
            {othersText} {notificationActionText(firstNotification)}
          </span>
        </div>

        <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
          <span>{formatTime(group.latestAt)}</span>
          {contextLabel && (
            <span className="rounded-full bg-muted px-2 py-0.5 font-medium text-foreground/75">
              {contextLabel}
            </span>
          )}
          {group.notifications.length > 1 && (
            <span className="rounded-full bg-muted px-2 py-0.5 font-medium">
              {group.notifications.length} ta
            </span>
          )}
          {hasUnread && (
            <span className="inline-flex items-center gap-1 font-semibold text-foreground">
              <span className="h-1.5 w-1.5 rounded-full bg-foreground" />
              Yangi
            </span>
          )}
        </div>

        {preview && (
          <div
            className={cn(
              'mt-2.5 flex max-w-2xl items-start gap-2 rounded-xl border px-3 py-2 text-xs leading-relaxed',
              hasUnread ? 'border-border bg-muted/45' : 'border-border/60 bg-muted/25',
            )}
          >
            {group.type === 'mention' || group.type === 'comment_mention' ? (
              <AtSign className="mt-0.5 h-3.5 w-3.5 shrink-0 text-violet-600" />
            ) : group.type === 'reply' ? (
              <Reply className="mt-0.5 h-3.5 w-3.5 shrink-0 text-cyan-600" />
            ) : (
              <MessageCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            )}
            <span className="line-clamp-2 text-foreground/80">“{preview}”</span>
          </div>
        )}

        {group.type === 'collaboration_invite' && collaborationId && (
          <div className="mt-3 flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              className="h-8 rounded-full px-4"
              disabled={collaborationBusy !== null}
              onClick={(event) => void handleCollaborationResponse(event, true)}
            >
              {collaborationBusy === 'accept' ? (
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              ) : (
                <Check className="mr-1.5 h-3.5 w-3.5" />
              )}
              Qabul qilish
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-8 rounded-full px-4"
              disabled={collaborationBusy !== null}
              onClick={(event) => void handleCollaborationResponse(event, false)}
            >
              {collaborationBusy === 'decline' ? (
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              ) : (
                <X className="mr-1.5 h-3.5 w-3.5" />
              )}
              Rad etish
            </Button>
            {target && (
              <Button type="button" size="sm" variant="ghost" className="h-8 rounded-full px-3" onClick={handlePostClick}>
                Preview
              </Button>
            )}
          </div>
        )}
      </div>

      <div className="flex items-start gap-1">
        {group.postThumbnail ? (
          <PostThumbnail url={group.postThumbnail} onClick={handlePostClick} />
        ) : target && group.type !== 'follow' ? (
          <Button
            variant="ghost"
            size="icon"
            className="mt-1 h-9 w-9 rounded-full"
            onClick={handlePostClick}
            aria-label="Ochish"
          >
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          </Button>
        ) : null}

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 rounded-full opacity-50 transition-opacity md:opacity-0 md:group-hover:opacity-100 md:focus-visible:opacity-100"
              onClick={(event) => event.stopPropagation()}
              aria-label="Boshqa amallar"
            >
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52">
            {hasUnread && (
              <DropdownMenuItem
                onClick={(event) => {
                  event.stopPropagation();
                  markGroupRead();
                }}
              >
                <CheckCheck className="mr-2 h-4 w-4" />
                O‘qilgan deb belgilash
              </DropdownMenuItem>
            )}
            <DropdownMenuItem
              onClick={(event) => void handleDelete(event)}
              className="text-destructive focus:text-destructive"
            >
              <Trash2 className="mr-2 h-4 w-4" />
              O‘chirish
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </motion.div>
  );
}

function NotificationGroup({
  title,
  groups,
  onMarkAsRead,
  onDelete,
  onRespondCollaboration,
  onBeforeOpen,
  returnTo,
  startIndex,
}: {
  title: string;
  groups: GroupedNotification[];
  onMarkAsRead: (id: string) => void | Promise<void>;
  onDelete: (id: string) => Promise<void> | void;
  onRespondCollaboration: (collaborationId: string, accept: boolean) => Promise<void>;
  onBeforeOpen: () => void;
  returnTo: string;
  startIndex: number;
}) {
  if (!groups.length) return null;

  return (
    <section aria-label={title} className="mb-5">
      <div className="mb-2 flex items-center justify-between px-1">
        <h2 className="text-[11px] font-bold uppercase tracking-[0.09em] text-muted-foreground">
          {title}
        </h2>
        <span className="text-[11px] tabular-nums text-muted-foreground">{groups.length}</span>
      </div>
      <div className="space-y-2">
        {groups.map((group, index) => (
          <GroupedNotificationItem
            key={group.id}
            group={group}
            onMarkAsRead={onMarkAsRead}
            onDelete={onDelete}
            onRespondCollaboration={onRespondCollaboration}
            onBeforeOpen={onBeforeOpen}
            returnTo={returnTo}
            index={startIndex + index}
          />
        ))}
      </div>
    </section>
  );
}

function NotificationSkeleton() {
  return (
    <div className="rounded-[20px] border border-border/60 bg-card p-4">
      <div className="flex gap-3">
        <Skeleton className="h-12 w-12 rounded-full" />
        <div className="flex-1 space-y-2 pt-1">
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-3 w-1/3" />
          <Skeleton className="h-10 w-2/3 rounded-xl" />
        </div>
        <Skeleton className="h-14 w-14 rounded-2xl" />
      </div>
    </div>
  );
}

function PushNotificationBanner() {
  const { permission, supported, requestPermission } = useNotificationPermission();
  const navigate = useNavigate();
  const [dismissed, setDismissed] = useState(false);

  if (!supported || permission === 'granted' || permission === 'denied' || dismissed) return null;

  return (
    <div className="mb-4 rounded-2xl border border-border bg-card p-4 shadow-sm">
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-muted">
          <Bell className="h-5 w-5 text-muted-foreground" />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold">Muhim faollikni o‘tkazib yubormang</h3>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            Eslatish, izoh, hammualliflik va obuna voqealarini brauzer yopiq bo‘lsa ham oling.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button size="sm" className="h-8 rounded-full px-4" onClick={requestPermission}>
              Push’ni yoqish
            </Button>
            <Button size="sm" variant="ghost" className="h-8 rounded-full px-3" onClick={() => navigate('/settings?tab=notifications')}>
              Sozlamalar
            </Button>
            <Button size="sm" variant="ghost" className="h-8 rounded-full px-3 text-muted-foreground" onClick={() => setDismissed(true)}>
              Keyinroq
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function NotificationsPage() {
  const isMobile = useIsMobile();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const scrollRootRef = useRef<HTMLDivElement>(null);
  const restoredScrollRef = useRef(false);
  const {
    notifications,
    unreadCount,
    loading,
    isLoadingMore,
    hasMore,
    error,
    loadMore,
    markAsRead,
    markAllAsRead,
    deleteNotification,
    respondToCollaboration,
    refetch,
  } = useNotifications();

  const requestedFilter = searchParams.get('filter') as NotificationFilter | null;
  const initialFilter = FILTERS.some((item) => item.id === requestedFilter)
    ? (requestedFilter as NotificationFilter)
    : 'all';
  const [filter, setFilterState] = useState<NotificationFilter>(initialFilter);
  const [markingAll, setMarkingAll] = useState(false);

  const setFilter = useCallback((next: NotificationFilter) => {
    setFilterState(next);
    const params = new URLSearchParams(searchParams);
    if (next === 'all') params.delete('filter');
    else params.set('filter', next);
    setSearchParams(params, { replace: true });
  }, [searchParams, setSearchParams]);

  const returnTo = location.pathname + location.search;

  const captureReturnState = useCallback(() => {
    const viewport = scrollRootRef.current?.querySelector<HTMLElement>(
      '[data-radix-scroll-area-viewport]',
    );
    const mainScroller = scrollRootRef.current?.closest('main') as HTMLElement | null;
    sessionStorage.setItem(
      'alsamos.notifications.returnState',
      JSON.stringify({
        scrollTop: viewport?.scrollTop ?? 0,
        mainScrollTop: mainScroller?.scrollTop ?? 0,
        windowScrollY: window.scrollY,
        filter,
      }),
    );
  }, [filter]);

  useEffect(() => {
    if (loading || restoredScrollRef.current) return;
    restoredScrollRef.current = true;

    try {
      const raw = sessionStorage.getItem('alsamos.notifications.returnState');
      if (!raw) return;
      sessionStorage.removeItem('alsamos.notifications.returnState');

      const saved = JSON.parse(raw) as {
        scrollTop?: number;
        mainScrollTop?: number;
        windowScrollY?: number;
        filter?: NotificationFilter;
      };
      if (saved.filter && FILTERS.some((item) => item.id === saved.filter) && saved.filter !== filter) {
        setFilter(saved.filter);
      }

      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          const viewport = scrollRootRef.current?.querySelector<HTMLElement>(
            '[data-radix-scroll-area-viewport]',
          );
          if (viewport && typeof saved.scrollTop === 'number') {
            viewport.scrollTop = saved.scrollTop;
          }
          const mainScroller = scrollRootRef.current?.closest('main') as HTMLElement | null;
          if (mainScroller && typeof saved.mainScrollTop === 'number') {
            mainScroller.scrollTop = saved.mainScrollTop;
          }
          if (typeof saved.windowScrollY === 'number' && saved.windowScrollY > 0) {
            window.scrollTo({ top: saved.windowScrollY, behavior: 'auto' });
          }
        });
      });
    } catch {
      sessionStorage.removeItem('alsamos.notifications.returnState');
    }
  }, [filter, loading, setFilter]);

  const filteredNotifications = useMemo(() => {
    if (filter === 'all') return notifications;
    if (filter === 'mentions') return notifications.filter((item) => MENTION_TYPES.includes(item.type));
    if (filter === 'comments') return notifications.filter((item) => COMMENT_TYPES.includes(item.type));
    if (filter === 'collaborations') return notifications.filter((item) => COLLABORATION_TYPES.includes(item.type));
    if (filter === 'likes') return notifications.filter((item) => item.type === 'like');
    if (filter === 'follows') return notifications.filter((item) => item.type === 'follow');
    return notifications;
  }, [filter, notifications]);

  const filterCounts = useMemo(
    () => ({
      all: notifications.length,
      mentions: notifications.filter((item) => MENTION_TYPES.includes(item.type)).length,
      comments: notifications.filter((item) => COMMENT_TYPES.includes(item.type)).length,
      collaborations: notifications.filter((item) => COLLABORATION_TYPES.includes(item.type)).length,
      likes: notifications.filter((item) => item.type === 'like').length,
      follows: notifications.filter((item) => item.type === 'follow').length,
    }),
    [notifications],
  );

  const actionableUnread = useMemo(
    () => notifications.filter((item) => !item.is_read && notificationNeedsExplicitRead(item)).length,
    [notifications],
  );
  const mentionUnread = useMemo(
    () => notifications.filter((item) => !item.is_read && MENTION_TYPES.includes(item.type)).length,
    [notifications],
  );
  const collaborationInvites = useMemo(
    () => notifications.filter((item) => !item.is_read && item.type === 'collaboration_invite').length,
    [notifications],
  );

  const groupedNotifications = useMemo((): TimeGroupedNotifications => {
    const buckets: Record<keyof TimeGroupedNotifications, Notification[]> = {
      today: [],
      yesterday: [],
      thisWeek: [],
      thisMonth: [],
      older: [],
    };

    filteredNotifications.forEach((notification) => {
      const date = new Date(notification.created_at);
      if (Number.isNaN(date.getTime())) return buckets.older.push(notification);
      if (isToday(date)) buckets.today.push(notification);
      else if (isYesterday(date)) buckets.yesterday.push(notification);
      else if (isThisWeek(date, { weekStartsOn: 1 })) buckets.thisWeek.push(notification);
      else if (isThisMonth(date)) buckets.thisMonth.push(notification);
      else buckets.older.push(notification);
    });

    return {
      today: consolidateNotifications(buckets.today),
      yesterday: consolidateNotifications(buckets.yesterday),
      thisWeek: consolidateNotifications(buckets.thisWeek),
      thisMonth: consolidateNotifications(buckets.thisMonth),
      older: consolidateNotifications(buckets.older),
    };
  }, [filteredNotifications]);

  const handleMarkAll = useCallback(async () => {
    if (markingAll) return;
    setMarkingAll(true);
    try {
      await markAllAsRead();
      toast.success('Barcha bildirishnomalar o‘qildi');
    } catch {
      toast.error('Bildirishnomalarni belgilab bo‘lmadi');
    } finally {
      setMarkingAll(false);
    }
  }, [markAllAsRead, markingAll]);

  let itemIndex = 0;
  const takeIndex = (groups: GroupedNotification[]) => {
    const start = itemIndex;
    itemIndex += groups.length;
    return start;
  };

  const content = (
    <div className="flex h-full min-h-0 flex-col bg-muted/10">
      <header className="sticky top-0 z-20 border-b border-border/70 bg-background/92 backdrop-blur-xl">
        <div className="mx-auto w-full max-w-6xl px-4 pb-3 pt-4 md:px-6 md:pt-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2.5">
                <h1 className="text-xl font-bold tracking-tight md:text-2xl">Bildirishnomalar</h1>
                {unreadCount > 0 && (
                  <Badge className="rounded-full px-2.5 py-0.5 text-xs">
                    {unreadCount > 99 ? '99+' : unreadCount}
                  </Badge>
                )}
              </div>
            </div>

            <div className="flex items-center gap-1">
              {unreadCount > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="rounded-full"
                  disabled={markingAll}
                  onClick={() => void handleMarkAll()}
                >
                  {markingAll ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <CheckCheck className="mr-1.5 h-4 w-4" />}
                  <span className="hidden sm:inline">Hammasini o‘qish</span>
                </Button>
              )}
              <Button
                variant="ghost"
                size="icon"
                className="rounded-full"
                onClick={() => navigate('/settings?tab=notifications')}
                aria-label="Bildirishnoma sozlamalari"
              >
                <Settings className="h-5 w-5" />
              </Button>
            </div>
          </div>

          <div className="mt-4 flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
            {FILTERS.map(({ id, label }) => {
              const active = filter === id;
              const count = filterCounts[id];
              return (
                <button
                  key={id}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setFilter(id)}
                  className={cn(
                    'shrink-0 rounded-full px-3.5 py-2 text-sm font-medium transition',
                    active
                      ? 'bg-foreground text-background shadow-sm'
                      : 'bg-muted text-muted-foreground hover:bg-muted/80 hover:text-foreground',
                  )}
                >
                  {label}
                  {count > 0 && <span className="ml-1.5 text-xs opacity-70">{count}</span>}
                </button>
              );
            })}
          </div>
        </div>
      </header>

      <ScrollArea ref={scrollRootRef} className="min-h-0 flex-1">
        <div className="mx-auto grid w-full max-w-6xl gap-5 px-4 py-5 md:px-6 xl:grid-cols-[minmax(0,1fr)_280px]">
          <main className="min-w-0">
            <PushNotificationBanner />

            {loading ? (
              <div className="space-y-2">
                {Array.from({ length: 6 }).map((_, index) => <NotificationSkeleton key={index} />)}
              </div>
            ) : error && notifications.length === 0 ? (
              <div className="rounded-3xl border border-border bg-card p-10 text-center shadow-sm">
                <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-destructive/10">
                  <AlertCircle className="h-6 w-6 text-destructive" />
                </span>
                <h2 className="mt-4 font-semibold">{error}</h2>
                <p className="mx-auto mt-2 max-w-sm text-sm text-muted-foreground">
                  Internet aloqasini tekshirib, yana urinib ko‘ring.
                </p>
                <Button className="mt-4 rounded-full" onClick={() => void refetch()}>
                  <RefreshCw className="mr-2 h-4 w-4" />
                  Qayta urinish
                </Button>
              </div>
            ) : filteredNotifications.length === 0 ? (
              <div className="rounded-3xl border border-border bg-card p-10 text-center shadow-sm">
                <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-muted">
                  <Inbox className="h-7 w-7 text-muted-foreground" />
                </span>
                <h2 className="mt-4 text-lg font-semibold">Bu bo‘lim hozircha toza</h2>
                <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-muted-foreground">
                  {FILTER_EMPTY_TEXT[filter]}
                </p>
                {filter !== 'all' && (
                  <Button variant="ghost" className="mt-4 rounded-full" onClick={() => setFilter('all')}>
                    Barcha faollik
                  </Button>
                )}
              </div>
            ) : (
              <>
                {error && (
                  <div className="mb-4 flex items-center gap-2 rounded-2xl border border-destructive/20 bg-destructive/5 px-3 py-2 text-xs text-destructive">
                    <AlertCircle className="h-4 w-4" />
                    <span className="flex-1">{error}</span>
                    <button className="font-semibold underline" onClick={() => void refetch()}>Yangilash</button>
                  </div>
                )}

                <NotificationGroup title="Bugun" groups={groupedNotifications.today} onMarkAsRead={markAsRead} onDelete={deleteNotification} onRespondCollaboration={respondToCollaboration} onBeforeOpen={captureReturnState} returnTo={returnTo} startIndex={takeIndex(groupedNotifications.today)} />
                <NotificationGroup title="Kecha" groups={groupedNotifications.yesterday} onMarkAsRead={markAsRead} onDelete={deleteNotification} onRespondCollaboration={respondToCollaboration} onBeforeOpen={captureReturnState} returnTo={returnTo} startIndex={takeIndex(groupedNotifications.yesterday)} />
                <NotificationGroup title="Shu hafta" groups={groupedNotifications.thisWeek} onMarkAsRead={markAsRead} onDelete={deleteNotification} onRespondCollaboration={respondToCollaboration} onBeforeOpen={captureReturnState} returnTo={returnTo} startIndex={takeIndex(groupedNotifications.thisWeek)} />
                <NotificationGroup title="Shu oy" groups={groupedNotifications.thisMonth} onMarkAsRead={markAsRead} onDelete={deleteNotification} onRespondCollaboration={respondToCollaboration} onBeforeOpen={captureReturnState} returnTo={returnTo} startIndex={takeIndex(groupedNotifications.thisMonth)} />
                <NotificationGroup title="Avvalroq" groups={groupedNotifications.older} onMarkAsRead={markAsRead} onDelete={deleteNotification} onRespondCollaboration={respondToCollaboration} onBeforeOpen={captureReturnState} returnTo={returnTo} startIndex={takeIndex(groupedNotifications.older)} />

                {hasMore && (
                  <div className="flex justify-center pb-8 pt-2">
                    <Button variant="outline" className="rounded-full px-6" disabled={isLoadingMore} onClick={() => void loadMore()}>
                      {isLoadingMore && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                      {isLoadingMore ? 'Yuklanmoqda...' : 'Ko‘proq yuklash'}
                    </Button>
                  </div>
                )}
              </>
            )}
          </main>

          <aside className="hidden xl:block">
            <div className="sticky top-5 space-y-3">
              <section className="rounded-3xl border border-border bg-card p-4 shadow-sm">
                <div className="flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-muted-foreground" />
                  <h2 className="text-sm font-semibold">Faollik markazi</h2>
                </div>
                <div className="mt-4 grid grid-cols-3 gap-2">
                  <div className="rounded-2xl bg-muted/55 p-3 text-center">
                    <p className="text-lg font-bold tabular-nums">{unreadCount}</p>
                    <p className="mt-0.5 text-[10px] text-muted-foreground">Yangi</p>
                  </div>
                  <div className="rounded-2xl bg-muted/55 p-3 text-center">
                    <p className="text-lg font-bold tabular-nums">{mentionUnread}</p>
                    <p className="mt-0.5 text-[10px] text-muted-foreground">Mention</p>
                  </div>
                  <div className="rounded-2xl bg-muted/55 p-3 text-center">
                    <p className="text-lg font-bold tabular-nums">{collaborationInvites}</p>
                    <p className="mt-0.5 text-[10px] text-muted-foreground">Taklif</p>
                  </div>
                </div>
                {actionableUnread > 0 && (
                  <div className="mt-3 flex items-start gap-2 rounded-xl border border-border bg-background px-3 py-2.5">
                    <Bell className="mt-0.5 h-4 w-4 text-foreground" />
                    <p className="text-xs leading-relaxed text-muted-foreground">
                      <strong className="text-foreground">{actionableUnread} ta</strong> bildirishnoma sizning harakatingizni kutmoqda.
                    </p>
                  </div>
                )}
              </section>

              <section className="rounded-3xl border border-border bg-card p-4 shadow-sm">
                <h2 className="text-sm font-semibold">Qachon o‘qiladi?</h2>
                <div className="mt-3 space-y-3">
                  <div className="flex gap-3">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-muted">
                      <Eye className="h-4 w-4 text-muted-foreground" />
                    </span>
                    <div>
                      <p className="text-xs font-semibold">Ko‘rilganda avtomatik</p>
                      <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">
                        Like, follow va status eventlari 1.2 soniya ko‘rinsa o‘qiladi.
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-3">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-muted">
                      <Clock3 className="h-4 w-4 text-muted-foreground" />
                    </span>
                    <div>
                      <p className="text-xs font-semibold">Ochilmaguncha yangi</p>
                      <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">
                        Mention, comment, reply va collab taklifi bosilmaguncha unread qoladi.
                      </p>
                    </div>
                  </div>
                </div>
              </section>

              <Button
                variant="outline"
                className="h-10 w-full rounded-2xl"
                onClick={() => navigate('/settings?tab=notifications')}
              >
                <Settings className="mr-2 h-4 w-4" />
                Bildirishnoma sozlamalari
              </Button>
            </div>
          </aside>
        </div>
      </ScrollArea>
    </div>
  );

  if (isMobile) {
    return <PullToRefresh onRefresh={refetch} className="h-full">{content}</PullToRefresh>;
  }

  return content;
}

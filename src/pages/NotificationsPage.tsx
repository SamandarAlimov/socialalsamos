import { useState, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  isToday,
  isYesterday,
  isThisWeek,
  isThisMonth,
  differenceInMinutes,
} from 'date-fns';
import { useTranslation } from 'react-i18next';
import { formatRelative, formatDate } from '@/lib/i18n-format';
import {
  Heart,
  MessageCircle,
  UserPlus,
  AtSign,
  Check,
  X,
  Bell,
  BellOff,
  Settings,
  Trash2,
  MoreHorizontal,
  ChevronRight,
  Users,
  Image as ImageIcon,
  Play,
  Loader2,
  AlertCircle,
  RefreshCw,
} from 'lucide-react';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useNotifications, Notification } from '@/hooks/useNotifications';
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
import { toast } from 'sonner';

type NotificationFilter =
  | 'all'
  | 'likes'
  | 'comments'
  | 'follows'
  | 'mentions'
  | 'collaborations';

const FILTER_LABELS: Record<NotificationFilter, string> = {
  all: 'Hammasi',
  likes: 'Yoqtirishlar',
  comments: 'Izohlar',
  follows: 'Obunalar',
  mentions: 'Eslatishlar',
  collaborations: 'Hammualliflik',
};

const FILTER_EMPTY_TEXT: Record<NotificationFilter, string> = {
  all: 'Kimdir postingizni yoqtirsa, izoh qoldirsa yoki sizga obuna bo‘lsa — shu yerda ko‘rinadi.',
  likes: 'Hozircha yoqtirishlar yo‘q.',
  comments: 'Hozircha izohlar yo‘q.',
  follows: 'Hozircha yangi obunachilar yo‘q.',
  mentions: 'Hozircha sizni hech kim eslatib o‘tmagan.',
  collaborations: 'Hozircha hammualliflik takliflari yo‘q.',
};

const COLLABORATION_TYPES: Notification['type'][] = [
  'collaboration_invite',
  'collaboration_accepted',
  'collaboration_declined',
  'collaboration_revoked',
  'collaboration_removed',
  'collaboration_left',
];

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
  }>;
}

interface TimeGroupedNotifications {
  today: GroupedNotification[];
  yesterday: GroupedNotification[];
  thisWeek: GroupedNotification[];
  thisMonth: GroupedNotification[];
  older: GroupedNotification[];
}

const NotificationIcon = ({ type }: { type: Notification['type'] }) => {
  const iconClass = 'h-4 w-4 text-white';

  switch (type) {
    case 'like':
      return (
        <div className="h-7 w-7 rounded-full bg-gradient-to-br from-red-500 to-pink-500 flex items-center justify-center ring-2 ring-background">
          <Heart className={iconClass} fill="currentColor" />
        </div>
      );
    case 'comment':
      return (
        <div className="h-7 w-7 rounded-full bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center ring-2 ring-background">
          <MessageCircle className={iconClass} fill="currentColor" />
        </div>
      );
    case 'follow':
      return (
        <div className="h-7 w-7 rounded-full bg-gradient-to-br from-green-500 to-emerald-500 flex items-center justify-center ring-2 ring-background">
          <UserPlus className={iconClass} />
        </div>
      );
    case 'mention':
      return (
        <div className="h-7 w-7 rounded-full bg-gradient-to-br from-purple-500 to-violet-500 flex items-center justify-center ring-2 ring-background">
          <AtSign className={iconClass} />
        </div>
      );
    case 'collaboration_invite':
    case 'collaboration_accepted':
    case 'collaboration_declined':
    case 'collaboration_revoked':
    case 'collaboration_removed':
    case 'collaboration_left':
      return (
        <div className="h-7 w-7 rounded-full bg-gradient-to-br from-orange-500 to-amber-500 flex items-center justify-center ring-2 ring-background">
          <Users className={iconClass} />
        </div>
      );
    default:
      return (
        <div className="h-7 w-7 rounded-full bg-primary flex items-center justify-center ring-2 ring-background">
          <Bell className={iconClass} />
        </div>
      );
  }
};

/**
 * Post rasmi o'chirilgan yoki video bo'lsa ham sahifa buzilmasligi uchun
 * xavfsiz thumbnail. Ilgari <img alt="Post"> ishlatilgani uchun rasm
 * yuklanmasa ro'yxatda "Post" degan buzilgan matn ko'rinardi.
 */
function PostThumbnail({
  url,
  onClick,
}: {
  url: string;
  onClick: (event: React.MouseEvent) => void;
}) {
  const [failed, setFailed] = useState(false);
  const isVideo = VIDEO_PATTERN.test(url);
  const baseClass =
    'relative flex-shrink-0 h-14 w-14 rounded-xl overflow-hidden bg-muted flex items-center justify-center transition-transform hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

  if (failed) {
    return (
      <button type="button" onClick={onClick} className={baseClass} aria-label="Postni ochish">
        <ImageIcon className="h-5 w-5 text-muted-foreground" />
      </button>
    );
  }

  return (
    <button type="button" onClick={onClick} className={baseClass} aria-label="Postni ochish">
      {isVideo ? (
        <>
          <video
            src={url}
            className="h-full w-full object-cover"
            muted
            playsInline
            preload="metadata"
            onError={() => setFailed(true)}
          />
          <span className="absolute inset-0 flex items-center justify-center bg-black/30">
            <Play className="h-4 w-4 text-white" fill="currentColor" />
          </span>
        </>
      ) : (
        <img
          src={url}
          alt=""
          loading="lazy"
          decoding="async"
          className="h-full w-full object-cover"
          onError={() => setFailed(true)}
        />
      )}
    </button>
  );
}

// 30 daqiqalik oyna ichida bir xil tur va bir xil post bo'yicha guruhlash
function consolidateNotifications(notifications: Notification[]): GroupedNotification[] {
  const groups: Map<string, GroupedNotification> = new Map();
  const CONSOLIDATION_WINDOW_MINUTES = 30;

  const sorted = [...notifications].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  );

  sorted.forEach((notification) => {
    const data = notification.data as Record<string, unknown>;
    const postId = typeof data?.post_id === 'string' ? (data.post_id as string) : undefined;
    const actor = notification.actor;
    const post = notification.post;

    const postThumbnail = post?.media_urls?.find(
      (media) => typeof media === 'string' && media.length > 0,
    );

    const baseGroupKey =
      notification.type === 'follow'
        ? `follow-${notification.type}`
        : `${notification.type}-${postId || 'no-post'}`;
    const canConsolidate =
      notification.type === 'like' ||
      notification.type === 'comment' ||
      notification.type === 'follow' ||
      notification.type === 'mention';
    const groupKey = canConsolidate ? baseGroupKey : `${baseGroupKey}-${notification.id}`;

    const existing = groups.get(groupKey);

    if (existing) {
      const timeDiff = differenceInMinutes(
        new Date(existing.latestAt),
        new Date(notification.created_at),
      );

      if (timeDiff <= CONSOLIDATION_WINDOW_MINUTES) {
        if (actor && !existing.actors.find((a) => a.id === actor.id)) {
          existing.actors.push({
            id: actor.id,
            username: actor.username,
            displayName: actor.display_name,
            avatar: actor.avatar_url,
          });
        }
        existing.notifications.push(notification);
        if (!existing.postThumbnail && postThumbnail) {
          existing.postThumbnail = postThumbnail;
        }
        return;
      }
    }

    groups.set(groupKey, {
      id: notification.id,
      type: notification.type,
      notifications: [notification],
      latestAt: notification.created_at,
      postId,
      postThumbnail,
      actors: actor
        ? [
            {
              id: actor.id,
              username: actor.username,
              displayName: actor.display_name,
              avatar: actor.avatar_url,
            },
          ]
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
  index,
}: {
  group: GroupedNotification;
  onMarkAsRead: (id: string) => void;
  onDelete: (id: string) => Promise<void> | void;
  onRespondCollaboration: (collaborationId: string, accept: boolean) => Promise<void>;
  index: number;
}) {
  const navigate = useNavigate();
  const hasUnread = group.notifications.some((n) => !n.is_read);
  const firstActor = group.actors[0];
  const otherActorsCount = Math.max(0, group.actors.length - 1);
  const [collaborationBusy, setCollaborationBusy] = useState<'accept' | 'decline' | null>(null);
  const collaborationId = group.notifications[0]?.data?.collaboration_id as string | undefined;
  const { i18n: i18nInst } = useTranslation();

  const markGroupRead = () => {
    group.notifications.forEach((n) => {
      if (!n.is_read) onMarkAsRead(n.id);
    });
  };

  const openTarget = () => {
    markGroupRead();

    if (group.postId && group.type !== 'follow') {
      navigate(`/home?post=${group.postId}`);
    } else if (group.type === 'follow' && firstActor) {
      navigate(`/user/${firstActor.username || firstActor.id}`);
    }
  };

  const handleActorClick = (event: React.MouseEvent, actor: typeof firstActor) => {
    event.stopPropagation();
    if (!actor) return;
    markGroupRead();
    navigate(`/user/${actor.username || actor.id}`);
  };

  const handlePostClick = (event: React.MouseEvent) => {
    event.stopPropagation();
    if (!group.postId) return;
    markGroupRead();
    navigate(`/home?post=${group.postId}`);
  };

  const handleDelete = async (event: React.MouseEvent) => {
    event.stopPropagation();
    try {
      await Promise.all(group.notifications.map((n) => onDelete(n.id)));
      toast.success('Bildirishnoma o‘chirildi');
    } catch (error) {
      console.error('Bildirishnomani o‘chirish xatosi:', error);
      toast.error('Bildirishnomani o‘chirib bo‘lmadi');
    }
  };

  const handleCollaborationResponse = async (event: React.MouseEvent, accept: boolean) => {
    event.stopPropagation();
    if (!collaborationId || collaborationBusy) return;

    setCollaborationBusy(accept ? 'accept' : 'decline');
    try {
      await onRespondCollaboration(collaborationId, accept);
      toast.success(accept ? 'Hammualliflik qabul qilindi' : 'Taklif rad etildi');
    } catch (error) {
      console.error('Collaboration javob xatosi:', error);
      toast.error('Hammualliflik taklifiga javob berib bo‘lmadi');
    } finally {
      setCollaborationBusy(null);
    }
  };

  const formatTime = (dateStr: string) => {
    const date = new Date(dateStr);
    if (Number.isNaN(date.getTime())) return '';

    const minutesAgo = differenceInMinutes(new Date(), date);
    if (minutesAgo < 1) return 'hozirgina';
    if (minutesAgo < 60) return `${minutesAgo} daqiqa oldin`;
    if (isToday(date)) return formatDate(date, 'HH:mm', i18nInst.language);
    return formatRelative(date, i18nInst.language);
  };

  const actorName = firstActor?.displayName || firstActor?.username || 'Foydalanuvchi';

  const actionText = (() => {
    switch (group.type) {
      case 'like':
        return 'postingizni yoqtirdi';
      case 'comment':
        return 'postingizga izoh qoldirdi';
      case 'follow':
        return 'sizga obuna bo‘ldi';
      case 'mention':
        return 'sizni eslatib o‘tdi';
      case 'message':
        return 'sizga xabar yubordi';
      case 'collaboration_invite':
        return 'sizni hammualliflikka taklif qildi';
      case 'collaboration_accepted':
        return 'hammualliflik taklifingizni qabul qildi';
      case 'collaboration_declined':
        return 'hammualliflik taklifingizni rad etdi';
      case 'collaboration_revoked':
        return 'hammualliflik taklifini bekor qildi';
      case 'collaboration_removed':
        return 'sizni hammualliflikdan olib tashladi';
      case 'collaboration_left':
        return 'post hammuallifligidan chiqdi';
      default:
        return '';
    }
  })();

  const othersText =
    otherActorsCount > 0
      ? otherActorsCount === 1
        ? ' va yana 1 kishi'
        : ` va yana ${otherActorsCount} kishi`
      : '';

  const ariaLabel = `${actorName}${othersText} ${actionText}, ${formatTime(group.latestAt)}`;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, delay: Math.min(index, 8) * 0.03 }}
      role="button"
      tabIndex={0}
      aria-label={ariaLabel}
      className={cn(
        'group relative flex items-start gap-3 p-4 cursor-pointer transition-colors duration-150',
        'hover:bg-accent/50 focus-visible:outline-none focus-visible:bg-accent/60',
        hasUnread && 'bg-primary/5 dark:bg-primary/10',
      )}
      onClick={openTarget}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          openTarget();
        }
      }}
    >
      {hasUnread && (
        <span
          aria-hidden
          className="absolute left-0 top-0 h-full w-0.5 bg-primary"
        />
      )}

      {/* Avatarlar */}
      <div className="relative flex-shrink-0">
        {group.actors.length > 1 ? (
          <div className="relative h-12 w-16">
            {group.actors.slice(0, 3).map((actor, i) => (
              <Avatar
                key={actor.id}
                className={cn(
                  'h-10 w-10 absolute border-2 border-background cursor-pointer transition-transform hover:z-10 hover:scale-105',
                  i === 0 && 'left-0 top-0 z-[3]',
                  i === 1 && 'left-4 top-1 z-[2]',
                  i === 2 && 'left-8 top-0 z-[1]',
                )}
                onClick={(event) => handleActorClick(event, actor)}
              >
                <AvatarImage src={actor.avatar || undefined} className="object-cover" />
                <AvatarFallback className="bg-muted text-sm font-medium">
                  {(actor.displayName || actor.username || '?').charAt(0).toUpperCase()}
                </AvatarFallback>
              </Avatar>
            ))}
            {group.actors.length > 3 && (
              <div className="absolute left-12 top-1 h-8 w-8 rounded-full bg-muted flex items-center justify-center text-xs font-semibold border-2 border-background z-[4]">
                +{group.actors.length - 3}
              </div>
            )}
          </div>
        ) : (
          <div
            className="relative cursor-pointer"
            onClick={(event) => handleActorClick(event, firstActor)}
          >
            <Avatar className="h-12 w-12">
              <AvatarImage src={firstActor?.avatar || undefined} className="object-cover" />
              <AvatarFallback className="bg-muted text-sm font-medium">
                {(firstActor?.displayName || firstActor?.username || '?')
                  .charAt(0)
                  .toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <div className="absolute -bottom-1 -right-1">
              <NotificationIcon type={group.type} />
            </div>
          </div>
        )}
      </div>

      {/* Matn */}
      <div className="flex-1 min-w-0 pt-0.5">
        <p className="text-sm leading-snug">
          <span
            className="font-semibold text-foreground hover:underline"
            onClick={(event) => handleActorClick(event, firstActor)}
          >
            {actorName}
          </span>
          <span className="text-muted-foreground">
            {othersText} {actionText}
          </span>
        </p>
        <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1.5">
          <span>{formatTime(group.latestAt)}</span>
          {hasUnread && <span className="h-1.5 w-1.5 rounded-full bg-primary" />}
        </p>

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
              {collaborationBusy === 'accept' ? 'Qabul qilinmoqda...' : 'Qabul qilish'}
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
              {collaborationBusy === 'decline' ? 'Rad etilmoqda...' : 'Rad etish'}
            </Button>
            {group.postId && (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="h-8 rounded-full px-3"
                onClick={handlePostClick}
              >
                Postni ko‘rish
              </Button>
            )}
          </div>
        )}
      </div>

      {/* Post rasmi */}
      {group.postThumbnail && (
        <PostThumbnail url={group.postThumbnail} onClick={handlePostClick} />
      )}

      {!group.postThumbnail &&
        group.postId &&
        (group.type === 'like' || group.type === 'comment' || group.type === 'mention') && (
          <Button
            variant="ghost"
            size="icon"
            aria-label="Postni ochish"
            className="flex-shrink-0 h-10 w-10 rounded-full"
            onClick={handlePostClick}
          >
            <ChevronRight className="h-5 w-5 text-muted-foreground" />
          </Button>
        )}

      {group.type === 'follow' && firstActor && (
        <Button
          variant="secondary"
          size="sm"
          className="flex-shrink-0 rounded-full px-4"
          onClick={(event) => handleActorClick(event, firstActor)}
        >
          Profil
        </Button>
      )}

      {/* Qo'shimcha amallar */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Boshqa amallar"
            className="flex-shrink-0 h-8 w-8 opacity-60 md:opacity-0 md:group-hover:opacity-100 md:focus-visible:opacity-100 transition-opacity"
            onClick={(event) => event.stopPropagation()}
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
              <Check className="h-4 w-4 mr-2" />
              O‘qilgan deb belgilash
            </DropdownMenuItem>
          )}
          <DropdownMenuItem
            onClick={(event) => void handleDelete(event)}
            className="text-destructive focus:text-destructive"
          >
            <Trash2 className="h-4 w-4 mr-2" />
            O‘chirish
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </motion.div>
  );
}

function NotificationGroup({
  title,
  groups,
  onMarkAsRead,
  onDelete,
  onRespondCollaboration,
  startIndex,
}: {
  title: string;
  groups: GroupedNotification[];
  onMarkAsRead: (id: string) => void;
  onDelete: (id: string) => Promise<void> | void;
  onRespondCollaboration: (collaborationId: string, accept: boolean) => Promise<void>;
  startIndex: number;
}) {
  if (groups.length === 0) return null;

  return (
    <section aria-label={title}>
      <div className="sticky top-0 z-10 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/70">
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-4 py-2.5">
          {title}
        </h3>
      </div>
      <div className="divide-y divide-border/50">
        {groups.map((group, i) => (
          <GroupedNotificationItem
            key={group.id}
            group={group}
            onMarkAsRead={onMarkAsRead}
            onDelete={onDelete}
            onRespondCollaboration={onRespondCollaboration}
            index={startIndex + i}
          />
        ))}
      </div>
    </section>
  );
}

function NotificationSkeleton() {
  return (
    <div className="flex items-start gap-3 p-4">
      <Skeleton className="h-12 w-12 rounded-full" />
      <div className="flex-1 space-y-2">
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-3 w-1/4" />
      </div>
      <Skeleton className="h-14 w-14 rounded-xl" />
    </div>
  );
}

function PushNotificationBanner() {
  const { permission, supported, requestPermission } = useNotificationPermission();
  const navigate = useNavigate();
  const [dismissed, setDismissed] = useState(false);

  if (!supported || permission === 'granted' || permission === 'denied' || dismissed) {
    return null;
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      className="mx-4 mt-4 p-4 rounded-2xl border border-primary/20 bg-primary/5"
    >
      <div className="flex items-start gap-3">
        <div className="h-10 w-10 rounded-full bg-primary flex items-center justify-center flex-shrink-0">
          <Bell className="h-5 w-5 text-primary-foreground" />
        </div>
        <div className="flex-1 min-w-0">
          <h4 className="font-semibold text-sm">Push bildirishnomalarni yoqing</h4>
          <p className="text-xs text-muted-foreground mt-0.5">
            Kimdir postingizni yoqtirsa, izoh qoldirsa yoki obuna bo‘lsa — darhol xabar beramiz.
          </p>
          <div className="flex flex-wrap gap-2 mt-3">
            <Button size="sm" className="rounded-full px-4" onClick={requestPermission}>
              Yoqish
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="rounded-full px-4"
              onClick={() => navigate('/settings')}
            >
              Sozlamalar
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="rounded-full px-4 text-muted-foreground"
              onClick={() => setDismissed(true)}
            >
              Keyinroq
            </Button>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

export default function NotificationsPage() {
  const isMobile = useIsMobile();
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
  const [filter, setFilter] = useState<NotificationFilter>('all');
  const [markingAll, setMarkingAll] = useState(false);
  const navigate = useNavigate();

  const handleRefresh = useCallback(async () => {
    await refetch();
  }, [refetch]);

  const handleMarkAllAsRead = useCallback(async () => {
    if (markingAll) return;
    setMarkingAll(true);
    try {
      await markAllAsRead();
      toast.success('Hammasi o‘qilgan deb belgilandi');
    } catch (err) {
      console.error('Hammasini o‘qilgan deb belgilash xatosi:', err);
      toast.error('Bildirishnomalarni belgilab bo‘lmadi');
    } finally {
      setMarkingAll(false);
    }
  }, [markAllAsRead, markingAll]);

  const filteredNotifications = useMemo(() => {
    if (filter === 'all') return notifications;

    const typeMap: Record<NotificationFilter, Notification['type'][]> = {
      all: [],
      likes: ['like'],
      comments: ['comment'],
      follows: ['follow'],
      mentions: ['mention'],
      collaborations: COLLABORATION_TYPES,
    };

    return notifications.filter((n) => typeMap[filter].includes(n.type));
  }, [notifications, filter]);

  const groupedNotifications = useMemo((): TimeGroupedNotifications => {
    const timeGroups: Record<string, Notification[]> = {
      today: [],
      yesterday: [],
      thisWeek: [],
      thisMonth: [],
      older: [],
    };

    filteredNotifications.forEach((notification) => {
      const date = new Date(notification.created_at);
      if (Number.isNaN(date.getTime())) {
        timeGroups.older.push(notification);
        return;
      }

      if (isToday(date)) {
        timeGroups.today.push(notification);
      } else if (isYesterday(date)) {
        timeGroups.yesterday.push(notification);
      } else if (isThisWeek(date, { weekStartsOn: 1 })) {
        timeGroups.thisWeek.push(notification);
      } else if (isThisMonth(date)) {
        timeGroups.thisMonth.push(notification);
      } else {
        timeGroups.older.push(notification);
      }
    });

    return {
      today: consolidateNotifications(timeGroups.today),
      yesterday: consolidateNotifications(timeGroups.yesterday),
      thisWeek: consolidateNotifications(timeGroups.thisWeek),
      thisMonth: consolidateNotifications(timeGroups.thisMonth),
      older: consolidateNotifications(timeGroups.older),
    };
  }, [filteredNotifications]);

  const filterCounts = useMemo(
    () => ({
      all: notifications.length,
      likes: notifications.filter((n) => n.type === 'like').length,
      comments: notifications.filter((n) => n.type === 'comment').length,
      follows: notifications.filter((n) => n.type === 'follow').length,
      mentions: notifications.filter((n) => n.type === 'mention').length,
      collaborations: notifications.filter((n) => COLLABORATION_TYPES.includes(n.type)).length,
    }),
    [notifications],
  );

  let currentIndex = 0;
  const getStartIndex = (groups: GroupedNotification[]) => {
    const start = currentIndex;
    currentIndex += groups.length;
    return start;
  };

  const pageContent = (
    <div className="flex flex-col h-full bg-background pb-20 md:pb-4">
      {/* Sarlavha */}
      <div className="sticky top-0 z-20 bg-background/95 backdrop-blur-xl supports-[backdrop-filter]:bg-background/80 border-b">
        <div className="flex items-center justify-between px-4 py-4">
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-bold">Bildirishnomalar</h1>
            {unreadCount > 0 && (
              <Badge variant="default" className="rounded-full px-2.5 py-0.5 text-xs">
                {unreadCount > 99 ? '99+' : unreadCount}
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-1">
            {unreadCount > 0 && (
              <Button
                variant="ghost"
                size="sm"
                disabled={markingAll}
                onClick={() => void handleMarkAllAsRead()}
                className="text-primary hover:text-primary hover:bg-primary/10 rounded-full"
              >
                {markingAll ? (
                  <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                ) : (
                  <Check className="h-4 w-4 mr-1.5" />
                )}
                <span className="hidden sm:inline">Hammasini o‘qildi</span>
                <span className="sm:hidden">O‘qildi</span>
              </Button>
            )}
            <Button
              variant="ghost"
              size="icon"
              aria-label="Bildirishnoma sozlamalari"
              className="rounded-full"
              onClick={() => navigate('/settings')}
            >
              <Settings className="h-5 w-5" />
            </Button>
          </div>
        </div>

        {/* Filtrlar */}
        <div className="px-4 pb-3">
          <div className="flex gap-2 overflow-x-auto scrollbar-hide pb-1">
            {(
              ['all', 'likes', 'comments', 'follows', 'mentions', 'collaborations'] as NotificationFilter[]
            ).map((f) => {
              const isActive = filter === f;
              const count = filterCounts[f];

              return (
                <button
                  key={f}
                  type="button"
                  aria-pressed={isActive}
                  onClick={() => setFilter(f)}
                  className={cn(
                    'px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-colors',
                    isActive
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted text-muted-foreground hover:bg-accent hover:text-accent-foreground',
                  )}
                >
                  {FILTER_LABELS[f]}
                  {count > 0 && (
                    <span className={cn('ml-1.5 text-xs', isActive ? 'opacity-80' : 'opacity-60')}>
                      {count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <PushNotificationBanner />

      {/* Ro'yxat */}
      <ScrollArea className="flex-1">
        {loading ? (
          <div className="divide-y divide-border/50">
            {Array.from({ length: 5 }).map((_, i) => (
              <NotificationSkeleton key={i} />
            ))}
          </div>
        ) : error && notifications.length === 0 ? (
          <div className="p-8 text-center">
            <div className="h-16 w-16 rounded-full bg-destructive/10 flex items-center justify-center mx-auto mb-4">
              <AlertCircle className="h-8 w-8 text-destructive" />
            </div>
            <h3 className="font-semibold text-base">{error}</h3>
            <p className="text-muted-foreground text-sm mt-2 max-w-xs mx-auto">
              Internet aloqangizni tekshirib, qaytadan urinib ko‘ring.
            </p>
            <Button className="mt-4 rounded-full" onClick={() => void refetch()}>
              <RefreshCw className="h-4 w-4 mr-2" />
              Qayta urinish
            </Button>
          </div>
        ) : filteredNotifications.length === 0 ? (
          <div className="p-8 text-center">
            <div className="h-20 w-20 rounded-full bg-muted flex items-center justify-center mx-auto mb-4">
              <BellOff className="h-10 w-10 text-muted-foreground/50" />
            </div>
            <h3 className="font-semibold text-lg">Bildirishnomalar yo‘q</h3>
            <p className="text-muted-foreground text-sm mt-2 max-w-xs mx-auto">
              {FILTER_EMPTY_TEXT[filter]}
            </p>
            {filter !== 'all' && (
              <Button
                variant="ghost"
                className="mt-4 rounded-full"
                onClick={() => setFilter('all')}
              >
                Hammasini ko‘rsatish
              </Button>
            )}
          </div>
        ) : (
          <div className="pb-24">
            {error && (
              <div className="mx-4 mt-3 flex items-center gap-2 rounded-xl border border-destructive/20 bg-destructive/5 px-3 py-2 text-xs text-destructive">
                <AlertCircle className="h-4 w-4 flex-shrink-0" />
                <span className="flex-1">{error}</span>
                <button
                  type="button"
                  className="font-semibold underline"
                  onClick={() => void refetch()}
                >
                  Yangilash
                </button>
              </div>
            )}

            <NotificationGroup
              title="Bugun"
              groups={groupedNotifications.today}
              onMarkAsRead={markAsRead}
              onDelete={deleteNotification}
              onRespondCollaboration={respondToCollaboration}
              startIndex={getStartIndex(groupedNotifications.today)}
            />
            <NotificationGroup
              title="Kecha"
              groups={groupedNotifications.yesterday}
              onMarkAsRead={markAsRead}
              onDelete={deleteNotification}
              onRespondCollaboration={respondToCollaboration}
              startIndex={getStartIndex(groupedNotifications.yesterday)}
            />
            <NotificationGroup
              title="Shu hafta"
              groups={groupedNotifications.thisWeek}
              onMarkAsRead={markAsRead}
              onDelete={deleteNotification}
              onRespondCollaboration={respondToCollaboration}
              startIndex={getStartIndex(groupedNotifications.thisWeek)}
            />
            <NotificationGroup
              title="Shu oy"
              groups={groupedNotifications.thisMonth}
              onMarkAsRead={markAsRead}
              onDelete={deleteNotification}
              onRespondCollaboration={respondToCollaboration}
              startIndex={getStartIndex(groupedNotifications.thisMonth)}
            />
            <NotificationGroup
              title="Avvalroq"
              groups={groupedNotifications.older}
              onMarkAsRead={markAsRead}
              onDelete={deleteNotification}
              onRespondCollaboration={respondToCollaboration}
              startIndex={getStartIndex(groupedNotifications.older)}
            />

            {hasMore && (
              <div className="flex justify-center py-6">
                <Button
                  variant="outline"
                  className="rounded-full px-6"
                  disabled={isLoadingMore}
                  onClick={() => void loadMore()}
                >
                  {isLoadingMore ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Yuklanmoqda...
                    </>
                  ) : (
                    'Ko‘proq yuklash'
                  )}
                </Button>
              </div>
            )}
          </div>
        )}
      </ScrollArea>
    </div>
  );

  if (isMobile) {
    return (
      <PullToRefresh onRefresh={handleRefresh} className="h-full">
        {pageContent}
      </PullToRefresh>
    );
  }

  return pageContent;
}

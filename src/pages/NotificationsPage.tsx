import { useState, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { formatDistanceToNow, isToday, isYesterday, isThisWeek, isThisMonth, differenceInMinutes, format } from 'date-fns';
import { Heart, MessageCircle, UserPlus, AtSign, Check, Bell, BellOff, Settings, Trash2, MoreHorizontal, ChevronRight, Sparkles, Users } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
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

type NotificationFilter = 'all' | 'likes' | 'comments' | 'follows' | 'mentions' | 'collaborations';

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

const NotificationIcon = ({ type, className, size = 'default' }: { type: Notification['type']; className?: string; size?: 'default' | 'large' }) => {
  const sizeClass = size === 'large' ? 'h-5 w-5' : 'h-4 w-4';
  const iconClass = cn(sizeClass, className);
  
  switch (type) {
    case 'like':
      return (
        <div className="h-8 w-8 rounded-full bg-gradient-to-br from-red-500 to-pink-500 flex items-center justify-center shadow-lg shadow-red-500/25">
          <Heart className={cn(iconClass, 'text-white')} fill="currentColor" />
        </div>
      );
    case 'comment':
      return (
        <div className="h-8 w-8 rounded-full bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center shadow-lg shadow-blue-500/25">
          <MessageCircle className={cn(iconClass, 'text-white')} fill="currentColor" />
        </div>
      );
    case 'follow':
      return (
        <div className="h-8 w-8 rounded-full bg-gradient-to-br from-green-500 to-emerald-500 flex items-center justify-center shadow-lg shadow-green-500/25">
          <UserPlus className={cn(iconClass, 'text-white')} />
        </div>
      );
    case 'mention':
      return (
        <div className="h-8 w-8 rounded-full bg-gradient-to-br from-purple-500 to-violet-500 flex items-center justify-center shadow-lg shadow-purple-500/25">
          <AtSign className={cn(iconClass, 'text-white')} />
        </div>
      );
    case 'collaboration_invite':
    case 'collaboration_accepted':
      return (
        <div className="h-8 w-8 rounded-full bg-gradient-to-br from-orange-500 to-amber-500 flex items-center justify-center shadow-lg shadow-orange-500/25">
          <Users className={cn(iconClass, 'text-white')} />
        </div>
      );
    default:
      return (
        <div className="h-8 w-8 rounded-full bg-gradient-to-br from-primary to-primary/80 flex items-center justify-center">
          <Bell className={iconClass} />
        </div>
      );
  }
};

// Group notifications by type and post within a timeframe (30 minutes)
function consolidateNotifications(notifications: Notification[]): GroupedNotification[] {
  const groups: Map<string, GroupedNotification> = new Map();
  const CONSOLIDATION_WINDOW_MINUTES = 30;
  
  const sorted = [...notifications].sort((a, b) => 
    new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );
  
  sorted.forEach((notification) => {
    const data = notification.data as Record<string, unknown>;
    const postId = data?.post_id as string | undefined;
    const actor = notification.actor;
    const post = notification.post;
    
    const postThumbnail = post?.media_urls?.[0];
    
    const groupKey = notification.type === 'follow' 
      ? `follow-${notification.type}`
      : `${notification.type}-${postId || 'no-post'}`;
    
    const existing = groups.get(groupKey);
    
    if (existing) {
      const timeDiff = differenceInMinutes(
        new Date(existing.latestAt),
        new Date(notification.created_at)
      );
      
      if (timeDiff <= CONSOLIDATION_WINDOW_MINUTES && actor) {
        if (!existing.actors.find(a => a.id === actor.id)) {
          existing.actors.push({
            id: actor.id,
            username: actor.username,
            displayName: actor.display_name,
            avatar: actor.avatar_url,
          });
        }
        existing.notifications.push(notification);
        return;
      }
    }
    
    groups.set(`${groupKey}-${notification.id}`, {
      id: notification.id,
      type: notification.type,
      notifications: [notification],
      latestAt: notification.created_at,
      postId,
      postThumbnail,
      actors: actor ? [{
        id: actor.id,
        username: actor.username,
        displayName: actor.display_name,
        avatar: actor.avatar_url,
      }] : [],
    });
  });
  
  return Array.from(groups.values()).sort((a, b) => 
    new Date(b.latestAt).getTime() - new Date(a.latestAt).getTime()
  );
}

function GroupedNotificationItem({ 
  group, 
  onMarkAsRead,
  onDelete,
  index,
}: { 
  group: GroupedNotification;
  onMarkAsRead: (id: string) => void;
  onDelete: (id: string) => void;
  index: number;
}) {
  const navigate = useNavigate();
  const hasUnread = group.notifications.some(n => !n.is_read);
  const firstActor = group.actors[0];
  const otherActorsCount = group.actors.length - 1;
  
  const handleItemClick = () => {
    group.notifications.forEach(n => {
      if (!n.is_read) onMarkAsRead(n.id);
    });
    
    if ((group.type === 'like' || group.type === 'comment' || group.type === 'mention') && group.postId) {
      navigate(`/home?post=${group.postId}`);
    } else if (group.type === 'follow' && firstActor) {
      navigate(`/user/${firstActor.username || firstActor.id}`);
    }
  };
  
  const handleActorClick = (e: React.MouseEvent, actor: typeof firstActor) => {
    e.stopPropagation();
    if (actor) {
      group.notifications.forEach(n => {
        if (!n.is_read) onMarkAsRead(n.id);
      });
      navigate(`/user/${actor.username || actor.id}`);
    }
  };
  
  const handlePostClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (group.postId) {
      group.notifications.forEach(n => {
        if (!n.is_read) onMarkAsRead(n.id);
      });
      navigate(`/home?post=${group.postId}`);
    }
  };
  
  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    group.notifications.forEach(n => onDelete(n.id));
  };

  const formatTime = (dateStr: string) => {
    const date = new Date(dateStr);
    if (isToday(date)) {
      return format(date, 'HH:mm');
    }
    return formatDistanceToNow(date, { addSuffix: true });
  };
  
  const getNotificationText = () => {
    const actorName = firstActor?.displayName || firstActor?.username;
    
  const usernameElement = actorName ? (
      <span 
        className="font-semibold text-foreground hover:underline cursor-pointer"
        onClick={(e) => {
          e.stopPropagation();
          if (firstActor) navigate(`/user/${firstActor.username || firstActor.id}`);
        }}
      >
        {actorName}
      </span>
    ) : (
      <span className="font-semibold">Someone</span>
    );
    
    if (otherActorsCount > 0) {
      const othersText = otherActorsCount === 1 
        ? 'and 1 other' 
        : `and ${otherActorsCount} others`;
      
      switch (group.type) {
        case 'like':
          return <>{usernameElement} <span className="text-muted-foreground">{othersText} liked your post</span></>;
        case 'comment':
          return <>{usernameElement} <span className="text-muted-foreground">{othersText} commented on your post</span></>;
        case 'follow':
          return <>{usernameElement} <span className="text-muted-foreground">{othersText} started following you</span></>;
        case 'mention':
          return <>{usernameElement} <span className="text-muted-foreground">{othersText} mentioned you</span></>;
        default:
          return <>{usernameElement} <span className="text-muted-foreground">{othersText}</span></>;
      }
    }
    
    switch (group.type) {
      case 'like':
        return <>{usernameElement} <span className="text-muted-foreground">liked your post</span></>;
      case 'comment':
        return <>{usernameElement} <span className="text-muted-foreground">commented on your post</span></>;
      case 'follow':
        return <>{usernameElement} <span className="text-muted-foreground">started following you</span></>;
      case 'mention':
        return <>{usernameElement} <span className="text-muted-foreground">mentioned you</span></>;
      case 'collaboration_invite':
        return <>{usernameElement} <span className="text-muted-foreground">wants to collaborate with you</span></>;
      case 'collaboration_accepted':
        return <>{usernameElement} <span className="text-muted-foreground">accepted your collaboration request</span></>;
      default:
        return usernameElement;
    }
  };
  
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: index * 0.05 }}
      className={cn(
        'group flex items-start gap-3 p-4 cursor-pointer transition-all duration-200',
        'hover:bg-accent/50 active:scale-[0.99]',
        hasUnread && 'bg-primary/5 dark:bg-primary/10'
      )}
      onClick={handleItemClick}
    >
      {/* Avatar section */}
      <div className="relative flex-shrink-0">
        {group.actors.length > 1 ? (
          <div className="relative h-12 w-16">
            {group.actors.slice(0, 3).map((actor, i) => (
              <Avatar 
                key={actor.id} 
                className={cn(
                  'h-10 w-10 absolute border-2 border-background cursor-pointer hover:z-10 transition-transform hover:scale-110',
                  i === 0 && 'left-0 top-0 z-[3]',
                  i === 1 && 'left-4 top-1 z-[2]',
                  i === 2 && 'left-8 top-0 z-[1]'
                )}
                onClick={(e) => handleActorClick(e, actor)}
              >
                <AvatarImage src={actor.avatar || undefined} className="object-cover" />
                <AvatarFallback className="bg-gradient-to-br from-primary/20 to-primary/10 text-sm font-medium">
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
            className="relative cursor-pointer group/avatar"
            onClick={(e) => handleActorClick(e, firstActor)}
          >
            <Avatar className="h-12 w-12 ring-2 ring-transparent group-hover/avatar:ring-primary/20 transition-all">
              <AvatarImage src={firstActor?.avatar || undefined} className="object-cover" />
              <AvatarFallback className="bg-gradient-to-br from-primary/20 to-primary/10 text-sm font-medium">
                {(firstActor?.displayName || firstActor?.username || '?').charAt(0).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <div className="absolute -bottom-1 -right-1">
              <NotificationIcon type={group.type} size="default" />
            </div>
          </div>
        )}
      </div>
      
      {/* Content */}
      <div className="flex-1 min-w-0 pt-0.5">
        <p className="text-sm leading-snug">
          {getNotificationText()}
        </p>
        <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1.5">
          <span>{formatTime(group.latestAt)}</span>
          {hasUnread && (
            <span className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
          )}
        </p>
      </div>
      
      {/* Post thumbnail */}
      {group.postThumbnail && (
        <div 
          className="flex-shrink-0 h-14 w-14 rounded-xl overflow-hidden bg-muted cursor-pointer hover:opacity-90 transition-all hover:scale-105 shadow-md"
          onClick={handlePostClick}
        >
          <img 
            src={group.postThumbnail} 
            alt="Post" 
            className="h-full w-full object-cover"
          />
        </div>
      )}
      
      {/* Action button for posts without thumbnail */}
      {!group.postThumbnail && (group.type === 'like' || group.type === 'comment' || group.type === 'mention') && group.postId && (
        <Button 
          variant="ghost" 
          size="icon"
          className="flex-shrink-0 h-10 w-10 rounded-full hover:bg-primary/10"
          onClick={handlePostClick}
        >
          <ChevronRight className="h-5 w-5 text-muted-foreground" />
        </Button>
      )}
      
      {/* Follow button */}
      {group.type === 'follow' && (
        <Button 
          variant="default" 
          size="sm" 
          className="flex-shrink-0 rounded-full px-4 bg-gradient-to-r from-primary to-primary/80 hover:from-primary/90 hover:to-primary/70 shadow-lg shadow-primary/25"
          onClick={(e) => {
            e.stopPropagation();
            if (firstActor) {
              navigate(`/user/${firstActor.username || firstActor.id}`);
            }
          }}
        >
          View
        </Button>
      )}
      
      {/* More options */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button 
            variant="ghost" 
            size="icon" 
            className="flex-shrink-0 h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity"
            onClick={(e) => e.stopPropagation()}
          >
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          {hasUnread && (
            <DropdownMenuItem onClick={(e) => {
              e.stopPropagation();
              group.notifications.forEach(n => onMarkAsRead(n.id));
            }}>
              <Check className="h-4 w-4 mr-2" />
              Mark as read
            </DropdownMenuItem>
          )}
          <DropdownMenuItem 
            onClick={handleDelete}
            className="text-destructive focus:text-destructive"
          >
            <Trash2 className="h-4 w-4 mr-2" />
            Delete
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
  startIndex,
}: { 
  title: string;
  groups: GroupedNotification[];
  onMarkAsRead: (id: string) => void;
  onDelete: (id: string) => void;
  startIndex: number;
}) {
  if (groups.length === 0) return null;
  
  return (
    <div>
      <div className="sticky top-0 z-10 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-4 py-3 flex items-center gap-2">
          <Sparkles className="h-3 w-3" />
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
            index={startIndex + i}
          />
        ))}
      </div>
    </div>
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
  
  if (!supported || permission === 'granted') return null;
  
  return (
    <motion.div
      initial={{ opacity: 0, y: -20 }}
      animate={{ opacity: 1, y: 0 }}
      className="mx-4 mt-4 p-4 rounded-2xl bg-gradient-to-r from-primary/10 via-primary/5 to-transparent border border-primary/20"
    >
      <div className="flex items-start gap-3">
        <div className="h-10 w-10 rounded-full bg-gradient-to-br from-primary to-primary/80 flex items-center justify-center shadow-lg shadow-primary/25">
          <Bell className="h-5 w-5 text-white" />
        </div>
        <div className="flex-1">
          <h4 className="font-semibold text-sm">Enable Push Notifications</h4>
          <p className="text-xs text-muted-foreground mt-0.5">
            Stay updated when someone likes, comments, or follows you
          </p>
        </div>
      </div>
      <div className="flex gap-2 mt-3 pl-13">
        <Button 
          size="sm" 
          className="rounded-full px-4 bg-gradient-to-r from-primary to-primary/80"
          onClick={requestPermission}
        >
          Enable
        </Button>
        <Button 
          size="sm" 
          variant="ghost" 
          className="rounded-full px-4"
          onClick={() => navigate('/settings')}
        >
          Settings
        </Button>
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
    markAsRead, 
    markAllAsRead, 
    deleteNotification,
    refetch,
  } = useNotifications();
  const [filter, setFilter] = useState<NotificationFilter>('all');
  const navigate = useNavigate();

  const handleRefresh = useCallback(async () => {
    if (refetch) {
      await refetch();
    }
  }, [refetch]);

  const filteredNotifications = useMemo(() => {
    if (filter === 'all') return notifications;
    
    const typeMap: Record<NotificationFilter, Notification['type'][]> = {
      all: [],
      likes: ['like'],
      comments: ['comment'],
      follows: ['follow'],
      mentions: ['mention'],
      collaborations: ['collaboration_invite', 'collaboration_accepted'],
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
      
      if (isToday(date)) {
        timeGroups.today.push(notification);
      } else if (isYesterday(date)) {
        timeGroups.yesterday.push(notification);
      } else if (isThisWeek(date)) {
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

  const filterCounts = useMemo(() => ({
    all: notifications.length,
    likes: notifications.filter(n => n.type === 'like').length,
    comments: notifications.filter(n => n.type === 'comment').length,
    follows: notifications.filter(n => n.type === 'follow').length,
    mentions: notifications.filter(n => n.type === 'mention').length,
    collaborations: notifications.filter(n => n.type === 'collaboration_invite' || n.type === 'collaboration_accepted').length,
  }), [notifications]);

  // Calculate start indices for animation
  let currentIndex = 0;
  const getStartIndex = (groups: GroupedNotification[]) => {
    const start = currentIndex;
    currentIndex += groups.length;
    return start;
  };

  const pageContent = (
    <div className="flex flex-col h-full bg-background pb-20 md:pb-4">
      {/* Header */}
      <div className="sticky top-0 z-20 bg-background/95 backdrop-blur-xl supports-[backdrop-filter]:bg-background/80 border-b">
        <div className="flex items-center justify-between px-4 py-4">
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-bold bg-gradient-to-r from-foreground to-foreground/70 bg-clip-text">
              Notifications
            </h1>
            {unreadCount > 0 && (
              <Badge variant="default" className="rounded-full px-2.5 py-0.5 text-xs bg-gradient-to-r from-primary to-primary/80 shadow-lg shadow-primary/25">
                {unreadCount}
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-1">
            {unreadCount > 0 && (
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={markAllAsRead}
                className="text-primary hover:text-primary hover:bg-primary/10 rounded-full"
              >
                <Check className="h-4 w-4 mr-1.5" />
                Mark all
              </Button>
            )}
            <Button
              variant="ghost"
              size="icon"
              className="rounded-full"
              onClick={() => navigate('/settings')}
            >
              <Settings className="h-5 w-5" />
            </Button>
          </div>
        </div>
        
        {/* Filter Tabs */}
        <div className="px-4 pb-3">
          <div className="flex gap-2 overflow-x-auto scrollbar-hide pb-1">
            {(['all', 'likes', 'comments', 'follows', 'mentions', 'collaborations'] as NotificationFilter[]).map((f) => {
              const isActive = filter === f;
              const count = filterCounts[f];
              
              return (
                <motion.button
                  key={f}
                  onClick={() => setFilter(f)}
                  whileTap={{ scale: 0.95 }}
                  className={cn(
                    'px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-all duration-200',
                    isActive
                      ? 'bg-gradient-to-r from-primary to-primary/80 text-primary-foreground shadow-lg shadow-primary/25'
                      : 'bg-muted text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                  )}
                >
                  {f.charAt(0).toUpperCase() + f.slice(1)}
                  {count > 0 && (
                    <span className={cn(
                      "ml-1.5 text-xs",
                      isActive ? "opacity-80" : "opacity-60"
                    )}>
                      {count}
                    </span>
                  )}
                </motion.button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Push Notification Banner */}
      <PushNotificationBanner />

      {/* Notifications List */}
      <ScrollArea className="flex-1">
        {loading ? (
          <div className="divide-y divide-border/50">
            {Array.from({ length: 5 }).map((_, i) => (
              <NotificationSkeleton key={i} />
            ))}
          </div>
        ) : filteredNotifications.length === 0 ? (
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="p-8 text-center"
          >
            <div className="h-20 w-20 rounded-full bg-gradient-to-br from-muted to-muted/50 flex items-center justify-center mx-auto mb-4 shadow-inner">
              <BellOff className="h-10 w-10 text-muted-foreground/50" />
            </div>
            <h3 className="font-semibold text-lg">No notifications yet</h3>
            <p className="text-muted-foreground text-sm mt-2 max-w-xs mx-auto">
              When someone interacts with your content, you'll see it here.
            </p>
          </motion.div>
        ) : (
          <div className="pb-24">
            <AnimatePresence>
              <NotificationGroup 
                title="Today" 
                groups={groupedNotifications.today}
                onMarkAsRead={markAsRead}
                onDelete={deleteNotification}
                startIndex={getStartIndex(groupedNotifications.today)}
              />
              <NotificationGroup 
                title="Yesterday" 
                groups={groupedNotifications.yesterday}
                onMarkAsRead={markAsRead}
                onDelete={deleteNotification}
                startIndex={getStartIndex(groupedNotifications.yesterday)}
              />
              <NotificationGroup 
                title="This Week" 
                groups={groupedNotifications.thisWeek}
                onMarkAsRead={markAsRead}
                onDelete={deleteNotification}
                startIndex={getStartIndex(groupedNotifications.thisWeek)}
              />
              <NotificationGroup 
                title="This Month" 
                groups={groupedNotifications.thisMonth}
                onMarkAsRead={markAsRead}
                onDelete={deleteNotification}
                startIndex={getStartIndex(groupedNotifications.thisMonth)}
              />
              <NotificationGroup 
                title="Older" 
                groups={groupedNotifications.older}
                onMarkAsRead={markAsRead}
                onDelete={deleteNotification}
                startIndex={getStartIndex(groupedNotifications.older)}
              />
            </AnimatePresence>
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

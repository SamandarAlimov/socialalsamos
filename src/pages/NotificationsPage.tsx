import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { formatDistanceToNow, isToday, isYesterday, isThisWeek, isThisMonth, differenceInMinutes } from 'date-fns';
import { Heart, MessageCircle, UserPlus, AtSign, Check, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useNotifications, Notification } from '@/hooks/useNotifications';
import { cn } from '@/lib/utils';

type NotificationFilter = 'all' | 'likes' | 'comments' | 'follows' | 'mentions';

interface GroupedNotification {
  id: string;
  type: Notification['type'];
  notifications: Notification[];
  latestAt: string;
  postId?: string;
  postThumbnail?: string;
  actors: Array<{
    id: string;
    username?: string;
    displayName?: string;
    avatar?: string;
  }>;
}

interface TimeGroupedNotifications {
  today: GroupedNotification[];
  yesterday: GroupedNotification[];
  thisWeek: GroupedNotification[];
  thisMonth: GroupedNotification[];
  older: GroupedNotification[];
}

const NotificationIcon = ({ type, className }: { type: Notification['type']; className?: string }) => {
  const iconClass = cn('h-4 w-4', className);
  switch (type) {
    case 'like':
      return <Heart className={cn(iconClass, 'text-red-500')} fill="currentColor" />;
    case 'comment':
      return <MessageCircle className={cn(iconClass, 'text-blue-500')} />;
    case 'follow':
      return <UserPlus className={cn(iconClass, 'text-green-500')} />;
    case 'mention':
      return <AtSign className={cn(iconClass, 'text-purple-500')} />;
    default:
      return <Heart className={iconClass} />;
  }
};

// Group notifications by type and post within a timeframe (30 minutes)
function consolidateNotifications(notifications: Notification[]): GroupedNotification[] {
  const groups: Map<string, GroupedNotification> = new Map();
  const CONSOLIDATION_WINDOW_MINUTES = 30;
  
  // Sort by date descending
  const sorted = [...notifications].sort((a, b) => 
    new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );
  
  sorted.forEach((notification) => {
    const data = notification.data as Record<string, unknown>;
    const postId = data?.post_id as string | undefined;
    const actorId = (data?.liker_id || data?.commenter_id || data?.follower_id || data?.mentioner_id || data?.actor_id) as string;
    
    // Create a key based on type and post (for likes/comments) or just type (for follows)
    const groupKey = notification.type === 'follow' 
      ? `follow-${notification.type}`
      : `${notification.type}-${postId || 'no-post'}`;
    
    const existing = groups.get(groupKey);
    
    if (existing) {
      // Check if within consolidation window
      const timeDiff = differenceInMinutes(
        new Date(existing.latestAt),
        new Date(notification.created_at)
      );
      
      if (timeDiff <= CONSOLIDATION_WINDOW_MINUTES) {
        // Add to existing group if actor not already included
        if (!existing.actors.find(a => a.id === actorId)) {
          existing.actors.push({
            id: actorId,
            username: data?.actor_username as string,
            displayName: data?.actor_display_name as string,
            avatar: data?.actor_avatar as string,
          });
        }
        existing.notifications.push(notification);
        return;
      }
    }
    
    // Create new group
    groups.set(`${groupKey}-${notification.id}`, {
      id: notification.id,
      type: notification.type,
      notifications: [notification],
      latestAt: notification.created_at,
      postId,
      postThumbnail: data?.post_thumbnail as string,
      actors: [{
        id: actorId,
        username: data?.actor_username as string,
        displayName: data?.actor_display_name as string,
        avatar: data?.actor_avatar as string,
      }],
    });
  });
  
  return Array.from(groups.values()).sort((a, b) => 
    new Date(b.latestAt).getTime() - new Date(a.latestAt).getTime()
  );
}

function GroupedNotificationItem({ 
  group, 
  onMarkAsRead, 
}: { 
  group: GroupedNotification;
  onMarkAsRead: (id: string) => void;
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
    } else if (group.type === 'follow' && firstActor?.id) {
      navigate(`/user/${firstActor.id}`);
    }
  };
  
  const handleActorClick = (e: React.MouseEvent, actorId: string) => {
    e.stopPropagation();
    if (actorId) {
      group.notifications.forEach(n => {
        if (!n.is_read) onMarkAsRead(n.id);
      });
      navigate(`/user/${actorId}`);
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
  
  const getNotificationText = () => {
    const actorName = firstActor?.displayName || firstActor?.username || 'Someone';
    
    if (otherActorsCount > 0) {
      const othersText = otherActorsCount === 1 
        ? 'and 1 other' 
        : `and ${otherActorsCount} others`;
      
      switch (group.type) {
        case 'like':
          return <><span className="font-semibold">{actorName}</span> {othersText} liked your post</>;
        case 'comment':
          return <><span className="font-semibold">{actorName}</span> {othersText} commented on your post</>;
        case 'follow':
          return <><span className="font-semibold">{actorName}</span> {othersText} started following you</>;
        case 'mention':
          return <><span className="font-semibold">{actorName}</span> {othersText} mentioned you</>;
        default:
          return <><span className="font-semibold">{actorName}</span> {othersText}</>;
      }
    }
    
    switch (group.type) {
      case 'like':
        return <><span className="font-semibold">{actorName}</span> liked your post</>;
      case 'comment':
        return <><span className="font-semibold">{actorName}</span> commented on your post</>;
      case 'follow':
        return <><span className="font-semibold">{actorName}</span> started following you</>;
      case 'mention':
        return <><span className="font-semibold">{actorName}</span> mentioned you</>;
      default:
        return <span className="font-semibold">{actorName}</span>;
    }
  };
  
  return (
    <div
      className={cn(
        'flex items-start gap-3 p-4 cursor-pointer transition-colors',
        'hover:bg-accent/50',
        hasUnread && 'bg-primary/5'
      )}
      onClick={handleItemClick}
    >
      {/* Avatar stack for grouped notifications */}
      <div className="relative flex-shrink-0">
        {group.actors.length > 1 ? (
          <div className="relative h-11 w-14">
            {/* Show up to 3 stacked avatars */}
            {group.actors.slice(0, 3).map((actor, i) => (
              <Avatar 
                key={actor.id} 
                className={cn(
                  'h-9 w-9 absolute border-2 border-background cursor-pointer hover:z-10',
                  i === 0 && 'left-0 top-0 z-[3]',
                  i === 1 && 'left-3 top-1 z-[2]',
                  i === 2 && 'left-6 top-0 z-[1]'
                )}
                onClick={(e) => handleActorClick(e, actor.id)}
              >
                <AvatarImage src={actor.avatar} />
                <AvatarFallback className="bg-muted text-xs">
                  {(actor.displayName || actor.username || '?').charAt(0).toUpperCase()}
                </AvatarFallback>
              </Avatar>
            ))}
            {group.actors.length > 3 && (
              <div className="absolute left-9 top-1 h-7 w-7 rounded-full bg-muted flex items-center justify-center text-xs font-medium border-2 border-background z-[4]">
                +{group.actors.length - 3}
              </div>
            )}
          </div>
        ) : (
          <div 
            className="relative cursor-pointer hover:opacity-80 transition-opacity"
            onClick={(e) => handleActorClick(e, firstActor?.id)}
          >
            <Avatar className="h-11 w-11">
              <AvatarImage src={firstActor?.avatar} />
              <AvatarFallback className="bg-muted text-xs">
                {(firstActor?.displayName || firstActor?.username || '?').charAt(0).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <div className="absolute -bottom-1 -right-1 h-5 w-5 rounded-full bg-background flex items-center justify-center border-2 border-background">
              <NotificationIcon type={group.type} className="h-3 w-3" />
            </div>
          </div>
        )}
      </div>
      
      {/* Content */}
      <div className="flex-1 min-w-0">
        <p className="text-sm text-muted-foreground">
          {getNotificationText()}
        </p>
        <p className="text-xs text-muted-foreground mt-0.5">
          {formatDistanceToNow(new Date(group.latestAt), { addSuffix: true })}
        </p>
      </div>
      
      {/* Post thumbnail */}
      {group.postThumbnail && (
        <div 
          className="flex-shrink-0 h-11 w-11 rounded-lg overflow-hidden bg-muted cursor-pointer hover:opacity-80 transition-opacity"
          onClick={handlePostClick}
        >
          <img 
            src={group.postThumbnail} 
            alt="Post" 
            className="h-full w-full object-cover"
          />
        </div>
      )}
      
      {/* View button for posts without thumbnail */}
      {!group.postThumbnail && (group.type === 'like' || group.type === 'comment' || group.type === 'mention') && group.postId && (
        <Button 
          variant="outline" 
          size="sm" 
          className="flex-shrink-0 text-xs"
          onClick={handlePostClick}
        >
          View
        </Button>
      )}
      
      {/* View profile for follow notifications */}
      {group.type === 'follow' && (
        <Button 
          variant="default" 
          size="sm" 
          className="flex-shrink-0 text-xs"
          onClick={(e) => {
            e.stopPropagation();
            if (firstActor?.id) {
              navigate(`/user/${firstActor.id}`);
            }
          }}
        >
          {group.actors.length > 1 ? 'View All' : 'View Profile'}
        </Button>
      )}
      
      {/* Unread indicator */}
      {hasUnread && (
        <div className="flex-shrink-0 h-2 w-2 rounded-full bg-primary mt-2" />
      )}
    </div>
  );
}

function NotificationGroup({ 
  title, 
  groups,
  onMarkAsRead,
}: { 
  title: string;
  groups: GroupedNotification[];
  onMarkAsRead: (id: string) => void;
}) {
  if (groups.length === 0) return null;
  
  return (
    <div>
      <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-4 py-2 bg-muted/30">
        {title}
      </h3>
      <div className="divide-y divide-border">
        {groups.map((group) => (
          <GroupedNotificationItem
            key={group.id}
            group={group}
            onMarkAsRead={onMarkAsRead}
          />
        ))}
      </div>
    </div>
  );
}

export default function NotificationsPage() {
  const { 
    notifications, 
    unreadCount, 
    loading, 
    markAsRead, 
    markAllAsRead, 
    deleteNotification 
  } = useNotifications();
  const [filter, setFilter] = useState<NotificationFilter>('all');

  // Filter notifications
  const filteredNotifications = useMemo(() => {
    if (filter === 'all') return notifications;
    
    const typeMap: Record<NotificationFilter, Notification['type'][]> = {
      all: [],
      likes: ['like'],
      comments: ['comment'],
      follows: ['follow'],
      mentions: ['mention'],
    };
    
    return notifications.filter((n) => typeMap[filter].includes(n.type));
  }, [notifications, filter]);

  // Group and consolidate notifications by time
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

    // Consolidate each time group
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
  }), [notifications]);

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 border-b">
        <div className="flex items-center justify-between px-4 py-3">
          <h1 className="text-xl font-bold">Notifications</h1>
          <div className="flex items-center gap-2">
            {unreadCount > 0 && (
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={markAllAsRead}
                className="text-primary"
              >
                <Check className="h-4 w-4 mr-1" />
                Mark all read
              </Button>
            )}
          </div>
        </div>
        
        {/* Filter Tabs */}
        <div className="px-4 pb-2">
          <div className="flex gap-2 overflow-x-auto scrollbar-hide pb-1">
            {(['all', 'likes', 'comments', 'follows', 'mentions'] as NotificationFilter[]).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={cn(
                  'px-3 py-1.5 rounded-full text-sm font-medium whitespace-nowrap transition-colors',
                  filter === f
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted text-muted-foreground hover:bg-accent'
                )}
              >
                {f.charAt(0).toUpperCase() + f.slice(1)}
                {filterCounts[f] > 0 && (
                  <span className="ml-1.5 text-xs opacity-70">
                    {filterCounts[f]}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Notifications List */}
      <ScrollArea className="flex-1">
        {loading ? (
          <div className="p-8 flex items-center justify-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
          </div>
        ) : filteredNotifications.length === 0 ? (
          <div className="p-8 text-center">
            <div className="h-16 w-16 rounded-full bg-muted flex items-center justify-center mx-auto mb-4">
              <Heart className="h-8 w-8 text-muted-foreground" />
            </div>
            <h3 className="font-semibold text-lg">No notifications yet</h3>
            <p className="text-muted-foreground text-sm mt-1">
              When someone likes your posts, comments, or follows you, you'll see it here.
            </p>
          </div>
        ) : (
          <div className="pb-20">
            <NotificationGroup 
              title="Today" 
              groups={groupedNotifications.today}
              onMarkAsRead={markAsRead}
            />
            <NotificationGroup 
              title="Yesterday" 
              groups={groupedNotifications.yesterday}
              onMarkAsRead={markAsRead}
            />
            <NotificationGroup 
              title="This Week" 
              groups={groupedNotifications.thisWeek}
              onMarkAsRead={markAsRead}
            />
            <NotificationGroup 
              title="This Month" 
              groups={groupedNotifications.thisMonth}
              onMarkAsRead={markAsRead}
            />
            <NotificationGroup 
              title="Older" 
              groups={groupedNotifications.older}
              onMarkAsRead={markAsRead}
            />
          </div>
        )}
      </ScrollArea>
    </div>
  );
}

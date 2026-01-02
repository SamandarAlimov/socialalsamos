import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { formatDistanceToNow, format, isToday, isYesterday, isThisWeek, isThisMonth } from 'date-fns';
import { Heart, MessageCircle, UserPlus, AtSign, Check, Settings, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useNotifications, Notification } from '@/hooks/useNotifications';
import { cn } from '@/lib/utils';

type NotificationFilter = 'all' | 'likes' | 'comments' | 'follows' | 'mentions';

interface GroupedNotifications {
  today: Notification[];
  yesterday: Notification[];
  thisWeek: Notification[];
  thisMonth: Notification[];
  older: Notification[];
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

function NotificationItem({ 
  notification, 
  onMarkAsRead, 
  onDelete 
}: { 
  notification: Notification;
  onMarkAsRead: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  const navigate = useNavigate();
  const data = notification.data as Record<string, unknown>;
  
  const handleClick = () => {
    onMarkAsRead(notification.id);
    
    // Navigate based on notification type
    if (notification.type === 'like' || notification.type === 'comment') {
      const postId = data?.post_id as string;
      if (postId) {
        navigate(`/home?post=${postId}`);
      }
    } else if (notification.type === 'follow') {
      const followerId = data?.follower_id as string;
      if (followerId) {
        navigate(`/user/${followerId}`);
      }
    }
  };

  // Get actor info from notification data
  const actorId = (data?.liker_id || data?.commenter_id || data?.follower_id) as string;
  const actorAvatar = data?.actor_avatar as string;
  const postThumbnail = data?.post_thumbnail as string;
  
  return (
    <div
      className={cn(
        'flex items-start gap-3 p-4 cursor-pointer transition-colors',
        'hover:bg-accent/50',
        !notification.is_read && 'bg-primary/5'
      )}
      onClick={handleClick}
    >
      {/* Avatar with notification icon overlay */}
      <div className="relative flex-shrink-0">
        <Avatar className="h-11 w-11">
          <AvatarImage src={actorAvatar} />
          <AvatarFallback className="bg-muted text-xs">
            {notification.title.charAt(0).toUpperCase()}
          </AvatarFallback>
        </Avatar>
        <div className="absolute -bottom-1 -right-1 h-5 w-5 rounded-full bg-background flex items-center justify-center border-2 border-background">
          <NotificationIcon type={notification.type} className="h-3 w-3" />
        </div>
      </div>
      
      {/* Content */}
      <div className="flex-1 min-w-0">
        <p className="text-sm">
          <span className="font-semibold">{notification.title}</span>
          {notification.body && (
            <span className="text-muted-foreground"> {notification.body}</span>
          )}
        </p>
        <p className="text-xs text-muted-foreground mt-0.5">
          {formatDistanceToNow(new Date(notification.created_at), { addSuffix: true })}
        </p>
      </div>
      
      {/* Post thumbnail (for likes/comments) */}
      {postThumbnail && (
        <div className="flex-shrink-0 h-11 w-11 rounded-lg overflow-hidden bg-muted">
          <img 
            src={postThumbnail} 
            alt="Post" 
            className="h-full w-full object-cover"
          />
        </div>
      )}
      
      {/* Unread indicator */}
      {!notification.is_read && (
        <div className="flex-shrink-0 h-2 w-2 rounded-full bg-primary mt-2" />
      )}
    </div>
  );
}

function NotificationGroup({ 
  title, 
  notifications,
  onMarkAsRead,
  onDelete
}: { 
  title: string;
  notifications: Notification[];
  onMarkAsRead: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  if (notifications.length === 0) return null;
  
  return (
    <div>
      <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-4 py-2 bg-muted/30">
        {title}
      </h3>
      <div className="divide-y divide-border">
        {notifications.map((notification) => (
          <NotificationItem
            key={notification.id}
            notification={notification}
            onMarkAsRead={onMarkAsRead}
            onDelete={onDelete}
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

  // Group notifications by time
  const groupedNotifications = useMemo((): GroupedNotifications => {
    const groups: GroupedNotifications = {
      today: [],
      yesterday: [],
      thisWeek: [],
      thisMonth: [],
      older: [],
    };

    filteredNotifications.forEach((notification) => {
      const date = new Date(notification.created_at);
      
      if (isToday(date)) {
        groups.today.push(notification);
      } else if (isYesterday(date)) {
        groups.yesterday.push(notification);
      } else if (isThisWeek(date)) {
        groups.thisWeek.push(notification);
      } else if (isThisMonth(date)) {
        groups.thisMonth.push(notification);
      } else {
        groups.older.push(notification);
      }
    });

    return groups;
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
              notifications={groupedNotifications.today}
              onMarkAsRead={markAsRead}
              onDelete={deleteNotification}
            />
            <NotificationGroup 
              title="Yesterday" 
              notifications={groupedNotifications.yesterday}
              onMarkAsRead={markAsRead}
              onDelete={deleteNotification}
            />
            <NotificationGroup 
              title="This Week" 
              notifications={groupedNotifications.thisWeek}
              onMarkAsRead={markAsRead}
              onDelete={deleteNotification}
            />
            <NotificationGroup 
              title="This Month" 
              notifications={groupedNotifications.thisMonth}
              onMarkAsRead={markAsRead}
              onDelete={deleteNotification}
            />
            <NotificationGroup 
              title="Older" 
              notifications={groupedNotifications.older}
              onMarkAsRead={markAsRead}
              onDelete={deleteNotification}
            />
          </div>
        )}
      </ScrollArea>
    </div>
  );
}

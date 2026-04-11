import { NavLink, useLocation } from 'react-router-dom';
import { Home, MessageCircle, PlusSquare, Video, User } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useUnreadMessages } from '@/hooks/useUnreadMessages';
import { useNotificationSound } from '@/hooks/useNotificationSound';
import { motion, AnimatePresence } from 'framer-motion';
import { useCallback, useRef, useState } from 'react';
import { SwitchAccountDialog } from '@/components/account/SwitchAccountDialog';
import { useAuth } from '@/contexts/AuthContext';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';

interface NavItem {
  icon: React.ElementType;
  label: string;
  path: string;
  badgeKey?: 'messages';
}

const bottomNavItems: NavItem[] = [
  { icon: Home, label: 'Home', path: '/home' },
  { icon: MessageCircle, label: 'Messages', path: '/messages', badgeKey: 'messages' },
  { icon: PlusSquare, label: 'Create', path: '/create' },
  { icon: Video, label: 'Videos', path: '/videos' },
  { icon: User, label: 'Profile', path: '/profile' },
];

export function BottomNavbar() {
  const location = useLocation();
  const { profile } = useAuth();
  const { playMessageSound } = useNotificationSound();
  const [switchAccountOpen, setSwitchAccountOpen] = useState(false);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isLongPress = useRef(false);
  
  const handleNewMessage = useCallback(() => {
    playMessageSound();
  }, [playMessageSound]);
  
  const { unreadCount: messagesUnreadCount } = useUnreadMessages(handleNewMessage);

  const getBadgeCount = (badgeKey?: 'messages') => {
    if (badgeKey === 'messages') return messagesUnreadCount;
    return 0;
  };

  const handleProfilePressStart = () => {
    isLongPress.current = false;
    longPressTimer.current = setTimeout(() => {
      isLongPress.current = true;
      setSwitchAccountOpen(true);
      if (navigator.vibrate) navigator.vibrate(50);
    }, 500);
  };

  const handleProfilePressEnd = () => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  };

  const handleProfileClick = (e: React.MouseEvent) => {
    if (isLongPress.current) {
      e.preventDefault();
      isLongPress.current = false;
    }
  };

  return (
    <>
    <nav className="fixed bottom-0 left-0 right-0 z-50 md:hidden safe-area-bottom">
      {/* Premium glass container */}
      <div className="mx-2 mb-1 rounded-2xl bg-card/80 backdrop-blur-2xl border border-border/40 shadow-lg">
        <div className="flex items-center justify-around h-[60px] px-1">
          {bottomNavItems.map((item) => {
            const isActive = location.pathname === item.path;
            const isCreate = item.path === '/create';
            const isProfile = item.path === '/profile';
            const badgeCount = getBadgeCount(item.badgeKey);
            
            return (
              <NavLink
                key={item.path}
                to={item.path}
                onClick={isProfile ? handleProfileClick : undefined}
                onMouseDown={isProfile ? handleProfilePressStart : undefined}
                onMouseUp={isProfile ? handleProfilePressEnd : undefined}
                onMouseLeave={isProfile ? handleProfilePressEnd : undefined}
                onTouchStart={isProfile ? handleProfilePressStart : undefined}
                onTouchEnd={isProfile ? handleProfilePressEnd : undefined}
                onContextMenu={isProfile ? (e) => e.preventDefault() : undefined}
                className={cn(
                  "relative flex flex-col items-center justify-center gap-0.5 min-w-[56px] py-1.5 rounded-xl transition-all duration-200",
                  isActive 
                    ? "text-primary" 
                    : "text-muted-foreground"
                )}
              >
                {/* Active indicator pill */}
                {isActive && !isCreate && (
                  <motion.div
                    layoutId="bottomNavActive"
                    className="absolute -top-0.5 w-5 h-[3px] rounded-full bg-primary"
                    transition={{ type: 'spring', stiffness: 500, damping: 35 }}
                  />
                )}

                {isCreate ? (
                  <div className={cn(
                    "flex items-center justify-center w-10 h-10 rounded-xl transition-all duration-200",
                    isActive 
                      ? "bg-primary text-primary-foreground shadow-md" 
                      : "bg-muted text-muted-foreground"
                  )}>
                    <item.icon className="h-5 w-5" />
                  </div>
                ) : (
                  <>
                    <div className="relative">
                      {isProfile && profile?.avatar_url ? (
                        <Avatar className={cn(
                          "h-6 w-6 transition-all duration-200",
                          isActive && "ring-2 ring-primary ring-offset-1 ring-offset-card"
                        )}>
                          <AvatarImage src={profile.avatar_url} />
                          <AvatarFallback className="text-[10px] bg-muted text-muted-foreground">
                            {profile.display_name?.[0] || profile.username?.[0] || 'U'}
                          </AvatarFallback>
                        </Avatar>
                      ) : (
                        <item.icon className={cn(
                          "h-[22px] w-[22px] transition-all duration-200",
                          isActive && "scale-105"
                        )} />
                      )}
                      <AnimatePresence>
                        {badgeCount > 0 && (
                          <motion.span
                            initial={{ scale: 0 }}
                            animate={{ scale: 1 }}
                            exit={{ scale: 0 }}
                            className="absolute -top-1.5 -right-2 h-4 min-w-4 px-0.5 rounded-full bg-destructive text-destructive-foreground text-[10px] font-bold flex items-center justify-center"
                          >
                            {badgeCount > 9 ? '9+' : badgeCount}
                          </motion.span>
                        )}
                      </AnimatePresence>
                    </div>
                    <span className={cn(
                      "text-[10px] transition-all duration-200",
                      isActive ? "font-semibold" : "font-medium"
                    )}>
                      {item.label}
                    </span>
                  </>
                )}
              </NavLink>
            );
          })}
        </div>
      </div>
    </nav>
    <SwitchAccountDialog open={switchAccountOpen} onOpenChange={setSwitchAccountOpen} />
    </>
  );
}

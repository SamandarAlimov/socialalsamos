import { NavLink, useLocation } from 'react-router-dom';
import { Home, MessageCircle, PlusSquare, Video, User } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useUnreadMessages } from '@/hooks/useUnreadMessages';
import { useNotificationSound } from '@/hooks/useNotificationSound';
import { motion, AnimatePresence } from 'framer-motion';
import { useCallback } from 'react';

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
  const { playMessageSound } = useNotificationSound();
  
  const handleNewMessage = useCallback(() => {
    playMessageSound();
  }, [playMessageSound]);
  
  const { unreadCount: messagesUnreadCount } = useUnreadMessages(handleNewMessage);

  const getBadgeCount = (badgeKey?: 'messages') => {
    if (badgeKey === 'messages') return messagesUnreadCount;
    return 0;
  };

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 bg-background/95 backdrop-blur-lg border-t border-border md:hidden safe-area-bottom">
      <div className="flex items-center justify-around h-16 px-2">
        {bottomNavItems.map((item) => {
          const isActive = location.pathname === item.path;
          const isCreate = item.path === '/create';
          const badgeCount = getBadgeCount(item.badgeKey);
          
          return (
            <NavLink
              key={item.path}
              to={item.path}
              className={cn(
                "flex flex-col items-center justify-center gap-1 min-w-[60px] py-2 rounded-xl transition-all duration-200",
                isCreate && "relative",
                isActive 
                  ? "text-primary" 
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {isCreate ? (
                <div className={cn(
                  "flex items-center justify-center w-12 h-12 rounded-full -mt-6 shadow-lg transition-all",
                  isActive 
                    ? "bg-primary text-primary-foreground" 
                    : "bg-primary/90 text-primary-foreground hover:bg-primary"
                )}>
                  <item.icon className="h-6 w-6" />
                </div>
              ) : (
                <>
                  <div className="relative">
                    <item.icon className={cn(
                      "h-6 w-6 transition-transform duration-200",
                      isActive && "scale-110"
                    )} />
                    <AnimatePresence>
                      {badgeCount > 0 && (
                        <motion.span
                          initial={{ scale: 0 }}
                          animate={{ scale: 1 }}
                          exit={{ scale: 0 }}
                          className="absolute -top-1.5 -right-1.5 h-4 min-w-4 px-0.5 rounded-full bg-destructive text-destructive-foreground text-[10px] font-bold flex items-center justify-center shadow-md"
                        >
                          {badgeCount > 9 ? '9+' : badgeCount}
                        </motion.span>
                      )}
                    </AnimatePresence>
                  </div>
                  <span className={cn(
                    "text-[10px] font-medium",
                    isActive && "font-semibold"
                  )}>
                    {item.label}
                  </span>
                </>
              )}
            </NavLink>
          );
        })}
      </div>
    </nav>
  );
}

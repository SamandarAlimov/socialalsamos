import { NavLink, useLocation } from 'react-router-dom';
import { 
  Home, 
  Search, 
  Video, 
  MessageCircle, 
  ShoppingBag, 
  Map, 
  PlusSquare, 
  User, 
  Settings,
  LogOut,
  ChevronLeft,
  ChevronRight,
  Compass,
  Wallet,
  Sparkles
} from 'lucide-react';
import { AlsamosLogo } from '@/components/AlsamosLogo';
import { useAuth } from '@/contexts/AuthContext';
import { cn } from '@/lib/utils';
import { useState, useCallback } from 'react';
import { NotificationsDropdown } from '@/components/NotificationsDropdown';
import { UserSearchDialog } from '@/components/UserSearchDialog';
import { Button } from '@/components/ui/button';
import { useUnreadMessages } from '@/hooks/useUnreadMessages';
import { useNotificationSound } from '@/hooks/useNotificationSound';
import { motion, AnimatePresence } from 'framer-motion';

interface NavItem {
  icon: React.ElementType;
  label: string;
  path?: string;
  badgeKey?: 'messages';
  action?: 'notifications' | 'search';
}

const navItems: NavItem[] = [
  { icon: Home, label: 'Home', path: '/home' },
  { icon: Search, label: 'Search', path: '/search' },
  { icon: Compass, label: 'Discover', path: '/discover' },
  { icon: Video, label: 'Videos', path: '/videos' },
  { icon: MessageCircle, label: 'Messages', path: '/messages', badgeKey: 'messages' },
  { icon: ShoppingBag, label: 'Marketplace', path: '/marketplace' },
  { icon: Map, label: 'Map', path: '/map' },
  { icon: Wallet, label: 'Payment', path: '/payment' },
  { icon: Sparkles, label: 'AI Assistant', path: '/ai' },
  { icon: PlusSquare, label: 'Create', path: '/create' },
];

const bottomItems: NavItem[] = [
  { icon: User, label: 'Profile', path: '/profile' },
  { icon: Settings, label: 'Settings', path: '/settings' },
];

export function AppSidebar() {
  const location = useLocation();
  const { user, logout } = useAuth();
  const [collapsed, setCollapsed] = useState(false);
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
    <aside 
      className={cn(
        "h-screen sticky top-0 bg-sidebar border-r border-sidebar-border flex-col transition-all duration-300",
        "hidden md:flex", // Hide on mobile
        collapsed ? "w-[72px]" : "w-64"
      )}
    >
      {/* Logo + Notifications */}
      <div className="h-16 flex items-center justify-between px-4 border-b border-sidebar-border">
        <AlsamosLogo size="sm" showText={!collapsed} />
        {!collapsed && <NotificationsDropdown />}
      </div>

      {/* Main Navigation */}
      <nav className="flex-1 p-3 space-y-1 overflow-y-auto scrollbar-hidden">
        {navItems.map((item) => {
          const isActive = item.path ? location.pathname === item.path : false;
          const badgeCount = getBadgeCount(item.badgeKey);
          
          return (
            <NavLink
              key={item.path}
              to={item.path!}
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-200 group relative",
                isActive 
                  ? "bg-primary text-primary-foreground shadow-md" 
                  : "text-sidebar-foreground hover:bg-sidebar-accent"
              )}
            >
              <div className="relative">
                <item.icon className={cn(
                  "h-5 w-5 flex-shrink-0 transition-transform duration-200",
                  !isActive && "group-hover:scale-110"
                )} />
                {/* Badge on icon for collapsed mode */}
                <AnimatePresence>
                  {collapsed && badgeCount > 0 && (
                    <motion.span
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      exit={{ scale: 0 }}
                      className="absolute -top-2 -right-2 h-4 min-w-4 px-1 rounded-full bg-destructive text-destructive-foreground text-[10px] font-bold flex items-center justify-center shadow-md"
                    >
                      {badgeCount > 9 ? '9+' : badgeCount}
                    </motion.span>
                  )}
                </AnimatePresence>
              </div>
              {!collapsed && (
                <span className="font-medium text-sm">{item.label}</span>
              )}
              {/* Badge in expanded mode */}
              <AnimatePresence>
                {!collapsed && badgeCount > 0 && (
                  <motion.span
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    exit={{ scale: 0 }}
                    className={cn(
                      "ml-auto flex items-center justify-center min-w-[20px] h-5 text-xs font-semibold rounded-full px-1.5 shadow-sm",
                      isActive 
                        ? "bg-primary-foreground text-primary" 
                        : "bg-destructive text-destructive-foreground"
                    )}
                  >
                    {badgeCount > 99 ? '99+' : badgeCount}
                  </motion.span>
                )}
              </AnimatePresence>
            </NavLink>
          );
        })}
      </nav>

      {/* Bottom Section */}
      <div className="p-3 border-t border-sidebar-border space-y-1">
        {bottomItems.map((item) => {
          const isActive = location.pathname === item.path;
          return (
            <NavLink
              key={item.path}
              to={item.path}
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-200 group",
                isActive 
                  ? "bg-primary text-primary-foreground shadow-md" 
                  : "text-sidebar-foreground hover:bg-sidebar-accent"
              )}
            >
              <item.icon className="h-5 w-5 flex-shrink-0" />
              {!collapsed && <span className="font-medium text-sm">{item.label}</span>}
            </NavLink>
          );
        })}
        
      </div>

      {/* Collapse Toggle */}
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="absolute -right-3 top-20 bg-background border border-border rounded-full p-1.5 shadow-md hover:bg-accent transition-colors"
      >
        {collapsed ? (
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
        ) : (
          <ChevronLeft className="h-4 w-4 text-muted-foreground" />
        )}
      </button>
    </aside>
  );
}

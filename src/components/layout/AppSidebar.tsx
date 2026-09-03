import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { Home, Search, Video, MessageCircle, ShoppingBag, Map, PlusSquare, User, Settings, LogOut, Compass, Wallet, Sparkles, LayoutGrid, MoreHorizontal, Moon, Sun, UsersRound } from 'lucide-react';
import { AlsamosLogo } from '@/components/AlsamosLogo';
import { useAuth } from '@/contexts/AuthContext';
import { cn } from '@/lib/utils';
import { useState, useCallback, useEffect } from 'react';
import { NotificationsDropdown } from '@/components/NotificationsDropdown';
import { Button } from '@/components/ui/button';
import { useUnreadMessages } from '@/hooks/useUnreadMessages';
import { useNotificationSound } from '@/hooks/useNotificationSound';
import { motion, AnimatePresence } from 'framer-motion';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { useTheme } from 'next-themes';
import { SwitchAccountDialog } from '@/components/account/SwitchAccountDialog';
import { useTranslation } from 'react-i18next';

interface NavItem {
  icon: React.ElementType;
  labelKey: string;
  path?: string;
  badgeKey?: 'messages';
  action?: 'notifications' | 'search';
}

const navItems: NavItem[] = [
  { icon: Home, labelKey: 'nav.home', path: '/home' },
  { icon: Search, labelKey: 'nav.search', path: '/search' },
  { icon: Compass, labelKey: 'nav.discover', path: '/discover' },
  { icon: Video, labelKey: 'nav.videos', path: '/videos' },
  { icon: MessageCircle, labelKey: 'nav.messages', path: '/messages', badgeKey: 'messages' },
  { icon: ShoppingBag, labelKey: 'nav.marketplace', path: '/marketplace' },
  { icon: Map, labelKey: 'nav.map', path: '/map' },
  { icon: Wallet, labelKey: 'nav.payment', path: '/payment' },
  { icon: Sparkles, labelKey: 'nav.ai', path: '/ai' },
  { icon: LayoutGrid, labelKey: 'nav.miniApps', path: '/mini-apps' },
  { icon: PlusSquare, labelKey: 'nav.create', path: '/create' },
];

const bottomItems: NavItem[] = [{ icon: User, labelKey: 'nav.profile', path: '/profile' }];

/** Aktiv nav rangsiz: neytral qatlam + font/icon weight. */
const NAV_ITEM_BASE = "flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-200 group relative";
const NAV_ITEM_ACTIVE = "bg-sidebar-accent text-sidebar-foreground font-semibold";
const NAV_ITEM_INACTIVE = "text-sidebar-foreground/70 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground";


/** Badge rangi butun platforma bo'ylab bitta: aktiv holatga qarab o'zgarmaydi. */
const NAV_BADGE = "bg-primary text-primary-foreground";

interface AppSidebarProps {
  collapsed: boolean;
  onCollapsedChange: (collapsed: boolean) => void;
}

export function AppSidebar({ collapsed, onCollapsedChange }: AppSidebarProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const { profile, logout } = useAuth();
  const { t } = useTranslation();
  const [showSwitchAccount, setShowSwitchAccount] = useState(false);

  // Auto-collapse on smaller desktop/tablet widths.
  useEffect(() => {
    const COLLAPSE_BREAKPOINT = 1100;
    const check = () => onCollapsedChange(window.innerWidth < COLLAPSE_BREAKPOINT);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, [onCollapsedChange]);

  const { theme, setTheme } = useTheme();
  const { playMessageSound } = useNotificationSound();
  const handleNewMessage = useCallback(() => playMessageSound(), [playMessageSound]);
  const { unreadCount: messagesUnreadCount } = useUnreadMessages(handleNewMessage);
  const getBadgeCount = (badgeKey?: 'messages') => badgeKey === 'messages' ? messagesUnreadCount : 0;

  const isNavItemActive = (path?: string) => {
    if (!path) return false;
    return location.pathname === path || location.pathname.startsWith(path + '/');
  };

  return (
    <aside className={cn(
      "h-screen min-h-0 sticky top-0 bg-sidebar border-r border-sidebar-border flex-col transition-all duration-300 z-50 overflow-visible",
      "hidden md:flex",
      collapsed ? "w-[72px]" : "w-64"
    )}>
      <div className="h-16 shrink-0 flex items-center justify-between px-4 border-b border-sidebar-border">
        <AlsamosLogo size="sm" showText={!collapsed} />
        {!collapsed && <NotificationsDropdown />}
      </div>

      <nav className="min-h-0 flex-1 space-y-1 overflow-y-auto overscroll-contain p-3 [scrollbar-gutter:stable] [scrollbar-width:thin]">
        {navItems.map((item) => {
          const isActive = isNavItemActive(item.path);
          const badgeCount = getBadgeCount(item.badgeKey);
          return (
            <NavLink key={item.path} to={item.path!} className={cn(
              NAV_ITEM_BASE,
              isActive ? NAV_ITEM_ACTIVE : NAV_ITEM_INACTIVE
            )}>
              <div className="relative">
                <item.icon
                  className={cn("h-5 w-5 flex-shrink-0 transition-transform duration-200", !isActive && "group-hover:scale-110")}
                  strokeWidth={isActive ? 2.4 : 1.9}
                />
                <AnimatePresence>
                  {collapsed && badgeCount > 0 && <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0 }} className={cn("absolute -top-2 -right-2 h-4 min-w-4 px-1 rounded-full text-[10px] font-bold flex items-center justify-center shadow-md", NAV_BADGE)}>{badgeCount > 9 ? '9+' : badgeCount}</motion.span>}
                </AnimatePresence>
              </div>
              {!collapsed && <span className="text-sm">{t(item.labelKey)}</span>}
              <AnimatePresence>
                {!collapsed && badgeCount > 0 && <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0 }} className={cn("ml-auto flex items-center justify-center min-w-[20px] h-5 text-xs font-semibold rounded-full px-1.5 shadow-sm", NAV_BADGE)}>{badgeCount > 99 ? '99+' : badgeCount}</motion.span>}
              </AnimatePresence>
            </NavLink>
          );
        })}
      </nav>

      <div className="shrink-0 p-3 border-t border-sidebar-border space-y-1">
        {bottomItems.map((item) => {
          const isActive = isNavItemActive(item.path);
          return (
            <div key={item.path} className="flex items-center gap-1">
              <NavLink to={item.path} className={cn("relative flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-200 group flex-1", isActive ? NAV_ITEM_ACTIVE : NAV_ITEM_INACTIVE)}>
                  {profile?.avatar_url ? <Avatar className={cn("h-5 w-5 flex-shrink-0", isActive && "ring-2 ring-foreground/20 ring-offset-1 ring-offset-sidebar")}><AvatarImage src={profile.avatar_url} alt={profile.display_name || 'Profile'} /><AvatarFallback><User className="h-3 w-3" /></AvatarFallback></Avatar> : <User className="h-5 w-5 flex-shrink-0" />}
                {!collapsed && <span className="text-sm">{t(item.labelKey)}</span>}
              </NavLink>
              {/* Xavfsizlik bu yerda emas — u Sozlamalar ichida joylashgan. */}
              {!collapsed && <DropdownMenu>
                <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="h-8 w-8 flex-shrink-0"><MoreHorizontal className="h-4 w-4" /></Button></DropdownMenuTrigger>
                <DropdownMenuContent align="end" side="top" className="w-56">
                  <DropdownMenuItem onClick={() => navigate('/settings')}><Settings className="h-4 w-4 mr-3" />{t('nav.settings')}</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}>{theme === 'dark' ? <Sun className="h-4 w-4 mr-3" /> : <Moon className="h-4 w-4 mr-3" />}{theme === 'dark' ? 'Yorug rejim' : 'Tungi rejim'}</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setShowSwitchAccount(true)}><UsersRound className="h-4 w-4 mr-3" />Hisobni almashtirish</DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={logout} className="text-destructive focus:text-destructive"><LogOut className="h-4 w-4 mr-3" />{t('nav.logout')}</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>}
            </div>
          );
        })}

        {collapsed && <DropdownMenu>
          <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="w-full h-10 rounded-xl"><MoreHorizontal className="h-5 w-5" /></Button></DropdownMenuTrigger>
          <DropdownMenuContent align="center" side="right" className="w-56">
            <DropdownMenuItem onClick={() => navigate('/settings')}><Settings className="h-4 w-4 mr-3" />{t('nav.settings')}</DropdownMenuItem>
            <DropdownMenuItem onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}>{theme === 'dark' ? <Sun className="h-4 w-4 mr-3" /> : <Moon className="h-4 w-4 mr-3" />}{theme === 'dark' ? 'Yorug rejim' : 'Tungi rejim'}</DropdownMenuItem>
            <DropdownMenuItem onClick={() => setShowSwitchAccount(true)}><UsersRound className="h-4 w-4 mr-3" />Hisobni almashtirish</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={logout} className="text-destructive focus:text-destructive"><LogOut className="h-4 w-4 mr-3" />{t('nav.logout')}</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>}
      </div>

      <SwitchAccountDialog open={showSwitchAccount} onOpenChange={setShowSwitchAccount} />
    </aside>
  );
}

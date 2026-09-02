import { NavLink, useLocation } from 'react-router-dom';
import {
  Home,
  MessageCircle,
  Plus,
  Video,
  User,
} from 'lucide-react';
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

/** Pastdagi asosiy navigatsiya (o'zbekcha) */
const bottomNavItems: NavItem[] = [
  { icon: Home, label: 'Asosiy', path: '/home' },
  { icon: MessageCircle, label: 'Xabarlar', path: '/messages', badgeKey: 'messages' },
  { icon: Plus, label: 'Yaratish', path: '/create' },
  { icon: Video, label: 'Videolar', path: '/videos' },
  { icon: User, label: 'Profil', path: '/profile' },
];

const LONG_PRESS_MS = 450;

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

  const tapHaptic = () => {
    if (typeof navigator !== 'undefined' && navigator.vibrate) navigator.vibrate(8);
  };

  const handleProfilePressStart = () => {
    isLongPress.current = false;
    longPressTimer.current = setTimeout(() => {
      isLongPress.current = true;
      setSwitchAccountOpen(true);
      if (navigator.vibrate) navigator.vibrate(35);
    }, LONG_PRESS_MS);
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
      return;
    }
    tapHaptic();
  };

  return (
    <>
      <nav
        className="pointer-events-none fixed bottom-0 left-0 right-0 z-50 md:hidden"
        aria-label="Asosiy navigatsiya"
      >
        {/* Suzuvchi kapsula panel */}
        <div className="pointer-events-auto mx-2.5 mb-[max(0.5rem,env(safe-area-inset-bottom))] rounded-[26px] border border-border/40 bg-background/70 shadow-[0_10px_34px_-8px_rgba(0,0,0,0.45)] backdrop-blur-2xl">
          <div className="flex h-[62px] items-stretch justify-around px-1.5">
            {bottomNavItems.map((item) => {
              const isActive = location.pathname === item.path;
              const isCreate = item.path === '/create';
              const isProfile = item.path === '/profile';
              const badgeCount = getBadgeCount(item.badgeKey);

              return (
                <NavLink
                  key={item.path}
                  to={item.path}
                  aria-label={item.label}
                  aria-current={isActive ? 'page' : undefined}
                  onClick={isProfile ? handleProfileClick : tapHaptic}
                  onMouseDown={isProfile ? handleProfilePressStart : undefined}
                  onMouseUp={isProfile ? handleProfilePressEnd : undefined}
                  onMouseLeave={isProfile ? handleProfilePressEnd : undefined}
                  onTouchStart={isProfile ? handleProfilePressStart : undefined}
                  onTouchEnd={isProfile ? handleProfilePressEnd : undefined}
                  onContextMenu={isProfile ? (e) => e.preventDefault() : undefined}
                  className={cn(
                    'group relative flex min-w-[58px] flex-1 select-none flex-col items-center justify-center gap-0.5 rounded-2xl',
                    'transition-transform duration-150 active:scale-[0.92]',
                    isActive ? 'text-foreground' : 'text-muted-foreground'
                  )}
                >
                  {/* Aktiv fon kapsulasi (silliq ko'chadi) */}
                  {isActive && !isCreate && (
                    <motion.span
                      layoutId="bottomNavActiveIndicator"
                      className="absolute top-1 h-0.5 w-5 rounded-full bg-primary"
                      transition={{ type: 'spring', stiffness: 480, damping: 34 }}
                    />
                  )}

                  {isCreate ? (
                    <motion.div
                      whileTap={{ scale: 0.9 }}
                      className={cn(
                        'flex h-11 w-11 items-center justify-center rounded-2xl transition-all duration-200',
                        isActive
                          ? 'bg-primary text-primary-foreground shadow-lg shadow-primary/30'
                          : 'bg-gradient-to-br from-primary to-primary/80 text-primary-foreground shadow-md shadow-primary/20'
                      )}
                    >
                      <Plus className="h-6 w-6" strokeWidth={2.6} />
                    </motion.div>
                  ) : (
                    <>
                      <div className="relative flex h-[26px] items-center justify-center">
                        {isProfile && profile?.avatar_url ? (
                          <Avatar
                            className={cn(
                              'h-[24px] w-[24px] transition-all duration-200',
                              isActive && 'ring-2 ring-foreground/20 ring-offset-1 ring-offset-background'
                            )}
                          >
                            <AvatarImage src={profile.avatar_url} />
                            <AvatarFallback className="bg-muted text-[10px] text-muted-foreground">
                              {profile.display_name?.[0] || profile.username?.[0] || 'F'}
                            </AvatarFallback>
                          </Avatar>
                        ) : (
                          <motion.span
                            animate={{ scale: isActive ? 1.08 : 1, y: isActive ? -1 : 0 }}
                            transition={{ type: 'spring', stiffness: 420, damping: 26 }}
                            className="flex items-center justify-center"
                          >
                            <item.icon
                              className="h-[23px] w-[23px]"
                              strokeWidth={isActive ? 2.5 : 1.9}
                            />
                          </motion.span>
                        )}

                        <AnimatePresence>
                          {badgeCount > 0 && (
                            <motion.span
                              initial={{ scale: 0, opacity: 0 }}
                              animate={{ scale: 1, opacity: 1 }}
                              exit={{ scale: 0, opacity: 0 }}
                              transition={{ type: 'spring', stiffness: 520, damping: 24 }}
                              className="absolute -right-2.5 -top-1.5 flex h-[17px] min-w-[17px] items-center justify-center rounded-full border-2 border-background bg-destructive px-1 text-[10px] font-bold leading-none text-destructive-foreground"
                            >
                              {badgeCount > 99 ? '99+' : badgeCount}
                            </motion.span>
                          )}
                        </AnimatePresence>
                      </div>

                      <span
                        className={cn(
                          'text-[10px] leading-none transition-all duration-200',
                          isActive ? 'font-semibold opacity-100' : 'font-medium opacity-80'
                        )}
                      >
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

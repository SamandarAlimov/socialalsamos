import { useMemo, useState, useRef, useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { 
  Menu, 
  LogOut,
  Compass,
  ShoppingBag,
  MapPin,
  Wallet,
  Sparkles,
  X,
  ChevronRight
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { motion, AnimatePresence } from 'framer-motion';

interface NavItem {
  icon: React.ElementType;
  label: string;
  path: string;
}

const menuItems: NavItem[] = [
  { icon: Compass, label: 'Discover', path: '/discover' },
  { icon: ShoppingBag, label: 'Marketplace', path: '/marketplace' },
  { icon: MapPin, label: 'Map', path: '/map' },
  { icon: Wallet, label: 'Payment', path: '/payment' },
  { icon: Sparkles, label: 'AI Assistant', path: '/ai' },
];

interface MobileMenuProps {
  className?: string;
}

export function MobileMenu({ className }: MobileMenuProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const { logout } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  
  // Swipe handling
  const touchStartX = useRef(0);
  const touchCurrentX = useRef(0);
  const [dragOffset, setDragOffset] = useState(0);
  const isDragging = useRef(false);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
    touchCurrentX.current = e.touches[0].clientX;
    isDragging.current = true;
  }, []);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!isDragging.current) return;
    
    touchCurrentX.current = e.touches[0].clientX;
    const diff = touchCurrentX.current - touchStartX.current;
    
    // Only allow swiping right (to close)
    if (diff > 0) {
      setDragOffset(Math.min(diff, 300));
    }
  }, []);

  const handleTouchEnd = useCallback(() => {
    isDragging.current = false;
    
    // If swiped more than 80px, close the menu
    if (dragOffset > 80) {
      setIsOpen(false);
    }
    setDragOffset(0);
  }, [dragOffset]);

  const handleNavigate = (path: string) => {
    navigate(path);
    setIsOpen(false);
  };

  const activePath = useMemo(() => location.pathname, [location.pathname]);

  // Backdrop animation variants
  const backdropVariants = {
    hidden: { opacity: 0 },
    visible: { opacity: 1 },
  };

  // Menu panel animation variants
  const menuVariants = {
    hidden: { 
      x: '100%',
      transition: {
        type: 'spring' as const,
        damping: 30,
        stiffness: 300,
      }
    },
    visible: { 
      x: 0,
      transition: {
        type: 'spring' as const,
        damping: 25,
        stiffness: 200,
      }
    },
  };

  // Stagger children animation
  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.05,
        delayChildren: 0.1,
      }
    },
  };

  const itemVariants = {
    hidden: { x: 20, opacity: 0 },
    visible: { 
      x: 0, 
      opacity: 1,
      transition: {
        type: 'spring' as const,
        damping: 25,
        stiffness: 300,
      }
    },
  };

  return (
    <>
      {/* Trigger Button */}
      <Button 
        variant="ghost" 
        size="icon" 
        className={cn("h-9 w-9 relative", className)}
        onClick={() => setIsOpen(true)}
      >
        <Menu className="h-5 w-5" />
      </Button>

      {/* Menu Overlay */}
      <AnimatePresence>
        {isOpen && (
          <>
            {/* Backdrop */}
            <motion.div
              className="fixed inset-0 z-50 bg-black/60"
              variants={backdropVariants}
              initial="hidden"
              animate="visible"
              exit="hidden"
              onClick={() => setIsOpen(false)}
            />

            {/* Menu Panel */}
            <motion.div
              className={cn(
                "fixed inset-y-0 right-0 z-50 w-[85%] max-w-[320px] bg-background border-l border-border shadow-2xl",
                "flex flex-col"
              )}
              variants={menuVariants}
              initial="hidden"
              animate="visible"
              exit="hidden"
              style={{ 
                x: dragOffset,
              }}
              onTouchStart={handleTouchStart}
              onTouchMove={handleTouchMove}
              onTouchEnd={handleTouchEnd}
            >
              {/* Header */}
              <motion.div 
                className="flex items-center justify-between px-4 h-14 border-b border-border"
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 }}
              >
                <div>
                  <h2 className="text-base font-semibold leading-none">Menu</h2>
                </div>
                <Button 
                  variant="ghost" 
                  size="icon" 
                  className={cn(
                    "h-9 w-9 rounded-full",
                    "hover:bg-accent hover:text-accent-foreground transition-colors"
                  )}
                  onClick={() => setIsOpen(false)}
                >
                  <X className="h-5 w-5" />
                </Button>
              </motion.div>

              {/* Menu Items */}
              <motion.nav 
                className="flex-1 overflow-y-auto scrollbar-hidden"
                variants={containerVariants}
                initial="hidden"
                animate="visible"
              >
                <div className="py-2">
                {menuItems.map((item, idx) => {
                  const isActive = activePath === item.path;
                  
                  return (
                    <motion.div key={item.path} variants={itemVariants}>
                      <button
                        onClick={() => handleNavigate(item.path)}
                        className={cn(
                          "w-full flex items-center gap-3 px-4 py-3 transition-colors",
                          "active:opacity-80",
                          isActive ? "bg-accent text-accent-foreground" : "text-foreground hover:bg-accent"
                        )}
                      >
                        <item.icon className={cn("h-5 w-5", isActive ? "text-foreground" : "text-muted-foreground")} />
                        <div className="flex-1 text-left">
                          <span className="text-sm font-medium block">{item.label}</span>
                        </div>
                        <ChevronRight className="h-4 w-4 text-muted-foreground" />
                      </button>
                      {idx !== menuItems.length - 1 && (
                        <div className="mx-4 border-b border-border" />
                      )}
                    </motion.div>
                  );
                })}
                </div>
              </motion.nav>

              {/* Footer */}
              <motion.div 
                className="shrink-0 border-t border-border bg-background safe-area-bottom"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 }}
              >
                <div className="p-4">
                <button
                  onClick={() => {
                    setIsOpen(false);
                    logout();
                  }}
                  className={cn(
                    "w-full flex items-center gap-3 px-4 py-3 rounded-xl",
                    "transition-colors text-destructive hover:bg-accent active:opacity-80"
                  )}
                >
                  <LogOut className="h-5 w-5" />
                  <span className="text-sm font-medium">Logout</span>
                </button>
                </div>
              </motion.div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}

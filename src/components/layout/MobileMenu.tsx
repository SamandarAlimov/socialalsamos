import { useState, useRef, useCallback } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
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
  description?: string;
}

const menuItems: NavItem[] = [
  { icon: Compass, label: 'Discover', path: '/discover', description: 'Explore new content' },
  { icon: ShoppingBag, label: 'Marketplace', path: '/marketplace', description: 'Buy & sell items' },
  { icon: MapPin, label: 'Map', path: '/map', description: 'Find nearby places' },
  { icon: Wallet, label: 'Payment', path: '/payment', description: 'Manage finances' },
  { icon: Sparkles, label: 'AI Assistant', path: '/ai', description: 'Get AI help' },
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
              className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm"
              variants={backdropVariants}
              initial="hidden"
              animate="visible"
              exit="hidden"
              onClick={() => setIsOpen(false)}
            />

            {/* Menu Panel */}
            <motion.div
              className="fixed inset-y-0 right-0 z-50 w-[85%] max-w-[320px] bg-background border-l border-border shadow-2xl"
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
                className="flex items-center justify-between p-4 border-b border-border"
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 }}
              >
                <div>
                  <h2 className="text-lg font-semibold">Menu</h2>
                  <p className="text-xs text-muted-foreground">Navigate to pages</p>
                </div>
                <Button 
                  variant="ghost" 
                  size="icon" 
                  className="h-9 w-9 rounded-full hover:bg-destructive/10 hover:text-destructive transition-colors"
                  onClick={() => setIsOpen(false)}
                >
                  <X className="h-5 w-5" />
                </Button>
              </motion.div>

              {/* Menu Items */}
              <motion.nav 
                className="p-3 space-y-1 overflow-y-auto max-h-[calc(100vh-180px)]"
                variants={containerVariants}
                initial="hidden"
                animate="visible"
              >
                {menuItems.map((item) => {
                  const isActive = location.pathname === item.path;
                  
                  return (
                    <motion.div key={item.path} variants={itemVariants}>
                      <button
                        onClick={() => handleNavigate(item.path)}
                        className={cn(
                          "w-full flex items-center gap-3 px-4 py-3.5 rounded-2xl transition-all duration-200 group",
                          isActive 
                            ? "bg-primary text-primary-foreground shadow-lg shadow-primary/25" 
                            : "text-foreground hover:bg-accent active:scale-[0.98]"
                        )}
                      >
                        <div className={cn(
                          "flex items-center justify-center w-10 h-10 rounded-xl transition-all duration-200",
                          isActive 
                            ? "bg-primary-foreground/20" 
                            : "bg-muted group-hover:bg-primary/10"
                        )}>
                          <item.icon className={cn(
                            "h-5 w-5 transition-colors",
                            isActive ? "text-primary-foreground" : "text-muted-foreground group-hover:text-primary"
                          )} />
                        </div>
                        <div className="flex-1 text-left">
                          <span className="font-medium block">{item.label}</span>
                          {item.description && (
                            <span className={cn(
                              "text-xs",
                              isActive ? "text-primary-foreground/70" : "text-muted-foreground"
                            )}>
                              {item.description}
                            </span>
                          )}
                        </div>
                        <ChevronRight className={cn(
                          "h-4 w-4 transition-all duration-200",
                          isActive 
                            ? "text-primary-foreground/70" 
                            : "text-muted-foreground opacity-0 group-hover:opacity-100 group-hover:translate-x-1"
                        )} />
                      </button>
                    </motion.div>
                  );
                })}
              </motion.nav>

              {/* Footer */}
              <motion.div 
                className="absolute bottom-0 left-0 right-0 p-4 border-t border-border bg-background safe-area-bottom"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 }}
              >
                <button
                  onClick={() => {
                    setIsOpen(false);
                    logout();
                  }}
                  className="w-full flex items-center gap-3 px-4 py-3.5 rounded-2xl transition-all duration-200 text-destructive hover:bg-destructive/10 active:scale-[0.98] group"
                >
                  <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-destructive/10 group-hover:bg-destructive/20 transition-colors">
                    <LogOut className="h-5 w-5" />
                  </div>
                  <span className="font-medium">Logout</span>
                </button>
              </motion.div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}

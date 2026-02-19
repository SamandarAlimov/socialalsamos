import { useRef, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronRight, LogOut, X, Moon, Sun, UserPlus } from "lucide-react";
import { useTheme } from "next-themes";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { SwitchAccountDialog } from "@/components/account/SwitchAccountDialog";

export interface MobileMenuNavItem {
  icon: React.ElementType;
  label: string;
  path: string;
}

interface MobileMenuDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  onNavigate: (path: string) => void;
  onLogout: () => void;
  activePath: string;
  items: MobileMenuNavItem[];
}

export function MobileMenuDrawer({
  isOpen,
  onClose,
  onNavigate,
  onLogout,
  activePath,
  items,
}: MobileMenuDrawerProps) {
  const { theme, setTheme } = useTheme();
  const [showSwitchAccount, setShowSwitchAccount] = useState(false);

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
    if (diff > 0) setDragOffset(Math.min(diff, 320));
  }, []);

  const handleTouchEnd = useCallback(() => {
    isDragging.current = false;

    // If swiped more than 80px, close the menu
    if (dragOffset > 80) onClose();
    setDragOffset(0);
  }, [dragOffset, onClose]);

  const handleThemeToggle = () => {
    setTheme(theme === 'dark' ? 'light' : 'dark');
  };

  const handleSwitchAccount = (e: React.MouseEvent) => {
    e.stopPropagation();
    setShowSwitchAccount(true);
  };

  // Backdrop animation variants
  const backdropVariants = {
    hidden: { opacity: 0 },
    visible: { opacity: 1 },
  };

  // Menu panel animation variants
  const menuVariants = {
    hidden: {
      x: "100%",
      transition: {
        type: "spring" as const,
        damping: 30,
        stiffness: 300,
      },
    },
    visible: {
      x: 0,
      transition: {
        type: "spring" as const,
        damping: 25,
        stiffness: 200,
      },
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
      },
    },
  };

  const itemVariants = {
    hidden: { x: 20, opacity: 0 },
    visible: {
      x: 0,
      opacity: 1,
      transition: {
        type: "spring" as const,
        damping: 25,
        stiffness: 300,
      },
    },
  };

  return (
    <>
      <AnimatePresence>
        {isOpen && (
          <>
            {/* Backdrop */}
            <motion.div
              className={cn(
                "fixed inset-0",
                // keep it above any app chrome
                "z-[9998]",
                // dims entire page
                "bg-black/60"
              )}
              variants={backdropVariants}
              initial="hidden"
              animate="visible"
              exit="hidden"
              onClick={onClose}
            />

            {/* Menu Panel */}
            <motion.div
              className={cn(
                "fixed inset-y-0 right-0",
                "z-[9999]",
                "w-[85%] max-w-[320px]",
                "bg-background border-l border-border shadow-2xl",
                "flex flex-col"
              )}
              variants={menuVariants}
              initial="hidden"
              animate="visible"
              exit="hidden"
              style={{ x: dragOffset }}
              onTouchStart={handleTouchStart}
              onTouchMove={handleTouchMove}
              onTouchEnd={handleTouchEnd}
              role="dialog"
              aria-modal="true"
              aria-label="Mobile menu"
            >
              {/* Header */}
              <motion.div
                className="flex items-center justify-between px-4 h-14 border-b border-border shrink-0"
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 }}
              >
                <h2 className="text-base font-semibold leading-none">Menu</h2>
                <Button
                  variant="ghost"
                  size="icon"
                  className={cn(
                    "h-9 w-9 rounded-full",
                    "hover:bg-accent hover:text-accent-foreground transition-colors"
                  )}
                  onClick={onClose}
                  aria-label="Close menu"
                >
                  <X className="h-5 w-5" />
                </Button>
              </motion.div>

              {/* Scrollable Menu Items */}
              <ScrollArea className="flex-1 min-h-0">
                <motion.nav
                  className="px-2 py-3"
                  variants={containerVariants}
                  initial="hidden"
                  animate="visible"
                >
                  <div className="space-y-1">
                    {items.map((item) => {
                      const isActive = activePath === item.path;

                      return (
                        <motion.div key={item.path} variants={itemVariants}>
                          <button
                            onClick={() => onNavigate(item.path)}
                            className={cn(
                              "w-full flex items-center gap-3 rounded-xl px-3 py-3",
                              "transition-colors active:opacity-80",
                              isActive
                                ? "bg-accent text-accent-foreground"
                                : "text-foreground hover:bg-accent"
                            )}
                          >
                            <div
                              className={cn(
                                "flex h-10 w-10 items-center justify-center rounded-lg",
                                isActive ? "bg-background/40" : "bg-muted"
                              )}
                            >
                              <item.icon
                                className={cn(
                                  "h-5 w-5",
                                  isActive
                                    ? "text-foreground"
                                    : "text-muted-foreground"
                                )}
                              />
                            </div>
                            <div className="flex-1 text-left">
                              <span className="text-sm font-medium block">
                                {item.label}
                              </span>
                            </div>
                            <ChevronRight className="h-4 w-4 text-muted-foreground" />
                          </button>
                        </motion.div>
                      );
                    })}
                  </div>
                </motion.nav>
              </ScrollArea>

              {/* Footer with Theme, Switch Accounts, and Logout */}
              <motion.div
                className="shrink-0 border-t border-border bg-background safe-area-bottom"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 }}
              >
                <div className="p-3 space-y-1">
                  {/* Theme Toggle */}
                  <button
                    onClick={handleThemeToggle}
                    className={cn(
                      "w-full flex items-center gap-3 px-3 py-3 rounded-xl",
                      "transition-colors text-foreground hover:bg-accent active:opacity-80"
                    )}
                  >
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
                      {theme === 'dark' ? (
                        <Sun className="h-5 w-5 text-muted-foreground" />
                      ) : (
                        <Moon className="h-5 w-5 text-muted-foreground" />
                      )}
                    </div>
                    <span className="text-sm font-medium">
                      {theme === 'dark' ? 'Light Mode' : 'Dark Mode'}
                    </span>
                  </button>

                  {/* Switch Accounts */}
                  <button
                    onClick={handleSwitchAccount}
                    className={cn(
                      "w-full flex items-center gap-3 px-3 py-3 rounded-xl",
                      "transition-colors text-foreground hover:bg-accent active:opacity-80"
                    )}
                  >
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
                      <UserPlus className="h-5 w-5 text-muted-foreground" />
                    </div>
                    <span className="text-sm font-medium">Switch Accounts</span>
                  </button>

                  {/* Logout */}
                  <button
                    onClick={onLogout}
                    className={cn(
                      "w-full flex items-center gap-3 px-3 py-3 rounded-xl",
                      "transition-colors text-destructive hover:bg-accent active:opacity-80"
                    )}
                  >
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-destructive/10">
                      <LogOut className="h-5 w-5" />
                    </div>
                    <span className="text-sm font-medium">Logout</span>
                  </button>
                </div>
              </motion.div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Switch Account Dialog - always rendered at top z-index, outside drawer DOM */}
      <SwitchAccountDialog
        open={showSwitchAccount}
        onOpenChange={setShowSwitchAccount}
      />
    </>
  );
}

import { Bell } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useNotifications } from '@/hooks/useNotifications';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';

export function NotificationsDropdown() {
  const { unreadCount } = useNotifications();
  const navigate = useNavigate();

  return (
    <Button 
      variant="ghost" 
      size="icon" 
      className={cn(
        "relative rounded-full transition-all duration-200",
        unreadCount > 0 && "hover:bg-primary/10"
      )}
      onClick={() => navigate('/notifications')}
    >
      <Bell className={cn(
        "h-5 w-5 transition-colors",
        unreadCount > 0 && "text-primary"
      )} />
      <AnimatePresence>
        {unreadCount > 0 && (
          <motion.span 
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0, opacity: 0 }}
            className="absolute -top-0.5 -right-0.5 h-5 min-w-5 px-1 rounded-full bg-gradient-to-r from-primary to-primary/80 text-primary-foreground text-xs font-medium flex items-center justify-center shadow-lg shadow-primary/30"
          >
            {unreadCount > 99 ? '99+' : unreadCount}
          </motion.span>
        )}
      </AnimatePresence>
    </Button>
  );
}

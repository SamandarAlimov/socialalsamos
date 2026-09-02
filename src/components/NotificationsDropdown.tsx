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
        unreadCount > 0 && "hover:bg-muted"
      )}
      onClick={() => navigate('/notifications')}
    >
      <Bell className="h-5 w-5 text-muted-foreground transition-colors" />
      <AnimatePresence>
        {unreadCount > 0 && (
          <motion.span 
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0, opacity: 0 }}
            className="absolute -top-0.5 -right-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1 text-xs font-medium text-primary-foreground shadow-sm"
          >
            {unreadCount > 99 ? '99+' : unreadCount}
          </motion.span>
        )}
      </AnimatePresence>
    </Button>
  );
}

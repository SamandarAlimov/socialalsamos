import { Bot } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAI } from '@/contexts/AIContext';
import { cn } from '@/lib/utils';

export function AIFloatingButton() {
  const { isOpen, setIsOpen, isLoading } = useAI();

  return (
    <AnimatePresence>
      {!isOpen && (
        <motion.button
          initial={{ scale: 0, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0, opacity: 0 }}
          whileHover={{ scale: 1.1 }}
          whileTap={{ scale: 0.95 }}
          onClick={() => setIsOpen(true)}
          className={cn(
            "fixed bottom-20 right-4 md:bottom-6 md:right-6 z-50",
            "h-14 w-14 rounded-full",
            "bg-gradient-to-br from-primary via-primary to-primary/80",
            "text-primary-foreground shadow-lg",
            "flex items-center justify-center",
            "hover:shadow-xl transition-shadow",
            isLoading && "animate-pulse"
          )}
        >
          <Bot className="h-6 w-6" />
          {isLoading && (
            <span className="absolute -top-1 -right-1 h-3 w-3 bg-green-500 rounded-full animate-ping" />
          )}
        </motion.button>
      )}
    </AnimatePresence>
  );
}

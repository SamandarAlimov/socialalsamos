import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Clock, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAI } from '@/contexts/AIContext';
import { useAuth } from '@/contexts/AuthContext';

export function AITimeLimitAlert() {
  const { user } = useAuth();
  const { checkTimeLimit, preferences } = useAI();
  const [show, setShow] = useState(false);
  const [alertData, setAlertData] = useState<{ usedMinutes: number; limitMinutes: number } | null>(null);

  useEffect(() => {
    if (!user || !preferences?.daily_time_limit_minutes || !preferences?.alerts_enabled) return;

    const checkLimit = async () => {
      const result = await checkTimeLimit();
      if (result.exceeded && result.limitMinutes) {
        setAlertData({ usedMinutes: result.usedMinutes, limitMinutes: result.limitMinutes });
        setShow(true);
      }
    };

    // Check every 5 minutes
    const interval = setInterval(checkLimit, 5 * 60 * 1000);
    
    // Initial check after 1 minute
    const timeout = setTimeout(checkLimit, 60 * 1000);

    return () => {
      clearInterval(interval);
      clearTimeout(timeout);
    };
  }, [user, preferences, checkTimeLimit]);

  if (!show || !alertData) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: -100 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -100 }}
        className="fixed top-4 left-1/2 -translate-x-1/2 z-[100] max-w-md w-[calc(100vw-2rem)]"
      >
        <div className="bg-yellow-500 text-yellow-950 rounded-xl shadow-xl p-4">
          <div className="flex items-start gap-3">
            <Clock className="h-5 w-5 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <h4 className="font-semibold">Vaqt limiti ogohlantirishi</h4>
              <p className="text-sm mt-1">
                Siz bugun {alertData.usedMinutes} daqiqa platformadan foydalandingiz. 
                Sizning kunlik limitingiz {alertData.limitMinutes} daqiqa edi.
              </p>
              <p className="text-sm mt-2 font-medium">
                Dam olishni va ko'zlaringizni tiklashni tavsiya qilamiz! 🌟
              </p>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 text-yellow-950 hover:bg-yellow-600"
              onClick={() => setShow(false)}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}

import { Lock } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

export function EncryptedIndicator({ className }: { className?: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          className={cn(
            'inline-flex items-center gap-1 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 px-1.5 py-0.5 text-[10px] font-medium',
            className,
          )}
        >
          <Lock className="h-2.5 w-2.5" />
          Shifrlangan
        </span>
      </TooltipTrigger>
      <TooltipContent side="bottom" className="max-w-[240px] text-xs">
        Bu chatdagi xabarlar shifrlangan holda saqlanadi. Faqat siz va suhbatdoshingiz o'qiy oladi.
      </TooltipContent>
    </Tooltip>
  );
}

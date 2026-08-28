import { LucideIcon, ChevronUp } from 'lucide-react';
import { cn } from '@/lib/utils';

export type CallControlTone = 'neutral' | 'accept' | 'decline' | 'active';

interface CallControlButtonProps {
  icon: LucideIcon;
  /** Tugma ostidagi izoh (Telegram Desktopdagidek) */
  label: string;
  tone?: CallControlTone;
  /** Yuqorida kichik "chevron" - qo'shimcha sozlamalar bor degani */
  hasMenu?: boolean;
  onMenuClick?: () => void;
  onClick?: () => void;
  disabled?: boolean;
  size?: 'md' | 'lg';
  className?: string;
}

const TONES: Record<CallControlTone, string> = {
  neutral: 'bg-white/12 text-white hover:bg-white/20',
  accept: 'bg-[#4DCA5B] text-white hover:bg-[#43b850]',
  decline: 'bg-[#F2495C] text-white hover:bg-[#dc4153]',
  active: 'bg-white text-neutral-900 hover:bg-white/90',
};

/**
 * Telegram Desktopdagi qo'ng'iroq tugmasi: yumaloq tugma + ostida izoh matni,
 * kerak bo'lsa ustida qo'shimcha menyu uchun kichik strelka.
 */
export function CallControlButton({
  icon: Icon,
  label,
  tone = 'neutral',
  hasMenu,
  onMenuClick,
  onClick,
  disabled,
  size = 'md',
  className,
}: CallControlButtonProps) {
  const box = size === 'lg' ? 'h-16 w-16' : 'h-14 w-14';
  const glyph = size === 'lg' ? 'h-7 w-7' : 'h-6 w-6';

  return (
    <div className={cn('flex w-[76px] flex-col items-center gap-1.5', className)}>
      {hasMenu ? (
        <button
          type="button"
          onClick={onMenuClick}
          className="flex h-4 items-center justify-center text-white/50 transition-colors hover:text-white"
          aria-label={label + ' sozlamalari'}
        >
          <ChevronUp className="h-3.5 w-3.5" />
        </button>
      ) : (
        <span className="h-4" />
      )}

      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        aria-label={label}
        className={cn(
          'flex items-center justify-center rounded-full shadow-lg transition-all duration-200 active:scale-95 disabled:opacity-40',
          box,
          TONES[tone]
        )}
      >
        <Icon className={glyph} />
      </button>

      <span className="line-clamp-2 text-center text-[11px] font-medium leading-tight text-white/70">
        {label}
      </span>
    </div>
  );
}

export default CallControlButton;

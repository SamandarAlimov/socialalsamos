import { ChevronRight, X, type LucideIcon } from 'lucide-react';

import { cn } from '@/lib/utils';

/**
 * Create oqimidagi sozlama qatori.
 *
 * O'lchovlar Instagram va Telegram muharrirlaridan olingan, chunki har bir
 * ekran o'zicha o'lcham tanlagani sababli sahifa "arzon" ko'rinardi:
 *  - qator balandligi 56px (barmoq uchun qulay minimal 44px dan yuqori);
 *  - yetakchi ikonka 22px, matn 15px;
 *  - joriy qiymat o'ng tomonda, so'ng shevron;
 *  - ajratkich chiziq ikonka ustunidan keyin boshlanadi — shunda ro'yxat
 *    bo'lak-bo'lak emas, yaxlit ko'rinadi.
 */

export const CREATE_ROW_MIN_HEIGHT = 56;
/** Ajratkich chapdan shu masofada boshlanadi: padding + ikonka + oraliq. */
export const CREATE_ROW_DIVIDER_INSET = 54;

interface CreateListRowProps {
  icon: LucideIcon;
  label: string;
  /** Ikkinchi qator matni (masalan manzil yoki ijrochi). */
  description?: string;
  /** O'ng tomondagi joriy qiymat, masalan "Hamma" yoki "3/10". */
  value?: string;
  /** Qiymat asosiy rangda ko'rsatilsin (faol holat uchun). */
  emphasizeValue?: boolean;
  active?: boolean;
  disabled?: boolean;
  onClick?: () => void;
  /** Berilsa, shevron o'rniga olib tashlash tugmasi chiqadi. */
  onRemove?: () => void;
  removeLabel?: string;
  className?: string;
}

export function CreateListRow({
  icon: Icon,
  label,
  description,
  value,
  emphasizeValue = false,
  active = false,
  disabled = false,
  onClick,
  onRemove,
  removeLabel,
  className,
}: CreateListRowProps) {
  const interactive = Boolean(onClick) && !disabled;

  return (
    <div
      className={cn(
        // Ajratkich pseudo-element orqali chiziladi, shunda u ikonkadan keyin
        // boshlanadi va oxirgi qatordan keyin ortiqcha chiziq qolmaydi.
        'relative flex items-center',
        'before:absolute before:left-[54px] before:right-0 before:top-0 before:h-px before:bg-border/45',
        'first:before:hidden',
        className,
      )}
    >
      <button
        type="button"
        onClick={onClick}
        disabled={!interactive}
        className={cn(
          'flex min-h-[56px] min-w-0 flex-1 items-center gap-4 px-4 text-left transition sm:px-5',
          interactive && 'hover:bg-muted/40 active:bg-muted/60',
          disabled && 'cursor-not-allowed opacity-45',
        )}
      >
        <Icon
          className={cn(
            'h-[22px] w-[22px] shrink-0',
            active ? 'text-primary' : 'text-foreground/75',
          )}
        />

        <span className="min-w-0 flex-1">
          <span className="block truncate text-[15px] leading-tight text-foreground">
            {label}
          </span>
          {description && (
            <span className="mt-0.5 block truncate text-[13px] leading-tight text-muted-foreground">
              {description}
            </span>
          )}
        </span>

        {value && (
          <span
            className={cn(
              'max-w-[42%] shrink-0 truncate text-[15px]',
              emphasizeValue ? 'text-primary' : 'text-muted-foreground',
            )}
          >
            {value}
          </span>
        )}

        {interactive && !onRemove && (
          <ChevronRight className="h-[18px] w-[18px] shrink-0 text-muted-foreground/60" />
        )}
      </button>

      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          aria-label={removeLabel ?? label + ' — olib tashlash'}
          className="mr-2 flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-muted-foreground transition hover:bg-muted hover:text-destructive sm:mr-3"
        >
          <X className="h-[18px] w-[18px]" />
        </button>
      )}
    </div>
  );
}

export default CreateListRow;

import { ImagePlus } from 'lucide-react';

import { cn } from '@/lib/utils';

interface CreateMediaDropzoneProps {
  onPick: () => void;
  className?: string;
}

/**
 * Bo'sh kompozitordagi media maydoni.
 *
 * Media-first sheet faqat fayl qo'shilgandan keyin ishga tushadi, shuning uchun
 * bo'sh ekranda pastki yarim butunlay bo'sh qolar va fayl qo'shish uchun
 * yagona yo'l kichkina qisqich ikonkasi edi. Instagram, Telegram va YouTube
 * o'sha bo'shliqqa aniq nishon qo'yadi — bu yerda ham shunday.
 *
 * Balandlik qat'iy emas: ota element uni flex-1 bilan cho'zsa, maydon qolgan
 * joyni egallaydi va amallar paneli ekrandan tushib ketmaydi.
 */
export function CreateMediaDropzone({ onPick, className }: CreateMediaDropzoneProps) {
  return (
    <button
      type="button"
      onClick={onPick}
      className={cn(
        'group mx-4 mb-4 flex min-h-[180px] flex-col items-center justify-center gap-3 rounded-2xl',
        'border-2 border-dashed border-border/70 px-6 py-8 text-center transition',
        'hover:border-primary/60 hover:bg-muted/30 active:scale-[0.995] sm:mx-5',
        className,
      )}
    >
      <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-muted/60 transition group-hover:bg-primary/10">
        <ImagePlus className="h-7 w-7 text-foreground/70 transition group-hover:text-primary" />
      </span>

      <span className="text-[15px] font-medium text-foreground">
        Rasm va videolarni shu yerga tashlang
      </span>

      <span className="max-w-sm text-[13px] leading-relaxed text-muted-foreground">
        Har qanday fayl turi qo‘llab-quvvatlanadi — hujjat, audio, arxiv ham.
      </span>

      <span className="mt-1 inline-flex h-10 shrink-0 items-center rounded-full bg-primary px-5 text-[14px] font-medium text-primary-foreground">
        Qurilmadan tanlash
      </span>
    </button>
  );
}

export default CreateMediaDropzone;

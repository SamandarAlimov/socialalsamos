import { cn } from '@/lib/utils';

/**
 * Segment / tab / filtr chip elementlari uchun YAGONA vizual qoida.
 *
 * Andoza — `src/components/ui/tabs.tsx` dagi TabsTrigger:
 *   track  = neytral kul  (`bg-muted`)
 *   aktiv  = oq/qora qatlam (`bg-background` + soya), RANGSIZ
 *
 * Ya'ni tanlov holati RANG bilan emas, QATLAM (elevation) bilan
 * ko'rsatiladi — bu iOS segmented control konventsiyasi.
 *
 * Nima uchun bu alohida faylda: ilgari har bir chip ro'yxati o'zicha rang
 * tanlardi. Discover sahifasida yuqoridagi tab bar to'g'ri (oq pill),
 * pastidagi kategoriya filtri esa to'liq to'yingan orange blok bilan
 * qurilgan edi — bir xil funksiyadagi ikki komponent ikki xil qoida bilan.
 * Yangi chip/segment ro'yxati qo'shsangiz shu yerdan import qiling,
 * o'z rang variantingizni yozmang.
 *
 * Brend orange bu yerda umuman ishtirok etmaydi. U faqat CTA tugmalar,
 * badge, aktiv nav aksenti va link matnida qoladi.
 */

export const SEGMENT_CHIP_BASE =
  'inline-flex shrink-0 items-center gap-1.5 rounded-full px-4 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2';

/** Tanlangan: oq/qora qatlam + nozik chegara. Rang yo'q. */
export const SEGMENT_CHIP_ACTIVE =
  'bg-background text-foreground font-semibold shadow-sm ring-1 ring-border';

/** Tanlanmagan: neytral track ustidagi so'nik matn. */
export const SEGMENT_CHIP_INACTIVE = 'bg-muted text-muted-foreground hover:text-foreground';

export function segmentChipClass(isActive: boolean, className?: string) {
  return cn(SEGMENT_CHIP_BASE, isActive ? SEGMENT_CHIP_ACTIVE : SEGMENT_CHIP_INACTIVE, className);
}

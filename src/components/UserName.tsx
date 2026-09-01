import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { VerifiedBadge } from '@/components/VerifiedBadge';

type BadgeSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl';

interface UserNameProps {
  displayName?: string | null;
  username?: string | null;
  isVerified?: boolean | null;
  /** Ism ham, username ham bo'lmasa ko'rsatiladigan matn. */
  fallback?: string;
  /** Nishon o'lchami (matn kattaligiga moslang). */
  badgeSize?: BadgeSize;
  /** Tashqi qatlam klasslari. */
  className?: string;
  /** Faqat ism matni klasslari (font-size, font-weight va h.k.). */
  nameClassName?: string;
  /**
   * Ism o'rniga tayyor tugun berish mumkin (masalan qidiruvda topilgan
   * so'z ajratib ko'rsatilgan <Highlighted /> yoki <EmojiText />).
   */
  children?: ReactNode;
}

/**
 * Foydalanuvchi ismi + tasdiqlangan nishoni uchun YAGONA komponent.
 *
 * Nima uchun kerak: ilgari har bir sahifa nishonni o'zicha chizardi - ba'zi
 * joyda `VerifiedBadge`, ba'zi joyda lucide `BadgeCheck`/`Verified` (kontur,
 * `currentColor` rangida), ba'zi joyda esa umuman chizilmasdi. Natijada bir
 * xil foydalanuvchi turli sahifada turlicha ko'rinardi.
 *
 * QOIDA: ism yonida nishon kerak bo'lsa - shu komponent ishlatilsin.
 * Faqat nishonning o'zi kerak bo'lsa - `VerifiedBadge`.
 * Lucide'ning `BadgeCheck` / `Verified` / `CheckCircle` ikonkalari tasdiq
 * nishoni sifatida ISHLATILMASIN.
 *
 * Kelajakda nishon dizayni, rangi yoki ko'rsatish shartlari o'zgarsa -
 * faqat shu fayl va `VerifiedBadge.tsx` tahrirlanadi, sahifalarga tegilmaydi.
 */
export function UserName({
  displayName,
  username,
  isVerified,
  fallback = 'Foydalanuvchi',
  badgeSize = 'sm',
  className,
  nameClassName,
  children,
}: UserNameProps) {
  const label = displayName || username || fallback;

  return (
    <span className={cn('flex min-w-0 items-center gap-1', className)}>
      <span className={cn('truncate', nameClassName)}>{children ?? label}</span>
      {isVerified ? <VerifiedBadge size={badgeSize} /> : null}
    </span>
  );
}

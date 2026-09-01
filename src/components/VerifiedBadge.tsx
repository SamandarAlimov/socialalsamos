import { cn } from '@/lib/utils';

interface VerifiedBadgeProps {
  className?: string;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
}

/**
 * Instagram uslubidagi tasdiqlangan foydalanuvchi nishoni.
 *
 * Muhim: butun loyihada FAQAT shu komponent ishlatilsin. Lucide'ning
 * `BadgeCheck` / `Verified` ikonkalari kontur (ichi bo'sh) ko'rinishda va
 * `currentColor` rangini oladi - natijada nishon joyiga qarab to'q sariq yoki
 * kulrang bo'lib qolardi. Bu yerda esa rang qat'iy #0095F6 va ichi to'la.
 */
export function VerifiedBadge({ className, size = 'sm' }: VerifiedBadgeProps) {
  const sizeClasses = {
    xs: 'h-3 w-3',
    sm: 'h-4 w-4',
    md: 'h-5 w-5',
    lg: 'h-6 w-6',
    xl: 'h-7 w-7',
  };

  return (
    <svg
      viewBox="0 0 24 24"
      className={cn(sizeClasses[size], 'shrink-0', className)}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label="Tasdiqlangan"
    >
      <title>Tasdiqlangan</title>

      {/* To'ldirilgan ko'k yulduzsimon fon */}
      <path
        d="M22.5 12.5c0-1.58-.875-2.95-2.148-3.6.154-.435.238-.905.238-1.4 0-2.21-1.71-3.998-3.818-3.998-.47 0-.92.084-1.336.25C14.818 2.415 13.51 1.5 12 1.5s-2.816.917-3.437 2.25c-.415-.165-.866-.25-1.336-.25-2.11 0-3.818 1.79-3.818 4 0 .494.083.964.237 1.4-1.272.65-2.147 2.018-2.147 3.6 0 1.495.782 2.798 1.942 3.486-.02.17-.032.34-.032.514 0 2.21 1.708 4 3.818 4 .47 0 .92-.086 1.335-.25.62 1.334 1.926 2.25 3.437 2.25 1.512 0 2.818-.916 3.437-2.25.415.163.865.248 1.336.248 2.11 0 3.818-1.79 3.818-4 0-.174-.012-.344-.033-.513 1.158-.687 1.943-1.99 1.943-3.484z"
        fill="#0095F6"
      />

      {/*
        Oq belgi - stroke emas, to'ldirilgan shakl. Stroke variantida
        `h-3 w-3` (xs) o'lchamda chiziq juda ingichka bo'lib, nishon
        "bo'sh" ko'rinardi.
      */}
      <path
        d="M10.75 16.02a1.05 1.05 0 0 1-.744-.308l-2.7-2.7a1.052 1.052 0 1 1 1.488-1.488l1.956 1.956 4.456-4.456a1.052 1.052 0 1 1 1.488 1.488l-5.2 5.2a1.05 1.05 0 0 1-.744.308z"
        fill="#FFFFFF"
      />
    </svg>
  );
}

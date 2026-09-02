import { cn } from '@/lib/utils';

interface BubbleTailProps {
  /** Xabar meni tomonimdan bo'lsa dumcha o'ngda, aks holda chapda */
  isMine: boolean;
  /** Xatolik holatidagi kartada dumcha ham qizil bo'ladi */
  failed?: boolean;
  className?: string;
}

/**
 * Telegramdagi xabar kartasining pastidagi "dumcha" (tail).
 *
 * Dumcha har doim xabarni JO'NATGAN tomonga qaragan bo'ladi:
 * - o'zim yozgan xabar - o'ng pastda,
 * - suhbatdosh xabari - chap pastda.
 *
 * Rangi karta foni bilan bir xil: o'zim uchun `--bubble-own-bg`, kelgan xabar uchun
 * `--card` + `--border` chizig'i, shuning uchun mavzu (light/dark) o'zgarsa
 * dumcha ham avtomatik moslashadi.
 */
export function BubbleTail({ isMine, failed, className }: BubbleTailProps) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'pointer-events-none absolute bottom-0 z-0 block h-[13px] w-[9px]',
        isMine ? '-right-[6px]' : '-left-[6px]',
        className
      )}
      style={{ transform: isMine ? undefined : 'scaleX(-1)' }}
    >
      <svg
        width="9"
        height="13"
        viewBox="0 0 9 13"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="block h-full w-full"
      >
        <path
          d="M0 0C0 6.2 0.6 10.4 8.4 13C3.4 10.2 3 6 3 0H0Z"
          fill={
            failed
              ? 'hsl(var(--destructive) / 0.2)'
              : isMine
                ? 'hsl(var(--bubble-own-bg))'
                : 'hsl(var(--card))'
          }
          stroke={
            failed
              ? 'hsl(var(--destructive))'
              : isMine
                ? 'transparent'
                : 'hsl(var(--border))'
          }
          strokeWidth={isMine && !failed ? 0 : 1}
          strokeLinejoin="round"
        />
      </svg>
    </span>
  );
}

export default BubbleTail;

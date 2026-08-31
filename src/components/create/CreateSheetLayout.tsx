import { cn } from '@/lib/utils';
import { SnapSheet, type SnapSheetSnap } from '@/components/ui/snap-sheet';

/** Create sheet peek holatida matn maydoni ko'rinib turishi kerak. */
const CREATE_MIN_PEEK = 148;

interface CreateSheetLayoutProps {
  /** To'liq ekranli media sahnasi. */
  media: React.ReactNode;
  snap: SnapSheetSnap;
  onSnapChange: (snap: SnapSheetSnap) => void;
  /** Media ustidagi doiraviy asboblar rail'i. */
  rail?: React.ReactNode;
  /** Sheet pastida qotib turadigan amallar paneli. */
  footer?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}

/**
 * Media birinchi — xarita dizayn tilidagi create sahnasi.
 *
 * Mobil: butun ekran media, ustidan peek/half/full shisha sheet.
 * Desktop: chapda 376px shisha panel, o'ngda katta preview.
 *
 * Sheet mantiqi ui/snap-sheet dan olinadi, shuning uchun xarita va create
 * paneli bir xil sudralish fizikasi va bir xil sirt tokenlariga ega bo'ladi.
 */
export function CreateSheetLayout({
  media,
  snap,
  onSnapChange,
  rail,
  footer,
  children,
  className,
}: CreateSheetLayoutProps) {
  return (
    <div
      className={cn(
        'relative h-[calc(100dvh-4rem)] min-h-0 w-full overflow-hidden bg-black md:rounded-[24px]',
        className,
      )}
    >
      {/* Media sahnasi: desktopda chapdagi panel joyini bo'shatib beradi. */}
      <div className="absolute inset-0 flex min-h-0 items-center justify-center overflow-hidden md:left-[404px]">
        {media}
      </div>

      {rail && (
        <div className="absolute right-3 top-3 z-[1200] md:left-[420px] md:right-auto md:top-6">
          {rail}
        </div>
      )}

      <SnapSheet
        snap={snap}
        onSnapChange={onSnapChange}
        minPeek={CREATE_MIN_PEEK}
        grabberLabel="Create paneli balandligini o'zgartirish"
      >
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain [-webkit-overflow-scrolling:touch]">
          {children}
        </div>

        {footer && <div className="shrink-0">{footer}</div>}
      </SnapSheet>
    </div>
  );
}

export default CreateSheetLayout;

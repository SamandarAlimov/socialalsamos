import { SnapSheet, type SnapSheetSnap } from '@/components/ui/snap-sheet';

/**
 * Xarita paneli endi umumiy SnapSheet ustida ishlaydi.
 *
 * Xatti-harakat o'zgarmagan: tutqichni sudrash, tez swipe qilinganda keyingi
 * snap nuqtasiga o'tish, sekin qo'yib yuborilganda eng yaqin snapga yopishish
 * va desktopda doim to'liq chap panel. Mantiq src/components/ui/snap-sheet.tsx
 * ichida, shuning uchun create oqimi ham xuddi shu panelni qayta ishlatadi.
 */

export type MapSheetSnap = SnapSheetSnap;

interface MapBottomSheetProps {
  snap: MapSheetSnap;
  onSnapChange: (snap: MapSheetSnap) => void;
  children: React.ReactNode;
  className?: string;
  onHeightChange?: (height: number) => void;
}

export function MapBottomSheet({
  snap,
  onSnapChange,
  children,
  className,
  onHeightChange,
}: MapBottomSheetProps) {
  return (
    <SnapSheet
      snap={snap}
      onSnapChange={onSnapChange}
      className={className}
      onHeightChange={onHeightChange}
      grabberLabel="Xarita paneli balandligini o'zgartirish"
    >
      {children}
    </SnapSheet>
  );
}

export default MapBottomSheet;

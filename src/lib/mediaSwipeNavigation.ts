export function getMediaCarouselSwipeTarget(
  currentIndex: number,
  totalItems: number,
  deltaX: number,
): number | null {
  if (totalItems <= 1 || deltaX === 0) return null;

  const target = currentIndex + (deltaX < 0 ? 1 : -1);
  return target >= 0 && target < totalItems ? target : null;
}

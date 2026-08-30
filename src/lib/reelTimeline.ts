export const MAX_REEL_CLIPS = 10;

export interface ReelTimelineClip {
  id: string;
  file: File;
  previewUrl?: string;
  durationSeconds?: number;
}

export function moveReelClip<T>(
  items: T[],
  fromIndex: number,
  toIndex: number,
): T[] {
  if (
    fromIndex < 0 ||
    toIndex < 0 ||
    fromIndex >= items.length ||
    toIndex >= items.length ||
    fromIndex === toIndex
  ) {
    return items;
  }

  const next = [...items];
  const [moved] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, moved);
  return next;
}

import type { CSSProperties } from 'react';

import { cn } from '@/lib/utils';
import { resolveProfileCoverPreset } from '@/lib/profileCovers';

interface ProfileCoverSurfaceProps {
  coverUrl?: string | null;
  presetId?: string | null;
  className?: string;
  imageClassName?: string;
  decorative?: boolean;
}

export function ProfileCoverSurface({
  coverUrl,
  presetId,
  className,
  imageClassName,
  decorative = true,
}: ProfileCoverSurfaceProps) {
  if (coverUrl) {
    return (
      <img
        src={coverUrl}
        alt=""
        draggable={false}
        className={cn('h-full w-full object-cover', imageClassName, className)}
      />
    );
  }

  const preset = resolveProfileCoverPreset(presetId);
  const style: CSSProperties = {
    backgroundColor: preset.backgroundColor,
    backgroundImage: preset.backgroundImage,
    backgroundSize: 'backgroundSize' in preset ? preset.backgroundSize : undefined,
  };

  return (
    <div
      data-cover-preset={preset.id}
      aria-hidden={decorative ? true : undefined}
      className={cn('relative h-full w-full overflow-hidden', className)}
      style={style}
    >
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-white/[0.06] via-transparent to-black/[0.08]" />
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-white/40 mix-blend-overlay" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-px bg-black/10" />
    </div>
  );
}

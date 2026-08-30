import type { MapLayerId } from '@/lib/mapLayers';
import { cn } from '@/lib/utils';

interface MapDataCreditProps {
  layerId: MapLayerId;
  overlays: string[];
  className?: string;
  style?: React.CSSProperties;
}

/**
 * Provider creditini Leaflet watermarkidan ajratib, Alsamos UI ichida juda
 * ixcham ko'rsatadi. Xarita ma'lumotlari/imagery litsenziyasi uchun credit
 * butunlay yo'qolmasligi kerak, lekin foydalanuvchi UXini bosib ketmaydi.
 */
export function MapDataCredit({ layerId, overlays, className, style }: MapDataCreditProps) {
  const credits: { label: string; href: string }[] = [];

  if (layerId === 'map' || layerId === 'night' || layerId === 'hybrid') {
    credits.push({
      label: 'OpenStreetMap contributors',
      href: 'https://www.openstreetmap.org/copyright',
    });
  }

  if (layerId === 'satellite' || layerId === 'hybrid') {
    credits.push({
      label: 'Esri',
      href: 'https://www.esri.com/',
    });
  }

  if (layerId === 'night' || layerId === 'hybrid') {
    credits.push({
      label: 'CARTO',
      href: 'https://carto.com/attributions',
    });
  }

  if (overlays.includes('transit') || overlays.includes('cycle')) {
    if (!credits.some((item) => item.label === 'OpenStreetMap contributors')) {
      credits.push({
        label: 'OpenStreetMap contributors',
        href: 'https://www.openstreetmap.org/copyright',
      });
    }
  }

  if (!credits.length) return null;

  return (
    <div
      className={cn(
        'absolute z-[1060] flex max-w-[72vw] items-center gap-1 rounded-md bg-background/55 px-1.5 py-1 text-[9px] leading-none text-muted-foreground/65 shadow-sm backdrop-blur-md transition-opacity hover:bg-background/85 hover:text-muted-foreground',
        className,
      )}
      style={style}
    >
      <span className="shrink-0">Map data</span>
      <span aria-hidden="true">·</span>
      <span className="truncate">
        {credits.map((credit, index) => (
          <span key={credit.label}>
            {index > 0 && <span className="mx-1">/</span>}
            <a
              href={credit.href}
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-foreground hover:underline"
            >
              {credit.label}
            </a>
          </span>
        ))}
      </span>
    </div>
  );
}

export default MapDataCredit;

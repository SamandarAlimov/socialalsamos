import { useState } from 'react';
import {
  Bookmark,
  Clock,
  Globe,
  MapPin,
  Navigation,
  Phone,
  Send,
  Share2,
  ShoppingBag,
  Star,
  X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatDistance } from '@/lib/geocoding';
import { isProbablyOpen, type MapPlace } from '@/lib/mapPlaces';

interface PlaceDetailsCardProps {
  place: MapPlace;
  saved?: boolean;
  onClose: () => void;
  onDirections: (place: MapPlace) => void;
  onSendToChat: (place: MapPlace) => void;
  onToggleSave: (place: MapPlace) => void;
  onShare: (place: MapPlace) => void;
  onNearbyListings?: (place: MapPlace) => void;
  onCreatePost?: (place: MapPlace) => void;
  className?: string;
}

type TabId = 'overview' | 'details' | 'links';

const TABS: Array<{ id: TabId; label: string }> = [
  { id: 'overview', label: 'Umumiy' },
  { id: 'details', label: "Ma'lumot" },
  { id: 'links', label: 'Bog\u2018lash' },
];

/** POI batafsil kartasi - Yandex Mapsdagi joy kartasi uslubida. */
export function PlaceDetailsCard({
  place,
  saved,
  onClose,
  onDirections,
  onSendToChat,
  onToggleSave,
  onShare,
  onNearbyListings,
  onCreatePost,
  className,
}: PlaceDetailsCardProps) {
  const [tab, setTab] = useState<TabId>('overview');
  const open = isProbablyOpen(place.openingHours);
  const image = place.tags?.image || place.tags?.['image:0'] || null;

  return (
    <div className={cn('overflow-hidden rounded-3xl bg-card ring-1 ring-border', className)}>
      <div className="relative h-32 w-full overflow-hidden bg-gradient-to-br from-primary/25 via-primary/10 to-transparent">
        {image ? (
          <img src={image} alt={place.name} className="h-full w-full object-cover" loading="lazy" />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-5xl opacity-70">
            {place.categoryId ? categoryEmoji(place.categoryId) : '\ud83d\udccd'}
          </div>
        )}
        <button
          type="button"
          onClick={onClose}
          className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-full bg-background/90 text-foreground shadow ring-1 ring-border"
          aria-label="Yopish"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="p-4">
        <h2 className="text-[19px] font-bold leading-tight text-foreground">{place.name}</h2>
        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12.5px] text-muted-foreground">
          {place.categoryLabel && <span>{place.categoryLabel}</span>}
          {typeof place.distanceM === 'number' && (
            <span className="font-medium text-foreground/70">{formatDistance(place.distanceM)}</span>
          )}
          {open !== null && (
            <span
              className={cn(
                'inline-flex items-center gap-1 font-semibold',
                open ? 'text-emerald-600' : 'text-destructive',
              )}
            >
              <Clock className="h-3.5 w-3.5" />
              {open ? 'Hozir ochiq' : 'Yopiq'}
            </span>
          )}
        </div>

        <div className="mt-3 flex items-center gap-2">
          <button
            type="button"
            onClick={() => onDirections(place)}
            className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-full bg-primary px-4 py-2.5 text-[13.5px] font-semibold text-primary-foreground transition-opacity hover:opacity-90"
          >
            <Navigation className="h-4 w-4" />
            Yo\u2018nalish
          </button>
          <button
            type="button"
            onClick={() => onToggleSave(place)}
            className={cn(
              'flex h-11 w-11 items-center justify-center rounded-full ring-1 transition-colors',
              saved
                ? 'bg-primary/10 text-primary ring-primary'
                : 'bg-muted text-foreground ring-border hover:bg-muted/70',
            )}
            aria-label="Saqlash"
          >
            <Bookmark className={cn('h-4.5 w-4.5', saved && 'fill-current')} />
          </button>
          <button
            type="button"
            onClick={() => onShare(place)}
            className="flex h-11 w-11 items-center justify-center rounded-full bg-muted text-foreground ring-1 ring-border transition-colors hover:bg-muted/70"
            aria-label="Ulashish"
          >
            <Share2 className="h-4.5 w-4.5" />
          </button>
        </div>

        <div className="mt-4 flex items-center gap-1 border-b border-border">
          {TABS.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setTab(item.id)}
              className={cn(
                '-mb-px border-b-2 px-3 py-2 text-[13px] font-semibold transition-colors',
                tab === item.id
                  ? 'border-primary text-foreground'
                  : 'border-transparent text-muted-foreground hover:text-foreground',
              )}
            >
              {item.label}
            </button>
          ))}
        </div>

        <div className="pt-3">
          {tab === 'overview' && (
            <div className="flex flex-col gap-2.5 text-[13px]">
              {place.address && (
                <Row icon={<MapPin className="h-4 w-4" />} text={place.address} />
              )}
              {place.openingHours && (
                <Row icon={<Clock className="h-4 w-4" />} text={place.openingHours} />
              )}
              {place.phone && (
                <a href={'tel:' + place.phone} className="block">
                  <Row icon={<Phone className="h-4 w-4" />} text={place.phone} link />
                </a>
              )}
              {place.website && (
                <a href={place.website} target="_blank" rel="noopener noreferrer" className="block">
                  <Row icon={<Globe className="h-4 w-4" />} text={place.website} link />
                </a>
              )}
              {!place.address && !place.phone && !place.openingHours && (
                <p className="text-[13px] text-muted-foreground">
                  Bu joy uchun qo\u2018shimcha ma\u2018lumot hozircha yo\u2018q.
                </p>
              )}
            </div>
          )}

          {tab === 'details' && (
            <div className="flex flex-col gap-1.5 text-[12.5px]">
              <Detail label="Koordinata" value={place.latitude.toFixed(5) + ', ' + place.longitude.toFixed(5)} />
              {place.brand && <Detail label="Brend / operator" value={place.brand} />}
              {place.cuisine && <Detail label="Taomlar" value={place.cuisine.replace(/;/g, ', ')} />}
              {place.wheelchair && (
                <Detail
                  label="Nogironlar uchun"
                  value={place.wheelchair === 'yes' ? 'Qulay' : place.wheelchair === 'limited' ? 'Cheklangan' : 'Qulay emas'}
                />
              )}
              {place.tags?.['payment:cards'] && <Detail label="Karta to\u2018lovi" value="Qabul qilinadi" />}
              {place.tags?.internet_access && <Detail label="Internet" value={place.tags.internet_access} />}
              <Detail label="Manba" value={place.source === 'overpass' ? 'OpenStreetMap' : place.source} />
            </div>
          )}

          {tab === 'links' && (
            <div className="flex flex-col gap-2">
              <LinkAction
                icon={<Send className="h-4 w-4" />}
                title="Chatga yuborish"
                hint="Lokatsiya xabari sifatida do\u2018stlaringizga"
                onClick={() => onSendToChat(place)}
              />
              {onNearbyListings && (
                <LinkAction
                  icon={<ShoppingBag className="h-4 w-4" />}
                  title="Yaqin e\u2018lonlar"
                  hint="Bozorda shu atrofdagi mahsulotlar"
                  onClick={() => onNearbyListings(place)}
                />
              )}
              {onCreatePost && (
                <LinkAction
                  icon={<Star className="h-4 w-4" />}
                  title="Joy bilan post yaratish"
                  hint="Postga shu manzilni belgilash"
                  onClick={() => onCreatePost(place)}
                />
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Row({ icon, text, link }: { icon: React.ReactNode; text: string; link?: boolean }) {
  return (
    <div className="flex items-start gap-2.5">
      <span className="mt-0.5 text-muted-foreground">{icon}</span>
      <span className={cn('min-w-0 break-words', link ? 'text-primary underline-offset-2 hover:underline' : 'text-foreground')}>
        {text}
      </span>
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-3 rounded-xl bg-muted/40 px-3 py-2">
      <span className="text-muted-foreground">{label}</span>
      <span className="min-w-0 break-words text-right font-medium text-foreground">{value}</span>
    </div>
  );
}

function LinkAction({
  icon,
  title,
  hint,
  onClick,
}: {
  icon: React.ReactNode;
  title: string;
  hint: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-3 rounded-2xl bg-muted/50 p-3 text-left ring-1 ring-border/60 transition-colors hover:bg-muted"
    >
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
        {icon}
      </span>
      <span className="min-w-0">
        <span className="block text-[13.5px] font-semibold text-foreground">{title}</span>
        <span className="block text-[11.5px] leading-snug text-muted-foreground">{hint}</span>
      </span>
    </button>
  );
}

function categoryEmoji(categoryId: string): string {
  const map: Record<string, string> = {
    restaurant: '\ud83c\udf7d\ufe0f',
    cafe: '\u2615',
    fast_food: '\ud83c\udf54',
    bakery: '\ud83e\udd50',
    fuel: '\u26fd',
    parking: '\ud83c\udd7f\ufe0f',
    pharmacy: '\ud83d\udc8a',
    hospital: '\ud83c\udfe5',
    atm: '\ud83c\udfe7',
    bank: '\ud83c\udfe6',
    market: '\ud83e\uded1',
    supermarket: '\ud83d\uded2',
    mosque: '\ud83d\udd4c',
    hotel: '\ud83c\udfe8',
    school: '\ud83c\udfeb',
    gym: '\ud83c\udfcb\ufe0f',
    car_wash: '\ud83e\uddfd',
    bus_stop: '\ud83d\ude8f',
  };
  return map[categoryId] ?? '\ud83d\udccd';
}

import { useMemo, useState } from 'react';
import {
  Bookmark,
  BookmarkCheck,
  Clock,
  Copy,
  Globe,
  ImagePlus,
  MapPin,
  Navigation,
  PersonStanding,
  Phone,
  Send,
  Share2,
  ShoppingBag,
  Star,
  X,
} from 'lucide-react';
import type { MapPlace } from '@/lib/mapPlaces';
import { isProbablyOpen } from '@/lib/mapPlaces';
import { formatDistance } from '@/lib/geocoding';
import { categoryUi } from '@/lib/placeIcons';
import { usePlaceReviews } from '@/hooks/usePlaceReviews';
import { PlaceReviews } from '@/components/map/PlaceReviews';
import { NearbyListingsCard } from '@/components/map/NearbyListingsCard';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

interface PlaceDetailsCardProps {
  place: MapPlace;
  saved?: boolean;
  onClose: () => void;
  onDirections: (place: MapPlace) => void;
  onSendToChat: (place: MapPlace) => void;
  onToggleSave: (place: MapPlace) => void;
  onShare: (place: MapPlace) => void;
  onCreatePost?: (place: MapPlace) => void;
  className?: string;
}

type TabId = 'overview' | 'reviews' | 'details';

const TABS: { id: TabId; label: string }[] = [
  { id: 'overview', label: 'Umumiy' },
  { id: 'reviews', label: 'Izohlar' },
  { id: 'details', label: "Ma'lumot" },
];

function Row({
  icon,
  children,
  onClick,
}: {
  icon: React.ReactNode;
  children: React.ReactNode;
  onClick?: () => void;
}) {
  return (
    <div
      className={cn(
        'flex items-start gap-3 py-2 text-sm',
        onClick && 'cursor-pointer hover:text-primary',
      )}
      onClick={onClick}
    >
      <span className="mt-0.5 text-muted-foreground">{icon}</span>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

export function PlaceDetailsCard({
  place,
  saved,
  onClose,
  onDirections,
  onSendToChat,
  onToggleSave,
  onShare,
  onCreatePost,
  className,
}: PlaceDetailsCardProps) {
  const [tab, setTab] = useState<TabId>('overview');
  const ui = categoryUi(place.categoryId);
  const open = isProbablyOpen(place.openingHours);

  const placeRef = useMemo(
    () => ({
      id: place.id,
      source: place.source,
      name: place.name,
      latitude: place.latitude,
      longitude: place.longitude,
    }),
    [place],
  );

  const { summary } = usePlaceReviews(placeRef);
  const heroImage = typeof place.tags?.image === 'string' ? place.tags.image : null;

  const copyAddress = async () => {
    const text = place.address || place.latitude.toFixed(5) + ', ' + place.longitude.toFixed(5);
    try {
      await navigator.clipboard.writeText(text);
      toast.success('Manzil nusxalandi');
    } catch {
      toast.error('Nusxalanmadi');
    }
  };

  return (
    <div className={cn('flex flex-col overflow-hidden bg-background', className)}>
      <div className="relative">
        {heroImage ? (
          <img src={heroImage} alt={place.name} className="h-36 w-full object-cover" />
        ) : (
          <div
            className="flex h-24 w-full items-center justify-center"
            style={{ backgroundColor: ui.color + '1a' }}
          >
            <ui.Icon className="h-9 w-9" style={{ color: ui.color }} />
          </div>
        )}
        <button
          type="button"
          onClick={onClose}
          className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-full bg-background/90 text-foreground shadow-sm"
          aria-label="Yopish"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="px-4 pt-3">
        <h2 className="text-lg font-semibold leading-tight">{place.name}</h2>
        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
          <span className="font-medium" style={{ color: ui.color }}>
            {place.categoryLabel || ui.label}
          </span>
          {summary.total > 0 && (
            <span className="flex items-center gap-1 font-medium text-amber-500">
              <Star className="h-3.5 w-3.5 fill-current" />
              {summary.average.toFixed(1)}
              <span className="text-muted-foreground">({summary.total})</span>
            </span>
          )}
          {open !== null && (
            <span className={open ? 'font-medium text-emerald-600' : 'font-medium text-destructive'}>
              {open ? 'Ochiq' : 'Yopiq'}
            </span>
          )}
          {place.distanceM != null && <span>{formatDistance(place.distanceM)}</span>}
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => onDirections(place)}
            className="flex h-10 flex-1 items-center justify-center gap-2 rounded-xl bg-primary px-3 text-sm font-semibold text-primary-foreground"
          >
            <Navigation className="h-4 w-4" />
            Marshrut
          </button>
          <button
            type="button"
            onClick={() => onSendToChat(place)}
            className="flex h-10 w-10 items-center justify-center rounded-xl border border-border/70 text-muted-foreground hover:text-foreground"
            aria-label="Chatga yuborish"
          >
            <Send className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => onToggleSave(place)}
            className={cn(
              'flex h-10 w-10 items-center justify-center rounded-xl border border-border/70',
              saved ? 'text-primary' : 'text-muted-foreground hover:text-foreground',
            )}
            aria-label="Saqlash"
          >
            {saved ? <BookmarkCheck className="h-4 w-4" /> : <Bookmark className="h-4 w-4" />}
          </button>
          <button
            type="button"
            onClick={() => onShare(place)}
            className="flex h-10 w-10 items-center justify-center rounded-xl border border-border/70 text-muted-foreground hover:text-foreground"
            aria-label="Ulashish"
          >
            <Share2 className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="mt-3 flex border-b border-border/60 px-4">
        {TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setTab(item.id)}
            className={cn(
              'relative flex-1 pb-2 text-sm font-medium transition-colors',
              tab === item.id ? 'text-foreground' : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {item.label}
            {tab === item.id && (
              <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-primary" />
            )}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-3">
        {tab === 'overview' && (
          <div className="space-y-3">
            <div className="divide-y divide-border/50">
              {place.address && (
                <Row icon={<MapPin className="h-4 w-4" />} onClick={copyAddress}>
                  <p>{place.address}</p>
                  <p className="text-xs text-muted-foreground">Nusxalash uchun bosing</p>
                </Row>
              )}
              {place.openingHours && (
                <Row icon={<Clock className="h-4 w-4" />}>
                  <p className="whitespace-pre-wrap">{place.openingHours}</p>
                </Row>
              )}
              {place.phone && (
                <Row
                  icon={<Phone className="h-4 w-4" />}
                  onClick={() => window.open('tel:' + place.phone, '_self')}
                >
                  <p>{place.phone}</p>
                </Row>
              )}
              {place.website && (
                <Row
                  icon={<Globe className="h-4 w-4" />}
                  onClick={() => window.open(place.website as string, '_blank', 'noopener')}
                >
                  <p className="truncate">{place.website}</p>
                </Row>
              )}
            </div>

            <NearbyListingsCard
              latitude={place.latitude}
              longitude={place.longitude}
              areaName={place.address}
            />

            <div className="flex flex-wrap gap-2">
              {onCreatePost && (
                <button
                  type="button"
                  onClick={() => onCreatePost(place)}
                  className="flex h-9 items-center gap-1.5 rounded-lg border border-border/70 px-3 text-sm"
                >
                  <ImagePlus className="h-4 w-4" />
                  Shu joy haqida post
                </button>
              )}
              <button
                type="button"
                onClick={copyAddress}
                className="flex h-9 items-center gap-1.5 rounded-lg border border-border/70 px-3 text-sm"
              >
                <Copy className="h-4 w-4" />
                Manzilni nusxalash
              </button>
            </div>
          </div>
        )}

        {tab === 'reviews' && <PlaceReviews place={placeRef} />}

        {tab === 'details' && (
          <div className="divide-y divide-border/50">
            {place.brand && (
              <Row icon={<ShoppingBag className="h-4 w-4" />}>
                <p className="text-xs text-muted-foreground">Brend</p>
                <p>{place.brand}</p>
              </Row>
            )}
            {place.cuisine && (
              <Row icon={<ui.Icon className="h-4 w-4" />}>
                <p className="text-xs text-muted-foreground">Taomlar</p>
                <p>{place.cuisine}</p>
              </Row>
            )}
            {place.wheelchair && (
              <Row icon={<PersonStanding className="h-4 w-4" />}>
                <p className="text-xs text-muted-foreground">Nogironlar aravachasi</p>
                <p>{place.wheelchair === 'yes' ? 'Mavjud' : place.wheelchair}</p>
              </Row>
            )}
            <Row icon={<MapPin className="h-4 w-4" />}>
              <p className="text-xs text-muted-foreground">Koordinata</p>
              <p>
                {place.latitude.toFixed(5)}, {place.longitude.toFixed(5)}
              </p>
            </Row>
            <Row icon={<Globe className="h-4 w-4" />}>
              <p className="text-xs text-muted-foreground">Manba</p>
              <p className="uppercase">{place.source}</p>
            </Row>
          </div>
        )}
      </div>
    </div>
  );
}

export default PlaceDetailsCard;

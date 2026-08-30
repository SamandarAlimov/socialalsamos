import { useEffect, useMemo, useState } from 'react';
import {
  Bookmark,
  BookmarkCheck,
  Clock,
  Copy,
  CreditCard,
  Globe,
  ImagePlus,
  Mail,
  MapPin,
  MessageCircle,
  Navigation,
  PersonStanding,
  Phone,
  Share2,
  ShoppingBag,
  Star,
  Trees,
  UtensilsCrossed,
  Wifi,
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
  highContrast?: boolean;
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
  { id: 'details', label: 'Tafsilotlar' },
];

function InfoRow({
  icon,
  title,
  children,
  highContrast,
  onClick,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
  highContrast?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      disabled={!onClick}
      onClick={onClick}
      className={cn(
        'flex w-full items-start gap-3 rounded-2xl px-3 py-2.5 text-left transition',
        highContrast
          ? 'bg-white/[0.055] hover:bg-white/[0.09]'
          : 'bg-muted/35 hover:bg-muted/60',
        !onClick && 'cursor-default',
      )}
    >
      <span
        className={cn(
          'mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl',
          highContrast ? 'bg-white/[0.08] text-white/[0.70]' : 'bg-background text-muted-foreground',
        )}
      >
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span
          className={cn(
            'block text-[11px] font-semibold uppercase tracking-wide',
            highContrast ? 'text-white/[0.45]' : 'text-muted-foreground',
          )}
        >
          {title}
        </span>
        <span className="mt-0.5 block min-w-0 text-sm font-medium">{children}</span>
      </span>
    </button>
  );
}

function resolvePlaceImages(place: MapPlace): string[] {
  const urls = new Set<string>();

  const direct = place.tags?.image?.trim();
  if (direct) {
    for (const value of direct.split(';').map((item) => item.trim())) {
      if (/^https?:\/\//i.test(value)) urls.add(value);
    }
  }

  const commons = place.tags?.wikimedia_commons?.trim();
  if (commons?.toLowerCase().startsWith('file:')) {
    const filename = commons.slice(5).trim();
    if (filename) {
      urls.add(
        'https://commons.wikimedia.org/wiki/Special:Redirect/file/' +
          encodeURIComponent(filename),
      );
    }
  }

  return Array.from(urls).slice(0, 6);
}

function formatOpeningHours(value: string): string {
  const normalized = value.trim();
  if (!normalized) return '';
  if (normalized === '24/7') return 'Har kuni · 24 soat';

  const days: Record<string, string> = {
    Mo: 'Du',
    Tu: 'Se',
    We: 'Ch',
    Th: 'Pa',
    Fr: 'Ju',
    Sa: 'Sh',
    Su: 'Ya',
  };

  return normalized
    .split(';')
    .map((part) =>
      part
        .trim()
        .replace(/\b(Mo|Tu|We|Th|Fr|Sa|Su)\b/g, (token) => days[token] ?? token),
    )
    .filter(Boolean)
    .join(' · ');
}

type AmenityChip = {
  label: string;
  icon: React.ReactNode;
};

function amenityChips(tags?: Record<string, string>): AmenityChip[] {
  if (!tags) return [];
  const chips: AmenityChip[] = [];

  const yes = (key: string) => ['yes', 'designated', 'customers', 'permissive'].includes((tags[key] ?? '').toLowerCase());

  if (yes('internet_access') || ['wlan', 'wifi'].includes((tags.internet_access ?? '').toLowerCase())) {
    chips.push({ label: 'Wi‑Fi', icon: <Wifi className="h-3.5 w-3.5" /> });
  }
  if (yes('outdoor_seating')) {
    chips.push({ label: 'Ochiq joy', icon: <Trees className="h-3.5 w-3.5" /> });
  }
  if (yes('takeaway') || tags.takeaway === 'only') {
    chips.push({ label: 'Olib ketish', icon: <ShoppingBag className="h-3.5 w-3.5" /> });
  }
  if (yes('delivery')) {
    chips.push({ label: 'Yetkazib berish', icon: <Navigation className="h-3.5 w-3.5" /> });
  }
  if (
    yes('payment:cards') ||
    yes('payment:visa') ||
    yes('payment:mastercard') ||
    yes('payment:contactless')
  ) {
    chips.push({ label: 'Karta', icon: <CreditCard className="h-3.5 w-3.5" /> });
  }
  if (yes('wheelchair')) {
    chips.push({ label: 'Aravacha uchun mos', icon: <PersonStanding className="h-3.5 w-3.5" /> });
  }

  return chips.slice(0, 8);
}

export function PlaceDetailsCard({
  place,
  saved,
  highContrast = false,
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
  const photoUrls = useMemo(() => resolvePlaceImages(place), [place]);
  const heroImage = photoUrls[0] ?? null;
  const [imageFailed, setImageFailed] = useState(false);
  const amenities = useMemo(() => amenityChips(place.tags), [place.tags]);
  const email = place.tags?.email || place.tags?.['contact:email'] || null;
  const instagram = place.tags?.['contact:instagram'] || place.tags?.instagram || null;
  const telegram = place.tags?.['contact:telegram'] || place.tags?.telegram || null;
  const displayAddress =
    place.address || place.latitude.toFixed(5) + ', ' + place.longitude.toFixed(5);

  useEffect(() => {
    setImageFailed(false);
  }, [heroImage, place.id]);

  const copyAddress = async () => {
    try {
      await navigator.clipboard.writeText(displayAddress);
      toast.success('Manzil nusxalandi');
    } catch {
      toast.error('Nusxalanmadi');
    }
  };

  const secondaryButton = highContrast
    ? 'border-white/[0.12] bg-white/[0.055] text-white/[0.82] hover:bg-white/[0.1] hover:text-white'
    : 'border-border/60 bg-background/65 text-foreground hover:bg-muted/60';

  return (
    <div
      className={cn(
        'flex min-h-0 flex-col overflow-hidden',
        highContrast ? 'map-imagery-card bg-slate-950/90 text-white' : 'bg-background text-foreground',
        className,
      )}
    >
      <div className="relative shrink-0 overflow-hidden">
        {heroImage && !imageFailed ? (
          <>
            <img
              src={heroImage}
              alt={place.name}
              className="h-40 w-full object-cover"
              loading="lazy"
              referrerPolicy="no-referrer"
              onError={() => setImageFailed(true)}
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/65 via-black/5 to-black/20" />
          </>
        ) : (
          <div
            className="relative flex h-28 w-full items-center justify-center overflow-hidden"
            style={{
              background:
                highContrast
                  ? `linear-gradient(135deg, ${ui.color}55, rgba(15,23,42,.82) 72%)`
                  : `linear-gradient(135deg, ${ui.color}30, ${ui.color}0d 72%)`,
            }}
          >
            <div
              className="absolute -right-10 -top-12 h-36 w-36 rounded-full blur-2xl"
              style={{ backgroundColor: ui.color + '35' }}
            />
            <span
              className={cn(
                'relative flex h-16 w-16 items-center justify-center rounded-[22px] border shadow-xl backdrop-blur',
                highContrast ? 'border-white/15 bg-white/10' : 'border-white/70 bg-background/75',
              )}
            >
              <ui.Icon className="h-8 w-8" style={{ color: ui.color }} />
            </span>
          </div>
        )}

        <button
          type="button"
          onClick={onClose}
          className="absolute right-3 top-3 flex h-9 w-9 items-center justify-center rounded-full bg-black/45 text-white shadow-lg backdrop-blur transition hover:bg-black/60"
          aria-label="Yopish"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="shrink-0 px-4 pb-3 pt-3.5">
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <h2 className="text-[20px] font-extrabold leading-tight tracking-tight">
              {place.name || ui.label}
            </h2>
            <p
              className={cn(
                'mt-1 line-clamp-2 text-xs leading-relaxed',
                highContrast ? 'text-white/[0.58]' : 'text-muted-foreground',
              )}
            >
              {displayAddress}
            </p>
          </div>

          <span
            className={cn(
              'shrink-0 rounded-full px-2.5 py-1 text-[11px] font-bold',
              highContrast ? 'bg-white/[0.08]' : 'bg-muted/55',
            )}
            style={{ color: ui.color }}
          >
            {place.categoryLabel || ui.label}
          </span>
        </div>

        <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
          {summary.total > 0 && (
            <span
              className={cn(
                'flex items-center gap-1 rounded-full px-2 py-1 text-[11px] font-semibold',
                highContrast ? 'bg-amber-400/[0.12] text-amber-300' : 'bg-amber-500/10 text-amber-600',
              )}
            >
              <Star className="h-3.5 w-3.5 fill-current" />
              {summary.average.toFixed(1)}
              <span className={highContrast ? 'text-white/[0.45]' : 'text-muted-foreground'}>
                ({summary.total})
              </span>
            </span>
          )}

          {open !== null && (
            <span
              className={cn(
                'rounded-full px-2 py-1 text-[11px] font-semibold',
                open
                  ? highContrast
                    ? 'bg-emerald-400/[0.12] text-emerald-300'
                    : 'bg-emerald-500/10 text-emerald-600'
                  : highContrast
                    ? 'bg-red-400/[0.12] text-red-300'
                    : 'bg-destructive/10 text-destructive',
              )}
            >
              {open ? 'Ochiq' : 'Yopiq'}
            </span>
          )}

          {place.distanceM != null && (
            <span
              className={cn(
                'rounded-full px-2 py-1 text-[11px] font-semibold',
                highContrast ? 'bg-white/[0.08] text-white/[0.65]' : 'bg-muted/55 text-muted-foreground',
              )}
            >
              {formatDistance(place.distanceM)}
            </span>
          )}
        </div>

        <div className="mt-3 grid grid-cols-[1.7fr_repeat(3,1fr)] gap-2">
          <button
            type="button"
            onClick={() => onDirections(place)}
            className="flex h-11 items-center justify-center gap-2 rounded-2xl bg-primary px-3 text-sm font-bold text-primary-foreground shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
          >
            <Navigation className="h-4 w-4" />
            Marshrut
          </button>

          <button
            type="button"
            onClick={() => onSendToChat(place)}
            className={cn('flex h-11 flex-col items-center justify-center rounded-2xl border text-[10px] font-semibold transition', secondaryButton)}
            aria-label="Joylashuvni chatga yuborish"
            title="Joylashuvni xabarlar orqali yuborish"
          >
            <MessageCircle className="mb-0.5 h-4 w-4" />
            Chatga
          </button>

          <button
            type="button"
            onClick={() => onToggleSave(place)}
            className={cn(
              'flex h-11 flex-col items-center justify-center rounded-2xl border text-[10px] font-semibold transition',
              secondaryButton,
              saved && (highContrast ? 'border-primary/50 text-primary' : 'text-primary'),
            )}
            aria-label="Saqlash"
          >
            {saved ? <BookmarkCheck className="mb-0.5 h-4 w-4" /> : <Bookmark className="mb-0.5 h-4 w-4" />}
            {saved ? 'Saqlandi' : 'Saqlash'}
          </button>

          <button
            type="button"
            onClick={() => onShare(place)}
            className={cn('flex h-11 flex-col items-center justify-center rounded-2xl border text-[10px] font-semibold transition', secondaryButton)}
            aria-label="Ulashish"
          >
            <Share2 className="mb-0.5 h-4 w-4" />
            Ulashish
          </button>
        </div>
      </div>

      <div
        className={cn(
          'flex shrink-0 border-b px-3',
          highContrast ? 'border-white/10 bg-black/10' : 'border-border/50 bg-background/70',
        )}
      >
        {TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setTab(item.id)}
            className={cn(
              'relative flex-1 py-2.5 text-xs font-semibold transition-colors',
              tab === item.id
                ? highContrast
                  ? 'text-white'
                  : 'text-foreground'
                : highContrast
                  ? 'text-white/[0.45] hover:text-white/80'
                  : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {item.label}
            {tab === item.id && (
              <span className="absolute inset-x-4 bottom-0 h-0.5 rounded-full bg-primary" />
            )}
          </button>
        ))}
      </div>

      <div className="map-panel-scrollbar min-h-0 flex-1 overflow-y-auto px-4 py-3.5">
        {tab === 'overview' && (
          <div className="space-y-3">
            <div className="space-y-2">
              <InfoRow
                title="Manzil"
                icon={<MapPin className="h-4 w-4" />}
                highContrast={highContrast}
                onClick={copyAddress}
              >
                <span className="line-clamp-2">{displayAddress}</span>
              </InfoRow>

              {place.openingHours && (
                <InfoRow title="Ish vaqti" icon={<Clock className="h-4 w-4" />} highContrast={highContrast}>
                  <span className="whitespace-pre-wrap">{formatOpeningHours(place.openingHours)}</span>
                </InfoRow>
              )}

              {place.phone && (
                <InfoRow
                  title="Telefon"
                  icon={<Phone className="h-4 w-4" />}
                  highContrast={highContrast}
                  onClick={() => window.open('tel:' + place.phone, '_self')}
                >
                  {place.phone}
                </InfoRow>
              )}

              {place.website && (
                <InfoRow
                  title="Veb-sayt"
                  icon={<Globe className="h-4 w-4" />}
                  highContrast={highContrast}
                  onClick={() => window.open(place.website as string, '_blank', 'noopener')}
                >
                  <span className="block truncate">{place.website}</span>
                </InfoRow>
              )}
            </div>

            {photoUrls.length > 1 && (
              <div>
                <p
                  className={cn(
                    'mb-2 text-[11px] font-semibold uppercase tracking-wide',
                    highContrast ? 'text-white/[0.45]' : 'text-muted-foreground',
                  )}
                >
                  Rasmlar
                </p>
                <div className="map-panel-scrollbar flex gap-2 overflow-x-auto pb-1">
                  {photoUrls.slice(1).map((url) => (
                    <button
                      key={url}
                      type="button"
                      onClick={() => window.open(url, '_blank', 'noopener')}
                      className={cn(
                        'h-20 w-28 shrink-0 overflow-hidden rounded-xl border',
                        highContrast ? 'border-white/[0.10]' : 'border-border/[0.50]',
                      )}
                    >
                      <img
                        src={url}
                        alt={place.name}
                        className="h-full w-full object-cover"
                        loading="lazy"
                        referrerPolicy="no-referrer"
                      />
                    </button>
                  ))}
                </div>
              </div>
            )}

            {amenities.length > 0 && (
              <div
                className={cn(
                  'rounded-2xl border p-3',
                  highContrast
                    ? 'border-white/10 bg-white/[0.045]'
                    : 'border-border/50 bg-muted/25',
                )}
              >
                <p
                  className={cn(
                    'mb-2 text-[11px] font-semibold uppercase tracking-wide',
                    highContrast ? 'text-white/[0.45]' : 'text-muted-foreground',
                  )}
                >
                  Qulayliklar
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {amenities.map((amenity) => (
                    <span
                      key={amenity.label}
                      className={cn(
                        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-[11px] font-semibold',
                        highContrast
                          ? 'bg-white/[0.07] text-white/[0.78]'
                          : 'bg-background text-foreground/80 shadow-sm ring-1 ring-border/40',
                      )}
                    >
                      {amenity.icon}
                      {amenity.label}
                    </span>
                  ))}
                </div>
              </div>
            )}

            <NearbyListingsCard
              latitude={place.latitude}
              longitude={place.longitude}
              areaName={place.address}
              highContrast={highContrast}
            />

            <div className="grid grid-cols-2 gap-2">
              {onCreatePost && (
                <button
                  type="button"
                  onClick={() => onCreatePost(place)}
                  className={cn(
                    'flex min-h-10 items-center justify-center gap-1.5 rounded-xl border px-3 text-xs font-semibold transition',
                    secondaryButton,
                  )}
                >
                  <ImagePlus className="h-4 w-4" />
                  Post yaratish
                </button>
              )}
              <button
                type="button"
                onClick={copyAddress}
                className={cn(
                  'flex min-h-10 items-center justify-center gap-1.5 rounded-xl border px-3 text-xs font-semibold transition',
                  secondaryButton,
                )}
              >
                <Copy className="h-4 w-4" />
                Manzilni nusxalash
              </button>
            </div>
          </div>
        )}

        {tab === 'reviews' && <PlaceReviews place={placeRef} highContrast={highContrast} />}

        {tab === 'details' && (
          <div className="space-y-2">
            {place.brand && (
              <InfoRow title="Brend" icon={<ShoppingBag className="h-4 w-4" />} highContrast={highContrast}>
                {place.brand}
              </InfoRow>
            )}
            {place.cuisine && (
              <InfoRow title="Taomlar" icon={<UtensilsCrossed className="h-4 w-4" />} highContrast={highContrast}>
                {place.cuisine}
              </InfoRow>
            )}
            {email && (
              <InfoRow
                title="Email"
                icon={<Mail className="h-4 w-4" />}
                highContrast={highContrast}
                onClick={() => window.open('mailto:' + email, '_self')}
              >
                <span className="block truncate">{email}</span>
              </InfoRow>
            )}
            {instagram && (
              <InfoRow
                title="Instagram"
                icon={<Globe className="h-4 w-4" />}
                highContrast={highContrast}
                onClick={() => {
                  const value = String(instagram).replace(/^@/, '');
                  window.open(
                    /^https?:\/\//i.test(value)
                      ? value
                      : 'https://instagram.com/' + value,
                    '_blank',
                    'noopener',
                  );
                }}
              >
                <span className="block truncate">{instagram}</span>
              </InfoRow>
            )}
            {telegram && (
              <InfoRow
                title="Telegram"
                icon={<Globe className="h-4 w-4" />}
                highContrast={highContrast}
                onClick={() => {
                  const value = String(telegram).replace(/^@/, '');
                  window.open(
                    /^https?:\/\//i.test(value)
                      ? value
                      : 'https://t.me/' + value,
                    '_blank',
                    'noopener',
                  );
                }}
              >
                <span className="block truncate">{telegram}</span>
              </InfoRow>
            )}
            {place.wheelchair && (
              <InfoRow title="Kirish imkoniyati" icon={<PersonStanding className="h-4 w-4" />} highContrast={highContrast}>
                {place.wheelchair === 'yes' ? 'Nogironlar aravachasi uchun mos' : place.wheelchair}
              </InfoRow>
            )}
            <InfoRow title="Koordinata" icon={<MapPin className="h-4 w-4" />} highContrast={highContrast}>
              {place.latitude.toFixed(5)}, {place.longitude.toFixed(5)}
            </InfoRow>
            <InfoRow title="Ma’lumot manbasi" icon={<Globe className="h-4 w-4" />} highContrast={highContrast}>
              <span className="uppercase">{place.source}</span>
            </InfoRow>
          </div>
        )}
      </div>
    </div>
  );
}

export default PlaceDetailsCard;

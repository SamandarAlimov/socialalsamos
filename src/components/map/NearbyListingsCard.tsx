import { useNavigate } from 'react-router-dom';
import { ImageIcon, Loader2, ShoppingBag } from 'lucide-react';
import { useNearbyListings } from '@/hooks/useNearbyListings';
import { formatDistance } from '@/lib/geocoding';
import { cn } from '@/lib/utils';

interface NearbyListingsCardProps {
  latitude: number;
  longitude: number;
  areaName?: string | null;
  radiusKm?: number;
  className?: string;
}

function formatPrice(price: number, currency: string): string {
  return new Intl.NumberFormat('uz-UZ').format(Math.round(price)) + ' ' + (currency || 'UZS');
}

export function NearbyListingsCard({
  latitude,
  longitude,
  areaName,
  radiusKm = 5,
  className,
}: NearbyListingsCardProps) {
  const navigate = useNavigate();
  const { listings, loading } = useNearbyListings(
    { latitude, longitude },
    radiusKm,
    areaName ?? undefined,
  );

  if (!loading && !listings.length) return null;

  return (
    <div className={cn('rounded-xl border border-border/70 p-3', className)}>
      <div className="mb-2 flex items-center gap-2">
        <ShoppingBag className="h-4 w-4 text-primary" />
        <p className="text-sm font-semibold">Yaqin e\u2019lonlar</p>
        {loading && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
        {!loading && listings.length > 0 && (
          <button
            type="button"
            onClick={() =>
              navigate(
                '/marketplace?lat=' +
                  latitude +
                  '&lng=' +
                  longitude +
                  '&near=' +
                  radiusKm,
              )
            }
            className="ml-auto text-xs font-semibold text-primary hover:underline"
          >
            Barchasi
          </button>
        )}
      </div>

      <div className="flex gap-3 overflow-x-auto scrollbar-hide pb-1">
        {listings.slice(0, 12).map((listing) => (
          <button
            key={listing.id}
            type="button"
            onClick={() => navigate('/marketplace?product=' + listing.id)}
            className="w-36 shrink-0 text-left"
          >
            <div className="flex h-24 w-full items-center justify-center overflow-hidden rounded-lg bg-muted">
              {listing.image ? (
                <img
                  src={listing.image}
                  alt={listing.title}
                  className="h-full w-full object-cover"
                  loading="lazy"
                />
              ) : (
                <ImageIcon className="h-6 w-6 text-muted-foreground" />
              )}
            </div>
            <p className="mt-1 truncate text-xs font-medium">{listing.title}</p>
            <p className="text-xs text-primary">{formatPrice(listing.price, listing.currency)}</p>
            {listing.distanceM != null && (
              <p className="text-[11px] text-muted-foreground">
                {formatDistance(listing.distanceM)}
              </p>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}

export default NearbyListingsCard;

import { useMemo } from 'react';
import { Car, ExternalLink, Loader2, Phone } from 'lucide-react';
import { buildTaxiOffersWithProviders, formatSum, type TaxiPoint } from '@/lib/taxiProviders';
import { cn } from '@/lib/utils';
import { useTaxiProviders } from '@/hooks/useTaxiProviders';

interface TaxiOffersCardProps {
  from: TaxiPoint;
  to: TaxiPoint;
  distanceKm: number;
  durationMin: number;
  highContrast?: boolean;
  className?: string;
}

/**
 * O'z taksoparkimiz yo'q - mavjud taksi xizmatlariga (Yandex Go, MyTaxi,
 * inDrive, Millennium) manzil to'ldirilgan havola bilan ulanamiz.
 */
export function TaxiOffersCard({
  from,
  to,
  distanceKm,
  durationMin,
  highContrast = false,
  className,
}: TaxiOffersCardProps) {
  const { providers, loading } = useTaxiProviders();
  const offers = useMemo(
    () => buildTaxiOffersWithProviders(providers, from, to, distanceKm, durationMin),
    [providers, from, to, distanceKm, durationMin],
  );

  if (!offers.length) return null;

  return (
    <div
      className={cn(
        'rounded-2xl border p-3',
        highContrast
          ? 'border-white/10 bg-white/[0.045] text-white'
          : 'border-border/60 bg-background/60',
        className,
      )}
    >
      <div className="mb-2 flex items-center gap-2">
        <Car className="h-4 w-4 text-primary" />
        <p className="text-sm font-semibold">Taksi chaqirish</p>
        {loading && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
        <span className="ml-auto text-xs text-muted-foreground">
          {distanceKm.toFixed(1)} km \u00b7 {Math.round(durationMin)} daq
        </span>
      </div>

      <div className="space-y-2">
        {offers.map((offer) => (
          <div
            key={offer.provider.slug}
            className={cn(
              'flex items-center gap-3 rounded-2xl border px-3 py-2.5',
              highContrast ? 'border-white/10 bg-white/[0.045]' : 'border-border/50 bg-background/55',
            )}
          >
            <span className={cn('flex h-10 w-10 items-center justify-center overflow-hidden rounded-xl text-sm font-bold', highContrast ? 'bg-white/[0.08]' : 'bg-muted')}>
              {offer.provider.logoUrl ? (
                <img
                  src={offer.provider.logoUrl}
                  alt=""
                  className="h-full w-full object-contain"
                  loading="lazy"
                />
              ) : (
                offer.provider.name.slice(0, 1)
              )}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{offer.provider.name}</p>
              <p className="text-xs text-muted-foreground">
                {offer.estimate > 0 ? 'Taxminan ' + formatSum(offer.estimate) : 'Narx ilovada'}
              </p>
            </div>
            {offer.provider.phone && (
              <a
                href={'tel:' + offer.provider.phone}
                className={cn(
                  'flex h-8 w-8 items-center justify-center rounded-xl border transition',
                  highContrast
                    ? 'border-white/12 bg-white/[0.04] text-white/60 hover:bg-white/[0.1] hover:text-white'
                    : 'border-border/60 text-muted-foreground hover:text-foreground',
                )}
                aria-label="Qo'ng'iroq"
              >
                <Phone className="h-4 w-4" />
              </a>
            )}
            <a
              href={offer.url || '#'}
              onClick={(event) => {
                if (!offer.url) event.preventDefault();
              }}
              target="_blank"
              rel="noopener noreferrer"
              className={cn(
                'flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-xs font-semibold',
                offer.url
                  ? 'bg-primary text-primary-foreground'
                  : 'cursor-not-allowed bg-muted text-muted-foreground',
              )}
            >
              Chaqirish
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          </div>
        ))}
      </div>

      <p className="mt-2 text-[11px] text-muted-foreground">
        Narxlar taxminiy hisoblanadi, yakuniy summa xizmat ilovasida ko'rsatiladi.
      </p>
    </div>
  );
}

export default TaxiOffersCard;

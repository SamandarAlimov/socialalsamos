import { useMemo } from 'react';
import { Car, ExternalLink, Phone } from 'lucide-react';
import { buildTaxiOffers, formatSum, type TaxiPoint } from '@/lib/taxiProviders';
import { cn } from '@/lib/utils';

interface TaxiOffersCardProps {
  from: TaxiPoint;
  to: TaxiPoint;
  distanceKm: number;
  durationMin: number;
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
  className,
}: TaxiOffersCardProps) {
  const offers = useMemo(
    () => buildTaxiOffers(from, to, distanceKm, durationMin),
    [from, to, distanceKm, durationMin],
  );

  if (!offers.length) return null;

  return (
    <div className={cn('rounded-xl border border-border/70 p-3', className)}>
      <div className="mb-2 flex items-center gap-2">
        <Car className="h-4 w-4 text-primary" />
        <p className="text-sm font-semibold">Taksi chaqirish</p>
        <span className="ml-auto text-xs text-muted-foreground">
          {distanceKm.toFixed(1)} km \u00b7 {Math.round(durationMin)} daq
        </span>
      </div>

      <div className="space-y-2">
        {offers.map((offer) => (
          <div
            key={offer.provider.slug}
            className="flex items-center gap-3 rounded-lg border border-border/60 px-3 py-2"
          >
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-muted text-sm font-bold">
              {offer.provider.name.slice(0, 1)}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{offer.provider.name}</p>
              <p className="text-xs text-muted-foreground">
                {offer.estimate ? 'Taxminan ' + formatSum(offer.estimate) : offer.estimateLabel}
              </p>
            </div>
            {offer.provider.phone && (
              <a
                href={'tel:' + offer.provider.phone}
                className="flex h-8 w-8 items-center justify-center rounded-lg border border-border/60 text-muted-foreground hover:text-foreground"
                aria-label="Qo'ng'iroq"
              >
                <Phone className="h-4 w-4" />
              </a>
            )}
            <a
              href={offer.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex h-8 items-center gap-1.5 rounded-lg bg-primary px-2.5 text-xs font-semibold text-primary-foreground"
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

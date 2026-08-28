import { Car, ExternalLink, Phone } from 'lucide-react';
import { cn } from '@/lib/utils';
import { buildTaxiOffers, type TaxiPoint } from '@/lib/taxiProviders';

interface TaxiOffersCardProps {
  from: TaxiPoint;
  to: TaxiPoint;
  distanceKm: number;
  durationMin: number;
  className?: string;
}

/**
 * Mavjud taksi parklarini ulash: bosilganda provayder ilovasida manzil
 * to'ldirilgan holda buyurtma ekrani ochiladi. O'z taksoparkimiz kerak emas.
 */
export function TaxiOffersCard({
  from,
  to,
  distanceKm,
  durationMin,
  className,
}: TaxiOffersCardProps) {
  const offers = buildTaxiOffers(from, to, distanceKm, durationMin);

  return (
    <div className={cn('rounded-3xl bg-card p-3 ring-1 ring-border', className)}>
      <div className="mb-2 flex items-center gap-2 px-1">
        <Car className="h-4 w-4 text-primary" />
        <p className="text-[14px] font-bold text-foreground">Taksi buyurtma qilish</p>
        <span className="ml-auto text-[11px] text-muted-foreground">
          {distanceKm.toFixed(1)} km \u00b7 ~{Math.round(durationMin)} daq
        </span>
      </div>

      <div className="flex flex-col gap-2">
        {offers.map((offer) => (
          <div
            key={offer.provider.slug}
            className="flex items-center gap-3 rounded-2xl bg-muted/50 p-3 ring-1 ring-border/60"
          >
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-background text-lg ring-1 ring-border">
              {offer.provider.emoji}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[14px] font-semibold text-foreground">
                {offer.provider.name}
              </p>
              <p className="text-[12px] text-muted-foreground">
                ~{offer.estimateLabel} \u00b7 taxminiy
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-1.5">
              {offer.provider.phone && (
                <a
                  href={'tel:' + offer.provider.phone}
                  className="flex h-9 w-9 items-center justify-center rounded-full bg-background text-foreground ring-1 ring-border transition-colors hover:bg-muted"
                  aria-label="Qo'ng'iroq"
                >
                  <Phone className="h-4 w-4" />
                </a>
              )}
              <a
                href={offer.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 rounded-full bg-primary px-3.5 py-2 text-[12px] font-semibold text-primary-foreground transition-opacity hover:opacity-90"
              >
                Buyurtma
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
            </div>
          </div>
        ))}
      </div>

      <p className="mt-2 px-1 text-[11px] leading-snug text-muted-foreground">
        Narxlar taxminiy. Aniq narx va haydovchi tanlovi provayder ilovasida ko\u2018rsatiladi.
      </p>
    </div>
  );
}

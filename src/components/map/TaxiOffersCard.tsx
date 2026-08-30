import { useMemo, useState } from 'react';
import {
  Car,
  Check,
  ChevronDown,
  ExternalLink,
  Loader2,
  Phone,
  ShieldCheck,
} from 'lucide-react';
import {
  buildTaxiOffersWithProviders,
  formatSum,
  type TaxiPoint,
} from '@/lib/taxiProviders';
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
 * Alsamos Taxi Hub:
 * foydalanuvchi provayderlarni Alsamos ichida solishtiradi. Rasmiy booking API
 * ulanmagan provayderda faqat oxirgi "davom etish" bosqichi tashqi servisga
 * o'tadi. Bu narx/ETA ni real provider quote deb ko'rsatib yubormaslik uchun
 * taxminiy qiymatlarni aniq belgilaydi.
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
  const [expanded, setExpanded] = useState(false);
  const [selectedSlug, setSelectedSlug] = useState<string | null>(null);

  const offers = useMemo(
    () =>
      buildTaxiOffersWithProviders(
        providers,
        from,
        to,
        distanceKm,
        durationMin,
      ),
    [providers, from, to, distanceKm, durationMin],
  );

  const selected =
    offers.find((offer) => offer.provider.slug === selectedSlug) ??
    offers[0] ??
    null;
  const cheapest = useMemo(
    () =>
      offers
        .filter((offer) => offer.estimate > 0)
        .reduce<(typeof offers)[number] | null>(
          (best, offer) =>
            !best || offer.estimate < best.estimate ? offer : best,
          null,
        ),
    [offers],
  );

  if (!offers.length && !loading) return null;

  const muted = highContrast ? 'text-white/[0.55]' : 'text-muted-foreground';
  const surface = highContrast
    ? 'border-white/[0.10] bg-white/[0.045]'
    : 'border-border/[0.55] bg-background/[0.62]';

  if (!expanded) {
    return (
      <button
        type="button"
        onClick={() => setExpanded(true)}
        className={cn(
          'flex w-full items-center gap-3 rounded-2xl border p-3 text-left transition hover:-translate-y-0.5 hover:shadow-md',
          surface,
          highContrast ? 'text-white' : 'text-foreground',
          className,
        )}
      >
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-primary/[0.12] text-primary">
          <Car className="h-5 w-5" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-bold">Taksi</span>
          <span className={cn('mt-0.5 block text-xs', muted)}>
            {loading
              ? 'Xizmatlar yuklanmoqda...'
              : cheapest
                ? '≈ ' + formatSum(cheapest.estimate) + ' dan'
                : 'Variantlarni ko‘rish'}
          </span>
        </span>
        <ChevronDown className={cn('h-4 w-4 shrink-0', muted)} />
      </button>
    );
  }

  return (
    <div
      className={cn(
        'rounded-2xl border p-3',
        surface,
        highContrast ? 'text-white' : 'text-foreground',
        className,
      )}
    >
      <div className="mb-3 flex items-center gap-2">
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/[0.12] text-primary">
          <Car className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold">Alsamos Taxi Hub</p>
          <p className={cn('text-[11px]', muted)}>
            {distanceKm.toFixed(1)} km · {Math.round(durationMin)} daq
          </p>
        </div>
        {loading && <Loader2 className={cn('h-4 w-4 animate-spin', muted)} />}
        <button
          type="button"
          onClick={() => setExpanded(false)}
          className={cn(
            'flex h-8 w-8 items-center justify-center rounded-xl transition',
            highContrast
              ? 'bg-white/[0.05] text-white/[0.62] hover:bg-white/[0.1] hover:text-white'
              : 'bg-muted/[0.50] text-muted-foreground hover:text-foreground',
          )}
          aria-label="Taksi variantlarini yopish"
        >
          <ChevronDown className="h-4 w-4 rotate-180" />
        </button>
      </div>

      <div
        className={cn(
          'mb-3 rounded-xl border px-3 py-2 text-[11px] leading-relaxed',
          highContrast
            ? 'border-amber-300/[0.14] bg-amber-300/[0.06] text-amber-100/[0.78]'
            : 'border-amber-500/[0.18] bg-amber-500/[0.06] text-amber-700',
        )}
      >
        Narxlar Alsamos hisoblagan <b>taxminiy</b> qiymat. Rasmiy provider API
        ulanmaguncha real mashina ETA va yakuniy narx provayder tasdig‘idan keyin
        ma’lum bo‘ladi.
      </div>

      <div className="space-y-2">
        {offers.map((offer) => {
          const active = selected?.provider.slug === offer.provider.slug;
          return (
            <button
              key={offer.provider.slug}
              type="button"
              onClick={() => setSelectedSlug(offer.provider.slug)}
              className={cn(
                'flex w-full items-center gap-3 rounded-2xl border px-3 py-2.5 text-left transition',
                active
                  ? 'border-primary/[0.45] bg-primary/[0.08] ring-1 ring-primary/[0.12]'
                  : highContrast
                    ? 'border-white/[0.10] bg-white/[0.035] hover:bg-white/[0.065]'
                    : 'border-border/[0.45] bg-background/[0.48] hover:bg-muted/[0.45]',
              )}
            >
              <span
                className={cn(
                  'flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-xl text-sm font-bold',
                  highContrast ? 'bg-white/[0.08]' : 'bg-muted',
                )}
              >
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

              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold">
                  {offer.provider.name}
                </span>
                <span className={cn('block text-xs', muted)}>
                  {offer.estimate > 0
                    ? '≈ ' + formatSum(offer.estimate)
                    : 'Narx providerda'}
                </span>
              </span>

              {active ? (
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary text-primary-foreground">
                  <Check className="h-3.5 w-3.5" />
                </span>
              ) : (
                <span
                  className={cn(
                    'h-4 w-4 rounded-full border-2',
                    highContrast ? 'border-white/[0.28]' : 'border-border',
                  )}
                />
              )}
            </button>
          );
        })}
      </div>

      {selected && (
        <div
          className={cn(
            'mt-3 rounded-2xl border p-3',
            highContrast
              ? 'border-white/[0.10] bg-black/[0.10]'
              : 'border-border/[0.45] bg-muted/[0.22]',
          )}
        >
          <div className="flex items-start gap-3">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold">{selected.provider.name}</p>
              <p className={cn('mt-0.5 text-xs', muted)}>
                Alsamos ichida manzil va variant tanlandi. Buyurtmani yakunlash
                uchun provider tasdig‘i kerak.
              </p>
            </div>
          </div>

          <div className="mt-3 flex gap-2">
            {selected.provider.phone && (
              <a
                href={'tel:' + selected.provider.phone}
                className={cn(
                  'flex h-10 items-center justify-center gap-1.5 rounded-xl border px-3 text-xs font-semibold transition',
                  highContrast
                    ? 'border-white/[0.12] bg-white/[0.04] text-white/[0.72] hover:bg-white/[0.09]'
                    : 'border-border/[0.55] bg-background text-foreground hover:bg-muted',
                )}
              >
                <Phone className="h-4 w-4" />
                Qo‘ng‘iroq
              </a>
            )}

            <a
              href={selected.url || '#'}
              onClick={(event) => {
                if (!selected.url) event.preventDefault();
              }}
              target="_blank"
              rel="noopener noreferrer"
              className={cn(
                'flex h-10 min-w-0 flex-1 items-center justify-center gap-1.5 rounded-xl px-3 text-xs font-bold',
                selected.url
                  ? 'bg-primary text-primary-foreground'
                  : 'cursor-not-allowed bg-muted text-muted-foreground',
              )}
            >
              Providerda davom etish
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          </div>
        </div>
      )}
    </div>
  );
}

export default TaxiOffersCard;

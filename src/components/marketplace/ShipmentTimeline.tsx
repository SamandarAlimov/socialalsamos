import {
  AlertTriangle,
  CheckCircle2,
  Clock3,
  MapPin,
  PackageCheck,
  Plane,
  Ship,
  ShieldCheck,
  TrainFront,
  Truck,
} from 'lucide-react';
import { format } from 'date-fns';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import {
  type MarketplaceShipment,
  type ShipmentStatus,
  type ShipmentTransportMode,
  useShipmentTracking,
} from '@/hooks/useShipmentTracking';

const STATUS_LABELS: Record<ShipmentStatus, string> = {
  draft: 'Tayyorlanmoqda',
  booked: 'Yetkazma yaratildi',
  handed_over: 'Tashuvchiga topshirildi',
  customs_export: 'Eksport bojxonasida',
  in_transit: 'Xalqaro tranzitda',
  customs_import: 'Import bojxonasida',
  customs_hold: 'Bojxonada ushlab turilibdi',
  out_for_delivery: 'Mahalliy yetkazishda',
  delivered: 'Yetkazildi',
  exception: 'Muammo yuz berdi',
  cancelled: 'Yetkazma bekor qilindi',
};

const CUSTOMS_LABELS: Record<string, string> = {
  not_required: 'Bojxona talab qilinmaydi',
  documents_required: 'Hujjatlar tayyorlanmoqda',
  export_review: 'Eksport tekshiruvida',
  export_cleared: 'Eksport bojxonasi yakunlandi',
  import_review: 'Import tekshiruvida',
  payment_required: 'Boj / soliq to‘lovi kerak',
  hold: 'Bojxonada ushlab turilibdi',
  cleared: 'Bojxona yakunlandi',
  rejected: 'Bojxona rad etdi',
};

function ModeIcon({ mode, className }: { mode: ShipmentTransportMode; className?: string }) {
  if (mode === 'air') return <Plane className={className} />;
  if (mode === 'sea') return <Ship className={className} />;
  if (mode === 'rail') return <TrainFront className={className} />;
  return <Truck className={className} />;
}

function eventIcon(status: string) {
  if (status === 'delivered') return CheckCircle2;
  if (status === 'customs_export' || status === 'customs_import' || status === 'customs_hold') return ShieldCheck;
  if (status === 'exception') return AlertTriangle;
  if (status === 'booked' || status === 'draft') return Clock3;
  if (status === 'handed_over') return PackageCheck;
  return Truck;
}

function formatDate(value?: string | null) {
  if (!value) return null;
  try {
    return format(new Date(value), 'dd.MM.yyyy HH:mm');
  } catch {
    return null;
  }
}

function routeLabel(shipment: MarketplaceShipment) {
  const from = shipment.origin_country || 'Jo‘natuvchi';
  const to = shipment.destination_country || 'Qabul qiluvchi';
  return `${from} → ${to}`;
}

interface ShipmentTimelineProps {
  orderId: string;
  orderStatus?: string | null;
  shippingAddress?: Record<string, any> | null;
}

export function ShipmentTimeline({ orderId, orderStatus, shippingAddress }: ShipmentTimelineProps) {
  const { latest, isLoading, error, schemaAvailable } = useShipmentTracking(orderId);

  if (!schemaAvailable) return null;

  if (isLoading) {
    return (
      <div className="space-y-2 rounded-2xl border border-border/30 bg-muted/15 p-4">
        <Skeleton className="h-5 w-40" />
        <Skeleton className="h-16 w-full rounded-xl" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-start gap-2 rounded-2xl border border-destructive/20 bg-destructive/5 p-3 text-xs text-destructive">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
        <span>{error}</span>
      </div>
    );
  }

  if (!latest) {
    if (orderStatus === 'pending' || orderStatus === 'processing') {
      return (
        <div className="rounded-2xl border border-border/30 bg-muted/15 p-4">
          <div className="flex items-start gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-background shadow-sm">
              <PackageCheck className="h-4 w-4" />
            </span>
            <div className="min-w-0">
              <p className="text-sm font-semibold">Yetkazish tayyorlanmoqda</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Sotuvchi tashuvchi, transport va tracking ma’lumotlarini biriktirgach shu yerda to‘liq yo‘l ko‘rinadi.
              </p>
              {shippingAddress?.country && (
                <p className="mt-1 text-[11px] font-medium text-foreground/70">Manzil mamlakati: {shippingAddress.country}</p>
              )}
            </div>
          </div>
        </div>
      );
    }
    return null;
  }

  const customs = latest.customs;
  const customsTotal = customs
    ? Number(customs.duty_amount || 0) + Number(customs.tax_amount || 0) + Number(customs.fees_amount || 0)
    : 0;
  const statusLabel = STATUS_LABELS[latest.status] || latest.status;
  const eta = formatDate(latest.estimated_delivery_at);
  const events = [...latest.events].reverse();

  return (
    <section className="space-y-3 rounded-2xl border border-border/30 bg-card/45 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h4 className="text-sm font-bold">Yetkazishni kuzatish</h4>
            <Badge variant="outline" className="rounded-full text-[10px]">
              {statusLabel}
            </Badge>
          </div>
          <p className="mt-1 flex items-center gap-1.5 text-xs font-medium text-foreground/75">
            <ModeIcon mode={latest.transport_mode} className="h-3.5 w-3.5" />
            {routeLabel(latest)}
          </p>
        </div>
        {eta && (
          <div className="shrink-0 text-right">
            <p className="text-[9px] font-bold uppercase tracking-[0.12em] text-muted-foreground">Taxminiy</p>
            <p className="mt-0.5 text-[11px] font-semibold">{eta}</p>
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
        <InfoTile label="Tashuvchi" value={latest.carrier?.name || latest.carrier_name || 'Alsamos Logistics'} />
        <InfoTile label="Tracking" value={latest.tracking_number || 'Kutilmoqda'} mono />
        <InfoTile label="Bojxona" value={CUSTOMS_LABELS[latest.customs_status] || latest.customs_status} />
        <InfoTile
          label="Shart"
          value={latest.incoterm === 'DDP' ? 'DDP · boj kiritilgan' : 'DAP · import boji xaridorda'}
        />
      </div>

      {customs && (
        <div className="rounded-xl border border-border/30 bg-muted/20 p-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="flex items-center gap-1.5 text-xs font-semibold"><ShieldCheck className="h-3.5 w-3.5" /> Bojxona deklaratsiyasi</p>
              <p className="mt-1 text-[11px] text-muted-foreground">
                {customs.hs_code ? `HS ${customs.hs_code}` : 'HS kod kutilmoqda'}
                {customs.invoice_number ? ` · Invoice ${customs.invoice_number}` : ''}
              </p>
            </div>
            {customsTotal > 0 && (
              <div className="text-right">
                <p className="text-[9px] uppercase tracking-wide text-muted-foreground">Taxminiy boj/soliq</p>
                <p className="text-xs font-bold tabular-nums">{customsTotal.toLocaleString()} {customs.currency}</p>
              </div>
            )}
          </div>
        </div>
      )}

      {events.length > 0 && (
        <div className="space-y-0">
          {events.map((event, index) => {
            const Icon = eventIcon(event.status);
            const isLatest = index === 0;
            return (
              <div key={event.id} className="relative flex gap-3 pb-4 last:pb-0">
                {index < events.length - 1 && <span className="absolute left-[15px] top-8 h-[calc(100%-20px)] w-px bg-border" />}
                <span className={cn(
                  'relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border',
                  isLatest ? 'border-foreground bg-foreground text-background' : 'border-border bg-background text-muted-foreground',
                )}>
                  <Icon className="h-3.5 w-3.5" />
                </span>
                <div className="min-w-0 flex-1 pt-0.5">
                  <div className="flex items-start justify-between gap-3">
                    <p className="text-xs font-semibold">{event.title}</p>
                    <time className="shrink-0 text-[10px] text-muted-foreground">{formatDate(event.occurred_at)}</time>
                  </div>
                  {(event.location || event.country_code) && (
                    <p className="mt-0.5 flex items-center gap-1 text-[11px] text-muted-foreground">
                      <MapPin className="h-3 w-3" /> {[event.location, event.country_code].filter(Boolean).join(', ')}
                    </p>
                  )}
                  {event.description && <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">{event.description}</p>}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

function InfoTile({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="min-w-0 rounded-xl bg-muted/25 p-2.5">
      <p className="text-[9px] font-bold uppercase tracking-[0.1em] text-muted-foreground">{label}</p>
      <p className={cn('mt-1 line-clamp-2 text-[11px] font-semibold leading-snug', mono && 'font-mono')}>{value}</p>
    </div>
  );
}

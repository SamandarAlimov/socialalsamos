import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Clock3,
  PackageCheck,
  Plane,
  Save,
  Ship,
  ShieldCheck,
  TrainFront,
  Truck,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import type { Order, OrderStatus } from '@/hooks/useOrders';
import {
  type ShipmentStatus,
  type ShipmentTransportMode,
  useSellerShipmentActions,
  useShipmentTracking,
} from '@/hooks/useShipmentTracking';
import { cn } from '@/lib/utils';

const MODES: Array<{ id: ShipmentTransportMode; label: string }> = [
  { id: 'courier', label: 'Kuryer' },
  { id: 'truck', label: 'Avtomobil' },
  { id: 'air', label: 'Avia' },
  { id: 'rail', label: 'Temir yo‘l' },
  { id: 'sea', label: 'Dengiz' },
  { id: 'multimodal', label: 'Aralash' },
];

const EVENT_PRESETS: Array<{
  status: ShipmentStatus;
  code: string;
  label: string;
  description: string;
}> = [
  { status: 'handed_over', code: 'carrier_handover', label: 'Tashuvchiga topshirildi', description: 'Paket tashuvchiga topshirildi va yo‘lga tayyor.' },
  { status: 'customs_export', code: 'export_customs', label: 'Eksport bojxonasi', description: 'Jo‘natuvchi mamlakat bojxonasida tekshiruv boshlandi.' },
  { status: 'in_transit', code: 'international_transit', label: 'Xalqaro tranzit', description: 'Yetkazma xalqaro yo‘nalishda harakatlanmoqda.' },
  { status: 'customs_import', code: 'import_customs', label: 'Import bojxonasi', description: 'Qabul qiluvchi mamlakat bojxonasida tekshiruv boshlandi.' },
  { status: 'customs_hold', code: 'customs_hold', label: 'Bojxonada ushlab turish', description: 'Qo‘shimcha hujjat yoki to‘lov talab qilinmoqda.' },
  { status: 'out_for_delivery', code: 'last_mile', label: 'Mahalliy kuryerda', description: 'Yetkazma oxirgi manzilga olib borilmoqda.' },
  { status: 'delivered', code: 'delivered', label: 'Yetkazildi', description: 'Buyurtma qabul qiluvchiga topshirildi.' },
];

function ModeIcon({ mode }: { mode: ShipmentTransportMode }) {
  if (mode === 'air') return <Plane className="h-4 w-4" />;
  if (mode === 'sea') return <Ship className="h-4 w-4" />;
  if (mode === 'rail') return <TrainFront className="h-4 w-4" />;
  return <Truck className="h-4 w-4" />;
}

function countryFromAddress(address: any) {
  return String(address?.country_code || address?.country || '').trim().toUpperCase();
}

interface SellerShipmentManagerProps {
  order: Order;
  restaurantMode?: boolean;
  onOrderStatusChange?: (status: OrderStatus) => Promise<void> | void;
}

export function SellerShipmentManager({
  order,
  restaurantMode = false,
  onOrderStatusChange,
}: SellerShipmentManagerProps) {
  const { latest, isLoading, error, schemaAvailable, refresh } = useShipmentTracking(order.id);
  const { createShipment, addEvent, saveCustoms, isSaving } = useSellerShipmentActions();
  const [showCreate, setShowCreate] = useState(false);
  const [showCustoms, setShowCustoms] = useState(false);
  const [mode, setMode] = useState<ShipmentTransportMode>('multimodal');
  const [originCountry, setOriginCountry] = useState('UZ');
  const [destinationCountry, setDestinationCountry] = useState(() => countryFromAddress(order.shipping_address));
  const [carrierName, setCarrierName] = useState('Alsamos Logistics');
  const [trackingNumber, setTrackingNumber] = useState('');
  const [serviceLevel, setServiceLevel] = useState('standard');
  const [incoterm, setIncoterm] = useState<'DDP' | 'DAP'>('DAP');
  const [etaDate, setEtaDate] = useState('');
  const [eventLocation, setEventLocation] = useState('');
  const [eventCountry, setEventCountry] = useState('');

  const [hsCode, setHsCode] = useState('');
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [dutyAmount, setDutyAmount] = useState('0');
  const [taxAmount, setTaxAmount] = useState('0');
  const [feesAmount, setFeesAmount] = useState('0');
  const [customsNotes, setCustomsNotes] = useState('');

  useEffect(() => {
    setDestinationCountry(countryFromAddress(order.shipping_address));
  }, [order.id, order.shipping_address]);

  useEffect(() => {
    if (!latest) return;
    setOriginCountry(latest.origin_country || originCountry || 'UZ');
    setDestinationCountry(latest.destination_country || destinationCountry);
    setCarrierName(latest.carrier_name || carrierName);
    setTrackingNumber(latest.tracking_number || '');
    setIncoterm(latest.incoterm || 'DAP');
    if (latest.customs) {
      setHsCode(latest.customs.hs_code || '');
      setInvoiceNumber(latest.customs.invoice_number || '');
      setDutyAmount(String(latest.customs.duty_amount || 0));
      setTaxAmount(String(latest.customs.tax_amount || 0));
      setFeesAmount(String(latest.customs.fees_amount || 0));
      setCustomsNotes(latest.customs.notes || '');
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [latest?.id]);

  const international = Boolean(
    (latest?.origin_country || originCountry) &&
    (latest?.destination_country || destinationCountry) &&
    String(latest?.origin_country || originCountry).toUpperCase() !== String(latest?.destination_country || destinationCountry).toUpperCase(),
  );

  const eventPresets = useMemo(() => {
    if (!latest) return [];
    return EVENT_PRESETS.filter(event => {
      if (!international && ['customs_export', 'customs_import', 'customs_hold'].includes(event.status)) return false;
      if (latest.status === 'delivered' || latest.status === 'cancelled') return false;
      return event.status !== latest.status;
    });
  }, [international, latest]);

  if (restaurantMode || !schemaAvailable) return null;

  if (isLoading) {
    return <div className="rounded-xl border border-border/30 bg-muted/15 p-3 text-xs text-muted-foreground">Logistika ma’lumotlari yuklanmoqda…</div>;
  }

  if (error) {
    return (
      <div className="flex items-start gap-2 rounded-xl border border-destructive/20 bg-destructive/5 p-3 text-xs text-destructive">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> {error}
      </div>
    );
  }

  const handleCreate = async () => {
    const eta = etaDate ? new Date(`${etaDate}T18:00:00`).toISOString() : null;
    const result = await createShipment({
      orderId: order.id,
      transportMode: mode,
      serviceLevel,
      carrierName,
      trackingNumber,
      originCountry,
      destinationCountry,
      incoterm,
      estimatedDeliveryAt: eta,
    });
    if (result.success) {
      setShowCreate(false);
      await refresh();
    }
  };

  const handleEvent = async (preset: (typeof EVENT_PRESETS)[number]) => {
    const result = await addEvent({
      shipmentId: latest!.id,
      status: preset.status,
      eventCode: preset.code,
      title: preset.label,
      description: preset.description,
      location: eventLocation,
      countryCode: eventCountry,
    });
    if (!result.success) return;

    if (
      order.status === 'processing' &&
      ['handed_over','customs_export','in_transit','customs_import','customs_hold','out_for_delivery'].includes(preset.status)
    ) {
      await onOrderStatusChange?.('shipped');
    } else if (order.status === 'shipped' && preset.status === 'delivered') {
      await onOrderStatusChange?.('delivered');
    }

    setEventLocation('');
    setEventCountry('');
    await refresh();
  };

  const handleCustoms = async () => {
    if (!latest) return;
    const result = await saveCustoms({
      shipmentId: latest.id,
      hsCode,
      originCountry: latest.origin_country || originCountry,
      destinationCountry: latest.destination_country || destinationCountry,
      declaredValue: Number(latest.declared_value || order.total || 0),
      currency: latest.currency || order.currency || 'USD',
      invoiceNumber,
      incoterm,
      dutyAmount: Number(dutyAmount || 0),
      taxAmount: Number(taxAmount || 0),
      feesAmount: Number(feesAmount || 0),
      notes: customsNotes,
    });
    if (result.success) {
      setShowCustoms(false);
      await refresh();
    }
  };

  return (
    <div className="space-y-3 rounded-2xl border border-border/40 bg-background/60 p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 text-xs font-bold"><PackageCheck className="h-4 w-4" /> Xalqaro logistika</p>
          <p className="mt-0.5 text-[10px] text-muted-foreground">Transport, tracking, bojxona va oxirgi yetkazish bir oqimda.</p>
        </div>
        {latest && <Badge variant="outline" className="rounded-full text-[9px]">{latest.status}</Badge>}
      </div>

      {!latest ? (
        <>
          {!showCreate ? (
            <Button type="button" variant="outline" className="h-9 w-full rounded-xl text-xs" onClick={() => setShowCreate(true)}>
              <Truck className="mr-1.5 h-4 w-4" /> Yetkazma yaratish
            </Button>
          ) : (
            <div className="space-y-3 rounded-xl bg-muted/20 p-3">
              <div className="grid grid-cols-2 gap-2">
                <LabeledInput label="Jo‘natuvchi davlat" value={originCountry} onChange={setOriginCountry} placeholder="UZ" />
                <LabeledInput label="Qabul qiluvchi davlat" value={destinationCountry} onChange={setDestinationCountry} placeholder="DE" />
              </div>

              <div className="space-y-1">
                <p className="text-[10px] font-semibold text-muted-foreground">Transport turi</p>
                <div className="grid grid-cols-3 gap-1.5">
                  {MODES.map(item => (
                    <button key={item.id} type="button" onClick={() => setMode(item.id)} className={cn(
                      'flex min-h-9 items-center justify-center gap-1 rounded-lg border px-2 text-[10px] font-semibold transition',
                      mode === item.id ? 'border-foreground bg-foreground text-background' : 'border-border/50 bg-background text-muted-foreground',
                    )}>
                      <ModeIcon mode={item.id} /> {item.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <LabeledInput label="Tashuvchi" value={carrierName} onChange={setCarrierName} placeholder="Alsamos Logistics" />
                <LabeledInput label="Tracking" value={trackingNumber} onChange={setTrackingNumber} placeholder="Ixtiyoriy" />
              </div>

              <div className="grid grid-cols-3 gap-2">
                <label className="space-y-1">
                  <span className="text-[10px] font-semibold text-muted-foreground">Xizmat</span>
                  <select value={serviceLevel} onChange={event => setServiceLevel(event.target.value)} className="h-9 w-full rounded-lg border border-border/50 bg-background px-2 text-xs">
                    <option value="economy">Economy</option>
                    <option value="standard">Standard</option>
                    <option value="express">Express</option>
                  </select>
                </label>
                <label className="space-y-1">
                  <span className="text-[10px] font-semibold text-muted-foreground">Boj sharti</span>
                  <select value={incoterm} onChange={event => setIncoterm(event.target.value as 'DDP' | 'DAP')} className="h-9 w-full rounded-lg border border-border/50 bg-background px-2 text-xs">
                    <option value="DAP">DAP</option>
                    <option value="DDP">DDP</option>
                  </select>
                </label>
                <label className="space-y-1">
                  <span className="text-[10px] font-semibold text-muted-foreground">Taxminiy sana</span>
                  <Input type="date" value={etaDate} onChange={event => setEtaDate(event.target.value)} className="h-9 rounded-lg px-2 text-xs" />
                </label>
              </div>

              <div className="flex gap-2">
                <Button type="button" variant="ghost" className="h-9 flex-1 rounded-xl text-xs" onClick={() => setShowCreate(false)}>Bekor</Button>
                <Button type="button" className="h-9 flex-1 rounded-xl text-xs" disabled={isSaving || !originCountry.trim() || !destinationCountry.trim()} onClick={handleCreate}>
                  {isSaving ? <Clock3 className="mr-1.5 h-4 w-4 animate-spin" /> : <PackageCheck className="mr-1.5 h-4 w-4" />} Yaratish
                </Button>
              </div>
            </div>
          )}
        </>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2 text-[10px] sm:grid-cols-4">
            <MiniStat label="Yo‘nalish" value={`${latest.origin_country || '—'} → ${latest.destination_country || '—'}`} />
            <MiniStat label="Transport" value={MODES.find(item => item.id === latest.transport_mode)?.label || latest.transport_mode} />
            <MiniStat label="Tracking" value={latest.tracking_number || 'Kutilmoqda'} />
            <MiniStat label="Bojxona" value={latest.customs_status.replaceAll('_', ' ')} />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <LabeledInput label="Hozirgi joy" value={eventLocation} onChange={setEventLocation} placeholder="Masalan, Frankfurt Cargo" />
            <LabeledInput label="Davlat kodi" value={eventCountry} onChange={setEventCountry} placeholder="DE" />
          </div>

          <div className="grid grid-cols-2 gap-2">
            {eventPresets.map(preset => (
              <Button key={preset.status} type="button" variant={preset.status === 'delivered' ? 'default' : 'outline'} className="min-h-10 h-auto justify-start rounded-xl px-3 py-2 text-left text-[10px]" disabled={isSaving} onClick={() => void handleEvent(preset)}>
                {preset.status.includes('customs') ? <ShieldCheck className="mr-1.5 h-3.5 w-3.5 shrink-0" /> : preset.status === 'delivered' ? <CheckCircle2 className="mr-1.5 h-3.5 w-3.5 shrink-0" /> : <Truck className="mr-1.5 h-3.5 w-3.5 shrink-0" />}
                {preset.label}
              </Button>
            ))}
          </div>

          {international && (
            <>
              <Button type="button" variant="secondary" className="h-9 w-full rounded-xl text-xs" onClick={() => setShowCustoms(value => !value)}>
                <ShieldCheck className="mr-1.5 h-4 w-4" /> Bojxona deklaratsiyasi
              </Button>
              {showCustoms && (
                <div className="space-y-2 rounded-xl border border-border/40 bg-muted/20 p-3">
                  <div className="grid grid-cols-2 gap-2">
                    <LabeledInput label="HS code" value={hsCode} onChange={setHsCode} placeholder="8517.13" />
                    <LabeledInput label="Invoice №" value={invoiceNumber} onChange={setInvoiceNumber} placeholder="INV-2026-001" />
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <LabeledInput label="Boj" value={dutyAmount} onChange={setDutyAmount} inputMode="decimal" />
                    <LabeledInput label="Soliq/VAT" value={taxAmount} onChange={setTaxAmount} inputMode="decimal" />
                    <LabeledInput label="Fee" value={feesAmount} onChange={setFeesAmount} inputMode="decimal" />
                  </div>
                  <label className="space-y-1">
                    <span className="text-[10px] font-semibold text-muted-foreground">Izoh</span>
                    <Textarea value={customsNotes} onChange={event => setCustomsNotes(event.target.value)} rows={2} className="resize-none rounded-lg text-xs" placeholder="Sertifikat, hujjat yoki bojxona izohi" />
                  </label>
                  <Button type="button" className="h-9 w-full rounded-xl text-xs" disabled={isSaving} onClick={() => void handleCustoms()}>
                    <Save className="mr-1.5 h-4 w-4" /> Saqlash
                  </Button>
                </div>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}

function LabeledInput({
  label,
  value,
  onChange,
  placeholder,
  inputMode,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  inputMode?: React.HTMLAttributes<HTMLInputElement>['inputMode'];
}) {
  return (
    <label className="min-w-0 space-y-1">
      <span className="block text-[10px] font-semibold text-muted-foreground">{label}</span>
      <Input value={value} onChange={event => onChange(event.target.value)} placeholder={placeholder} inputMode={inputMode} className="h-9 min-w-0 rounded-lg px-2 text-xs" />
    </label>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-lg bg-muted/25 p-2">
      <p className="text-[9px] font-bold uppercase tracking-[0.08em] text-muted-foreground">{label}</p>
      <p className="mt-0.5 truncate text-[10px] font-semibold" title={value}>{value}</p>
    </div>
  );
}

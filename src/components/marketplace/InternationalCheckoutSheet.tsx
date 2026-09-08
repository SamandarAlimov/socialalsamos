import { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  ArrowLeft,
  Banknote,
  CheckCircle,
  ChevronRight,
  Clock3,
  CreditCard,
  Globe2,
  Loader2,
  LocateFixed,
  MapPin,
  Package,
  Plane,
  ShieldCheck,
  Ship,
  TrainFront,
  Truck,
  Wallet,
  X,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Textarea } from '@/components/ui/textarea';
import { useAuth } from '@/contexts/AuthContext';
import { useCart } from '@/hooks/useMarketplace';
import { useMarketplaceDeliveryLocation } from '@/hooks/useMarketplaceDeliveryLocation';
import { supabase } from '@/integrations/supabase/client';
import { db } from '@/lib/db';
import { formatPrice } from '@/lib/marketplace';
import {
  getEnabledPaymentProviders,
  initPayment,
  type PaymentProviderId,
} from '@/lib/payments';
import {
  INTERNATIONAL_COUNTRY_OPTIONS,
  INTERNATIONAL_SERVICE_OPTIONS,
  etaLabel,
  normalizeInternationalQuote,
  serviceLevelLabel,
  transportModeLabel,
  type InternationalIncoterm,
  type InternationalServiceLevel,
  type InternationalShippingQuote,
} from '@/lib/logistics/international';
import { cn } from '@/lib/utils';

interface InternationalCheckoutSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

type Step = 'shipping' | 'address' | 'payment' | 'review' | 'pending' | 'success' | 'failed';
type PaymentInitOutcome = Awaited<ReturnType<typeof initPayment>>;

const PROVIDERS = getEnabledPaymentProviders();
const DEFAULT_PROVIDER: PaymentProviderId =
  PROVIDERS.find(provider => provider.id === 'card_on_delivery')?.id
  ?? PROVIDERS[0]?.id
  ?? 'cash';

const EMPTY_ADDRESS = {
  full_name: '',
  phone: '',
  street: '',
  city: '',
  region: '',
  zip: '',
};

const ERROR_MESSAGES: Record<string, string> = {
  not_authenticated: 'Iltimos, tizimga kiring.',
  empty_cart: 'Savat bo‘sh.',
  international_single_seller_required: 'Xalqaro buyurtmada hozircha bitta sotuvchining mahsulotlarini alohida rasmiylashtiring.',
  mixed_origin_not_supported: 'Turli davlatlardan chiqadigan mahsulotlarni alohida buyurtma qiling.',
  mixed_currency_not_supported: 'Turli valyutadagi mahsulotlarni alohida buyurtma qiling.',
  restaurant_international_not_supported: 'Restoran buyurtmalari xalqaro yetkazishga qo‘shilmaydi.',
  invalid_destination_country: 'Qabul qiluvchi davlatni tanlang.',
  invalid_service_level: 'Yetkazish tarifini qayta tanlang.',
  invalid_incoterm: 'Bojxona shartini qayta tanlang.',
  express_not_available: 'Bu yuk uchun Express avia mavjud emas. Standard yoki Economy tanlang.',
  product_unavailable: 'Savatdagi mahsulotlardan biri sotuvda mavjud emas.',
  insufficient_stock: 'Omborda yetarli mahsulot qolmagan.',
  insufficient_balance: 'Hamyonda mablag‘ yetarli emas.',
  quote_cart_changed: 'Savat o‘zgardi. Yetkazish narxini qayta hisoblang.',
  invalid_shipping_address: 'Yetkazish manzilini to‘liq kiriting.',
};

function extractCode(message?: string | null) {
  if (!message) return '';
  return message.replace(/^.*:\s*/, '').trim();
}

function friendlyError(message?: string | null) {
  const code = extractCode(message);
  return ERROR_MESSAGES[code] || message || 'Amal bajarilmadi.';
}

function isValidPhone(value: string) {
  const digits = value.replace(/\D/g, '');
  return digits.length >= 9 && digits.length <= 15;
}

function TransportIcon({ mode }: { mode?: string }) {
  if (mode === 'air') return <Plane className="h-4 w-4" />;
  if (mode === 'sea') return <Ship className="h-4 w-4" />;
  if (mode === 'rail') return <TrainFront className="h-4 w-4" />;
  return <Truck className="h-4 w-4" />;
}

function PaymentIcon({ id }: { id: string }) {
  if (id === 'wallet') return <Wallet className="h-5 w-5" />;
  if (id === 'cash' || id === 'card_on_delivery') return <Banknote className="h-5 w-5" />;
  return <CreditCard className="h-5 w-5" />;
}

export function InternationalCheckoutSheet({ open, onOpenChange, onSuccess }: InternationalCheckoutSheetProps) {
  const { user } = useAuth();
  const { items, total: cartTotal, currency, refresh } = useCart();
  const { location, isLocating, error: locationError, locate } = useMarketplaceDeliveryLocation();
  const [step, setStep] = useState<Step>('shipping');
  const [destinationCountry, setDestinationCountry] = useState('');
  const [serviceLevel, setServiceLevel] = useState<InternationalServiceLevel>('standard');
  const [incoterm] = useState<InternationalIncoterm>('DAP');
  const [quote, setQuote] = useState<InternationalShippingQuote | null>(null);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [address, setAddress] = useState(EMPTY_ADDRESS);
  const [useCoordinates, setUseCoordinates] = useState(true);
  const [notes, setNotes] = useState('');
  const [paymentProviderId, setPaymentProviderId] = useState<PaymentProviderId>(DEFAULT_PROVIDER);
  const [walletBalance, setWalletBalance] = useState<number | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [lastResult, setLastResult] = useState<any>(null);

  const selectedProvider = PROVIDERS.find(provider => provider.id === paymentProviderId) ?? PROVIDERS[0];
  const sellerIds = useMemo(() => new Set(items.map(item => item.product?.seller_id).filter(Boolean)), [items]);
  const containsFood = items.some(item => Boolean((item.product as any)?.is_food));
  const cartEligible = items.length > 0 && sellerIds.size === 1 && !containsFood;
  const cartFingerprint = items.map(item => `${item.id}:${item.quantity}:${item.product_variant_id || ''}`).join('|');
  const attachedLocation = useCoordinates ? location : null;
  const checkoutTotal = quote?.checkout_total ?? cartTotal;
  const walletInsufficient = selectedProvider?.id === 'wallet' && walletBalance !== null && walletBalance < checkoutTotal;
  const addressValid = Boolean(
    address.full_name.trim().length >= 3 &&
    isValidPhone(address.phone) &&
    address.street.trim().length >= 3 &&
    address.city.trim().length >= 2 &&
    destinationCountry,
  );

  useEffect(() => {
    if (!open) return;
    setStep('shipping');
    setQuote(null);
    setQuoteError(null);
    setLastResult(null);
    setPaymentProviderId(DEFAULT_PROVIDER);
    setUseCoordinates(true);
  }, [open]);

  useEffect(() => {
    if (!open || !user) return;
    let cancelled = false;
    void supabase
      .from('wallets')
      .select('balance')
      .eq('user_id', user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (!cancelled) setWalletBalance(Number(data?.balance ?? 0));
      });
    return () => { cancelled = true; };
  }, [open, user]);

  useEffect(() => {
    if (!open || !destinationCountry || !cartEligible) {
      setQuote(null);
      return;
    }
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      setQuoteLoading(true);
      setQuoteError(null);
      const { data, error } = await db.rpc('marketplace_quote_shipping', {
        _destination_country_code: destinationCountry,
        _service_level: serviceLevel,
        _incoterm: incoterm,
      });
      if (cancelled) return;
      if (error) {
        setQuote(null);
        setQuoteError(friendlyError(error.message));
      } else {
        const next = normalizeInternationalQuote(data);
        if (!next) {
          setQuote(null);
          setQuoteError('Yetkazish narxini hisoblab bo‘lmadi.');
        } else {
          setQuote(next);
        }
      }
      setQuoteLoading(false);
    }, 250);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [open, destinationCountry, serviceLevel, incoterm, cartEligible, cartFingerprint]);

  const cancelOrphan = async (orderId: string, reason: string) => {
    try {
      await db.rpc('marketplace_update_order_status', {
        _order_id: orderId,
        _status: 'cancelled',
        _reason: reason,
      });
    } catch {
      // Buyer can still cancel from Orders if this best-effort cleanup fails.
    }
  };

  const placeOrder = async () => {
    if (!quote || !selectedProvider || isProcessing || !addressValid) return;
    if (walletInsufficient) {
      toast.error('Hamyonda mablag‘ yetarli emas');
      return;
    }
    setIsProcessing(true);
    try {
      const shippingAddress: Record<string, unknown> = {
        ...address,
        country_code: destinationCountry,
        fulfillment_type: 'international_delivery',
      };
      if (attachedLocation) {
        shippingAddress.latitude = attachedLocation.latitude;
        shippingAddress.longitude = attachedLocation.longitude;
        if (attachedLocation.label) shippingAddress.geo_label = attachedLocation.label;
      }

      const { data, error } = await db.rpc('process_marketplace_international_order', {
        _shipping_address: shippingAddress,
        _payment_method: selectedProvider.method,
        _destination_country_code: destinationCountry,
        _service_level: serviceLevel,
        _incoterm: incoterm,
        _notes: notes || null,
      });
      if (error) throw new Error(friendlyError(error.message));

      const result = data as any;
      const orderId = result?.order_ids?.[0];
      if (!result?.success || !orderId) throw new Error('Buyurtma yaratilmadi.');
      setLastResult(result);

      const { data: order, error: orderError } = await supabase
        .from('orders')
        .select('id, order_number, total, currency')
        .eq('id', orderId)
        .single();
      if (orderError || !order) {
        await cancelOrphan(orderId, 'payment_init_data_unavailable');
        throw new Error("Buyurtma yaratildi, lekin to‘lov ma’lumoti olinmadi.");
      }

      const returnUrl = typeof window !== 'undefined'
        ? `${window.location.origin}/marketplace?tab=orders`
        : '/marketplace?tab=orders';
      const paymentResult: PaymentInitOutcome = await initPayment(paymentProviderId, {
        orderId: order.id,
        orderNumber: order.order_number,
        amount: Number(order.total),
        currency: order.currency || currency,
        returnUrl,
      });

      if (paymentResult.status === 'failed') {
        await cancelOrphan(orderId, 'payment_init_failed');
        throw new Error(paymentResult.error || 'To‘lovni boshlashda xatolik yuz berdi.');
      }
      await refresh();
      if (paymentResult.status === 'redirect' && paymentResult.redirectUrl) {
        window.location.assign(paymentResult.redirectUrl);
        return;
      }
      setStep(paymentResult.status === 'pending' ? 'pending' : 'success');
    } catch (error: any) {
      setLastResult((previous: any) => ({ ...(previous || {}), success: false, error: error?.message || 'Kutilmagan xatolik' }));
      setStep('failed');
    } finally {
      setIsProcessing(false);
    }
  };

  const resetAndClose = () => {
    const completed = step === 'success' || step === 'pending';
    setStep('shipping');
    setQuote(null);
    setLastResult(null);
    setNotes('');
    if (completed) onSuccess?.();
    onOpenChange(false);
  };

  const stepTitle: Record<Step, string> = {
    shipping: 'Xalqaro yetkazish',
    address: 'Qabul qiluvchi manzil',
    payment: 'To‘lov usuli',
    review: 'Buyurtmani tekshirish',
    pending: 'Buyurtma qabul qilindi',
    success: 'Buyurtma tasdiqlandi',
    failed: 'Buyurtma yakunlanmadi',
  };

  return (
    <Sheet open={open} onOpenChange={next => next ? onOpenChange(true) : resetAndClose()}>
      <SheetContent side="bottom" className="marketplace-neutral h-[96dvh] rounded-t-[30px] border-t border-border/40 p-0 sm:mx-auto sm:max-w-2xl">
        <div className="flex h-full flex-col">
          <SheetHeader className="border-b border-border/30 p-4">
            <div className="flex items-center gap-3">
              {['address', 'payment', 'review'].includes(step) && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-9 w-9 rounded-xl"
                  onClick={() => setStep(step === 'review' ? 'payment' : step === 'payment' ? 'address' : 'shipping')}
                  aria-label="Orqaga"
                >
                  <ArrowLeft className="h-4 w-4" />
                </Button>
              )}
              <SheetTitle className="text-left">{stepTitle[step]}</SheetTitle>
            </div>
            {!['pending','success','failed'].includes(step) && (
              <div className="mt-2 grid grid-cols-4 gap-1.5">
                {['shipping','address','payment','review'].map((name, index) => {
                  const current = ['shipping','address','payment','review'].indexOf(step);
                  return <div key={name} className={cn('h-1 rounded-full', index <= current ? 'bg-foreground' : 'bg-muted')} />;
                })}
              </div>
            )}
          </SheetHeader>

          <ScrollArea className="flex-1">
            <AnimatePresence mode="wait">
              {step === 'shipping' && (
                <motion.div key="shipping" initial={{ opacity: 0, x: -12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 12 }} className="space-y-5 p-4">
                  <div className="rounded-2xl border border-sky-500/20 bg-sky-500/[0.05] p-4">
                    <div className="flex items-start gap-3">
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-sky-500/10 text-sky-600"><Globe2 className="h-5 w-5" /></span>
                      <div>
                        <p className="text-sm font-bold">Alsamos Global Logistics</p>
                        <p className="mt-1 text-xs leading-5 text-muted-foreground">Davlatlararo yo‘l, avia, dengiz va multimodal yetkazish. Bojxona summalari live tariff provayder ulanmaguncha taxminiy ko‘rsatiladi.</p>
                      </div>
                    </div>
                  </div>

                  {!cartEligible && (
                    <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
                      {containsFood
                        ? 'Restoran buyurtmalari local delivery oqimida qoladi.'
                        : 'Xalqaro checkout v1 uchun savatda faqat bitta sotuvchining mahsulotlari bo‘lishi kerak.'}
                    </div>
                  )}

                  <div className="space-y-2">
                    <label className="text-xs font-bold uppercase tracking-[0.12em] text-muted-foreground">Qabul qiluvchi davlat</label>
                    <select
                      value={destinationCountry}
                      onChange={event => setDestinationCountry(event.target.value)}
                      className="h-12 w-full rounded-xl border border-border/50 bg-background px-3 text-sm font-semibold outline-none focus:ring-2 focus:ring-foreground/20"
                    >
                      <option value="">Davlatni tanlang</option>
                      {INTERNATIONAL_COUNTRY_OPTIONS.map(country => <option key={country.code} value={country.code}>{country.label} ({country.code})</option>)}
                    </select>
                  </div>

                  <div className="space-y-2">
                    <p className="text-xs font-bold uppercase tracking-[0.12em] text-muted-foreground">Yetkazish tarifi</p>
                    <div className="grid gap-2 sm:grid-cols-3">
                      {INTERNATIONAL_SERVICE_OPTIONS.map(option => (
                        <button
                          key={option.id}
                          type="button"
                          onClick={() => setServiceLevel(option.id)}
                          className={cn(
                            'rounded-2xl border p-3 text-left transition',
                            serviceLevel === option.id ? 'border-foreground bg-foreground text-background shadow-sm' : 'border-border/50 bg-muted/20 hover:bg-muted/40',
                          )}
                        >
                          <p className="text-sm font-bold">{option.label}</p>
                          <p className={cn('mt-1 text-[11px] leading-4', serviceLevel === option.id ? 'text-background/70' : 'text-muted-foreground')}>{option.subtitle}</p>
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <p className="text-xs font-bold uppercase tracking-[0.12em] text-muted-foreground">Bojxona sharti</p>
                    <div className="grid grid-cols-2 gap-2">
                      <button type="button" className="rounded-2xl border border-foreground bg-foreground p-3 text-left text-background">
                        <p className="text-sm font-bold">DAP</p>
                        <p className="mt-1 text-[11px] text-background/70">Yetkazish checkoutda, import boji qabulda</p>
                      </button>
                      <button type="button" disabled className="rounded-2xl border border-border/40 bg-muted/20 p-3 text-left opacity-55">
                        <p className="flex items-center gap-1 text-sm font-bold">DDP <span className="rounded-full bg-muted px-1.5 py-0.5 text-[8px]">tez orada</span></p>
                        <p className="mt-1 text-[11px] text-muted-foreground">Live bojxona settlement ulangach oldindan to‘lov</p>
                      </button>
                    </div>
                  </div>

                  <QuoteCard quote={quote} loading={quoteLoading} error={quoteError} />
                </motion.div>
              )}

              {step === 'address' && (
                <motion.div key="address" initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -12 }} className="space-y-4 p-4">
                  <div className="rounded-2xl border border-border/40 bg-muted/20 p-3 text-xs">
                    <div className="flex items-center gap-2 font-bold"><Globe2 className="h-4 w-4" /> {quote?.origin_country_code} → {quote?.destination_country_code}</div>
                    <p className="mt-1 text-muted-foreground">{serviceLevelLabel(serviceLevel)} · {etaLabel(quote)} · {transportModeLabel(quote?.transport_mode)}</p>
                  </div>
                  <Field label="Qabul qiluvchi"><Input value={address.full_name} onChange={e => setAddress(p => ({ ...p, full_name: e.target.value }))} className="h-11 rounded-xl" placeholder="Ism Familiya" /></Field>
                  <Field label="Telefon"><Input value={address.phone} onChange={e => setAddress(p => ({ ...p, phone: e.target.value }))} className="h-11 rounded-xl" inputMode="tel" placeholder="+49 ..." /></Field>
                  <Field label="Ko‘cha va uy"><Input value={address.street} onChange={e => setAddress(p => ({ ...p, street: e.target.value }))} className="h-11 rounded-xl" placeholder="Ko‘cha, uy, kvartira" /></Field>
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Shahar"><Input value={address.city} onChange={e => setAddress(p => ({ ...p, city: e.target.value }))} className="h-11 rounded-xl" /></Field>
                    <Field label="Viloyat / region"><Input value={address.region} onChange={e => setAddress(p => ({ ...p, region: e.target.value }))} className="h-11 rounded-xl" /></Field>
                  </div>
                  <Field label="Pochta indeksi"><Input value={address.zip} onChange={e => setAddress(p => ({ ...p, zip: e.target.value }))} className="h-11 rounded-xl" /></Field>

                  <div className="rounded-2xl border border-border/40 bg-muted/20 p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div><p className="text-sm font-bold">Aniq lokatsiya</p><p className="mt-0.5 text-[11px] text-muted-foreground">Last-mile kuryer uchun xaritadagi nuqta</p></div>
                      <Button type="button" variant="outline" size="sm" className="rounded-xl" disabled={isLocating} onClick={() => { setUseCoordinates(true); void locate(); }}>
                        {isLocating ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <LocateFixed className="mr-1.5 h-3.5 w-3.5" />} {attachedLocation ? 'Yangilash' : 'Tanlash'}
                      </Button>
                    </div>
                    {attachedLocation && (
                      <div className="mt-3 flex items-start gap-2 rounded-xl bg-background p-2.5">
                        <MapPin className="mt-0.5 h-4 w-4 shrink-0" />
                        <div className="min-w-0 flex-1"><p className="line-clamp-2 text-xs font-medium">{attachedLocation.label || 'Xaritadagi nuqta'}</p><p className="mt-0.5 text-[10px] text-muted-foreground">{attachedLocation.latitude.toFixed(5)}, {attachedLocation.longitude.toFixed(5)}</p></div>
                        <button type="button" onClick={() => setUseCoordinates(false)} className="rounded-lg p-1 text-muted-foreground"><X className="h-3.5 w-3.5" /></button>
                      </div>
                    )}
                    {locationError && !attachedLocation && <p className="mt-2 text-[11px] text-destructive">{locationError}</p>}
                  </div>
                  <Field label="Yetkazishga izoh"><Textarea value={notes} onChange={e => setNotes(e.target.value)} className="resize-none rounded-xl" rows={2} placeholder="Eshik kodi, qabul vaqti..." /></Field>
                </motion.div>
              )}

              {step === 'payment' && (
                <motion.div key="payment" initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -12 }} className="space-y-3 p-4">
                  {PROVIDERS.map(provider => (
                    <button
                      key={provider.id}
                      type="button"
                      onClick={() => setPaymentProviderId(provider.id)}
                      className={cn('flex w-full items-center gap-3 rounded-2xl border p-4 text-left transition', paymentProviderId === provider.id ? 'border-foreground bg-foreground/[0.04]' : 'border-border/40 bg-muted/10')}
                    >
                      <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-muted"><PaymentIcon id={provider.id} /></span>
                      <span className="min-w-0 flex-1"><span className="block text-sm font-bold">{provider.label}</span><span className="mt-0.5 block text-xs text-muted-foreground">{provider.description}</span></span>
                      <span className={cn('h-4 w-4 rounded-full border-2', paymentProviderId === provider.id ? 'border-foreground bg-foreground ring-2 ring-background' : 'border-muted-foreground/40')} />
                    </button>
                  ))}
                  {selectedProvider?.id === 'wallet' && (
                    <div className="rounded-xl bg-muted/25 p-3 text-xs"><div className="flex justify-between"><span className="text-muted-foreground">Hamyon</span><span className="font-bold tabular-nums">{formatPrice(walletBalance ?? 0, currency)}</span></div>{walletInsufficient && <p className="mt-2 text-destructive">Mablag‘ yetarli emas.</p>}</div>
                  )}
                  <div className="flex items-center gap-2 rounded-xl border border-border/30 p-3 text-[11px] text-muted-foreground"><ShieldCheck className="h-4 w-4 shrink-0 text-emerald-500" /> Import bojlari hozir taxmin sifatida ko‘rsatiladi va DAP oqimida checkoutda undirilmaydi.</div>
                </motion.div>
              )}

              {step === 'review' && quote && (
                <motion.div key="review" initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -12 }} className="space-y-4 p-4">
                  <div className="rounded-2xl border border-border/40 bg-muted/20 p-4">
                    <div className="flex items-center justify-between gap-3"><div className="flex items-center gap-2 text-sm font-bold"><TransportIcon mode={quote.transport_mode} />{transportModeLabel(quote.transport_mode)} · {serviceLevelLabel(quote.service_level)}</div><span className="text-xs font-semibold">{etaLabel(quote)}</span></div>
                    <p className="mt-2 text-xs text-muted-foreground">{quote.origin_country_code} → {quote.destination_country_code} · DAP · {quote.billable_weight_kg.toFixed(2)} kg hisobiy vazn</p>
                  </div>
                  <div className="rounded-2xl border border-border/40 bg-muted/20 p-4"><div className="flex items-center gap-2 text-sm font-bold"><MapPin className="h-4 w-4" />Yetkazish manzili</div><p className="mt-2 text-sm">{address.full_name} · {address.phone}</p><p className="mt-1 text-xs text-muted-foreground">{address.street}, {address.city}{address.region ? `, ${address.region}` : ''} · {destinationCountry}</p></div>
                  <div className="rounded-2xl border border-border/40 bg-muted/20 p-4"><div className="flex items-center gap-2 text-sm font-bold"><CreditCard className="h-4 w-4" />{selectedProvider?.label}</div></div>
                  <CostBreakdown quote={quote} />
                  {quote.warnings.length > 0 && <div className="space-y-1.5 rounded-2xl border border-amber-500/20 bg-amber-500/[0.05] p-4">{quote.warnings.map((warning,index) => <p key={`${warning}-${index}`} className="flex gap-2 text-[11px] leading-4 text-muted-foreground"><AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-500" />{warning}</p>)}</div>}
                </motion.div>
              )}

              {(step === 'success' || step === 'pending') && (
                <motion.div key={step} initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} className="flex flex-col items-center p-6 text-center">
                  <div className="mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-emerald-500/10"><CheckCircle className="h-10 w-10 text-emerald-500" /></div>
                  <h2 className="text-xl font-bold">{step === 'pending' ? 'Xalqaro buyurtma qabul qilindi' : 'Xalqaro buyurtma tasdiqlandi'}</h2>
                  <p className="mt-2 max-w-sm text-sm text-muted-foreground">Sotuvchi jo‘natmani tayyorlaydi. Tracking, eksport bojxonasi, tranzit, import bojxonasi va last-mile holatlari Buyurtmalar bo‘limida ketma-ket ko‘rinadi.</p>
                  {lastResult?.quote && <div className="mt-5 w-full"><CostBreakdown quote={normalizeInternationalQuote(lastResult.quote) || quote!} /></div>}
                  <Button className="mt-5 h-11 w-full rounded-xl" onClick={resetAndClose}><Package className="mr-2 h-4 w-4" />Yakunlash</Button>
                </motion.div>
              )}

              {step === 'failed' && (
                <motion.div key="failed" initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} className="flex flex-col items-center p-6 text-center">
                  <div className="mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-destructive/10"><AlertCircle className="h-10 w-10 text-destructive" /></div>
                  <h2 className="text-xl font-bold">Buyurtma yakunlanmadi</h2>
                  <p className="mt-2 max-w-sm text-sm text-muted-foreground">{lastResult?.error || 'Kutilmagan xatolik yuz berdi.'}</p>
                  <Button className="mt-5 h-11 w-full rounded-xl" onClick={() => setStep('shipping')}>Qayta urinish</Button>
                </motion.div>
              )}
            </AnimatePresence>
          </ScrollArea>

          {!['pending','success','failed'].includes(step) && (
            <div className="border-t border-border/30 bg-background/98 p-4 backdrop-blur-xl">
              {step === 'shipping' && <Button className="h-12 w-full rounded-xl" disabled={!quote || quoteLoading || !cartEligible} onClick={() => setStep('address')}>Manzilga davom etish <ChevronRight className="ml-2 h-4 w-4" /></Button>}
              {step === 'address' && <Button className="h-12 w-full rounded-xl" disabled={!addressValid} onClick={() => setStep('payment')}>To‘lovga davom etish <ChevronRight className="ml-2 h-4 w-4" /></Button>}
              {step === 'payment' && <Button className="h-12 w-full rounded-xl" disabled={!selectedProvider || walletInsufficient} onClick={() => setStep('review')}>Tekshirish <ChevronRight className="ml-2 h-4 w-4" /></Button>}
              {step === 'review' && <Button className="h-12 w-full rounded-xl font-bold" disabled={!quote || isProcessing || walletInsufficient} onClick={() => void placeOrder()}>{isProcessing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Globe2 className="mr-2 h-4 w-4" />}Buyurtma berish — {formatPrice(checkoutTotal, quote?.currency || currency)}</Button>}
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function QuoteCard({ quote, loading, error }: { quote: InternationalShippingQuote | null; loading: boolean; error: string | null }) {
  if (loading) return <div className="flex min-h-28 items-center justify-center rounded-2xl border border-border/40 bg-muted/15"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>;
  if (error) return <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-4 text-xs text-destructive">{error}</div>;
  if (!quote) return <div className="rounded-2xl border border-dashed border-border/50 p-4 text-center text-xs text-muted-foreground">Davlatni tanlang — server yetkazish va bojxona taxminini hisoblaydi.</div>;
  return (
    <div className="space-y-3 rounded-2xl border border-border/50 bg-card p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3"><div><p className="text-xs text-muted-foreground">Yo‘nalish</p><p className="mt-0.5 font-bold">{quote.origin_country_code} → {quote.destination_country_code}</p></div><div className="text-right"><p className="text-xs text-muted-foreground">Taxminiy muddat</p><p className="mt-0.5 font-bold">{etaLabel(quote)}</p></div></div>
      <div className="flex items-center gap-2 rounded-xl bg-muted/30 p-3 text-xs"><TransportIcon mode={quote.transport_mode} /><span className="font-bold">{transportModeLabel(quote.transport_mode)}</span><span className="text-muted-foreground">· {serviceLevelLabel(quote.service_level)} · {quote.billable_weight_kg.toFixed(2)} kg</span></div>
      <CostBreakdown quote={quote} compact />
      {!quote.metadata_complete && <p className="text-[10px] leading-4 text-amber-600">Mahsulotning logistika o‘lchamlari to‘liq emas; quote standart paket taxmini bilan hisoblandi.</p>}
    </div>
  );
}

function CostBreakdown({ quote, compact = false }: { quote: InternationalShippingQuote; compact?: boolean }) {
  return (
    <div className={cn('space-y-2', !compact && 'rounded-2xl border border-border/40 bg-muted/20 p-4')}>
      <Row label="Mahsulotlar" value={formatPrice(quote.cart_value, quote.currency)} />
      <Row label="Xalqaro yetkazish" value={formatPrice(quote.shipping_charge, quote.currency)} />
      <div className="h-px bg-border/30" />
      <Row label="Checkout jami" value={formatPrice(quote.checkout_total, quote.currency)} strong />
      {quote.international && (
        <>
          <Row label="Taxminiy boj" value={formatPrice(quote.estimated_duty, quote.currency)} muted />
          <Row label="Taxminiy VAT" value={formatPrice(quote.estimated_vat, quote.currency)} muted />
          <Row label="Bojxona handling" value={formatPrice(quote.customs_handling, quote.currency)} muted />
          <Row label="Taxminiy landed cost" value={formatPrice(quote.estimated_landed_total, quote.currency)} strong />
          <p className="text-[10px] leading-4 text-muted-foreground">DAP: import boj/VAT checkout jami tarkibiga kirmaydi. Yakuniy bojxona summasi davlat va HS kodga bog‘liq.</p>
        </>
      )}
    </div>
  );
}

function Row({ label, value, strong, muted }: { label: string; value: string; strong?: boolean; muted?: boolean }) {
  return <div className={cn('flex items-center justify-between gap-3 text-xs', strong && 'text-sm font-bold', muted && 'text-muted-foreground')}><span>{label}</span><span className="shrink-0 tabular-nums">{value}</span></div>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="space-y-1.5"><label className="text-xs font-medium text-muted-foreground">{label}</label>{children}</div>;
}

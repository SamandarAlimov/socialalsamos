import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  MapPin, CreditCard, Truck, ShieldCheck, ChevronRight, Loader2, CheckCircle,
  Package, ArrowLeft, Wallet, Banknote, Plus, AlertCircle, AlertTriangle, ShoppingBag,
  LocateFixed, X, Store, Clock3, Utensils, Navigation,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { CategoryIcon } from '@/components/marketplace/CategoryIcon';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useCheckout } from '@/hooks/useOrders';
import {
  getEnabledPaymentProviders,
  getPendingPaymentProviders,
  initPayment,
  type PaymentProviderId,
} from '@/lib/payments';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { formatPrice, getShippingCost, checkoutErrorMessage } from '@/lib/marketplace';
import { checkoutAddressFromLocationLabel } from '@/lib/marketplaceDeliveryAddress';
import { getCartItemStock, getCartItemUnitPrice, getVariantOptionsLabel } from '@/hooks/useMarketplace';
import { useMarketplaceDeliveryLocation } from '@/hooks/useMarketplaceDeliveryLocation';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { marketplaceUz } from '@/i18n/marketplace';
import { toast } from 'sonner';
import { db } from '@/lib/db';

interface CheckoutSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

type Step = 'address' | 'payment' | 'review' | 'pending' | 'success' | 'failed';
type FulfillmentType = 'delivery' | 'pickup';
type PaymentInitOutcome = Awaited<ReturnType<typeof initPayment>>;

const ENABLED_PAYMENT_PROVIDERS = getEnabledPaymentProviders();
const PENDING_PAYMENT_PROVIDERS = getPendingPaymentProviders();

const DEFAULT_PAYMENT_PROVIDER: PaymentProviderId =
  ENABLED_PAYMENT_PROVIDERS.find(provider => provider.id === 'card_on_delivery')?.id
  ?? ENABLED_PAYMENT_PROVIDERS[0]?.id
  ?? 'cash';

const EMPTY_ADDRESS = {
  full_name: '',
  phone: '',
  street: '',
  city: '',
  region: '',
  zip: '',
};

function isValidPhone(value: string) {
  const digits = value.replace(/\D/g, '');
  return digits.length >= 9 && digits.length <= 15;
}

function formatReadyTime(date: Date) {
  try {
    return new Intl.DateTimeFormat('uz-UZ', { hour: '2-digit', minute: '2-digit' }).format(date);
  } catch {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
}

export function CheckoutSheet({ open, onOpenChange, onSuccess }: CheckoutSheetProps) {
  const { user, profile } = useAuth();
  const navigate = useNavigate();
  const { placeOrder, isProcessing, cartItems, cartTotal } = useCheckout();
  const { location, isLocating, error: locationError, locate } = useMarketplaceDeliveryLocation();
  const [step, setStep] = useState<Step>('address');
  const [address, setAddress] = useState(EMPTY_ADDRESS);
  const [useCoordinates, setUseCoordinates] = useState(true);
  const [notes, setNotes] = useState('');
  const [fulfillmentType, setFulfillmentType] = useState<FulfillmentType>('delivery');
  const [paymentProviderId, setPaymentProviderId] = useState<PaymentProviderId>(DEFAULT_PAYMENT_PROVIDER);
  const [walletBalance, setWalletBalance] = useState<number | null>(null);
  const [walletLoading, setWalletLoading] = useState(false);
  const [lastResult, setLastResult] = useState<{
    success?: boolean;
    order_ids?: string[];
    payment_status?: string;
    total?: number;
    error?: string;
  } | null>(null);

  const savedCustomerName = useMemo(() => {
    const profileName = profile?.display_name?.trim();
    if (profileName) return profileName;
    const metadataName = user?.user_metadata?.display_name;
    return typeof metadataName === 'string' ? metadataName.trim() : '';
  }, [profile?.display_name, user?.user_metadata?.display_name]);

  const savedCustomerPhone = useMemo(() => {
    const authPhone = user?.phone?.trim();
    if (authPhone) return authPhone;
    const metadataPhone = user?.user_metadata?.phone;
    return typeof metadataPhone === 'string' ? metadataPhone.trim() : '';
  }, [user?.phone, user?.user_metadata?.phone]);

  const currency = cartItems[0]?.product?.currency || 'USD';
  const selectedProvider = ENABLED_PAYMENT_PROVIDERS.find(provider => provider.id === paymentProviderId)
    ?? ENABLED_PAYMENT_PROVIDERS[0];

  const restaurantSellerId = cartItems[0]?.product?.seller_id || null;
  // Cart embeds only a compact seller object, so food identity is carried by
  // the product row itself. A restaurant checkout must contain only menu rows
  // from one seller; mixed carts stay on the normal marketplace flow.
  const restaurantCheckout = Boolean(
    restaurantSellerId &&
    cartItems.length > 0 &&
    cartItems.every(item =>
      item.product?.seller_id === restaurantSellerId &&
      Boolean((item.product as any)?.is_food),
    ),
  );
  const restaurantSeller = restaurantCheckout ? cartItems[0]?.product?.seller : undefined;
  const restaurantName = restaurantSeller?.business_name || 'Restoran';
  const restaurantLocation = restaurantSeller?.location || cartItems[0]?.product?.location || '';
  const restaurantCanDeliver = restaurantCheckout && cartItems.every(item => Boolean(item.product?.shipping_available));
  const preparationMinutes = restaurantCheckout
    ? Math.max(
        5,
        ...cartItems.map(item => {
          const value = Number((item.product as any)?.preparation_minutes || 20);
          return Number.isFinite(value) && value > 0 ? Math.min(240, value) : 20;
        }),
      )
    : 0;
  const isPickup = restaurantCheckout && fulfillmentType === 'pickup';
  const estimatedReadyAt = useMemo(
    () => new Date(Date.now() + preparationMinutes * 60_000),
    [preparationMinutes, open, step],
  );

  const attachedLocation = !isPickup && useCoordinates ? location : null;

  const shippingCost = useMemo(
    () => isPickup
      ? 0
      : cartItems.reduce((sum, item) => sum + getShippingCost(item.product, item.quantity), 0),
    [cartItems, isPickup],
  );
  const grandTotal = cartTotal + shippingCost;

  const unavailableItems = useMemo(
    () => cartItems.filter(item =>
      !item.product ||
      item.product.status !== 'active' ||
      (item.product_variant_id != null && (!item.variant || !item.variant.is_active)) ||
      getCartItemStock(item) < item.quantity,
    ),
    [cartItems],
  );

  const contactValid = Boolean(
    address.full_name.trim().length >= 3 &&
    isValidPhone(address.phone),
  );
  const deliveryAddressValid = Boolean(
    contactValid &&
    address.street.trim().length >= 3 &&
    address.city.trim().length >= 2,
  );
  const isAddressValid = isPickup ? contactValid : deliveryAddressValid;

  const walletInsufficient =
    selectedProvider?.id === 'wallet' && walletBalance !== null && walletBalance < grandTotal;

  const canPlaceOrder =
    !isProcessing &&
    isAddressValid &&
    cartItems.length > 0 &&
    unavailableItems.length === 0 &&
    !walletInsufficient &&
    Boolean(selectedProvider);

  useEffect(() => {
    if (!open) return;
    setAddress(current => {
      const fullName = current.full_name.trim() ? current.full_name : savedCustomerName;
      const phone = current.phone.trim() ? current.phone : savedCustomerPhone;
      if (fullName === current.full_name && phone === current.phone) return current;
      return { ...current, full_name: fullName, phone };
    });
  }, [open, savedCustomerName, savedCustomerPhone]);

  useEffect(() => {
    if (!open || !user) return;
    let cancelled = false;
    (async () => {
      setWalletLoading(true);
      const { data } = await supabase
        .from('wallets')
        .select('balance')
        .eq('user_id', user.id)
        .maybeSingle();
      if (!cancelled) {
        setWalletBalance(Number(data?.balance ?? 0));
        setWalletLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [open, user]);

  useEffect(() => {
    if (open) {
      setStep('address');
      setLastResult(null);
      setPaymentProviderId(DEFAULT_PAYMENT_PROVIDER);
      setUseCoordinates(true);
      setFulfillmentType(restaurantCheckout && !restaurantCanDeliver ? 'pickup' : 'delivery');
    }
  }, [open, restaurantCheckout, restaurantCanDeliver]);

  useEffect(() => {
    if (!open || isPickup || !location?.label) return;
    const autofill = checkoutAddressFromLocationLabel(location.label);
    if (!autofill.street && !autofill.city && !autofill.region) return;

    setAddress(current => {
      const next = {
        ...current,
        street: autofill.street || current.street,
        city: autofill.city || current.city,
        region: autofill.region || current.region,
      };

      if (
        next.street === current.street &&
        next.city === current.city &&
        next.region === current.region
      ) {
        return current;
      }

      return next;
    });
  }, [isPickup, location, open]);

  useEffect(() => {
    if (!restaurantCheckout) setFulfillmentType('delivery');
    else if (!restaurantCanDeliver && fulfillmentType === 'delivery') setFulfillmentType('pickup');
  }, [restaurantCheckout, restaurantCanDeliver, fulfillmentType]);

  const cancelOrphanOrders = async (orderIds: string[], reason: string) => {
    await Promise.all(orderIds.map(async orderId => {
      try {
        await db.rpc('marketplace_update_order_status', {
          _order_id: orderId,
          _status: 'cancelled',
          _reason: reason,
        });
      } catch {
        // Best effort: buyer can still cancel from Orders.
      }
    }));
  };

  const failWithOrphanCleanup = async (
    result: { order_ids?: string[] } | null,
    error: string,
    reason: string,
  ) => {
    const orderIds = result?.order_ids ?? [];
    if (orderIds.length > 0) await cancelOrphanOrders(orderIds, reason);
    setLastResult({ ...(result ?? {}), success: false, error });
    setStep('failed');
  };

  const handlePlaceOrder = async () => {
    if (isProcessing || !selectedProvider) return;

    if (unavailableItems.length > 0) {
      toast.error("Savatdagi ba'zi mahsulotlar mavjud emas");
      return;
    }
    if (walletInsufficient) {
      toast.error("Hamyonda mablag' yetarli emas");
      return;
    }

    const readyIso = new Date(Date.now() + preparationMinutes * 60_000).toISOString();
    const shippingPayload: Record<string, unknown> = isPickup
      ? {
          ...address,
          street: `Olib ketish — ${restaurantName}`,
          city: restaurantLocation || 'Restoran',
          region: '',
          zip: '',
          fulfillment_type: 'pickup',
          restaurant_name: restaurantName,
          preparation_minutes: preparationMinutes,
          estimated_ready_at: readyIso,
        }
      : {
          ...address,
          fulfillment_type: 'delivery',
          ...(restaurantCheckout
            ? {
                restaurant_name: restaurantName,
                preparation_minutes: preparationMinutes,
                estimated_ready_at: readyIso,
              }
            : {}),
        };

    if (attachedLocation) {
      shippingPayload.latitude = attachedLocation.latitude;
      shippingPayload.longitude = attachedLocation.longitude;
      if (attachedLocation.label) shippingPayload.geo_label = attachedLocation.label;
    }

    const result = await placeOrder(shippingPayload, selectedProvider.method, notes || undefined);
    setLastResult(result);

    if (!result?.success) {
      setStep('failed');
      return;
    }

    if (result.order_ids.length === 0) {
      setLastResult({ ...result, success: false, error: 'Buyurtma identifikatori topilmadi' });
      setStep('failed');
      return;
    }

    const { data: orderRows, error: orderError } = await supabase
      .from('orders')
      .select('id, order_number, total, currency')
      .in('id', result.order_ids);

    if (orderError || !orderRows || orderRows.length !== result.order_ids.length) {
      await failWithOrphanCleanup(
        result,
        "Buyurtma yaratildi, lekin to'lovni boshlash uchun ma'lumot olinmadi",
        'payment_init_data_unavailable',
      );
      return;
    }

    const returnUrl = typeof window !== 'undefined'
      ? `${window.location.origin}/marketplace?tab=orders`
      : '/marketplace?tab=orders';

    const outcomes: PaymentInitOutcome[] = [];
    for (const order of orderRows) {
      const paymentResult = await initPayment(paymentProviderId, {
        orderId: order.id,
        orderNumber: order.order_number,
        amount: Number(order.total),
        currency: order.currency || currency,
        returnUrl,
      });
      outcomes.push(paymentResult);
      if (paymentResult.status === 'failed') break;
    }

    const failed = outcomes.find(outcome => outcome.status === 'failed');
    if (failed) {
      await failWithOrphanCleanup(
        result,
        failed.error || "To'lovni boshlashda xatolik yuz berdi",
        'payment_init_failed',
      );
      return;
    }

    const redirects = outcomes.filter(outcome => outcome.status === 'redirect');
    if (redirects.length > 0) {
      if (redirects.length > 1 || orderRows.length > 1) {
        await failWithOrphanCleanup(
          result,
          "Bu to'lov usuli bir vaqtda bir nechta sotuvchiga to'lay olmaydi. Savatni sotuvchi bo'yicha alohida yakunlang.",
          'multi_seller_redirect_unsupported',
        );
        return;
      }
      const redirectUrl = redirects[0].redirectUrl;
      if (!redirectUrl) {
        await failWithOrphanCleanup(
          result,
          "To'lov sahifasi manzili olinmadi",
          'payment_redirect_url_missing',
        );
        return;
      }
      window.location.assign(redirectUrl);
      return;
    }

    setStep(outcomes.some(outcome => outcome.status === 'pending') ? 'pending' : 'success');
  };

  const resetAndClose = () => {
    setStep('address');
    setLastResult(null);
    setNotes('');
    setFulfillmentType('delivery');
    onOpenChange(false);
  };

  const handleOpenChange = (nextOpen: boolean) => {
    if (nextOpen) {
      onOpenChange(true);
      return;
    }
    if (step === 'success' || step === 'pending') onSuccess?.();
    resetAndClose();
  };

  const goToPaymentSettings = () => {
    onOpenChange(false);
    navigate('/settings/payment');
  };

  const stepIndex: number = {
    address: 0,
    payment: 1,
    review: 2,
    pending: 3,
    success: 3,
    failed: 2,
  }[step];

  const paidTotal = lastResult?.total ?? grandTotal;
  const successReadyTime = formatReadyTime(estimatedReadyAt);

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetContent side="bottom" className="marketplace-neutral h-[95vh] p-0 rounded-t-3xl border-t border-border/30 sm:max-w-2xl sm:mx-auto">
        <div className="flex flex-col h-full">
          <SheetHeader className="p-4 border-b border-border/30">
            <div className="flex items-center gap-3">
              {(step === 'payment' || step === 'review') && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-9 w-9 rounded-xl"
                  onClick={() => setStep(step === 'review' ? 'payment' : 'address')}
                  aria-label="Orqaga"
                >
                  <ArrowLeft className="h-4 w-4" />
                </Button>
              )}
              <SheetTitle className="flex-1 text-left">
                {step === 'address' && (restaurantCheckout ? 'Restoran buyurtmasi' : marketplaceUz.checkout.addressTitle)}
                {step === 'payment' && marketplaceUz.checkout.paymentTitle}
                {step === 'review' && marketplaceUz.checkout.reviewTitle}
                {step === 'pending' && marketplaceUz.checkout.pendingTitle}
                {step === 'success' && marketplaceUz.checkout.successTitle}
                {step === 'failed' && marketplaceUz.checkout.failedTitle}
              </SheetTitle>
            </div>
            {step !== 'success' && step !== 'pending' && step !== 'failed' && (
              <div className="flex gap-2 mt-2">
                {['address', 'payment', 'review'].map((s, i) => (
                  <div key={s} className={cn(
                    'h-1 flex-1 rounded-full transition-all',
                    i <= stepIndex ? 'bg-primary' : 'bg-muted',
                  )} />
                ))}
              </div>
            )}
          </SheetHeader>

          <ScrollArea className="flex-1">
            <AnimatePresence mode="wait">
              {step === 'address' && (
                <motion.div
                  key="address"
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 20 }}
                  className="p-4 space-y-4"
                >
                  {restaurantCheckout && (
                    <div className="space-y-3 rounded-2xl border border-orange-500/20 bg-orange-500/[0.04] p-4">
                      <div className="flex items-start gap-3">
                        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-orange-500/10 text-orange-600"><Utensils className="h-5 w-5" /></span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-bold">{restaurantName}</p>
                          <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground"><Clock3 className="h-3.5 w-3.5" /> Taxminiy tayyorlash ~{Math.round(preparationMinutes)} daqiqa</p>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-2 rounded-2xl bg-background/70 p-1">
                        <button
                          type="button"
                          disabled={!restaurantCanDeliver}
                          onClick={() => setFulfillmentType('delivery')}
                          className={cn(
                            'flex min-h-11 items-center justify-center gap-2 rounded-xl px-3 text-xs font-bold transition',
                            fulfillmentType === 'delivery' ? 'bg-foreground text-background shadow-sm' : 'text-muted-foreground',
                            !restaurantCanDeliver && 'cursor-not-allowed opacity-40',
                          )}
                        >
                          <Truck className="h-4 w-4" /> Yetkazish
                        </button>
                        <button
                          type="button"
                          onClick={() => setFulfillmentType('pickup')}
                          className={cn(
                            'flex min-h-11 items-center justify-center gap-2 rounded-xl px-3 text-xs font-bold transition',
                            fulfillmentType === 'pickup' ? 'bg-foreground text-background shadow-sm' : 'text-muted-foreground',
                          )}
                        >
                          <Store className="h-4 w-4" /> Olib ketish
                        </button>
                      </div>
                      {!restaurantCanDeliver && <p className="text-[11px] text-muted-foreground">Bu restoran hozir faqat olib ketish buyurtmalarini qabul qiladi.</p>}
                    </div>
                  )}

                  {cartItems.length === 0 && (
                    <div className="flex items-start gap-2 p-3 rounded-xl bg-muted/40 text-sm text-muted-foreground">
                      <ShoppingBag className="h-4 w-4 mt-0.5 shrink-0" />
                      <span>{marketplaceUz.checkout.emptyCart}</span>
                    </div>
                  )}
                  {unavailableItems.length > 0 && (
                    <div className="flex items-start gap-2 p-3 rounded-xl bg-destructive/10 text-destructive text-xs">
                      <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                      <span>
                        {unavailableItems.length} ta mahsulot sotuvda yo'q yoki zaxirasi yetarli emas.
                        Savatni tahrirlab, keyin davom eting.
                      </span>
                    </div>
                  )}

                  <div className="space-y-3">
                    <Field label={marketplaceUz.checkout.fullName}>
                      <Input value={address.full_name} onChange={e => setAddress(p => ({ ...p, full_name: e.target.value }))} placeholder="Ism Familiya" className="rounded-xl h-11" />
                    </Field>
                    <Field label={marketplaceUz.checkout.phone}>
                      <Input
                        value={address.phone}
                        onChange={e => setAddress(p => ({ ...p, phone: e.target.value }))}
                        placeholder="+998 90 123 45 67"
                        inputMode="tel"
                        className="rounded-xl h-11"
                      />
                      {address.phone.length > 0 && !isValidPhone(address.phone) && (
                        <p className="text-[11px] text-destructive">{marketplaceUz.checkout.phoneInvalid}</p>
                      )}
                    </Field>

                    {isPickup ? (
                      <div className="rounded-2xl border border-border/50 bg-muted/25 p-4">
                        <div className="flex items-start gap-3">
                          <Navigation className="mt-0.5 h-4 w-4 shrink-0 text-foreground" />
                          <div>
                            <p className="text-sm font-bold">Restorandan olib ketish</p>
                            <p className="mt-1 text-xs text-muted-foreground">{restaurantLocation || restaurantName}</p>
                            <p className="mt-2 text-[11px] font-medium text-foreground">Buyurtma taxminan {successReadyTime} da tayyor bo‘ladi.</p>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <>
                        <Field label={marketplaceUz.checkout.street}>
                          <Input value={address.street} onChange={e => setAddress(p => ({ ...p, street: e.target.value }))} placeholder="Ko'cha nomi, uy raqami" className="rounded-xl h-11" />
                        </Field>
                        <div className="grid grid-cols-2 gap-3">
                          <Field label={marketplaceUz.checkout.city}>
                            <Input value={address.city} onChange={e => setAddress(p => ({ ...p, city: e.target.value }))} placeholder="Toshkent" className="rounded-xl h-11" />
                          </Field>
                          <Field label={marketplaceUz.checkout.region}>
                            <Input value={address.region} onChange={e => setAddress(p => ({ ...p, region: e.target.value }))} placeholder="Toshkent sh." className="rounded-xl h-11" />
                          </Field>
                        </div>

                        <div className="space-y-2 rounded-xl border border-border/50 bg-muted/20 p-3">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="text-sm font-medium">Aniq joylashuv</p>
                              <p className="mt-0.5 text-[11px] text-muted-foreground">Kuryer eshikkacha aniq yetib kelishi uchun</p>
                            </div>
                            <Button
                              type="button"
                              variant={attachedLocation ? 'outline' : 'secondary'}
                              size="sm"
                              className="h-9 shrink-0 rounded-xl"
                              disabled={isLocating}
                              onClick={() => { setUseCoordinates(true); void locate(); }}
                            >
                              {isLocating ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <LocateFixed className="mr-1.5 h-3.5 w-3.5" />}
                              {attachedLocation ? 'Yangilash' : 'Aniqlash'}
                            </Button>
                          </div>

                          {attachedLocation && (
                            <div className="flex items-start gap-2 rounded-lg bg-background/60 p-2.5">
                              <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-foreground" />
                              <div className="min-w-0 flex-1">
                                <p className="line-clamp-2 text-xs font-medium">{attachedLocation.label || 'Joylashuv aniqlandi'}</p>
                                <p className="mt-0.5 text-[11px] tabular-nums text-muted-foreground">
                                  {attachedLocation.latitude.toFixed(5)}, {attachedLocation.longitude.toFixed(5)}
                                  {attachedLocation.accuracy ? ` • ±${Math.round(attachedLocation.accuracy)} m` : ''}
                                </p>
                              </div>
                              <button type="button" onClick={() => setUseCoordinates(false)} className="shrink-0 rounded-lg p-1 text-muted-foreground hover:bg-muted" aria-label="Joylashuvni olib tashlash"><X className="h-3.5 w-3.5" /></button>
                            </div>
                          )}

                          {locationError && !attachedLocation && <p className="text-[11px] text-destructive">{locationError}</p>}
                        </div>
                      </>
                    )}

                    <Field label={restaurantCheckout ? 'Restoranga izoh' : marketplaceUz.checkout.note}>
                      <Textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder={restaurantCheckout ? 'Masalan, piyozsiz, eshik kodi, qo‘ng‘iroq qilmang…' : "Qo'shimcha izoh..."} className="rounded-xl resize-none" rows={2} />
                    </Field>
                  </div>
                </motion.div>
              )}

              {step === 'payment' && (
                <motion.div key="payment" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="p-4 space-y-3">
                  {restaurantCheckout && (
                    <div className="flex items-center gap-3 rounded-2xl border border-border/40 bg-muted/25 p-3 text-xs">
                      <Clock3 className="h-4 w-4 text-orange-500" />
                      <span className="min-w-0 flex-1"><strong>{restaurantName}</strong> · ~{Math.round(preparationMinutes)} daqiqa · {isPickup ? 'olib ketish' : 'yetkazish'}</span>
                    </div>
                  )}

                  {ENABLED_PAYMENT_PROVIDERS.map(provider => (
                    <div key={provider.id} className="space-y-2">
                      <PaymentOption
                        icon={paymentProviderIcon(provider.id)}
                        title={provider.label}
                        subtitle={provider.description}
                        active={paymentProviderId === provider.id}
                        onSelect={() => setPaymentProviderId(provider.id)}
                      />
                      {provider.id === 'wallet' && (
                        <div className="mx-2 flex items-center justify-between rounded-xl bg-muted/30 px-3 py-2 text-xs">
                          <span className="text-muted-foreground">{marketplaceUz.checkout.availableBalance}</span>
                          <span className="font-bold tabular-nums">{walletLoading ? '…' : formatPrice(walletBalance ?? 0, currency)}</span>
                        </div>
                      )}
                      {provider.id === 'wallet' && walletInsufficient && (
                        <div className="mx-2 flex items-center gap-2 rounded-xl bg-destructive/10 p-2.5 text-xs text-destructive">
                          <AlertCircle className="h-4 w-4 shrink-0" />
                          <span className="flex-1">{marketplaceUz.checkout.insufficientBalance}</span>
                          <button type="button" onClick={goToPaymentSettings} className="shrink-0 font-semibold underline">To'ldirish</button>
                        </div>
                      )}
                    </div>
                  ))}

                  {PENDING_PAYMENT_PROVIDERS.length > 0 && (
                    <div className="space-y-2 pt-2">
                      <p className="px-1 text-xs font-semibold text-muted-foreground">{marketplaceUz.checkout.comingSoon}</p>
                      {PENDING_PAYMENT_PROVIDERS.map(provider => (
                        <div key={provider.id} className="flex w-full items-center gap-3 rounded-2xl border border-dashed border-border/50 bg-muted/20 p-4 opacity-70" aria-disabled="true">
                          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-muted">{paymentProviderIcon(provider.id, false)}</div>
                          <div className="min-w-0 flex-1"><p className="text-sm font-semibold">{provider.label}</p><p className="mt-0.5 text-xs text-muted-foreground">{provider.unavailableReason || marketplaceUz.checkout.unavailable}</p></div>
                        </div>
                      ))}
                    </div>
                  )}

                  <button type="button" onClick={goToPaymentSettings} className="w-full flex items-center justify-between p-3 rounded-xl border border-dashed border-border/50 hover:border-foreground/50 hover:bg-foreground/5 transition-colors text-sm">
                    <div className="flex items-center gap-2 text-muted-foreground"><Plus className="h-4 w-4" />{marketplaceUz.checkout.manageMethods}</div>
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  </button>

                  <div className="pt-2 flex items-center gap-4 text-xs text-muted-foreground">
                    <div className="flex items-center gap-1"><ShieldCheck className="h-3.5 w-3.5 text-foreground" />256-bit SSL</div>
                    <div className="flex items-center gap-1"><Truck className="h-3.5 w-3.5 text-foreground" />Xaridor himoyasi</div>
                  </div>
                </motion.div>
              )}

              {step === 'review' && (
                <motion.div key="review" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="p-4 space-y-4">
                  <div className="p-3 rounded-xl bg-muted/30 border border-border/20 space-y-1">
                    <div className="flex items-center gap-2 text-sm font-medium">
                      {isPickup ? <Store className="h-4 w-4 text-foreground" /> : <MapPin className="h-4 w-4 text-foreground" />}
                      {isPickup ? 'Restorandan olib ketish' : 'Yetkazib berish manzili'}
                    </div>
                    <p className="text-sm text-muted-foreground">{address.full_name} • {address.phone}</p>
                    {isPickup ? (
                      <><p className="text-sm text-muted-foreground">{restaurantName}{restaurantLocation ? ` · ${restaurantLocation}` : ''}</p><p className="flex items-center gap-1 text-[11px] font-semibold text-orange-600"><Clock3 className="h-3 w-3" /> ~{Math.round(preparationMinutes)} daqiqa · taxminan {successReadyTime}</p></>
                    ) : (
                      <>
                        <p className="text-sm text-muted-foreground">{address.street}, {address.city} {address.region}</p>
                        {attachedLocation && <p className="flex items-center gap-1 text-[11px] text-foreground"><LocateFixed className="h-3 w-3 shrink-0" /><span className="line-clamp-1">{attachedLocation.label || `${attachedLocation.latitude.toFixed(5)}, ${attachedLocation.longitude.toFixed(5)}`}</span></p>}
                        {restaurantCheckout && <p className="flex items-center gap-1 text-[11px] font-semibold text-orange-600"><Clock3 className="h-3 w-3" /> Restoran ~{Math.round(preparationMinutes)} daqiqada tayyorlaydi</p>}
                      </>
                    )}
                  </div>

                  <div className="p-3 rounded-xl bg-muted/30 border border-border/20 flex items-center justify-between">
                    <div className="flex items-center gap-2 text-sm font-medium"><CreditCard className="h-4 w-4 text-foreground" />{selectedProvider?.label || "To'lov usuli"}</div>
                    <button onClick={() => setStep('payment')} className="text-xs text-foreground font-semibold">O'zgartirish</button>
                  </div>

                  <div className="space-y-2">
                    <h4 className="text-sm font-medium">{marketplaceUz.checkout.products} ({cartItems.length})</h4>
                    {cartItems.map(item => {
                      const product = item.product;
                      if (!product) return null;
                      const image = item.variant?.image_url || product.images?.[0]?.url;
                      const itemShipping = isPickup ? 0 : getShippingCost(product, item.quantity);
                      const unitPrice = getCartItemUnitPrice(item);
                      const variantLabel = getVariantOptionsLabel(item.variant);
                      const serving = String((product as any)?.serving_label || '');
                      return (
                        <div key={item.id} className="flex gap-3 p-2 rounded-xl bg-muted/20">
                          <div className="relative w-14 h-14 rounded-lg overflow-hidden bg-muted shrink-0">
                            <div className="absolute inset-0 flex items-center justify-center text-muted-foreground/40"><CategoryIcon slug={product.category?.slug} name={product.category?.name} className="h-4 w-4" /></div>
                            {image && <img src={image} alt={product.title} className="absolute inset-0 w-full h-full object-cover" loading="lazy" onError={event => { event.currentTarget.style.display = 'none'; }} />}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium line-clamp-1">{product.title}</p>
                            {variantLabel && <p className="line-clamp-1 text-[11px] font-medium text-foreground/75">{variantLabel}</p>}
                            {restaurantCheckout && serving && !variantLabel && <p className="line-clamp-1 text-[11px] font-medium text-foreground/75">{serving}</p>}
                            <p className="text-xs text-muted-foreground tabular-nums">{item.quantity} × {formatPrice(unitPrice, currency)}</p>
                            {itemShipping > 0 && <p className="text-[11px] text-muted-foreground">+ {formatPrice(itemShipping, currency)} yetkazish</p>}
                          </div>
                          <p className="text-sm font-bold tabular-nums">{formatPrice(unitPrice * item.quantity, currency)}</p>
                        </div>
                      );
                    })}
                  </div>

                  <div className="p-3 rounded-xl bg-muted/30 border border-border/20 space-y-2">
                    <div className="flex justify-between text-sm"><span className="text-muted-foreground">{marketplaceUz.checkout.products}</span><span className="tabular-nums">{formatPrice(cartTotal, currency)}</span></div>
                    <div className="flex justify-between text-sm"><span className="text-muted-foreground">{isPickup ? 'Olib ketish' : marketplaceUz.checkout.delivery}</span><span className="tabular-nums">{isPickup ? 'Bepul' : shippingCost > 0 ? formatPrice(shippingCost, currency) : 'Bepul'}</span></div>
                    <div className="h-px bg-border/30" />
                    <div className="flex justify-between font-bold"><span>{marketplaceUz.checkout.total}</span><span className="text-foreground text-lg tabular-nums">{formatPrice(grandTotal, currency)}</span></div>
                  </div>

                  <div className="flex items-center gap-4 text-xs text-muted-foreground">
                    <div className="flex items-center gap-1"><ShieldCheck className="h-3.5 w-3.5 text-foreground" />Xavfsiz to'lov</div>
                    <div className="flex items-center gap-1"><Truck className="h-3.5 w-3.5 text-foreground" />Kafolat</div>
                  </div>
                </motion.div>
              )}

              {step === 'pending' && (
                <motion.div key="pending" initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} className="p-6 flex flex-col items-center text-center">
                  <div className="mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-foreground/10">{restaurantCheckout ? <Utensils className="h-10 w-10 text-foreground" /> : <Truck className="h-10 w-10 text-foreground" />}</div>
                  <h2 className="mb-1 text-xl font-bold">{restaurantCheckout ? 'Restoran buyurtmani oldi' : marketplaceUz.checkout.orderAccepted}</h2>
                  <p className="mb-5 max-w-sm text-sm text-muted-foreground">
                    {restaurantCheckout
                      ? `${restaurantName} buyurtmani tayyorlaydi. ${isPickup ? 'Tayyor bo‘lgach restorandan olib ketishingiz mumkin.' : 'Tayyorlashdan so‘ng yetkazish boshlanadi.'}`
                      : selectedProvider?.settlement === 'on_delivery'
                        ? "To'lov mahsulot yetkazilganda olinadi. Buyurtma holatini kuzatishingiz mumkin."
                        : "To'lov tasdiqlanishi kutilmoqda. Holat buyurtmalar bo'limida yangilanadi."}
                  </p>
                  {restaurantCheckout && (
                    <div className="mb-4 flex w-full items-center gap-3 rounded-2xl border border-orange-500/20 bg-orange-500/[0.04] p-4 text-left">
                      <Clock3 className="h-5 w-5 shrink-0 text-orange-500" />
                      <div><p className="text-sm font-bold">Taxminiy tayyor bo‘lish: ~{Math.round(preparationMinutes)} daqiqa</p><p className="mt-0.5 text-xs text-muted-foreground">Taxminan {successReadyTime} · {isPickup ? 'olib ketish' : 'yetkazish'}</p></div>
                    </div>
                  )}
                  <div className="mb-5 w-full rounded-2xl border border-border/50 bg-muted/20 p-4 text-left">
                    <div className="mb-2 flex justify-between text-sm"><span className="text-muted-foreground">{marketplaceUz.checkout.orders}</span><span className="font-semibold tabular-nums">{lastResult?.order_ids?.length ?? 0}</span></div>
                    <div className="mb-2 flex justify-between text-sm"><span className="text-muted-foreground">{marketplaceUz.checkout.paymentMethod}</span><span className="font-semibold">{selectedProvider?.label}</span></div>
                    <div className="flex justify-between text-sm"><span className="text-muted-foreground">{marketplaceUz.checkout.overall}</span><span className="font-bold text-foreground tabular-nums">{formatPrice(paidTotal, currency)}</span></div>
                  </div>
                  <div className="flex w-full flex-col gap-2">
                    <Button className="h-11 rounded-xl" onClick={() => { onSuccess?.(); resetAndClose(); navigate('/marketplace?tab=orders'); }}><Package className="mr-2 h-4 w-4" />{marketplaceUz.checkout.myOrders}</Button>
                    <Button variant="ghost" className="h-11 rounded-xl" onClick={() => { onSuccess?.(); resetAndClose(); }}>Yopish</Button>
                  </div>
                </motion.div>
              )}

              {step === 'success' && (
                <motion.div key="success" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="p-6 flex flex-col items-center text-center">
                  <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: 'spring', delay: 0.15 }} className="w-20 h-20 rounded-full bg-green-500/10 flex items-center justify-center mb-4"><CheckCircle className="h-10 w-10 text-green-500" /></motion.div>
                  <h2 className="text-xl font-bold mb-1">{restaurantCheckout ? 'Restoran buyurtmasi tasdiqlandi' : marketplaceUz.checkout.successTitle}</h2>
                  <p className="text-muted-foreground text-sm mb-5 max-w-sm">
                    {restaurantCheckout
                      ? `${restaurantName} buyurtmani qabul qildi. ${isPickup ? `Taxminan ${successReadyTime} da olib ketishga tayyor bo‘ladi.` : 'Tayyorlash tugagach yetkazish holati yangilanadi.'}`
                      : "To'lov muvaffaqiyatli yakunlandi. Kvitansiya buyurtmalar bo'limida saqlandi."}
                  </p>
                  {restaurantCheckout && (
                    <div className="mb-4 flex w-full items-center gap-3 rounded-2xl border border-orange-500/20 bg-orange-500/[0.04] p-4 text-left">
                      <Clock3 className="h-5 w-5 shrink-0 text-orange-500" />
                      <div><p className="text-sm font-bold">~{Math.round(preparationMinutes)} daqiqa tayyorlash</p><p className="mt-0.5 text-xs text-muted-foreground">{isPickup ? 'Restorandan olib ketish' : 'Kuryer orqali yetkazish'} · taxminan {successReadyTime}</p></div>
                    </div>
                  )}
                  <div className="w-full rounded-2xl border border-border/50 bg-muted/20 p-4 mb-5 text-left">
                    <div className="flex justify-between text-sm mb-2"><span className="text-muted-foreground">{marketplaceUz.checkout.orders}</span><span className="font-semibold tabular-nums">{lastResult?.order_ids?.length ?? 0}</span></div>
                    <div className="flex justify-between text-sm mb-2"><span className="text-muted-foreground">{marketplaceUz.checkout.paymentMethod}</span><span className="font-semibold">{selectedProvider?.label || "To'lov usuli"}</span></div>
                    <div className="flex justify-between text-sm"><span className="text-muted-foreground">{marketplaceUz.checkout.overall}</span><span className="font-bold text-foreground tabular-nums">{formatPrice(paidTotal, currency)}</span></div>
                  </div>
                  <div className="flex flex-col gap-2 w-full">
                    <Button className="rounded-xl h-11" onClick={() => { onSuccess?.(); resetAndClose(); navigate('/marketplace?tab=orders'); }}><Package className="h-4 w-4 mr-2" />{marketplaceUz.checkout.myOrders}</Button>
                    <Button variant="ghost" className="rounded-xl h-11" onClick={() => { onSuccess?.(); resetAndClose(); }}>Yopish</Button>
                  </div>
                </motion.div>
              )}

              {step === 'failed' && (
                <motion.div key="failed" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="p-6 flex flex-col items-center text-center">
                  <div className="w-20 h-20 rounded-full bg-destructive/10 flex items-center justify-center mb-4"><AlertCircle className="h-10 w-10 text-destructive" /></div>
                  <h2 className="text-xl font-bold mb-1">{marketplaceUz.checkout.failedOrder}</h2>
                  <p className="text-muted-foreground text-sm mb-5 max-w-xs">{checkoutErrorMessage(lastResult?.error)}</p>
                  <div className="flex flex-col gap-2 w-full">
                    <Button className="rounded-xl h-11" onClick={() => setStep('review')}>Qayta urinish</Button>
                    {(selectedProvider?.id === 'wallet' || lastResult?.error === 'insufficient_balance') && <Button variant="outline" className="rounded-xl h-11" onClick={goToPaymentSettings}><Wallet className="h-4 w-4 mr-2" />{marketplaceUz.checkout.topUpWallet}</Button>}
                    <Button variant="ghost" className="rounded-xl h-11" onClick={resetAndClose}>Yopish</Button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </ScrollArea>

          {step !== 'success' && step !== 'pending' && step !== 'failed' && (
            <div className="p-4 border-t border-border/30 bg-background/95 backdrop-blur-xl">
              {step === 'address' && (
                <Button className="w-full h-12 rounded-xl text-sm font-semibold shadow-lg shadow-black/10" disabled={!isAddressValid || cartItems.length === 0 || unavailableItems.length > 0} onClick={() => setStep('payment')}>
                  {restaurantCheckout ? `${isPickup ? 'Olib ketish' : 'Yetkazish'} bilan davom etish` : marketplaceUz.checkout.continue}<ChevronRight className="h-4 w-4 ml-2" />
                </Button>
              )}
              {step === 'payment' && <Button className="w-full h-12 rounded-xl text-sm font-semibold shadow-lg shadow-black/10" disabled={walletInsufficient || !selectedProvider} onClick={() => setStep('review')}>{marketplaceUz.checkout.review}<ChevronRight className="h-4 w-4 ml-2" /></Button>}
              {step === 'review' && (
                <Button className="w-full h-12 rounded-xl text-sm font-semibold shadow-lg shadow-black/10" disabled={!canPlaceOrder} onClick={handlePlaceOrder}>
                  {isProcessing ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> {marketplaceUz.checkout.placing}</> : <>{restaurantCheckout ? 'Buyurtmani tasdiqlash' : marketplaceUz.checkout.placeOrder} — {formatPrice(grandTotal, currency)}</>}
                </Button>
              )}
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="space-y-1.5"><label className="text-sm font-medium">{label}</label>{children}</div>;
}

function PaymentOption({
  icon, title, subtitle, active, onSelect,
}: {
  icon: React.ReactNode; title: string; subtitle: string; active: boolean; onSelect: () => void;
}) {
  return (
    <button type="button" onClick={onSelect} className={cn('w-full text-left rounded-2xl p-4 border transition-all', active ? 'border-foreground bg-foreground/5 ring-2 ring-foreground/20' : 'border-border/50 hover:border-border bg-muted/20')}>
      <div className="flex items-center gap-3">
        <div className="h-11 w-11 rounded-xl bg-gradient-to-br from-foreground to-foreground/70 flex items-center justify-center shrink-0">{icon}</div>
        <div className="flex-1 min-w-0"><p className="font-semibold text-sm">{title}</p><p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p></div>
        {active && <CheckCircle className="h-5 w-5 text-foreground shrink-0" />}
      </div>
    </button>
  );
}

function paymentProviderIcon(id: PaymentProviderId, inverse = true) {
  const className = cn('h-5 w-5', inverse ? 'text-background' : 'text-muted-foreground');
  switch (id) {
    case 'wallet': return <Wallet className={className} />;
    case 'cash': return <Banknote className={className} />;
    default: return <CreditCard className={className} />;
  }
}

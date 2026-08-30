import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  MapPin, CreditCard, Truck, ShieldCheck, ChevronRight, Loader2, CheckCircle,
  Package, ArrowLeft, Wallet, Banknote, Plus, AlertCircle, AlertTriangle, ShoppingBag,
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
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { marketplaceUz } from '@/i18n/marketplace';
import { toast } from 'sonner';

interface CheckoutSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

type Step = 'address' | 'payment' | 'review' | 'pending' | 'success' | 'failed';

const ENABLED_PAYMENT_PROVIDERS = getEnabledPaymentProviders();
const PENDING_PAYMENT_PROVIDERS = getPendingPaymentProviders();

const EMPTY_ADDRESS = {
  full_name: '',
  phone: '',
  street: '',
  city: '',
  region: '',
  zip: '',
};

/** Accepts +998 90 123 45 67 and similar international formats. */
function isValidPhone(value: string) {
  const digits = value.replace(/\D/g, '');
  return digits.length >= 9 && digits.length <= 15;
}

export function CheckoutSheet({ open, onOpenChange, onSuccess }: CheckoutSheetProps) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { placeOrder, isProcessing, cartItems, cartTotal } = useCheckout();
  const [step, setStep] = useState<Step>('address');
  const [address, setAddress] = useState(EMPTY_ADDRESS);
  const [notes, setNotes] = useState('');
  const [paymentProviderId, setPaymentProviderId] = useState<PaymentProviderId>('wallet');
  const [walletBalance, setWalletBalance] = useState<number | null>(null);
  const [walletLoading, setWalletLoading] = useState(false);
  const [lastResult, setLastResult] = useState<{
    success?: boolean;
    order_ids?: string[];
    payment_status?: string;
    total?: number;
    error?: string;
  } | null>(null);

  const currency = cartItems[0]?.product?.currency || 'USD';
  const selectedProvider = ENABLED_PAYMENT_PROVIDERS.find(provider => provider.id === paymentProviderId)
    ?? ENABLED_PAYMENT_PROVIDERS[0];

  /**
   * Shipping used to be summed once per cart line, ignoring quantity and even
   * charging delivery for pickup-only products. It is now computed per unit
   * with the same helper the cart and the order RPC use, so the total the
   * buyer confirms is the total that gets charged.
   */
  const shippingCost = useMemo(
    () => cartItems.reduce((sum, item) => sum + getShippingCost(item.product, item.quantity), 0),
    [cartItems],
  );
  const grandTotal = cartTotal + shippingCost;

  const unavailableItems = useMemo(
    () => cartItems.filter(item =>
      !item.product ||
      item.product.status !== 'active' ||
      Number(item.product.quantity ?? 0) < item.quantity,
    ),
    [cartItems],
  );

  const isAddressValid = Boolean(
    address.full_name.trim().length >= 3 &&
    isValidPhone(address.phone) &&
    address.street.trim().length >= 3 &&
    address.city.trim().length >= 2,
  );

  const walletInsufficient =
    selectedProvider?.id === 'wallet' && walletBalance !== null && walletBalance < grandTotal;

  const canPlaceOrder =
    !isProcessing &&
    isAddressValid &&
    cartItems.length > 0 &&
    unavailableItems.length === 0 &&
    !walletInsufficient &&
    Boolean(selectedProvider);

  // Fetch wallet balance whenever the sheet opens / user changes
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

  // Always start a fresh flow; a stale success/failed screen used to reappear.
  useEffect(() => {
    if (open) {
      setStep('address');
      setLastResult(null);
    }
  }, [open]);

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

    const result = await placeOrder(address, selectedProvider.method, notes || undefined);
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
      setLastResult({
        ...result,
        success: false,
        error: "Buyurtma yaratildi, lekin to'lovni boshlash uchun ma'lumot olinmadi",
      });
      setStep('failed');
      return;
    }

    let hasPending = false;
    const returnUrl = typeof window !== 'undefined'
      ? `${window.location.origin}/marketplace?tab=orders`
      : '/marketplace?tab=orders';

    for (const order of orderRows) {
      const paymentResult = await initPayment(paymentProviderId, {
        orderId: order.id,
        orderNumber: order.order_number,
        amount: Number(order.total),
        currency: order.currency || currency,
        returnUrl,
      });

      if (paymentResult.status === 'failed') {
        setLastResult({
          ...result,
          success: false,
          error: paymentResult.error || "To'lovni boshlashda xatolik yuz berdi",
        });
        setStep('failed');
        return;
      }

      if (paymentResult.status === 'redirect') {
        if (!paymentResult.redirectUrl) {
          setLastResult({
            ...result,
            success: false,
            error: "To'lov sahifasi manzili olinmadi",
          });
          setStep('failed');
          return;
        }
        window.location.assign(paymentResult.redirectUrl);
        return;
      }

      if (paymentResult.status === 'pending') {
        hasPending = true;
      }
    }

    setStep(hasPending ? 'pending' : 'success');
  };

  const resetAndClose = () => {
    setStep('address');
    setLastResult(null);
    setNotes('');
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

  // 'failed' had no entry, which produced an undefined index and a broken bar.
  const stepIndex: number = {
    address: 0,
    payment: 1,
    review: 2,
    pending: 3,
    success: 3,
    failed: 2,
  }[step];

  const paidTotal = lastResult?.total ?? grandTotal;

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetContent side="bottom" className="h-[95vh] p-0 rounded-t-3xl border-t border-border/30 sm:max-w-2xl sm:mx-auto">
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
                {step === 'address' && marketplaceUz.checkout.addressTitle}
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
                    <Field label={marketplaceUz.checkout.note}>
                      <Textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Qo'shimcha izoh..." className="rounded-xl resize-none" rows={2} />
                    </Field>
                  </div>
                </motion.div>
              )}

              {step === 'payment' && (
                <motion.div
                  key="payment"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  className="p-4 space-y-3"
                >
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
                          <span className="font-bold tabular-nums">
                            {walletLoading ? '…' : formatPrice(walletBalance ?? 0, currency)}
                          </span>
                        </div>
                      )}
                      {provider.id === 'wallet' && walletInsufficient && (
                        <div className="mx-2 flex items-center gap-2 rounded-xl bg-destructive/10 p-2.5 text-xs text-destructive">
                          <AlertCircle className="h-4 w-4 shrink-0" />
                          <span className="flex-1">{marketplaceUz.checkout.insufficientBalance}</span>
                          <button
                            type="button"
                            onClick={goToPaymentSettings}
                            className="shrink-0 font-semibold underline"
                          >
                            To'ldirish
                          </button>
                        </div>
                      )}
                    </div>
                  ))}

                  {PENDING_PAYMENT_PROVIDERS.length > 0 && (
                    <div className="space-y-2 pt-2">
                      <p className="px-1 text-xs font-semibold text-muted-foreground">
                        {marketplaceUz.checkout.comingSoon}
                      </p>
                      {PENDING_PAYMENT_PROVIDERS.map(provider => (
                        <div
                          key={provider.id}
                          className="flex w-full items-center gap-3 rounded-2xl border border-dashed border-border/50 bg-muted/20 p-4 opacity-70"
                          aria-disabled="true"
                        >
                          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-muted">
                            {paymentProviderIcon(provider.id, false)}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-semibold">{provider.label}</p>
                            <p className="mt-0.5 text-xs text-muted-foreground">
                              {provider.unavailableReason || marketplaceUz.checkout.unavailable}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Manage cards link */}
                  <button
                    type="button"
                    onClick={goToPaymentSettings}
                    className="w-full flex items-center justify-between p-3 rounded-xl border border-dashed border-border/50 hover:border-primary/50 hover:bg-primary/5 transition-colors text-sm"
                  >
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Plus className="h-4 w-4" />
                      {marketplaceUz.checkout.manageMethods}
                    </div>
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  </button>

                  <div className="pt-2 flex items-center gap-4 text-xs text-muted-foreground">
                    <div className="flex items-center gap-1">
                      <ShieldCheck className="h-3.5 w-3.5 text-primary" />
                      256-bit SSL
                    </div>
                    <div className="flex items-center gap-1">
                      <Truck className="h-3.5 w-3.5 text-primary" />
                      Xaridor himoyasi
                    </div>
                  </div>
                </motion.div>
              )}

              {step === 'review' && (
                <motion.div
                  key="review"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  className="p-4 space-y-4"
                >
                  <div className="p-3 rounded-xl bg-muted/30 border border-border/20 space-y-1">
                    <div className="flex items-center gap-2 text-sm font-medium">
                      <MapPin className="h-4 w-4 text-primary" />
                      Yetkazib berish manzili
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {address.full_name} • {address.phone}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {address.street}, {address.city} {address.region}
                    </p>
                  </div>

                  <div className="p-3 rounded-xl bg-muted/30 border border-border/20 flex items-center justify-between">
                    <div className="flex items-center gap-2 text-sm font-medium">
                      <CreditCard className="h-4 w-4 text-primary" />
                      {selectedProvider?.label || "To'lov usuli"}
                    </div>
                    <button
                      onClick={() => setStep('payment')}
                      className="text-xs text-primary font-semibold"
                    >
                      O'zgartirish
                    </button>
                  </div>

                  <div className="space-y-2">
                    <h4 className="text-sm font-medium">{marketplaceUz.checkout.products} ({cartItems.length})</h4>
                    {cartItems.map(item => {
                      const product = item.product;
                      if (!product) return null;
                      const image = product.images?.[0]?.url;
                      const itemShipping = getShippingCost(product, item.quantity);
                      return (
                        <div key={item.id} className="flex gap-3 p-2 rounded-xl bg-muted/20">
                          <div className="relative w-14 h-14 rounded-lg overflow-hidden bg-muted shrink-0">
                            <div className="absolute inset-0 flex items-center justify-center text-muted-foreground/40">
                              <CategoryIcon
                                slug={product.category?.slug}
                                name={product.category?.name}
                                className="h-4 w-4"
                              />
                            </div>
                            {image && (
                              <img
                                src={image}
                                alt={product.title}
                                className="absolute inset-0 w-full h-full object-cover"
                                loading="lazy"
                                onError={event => { event.currentTarget.style.display = 'none'; }}
                              />
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium line-clamp-1">{product.title}</p>
                            <p className="text-xs text-muted-foreground tabular-nums">
                              {item.quantity} × {formatPrice(product.price, currency)}
                            </p>
                            {itemShipping > 0 && (
                              <p className="text-[11px] text-muted-foreground">
                                + {formatPrice(itemShipping, currency)} yetkazish
                              </p>
                            )}
                          </div>
                          <p className="text-sm font-bold tabular-nums">
                            {formatPrice(product.price * item.quantity, currency)}
                          </p>
                        </div>
                      );
                    })}
                  </div>

                  <div className="p-3 rounded-xl bg-muted/30 border border-border/20 space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">{marketplaceUz.checkout.products}</span>
                      <span className="tabular-nums">{formatPrice(cartTotal, currency)}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">{marketplaceUz.checkout.delivery}</span>
                      <span className="tabular-nums">
                        {shippingCost > 0 ? formatPrice(shippingCost, currency) : 'Bepul'}
                      </span>
                    </div>
                    <div className="h-px bg-border/30" />
                    <div className="flex justify-between font-bold">
                      <span>{marketplaceUz.checkout.total}</span>
                      <span className="text-primary text-lg tabular-nums">{formatPrice(grandTotal, currency)}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-4 text-xs text-muted-foreground">
                    <div className="flex items-center gap-1">
                      <ShieldCheck className="h-3.5 w-3.5 text-primary" />
                      Xavfsiz to'lov
                    </div>
                    <div className="flex items-center gap-1">
                      <Truck className="h-3.5 w-3.5 text-primary" />
                      Kafolat
                    </div>
                  </div>
                </motion.div>
              )}

              {step === 'pending' && (
                <motion.div
                  key="pending"
                  initial={{ opacity: 0, scale: 0.96 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="p-6 flex flex-col items-center text-center"
                >
                  <div className="mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-primary/10">
                    <Truck className="h-10 w-10 text-primary" />
                  </div>
                  <h2 className="mb-1 text-xl font-bold">{marketplaceUz.checkout.orderAccepted}</h2>
                  <p className="mb-5 max-w-xs text-sm text-muted-foreground">
                    {selectedProvider?.settlement === 'on_delivery'
                      ? "To'lov mahsulot yetkazilganda olinadi. Buyurtma holatini kuzatishingiz mumkin."
                      : "To'lov tasdiqlanishi kutilmoqda. Holat buyurtmalar bo'limida yangilanadi."}
                  </p>
                  <div className="mb-5 w-full rounded-2xl border border-border/50 bg-muted/20 p-4 text-left">
                    <div className="mb-2 flex justify-between text-sm">
                      <span className="text-muted-foreground">{marketplaceUz.checkout.orders}</span>
                      <span className="font-semibold tabular-nums">{lastResult?.order_ids?.length ?? 0}</span>
                    </div>
                    <div className="mb-2 flex justify-between text-sm">
                      <span className="text-muted-foreground">{marketplaceUz.checkout.paymentMethod}</span>
                      <span className="font-semibold">{selectedProvider?.label}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">{marketplaceUz.checkout.overall}</span>
                      <span className="font-bold text-primary tabular-nums">{formatPrice(paidTotal, currency)}</span>
                    </div>
                  </div>
                  <div className="flex w-full flex-col gap-2">
                    <Button
                      className="h-11 rounded-xl"
                      onClick={() => { onSuccess?.(); resetAndClose(); navigate('/marketplace?tab=orders'); }}
                    >
                      <Package className="mr-2 h-4 w-4" />
                      {marketplaceUz.checkout.myOrders}
                    </Button>
                    <Button
                      variant="ghost"
                      className="h-11 rounded-xl"
                      onClick={() => { onSuccess?.(); resetAndClose(); }}
                    >
                      Yopish
                    </Button>
                  </div>
                </motion.div>
              )}

              {step === 'success' && (
                <motion.div
                  key="success"
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="p-6 flex flex-col items-center text-center"
                >
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ type: 'spring', delay: 0.15 }}
                    className="w-20 h-20 rounded-full bg-green-500/10 flex items-center justify-center mb-4"
                  >
                    <CheckCircle className="h-10 w-10 text-green-500" />
                  </motion.div>
                  <h2 className="text-xl font-bold mb-1">
                    {marketplaceUz.checkout.successTitle}
                  </h2>
                  <p className="text-muted-foreground text-sm mb-5 max-w-xs">
                    To'lov muvaffaqiyatli yakunlandi. Kvitansiya buyurtmalar bo'limida saqlandi.
                  </p>
                  <div className="w-full rounded-2xl border border-border/50 bg-muted/20 p-4 mb-5 text-left">
                    <div className="flex justify-between text-sm mb-2">
                      <span className="text-muted-foreground">{marketplaceUz.checkout.orders}</span>
                      <span className="font-semibold tabular-nums">{lastResult?.order_ids?.length ?? 0}</span>
                    </div>
                    <div className="flex justify-between text-sm mb-2">
                      <span className="text-muted-foreground">{marketplaceUz.checkout.paymentMethod}</span>
                      <span className="font-semibold">{selectedProvider?.label || "To'lov usuli"}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">{marketplaceUz.checkout.overall}</span>
                      <span className="font-bold text-primary tabular-nums">{formatPrice(paidTotal, currency)}</span>
                    </div>
                  </div>
                  <div className="flex flex-col gap-2 w-full">
                    <Button
                      className="rounded-xl h-11"
                      onClick={() => { onSuccess?.(); resetAndClose(); navigate('/marketplace?tab=orders'); }}
                    >
                      <Package className="h-4 w-4 mr-2" />
                      {marketplaceUz.checkout.myOrders}
                    </Button>
                    <Button
                      variant="ghost"
                      className="rounded-xl h-11"
                      onClick={() => { onSuccess?.(); resetAndClose(); }}
                    >
                      Yopish
                    </Button>
                  </div>
                </motion.div>
              )}

              {step === 'failed' && (
                <motion.div
                  key="failed"
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="p-6 flex flex-col items-center text-center"
                >
                  <div className="w-20 h-20 rounded-full bg-destructive/10 flex items-center justify-center mb-4">
                    <AlertCircle className="h-10 w-10 text-destructive" />
                  </div>
                  <h2 className="text-xl font-bold mb-1">{marketplaceUz.checkout.failedOrder}</h2>
                  <p className="text-muted-foreground text-sm mb-5 max-w-xs">
                    {checkoutErrorMessage(lastResult?.error)}
                  </p>
                  <div className="flex flex-col gap-2 w-full">
                    <Button className="rounded-xl h-11" onClick={() => setStep('review')}>
                      Qayta urinish
                    </Button>
                    {(selectedProvider?.id === 'wallet' || lastResult?.error === 'insufficient_balance') && (
                      <Button variant="outline" className="rounded-xl h-11" onClick={goToPaymentSettings}>
                        <Wallet className="h-4 w-4 mr-2" />
                        {marketplaceUz.checkout.topUpWallet}
                      </Button>
                    )}
                    <Button variant="ghost" className="rounded-xl h-11" onClick={resetAndClose}>
                      Yopish
                    </Button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </ScrollArea>

          {step !== 'success' && step !== 'pending' && step !== 'failed' && (
            <div className="p-4 border-t border-border/30 bg-background/95 backdrop-blur-xl">
              {step === 'address' && (
                <Button
                  className="w-full h-12 rounded-xl text-sm font-semibold shadow-lg shadow-primary/20"
                  disabled={!isAddressValid || cartItems.length === 0 || unavailableItems.length > 0}
                  onClick={() => setStep('payment')}
                >
                  {marketplaceUz.checkout.continue}
                  <ChevronRight className="h-4 w-4 ml-2" />
                </Button>
              )}
              {step === 'payment' && (
                <Button
                  className="w-full h-12 rounded-xl text-sm font-semibold shadow-lg shadow-primary/20"
                  disabled={walletInsufficient || !selectedProvider}
                  onClick={() => setStep('review')}
                >
                  {marketplaceUz.checkout.review}
                  <ChevronRight className="h-4 w-4 ml-2" />
                </Button>
              )}
              {step === 'review' && (
                <Button
                  className="w-full h-12 rounded-xl text-sm font-semibold shadow-lg shadow-primary/20"
                  disabled={!canPlaceOrder}
                  onClick={handlePlaceOrder}
                >
                  {isProcessing ? (
                    <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> {marketplaceUz.checkout.placing}</>
                  ) : (
                    <>{marketplaceUz.checkout.placeOrder} — {formatPrice(grandTotal, currency)}</>
                  )}
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
  return (
    <div className="space-y-1.5">
      <label className="text-sm font-medium">{label}</label>
      {children}
    </div>
  );
}

function PaymentOption({
  icon, title, subtitle, active, onSelect,
}: {
  icon: React.ReactNode; title: string; subtitle: string; active: boolean; onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        'w-full text-left rounded-2xl p-4 border transition-all',
        active
          ? 'border-primary bg-primary/5 ring-2 ring-primary/20'
          : 'border-border/50 hover:border-border bg-muted/20',
      )}
    >
      <div className="flex items-center gap-3">
        <div className="h-11 w-11 rounded-xl bg-gradient-to-br from-primary to-primary/70 flex items-center justify-center shrink-0">
          {icon}
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-sm">{title}</p>
          <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>
        </div>
        {active && <CheckCircle className="h-5 w-5 text-primary shrink-0" />}
      </div>
    </button>
  );
}


function paymentProviderIcon(id: PaymentProviderId, inverse = true) {
  const className = cn('h-5 w-5', inverse ? 'text-primary-foreground' : 'text-muted-foreground');
  switch (id) {
    case 'wallet':
      return <Wallet className={className} />;
    case 'cash':
      return <Banknote className={className} />;
    default:
      return <CreditCard className={className} />;
  }
}

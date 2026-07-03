import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  MapPin, CreditCard, Truck, ShieldCheck, ChevronRight,
  Loader2, CheckCircle, Package, ArrowLeft, Wallet, Banknote,
  Plus, AlertCircle
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useCheckout } from '@/hooks/useOrders';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

interface CheckoutSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

type Step = 'address' | 'payment' | 'review' | 'success' | 'failed';
type PaymentMethod = 'wallet' | 'card_on_delivery' | 'cash';

export function CheckoutSheet({ open, onOpenChange, onSuccess }: CheckoutSheetProps) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { placeOrder, isProcessing, cartItems, cartTotal } = useCheckout();
  const [step, setStep] = useState<Step>('address');
  const [address, setAddress] = useState({
    full_name: '',
    phone: '',
    street: '',
    city: '',
    region: '',
    zip: '',
  });
  const [notes, setNotes] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('wallet');
  const [walletBalance, setWalletBalance] = useState<number | null>(null);
  const [walletLoading, setWalletLoading] = useState(false);

  const shippingCost = cartItems.reduce((sum, i) => sum + (i.product?.shipping_price || 0), 0);
  const grandTotal = cartTotal + shippingCost;

  const isAddressValid = address.full_name && address.phone && address.street && address.city;
  const walletInsufficient = paymentMethod === 'wallet' && walletBalance !== null && walletBalance < grandTotal;

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

  const [lastResult, setLastResult] = useState<{ order_ids: string[]; payment_status: string; error?: string } | null>(null);

  const handlePlaceOrder = async () => {
    if (paymentMethod === 'wallet' && walletInsufficient) {
      toast.error("Hamyonda mablag' yetarli emas");
      return;
    }
    const result = await placeOrder(address, paymentMethod, notes || undefined);
    setLastResult(result);
    if (result.success) {
      setStep('success');
    } else {
      setStep('failed');
    }
  };

  const handleClose = () => {
    if (step === 'success') {
      setStep('address');
      onSuccess?.();
    }
    onOpenChange(false);
  };

  const goToPaymentSettings = () => {
    onOpenChange(false);
    navigate('/settings/payment');
  };

  const stepIndex = { address: 0, payment: 1, review: 2, success: 3 }[step];

  const paymentLabel: Record<PaymentMethod, string> = {
    wallet: 'Alsamos Hamyon',
    card_on_delivery: 'Karta (yetkazishda)',
    cash: 'Naqd (yetkazishda)',
  };

  return (
    <Sheet open={open} onOpenChange={handleClose}>
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
                >
                  <ArrowLeft className="h-4 w-4" />
                </Button>
              )}
              <SheetTitle className="flex-1 text-left">
                {step === 'address' && 'Yetkazib berish manzili'}
                {step === 'payment' && "To'lov usuli"}
                {step === 'review' && 'Buyurtmani tasdiqlash'}
                {step === 'success' && 'Buyurtma qabul qilindi!'}
              </SheetTitle>
            </div>
            {step !== 'success' && step !== 'failed' && (
              <div className="flex gap-2 mt-2">
                {['address', 'payment', 'review'].map((s, i) => (
                  <div key={s} className={cn(
                    "h-1 flex-1 rounded-full transition-all",
                    i <= stepIndex ? "bg-primary" : "bg-muted"
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
                  <div className="space-y-3">
                    <Field label="To'liq ism *">
                      <Input value={address.full_name} onChange={e => setAddress(p => ({ ...p, full_name: e.target.value }))} placeholder="Ism Familiya" className="rounded-xl h-11" />
                    </Field>
                    <Field label="Telefon raqam *">
                      <Input value={address.phone} onChange={e => setAddress(p => ({ ...p, phone: e.target.value }))} placeholder="+998 90 123 45 67" className="rounded-xl h-11" />
                    </Field>
                    <Field label="Ko'cha, uy *">
                      <Input value={address.street} onChange={e => setAddress(p => ({ ...p, street: e.target.value }))} placeholder="Ko'cha nomi, uy raqami" className="rounded-xl h-11" />
                    </Field>
                    <div className="grid grid-cols-2 gap-3">
                      <Field label="Shahar *">
                        <Input value={address.city} onChange={e => setAddress(p => ({ ...p, city: e.target.value }))} placeholder="Toshkent" className="rounded-xl h-11" />
                      </Field>
                      <Field label="Viloyat">
                        <Input value={address.region} onChange={e => setAddress(p => ({ ...p, region: e.target.value }))} placeholder="Toshkent sh." className="rounded-xl h-11" />
                      </Field>
                    </div>
                    <Field label="Izoh (ixtiyoriy)">
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
                  {/* Wallet */}
                  <button
                    type="button"
                    onClick={() => setPaymentMethod('wallet')}
                    className={cn(
                      "w-full text-left rounded-2xl p-4 border transition-all",
                      paymentMethod === 'wallet'
                        ? "border-primary bg-primary/5 ring-2 ring-primary/20"
                        : "border-border/50 hover:border-border bg-muted/20"
                    )}
                  >
                    <div className="flex items-start gap-3">
                      <div className="h-11 w-11 rounded-xl bg-gradient-to-br from-primary to-primary/70 flex items-center justify-center shrink-0">
                        <Wallet className="h-5 w-5 text-primary-foreground" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <p className="font-semibold text-sm">Alsamos Hamyon</p>
                          {paymentMethod === 'wallet' && (
                            <CheckCircle className="h-5 w-5 text-primary" />
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">Balansdan darhol yechiladi</p>
                        <div className="mt-2 flex items-center justify-between">
                          <span className="text-xs text-muted-foreground">Mavjud balans</span>
                          <span className="text-sm font-bold tabular-nums">
                            {walletLoading ? '…' : `$${(walletBalance ?? 0).toLocaleString()}`}
                          </span>
                        </div>
                      </div>
                    </div>
                    {walletInsufficient && (
                      <div className="mt-3 flex items-center gap-2 p-2.5 rounded-lg bg-destructive/10 text-destructive text-xs">
                        <AlertCircle className="h-4 w-4 shrink-0" />
                        <span className="flex-1">Balans yetarli emas. To'ldiring yoki boshqa usul tanlang.</span>
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); goToPaymentSettings(); }}
                          className="font-semibold underline shrink-0"
                        >
                          To'ldirish
                        </button>
                      </div>
                    )}
                  </button>

                  {/* Card on delivery */}
                  <PaymentOption
                    icon={<CreditCard className="h-5 w-5 text-primary-foreground" />}
                    title="Karta orqali (yetkazishda)"
                    subtitle="Kuryer POS-terminali orqali to'lov"
                    active={paymentMethod === 'card_on_delivery'}
                    onSelect={() => setPaymentMethod('card_on_delivery')}
                  />

                  {/* Cash */}
                  <PaymentOption
                    icon={<Banknote className="h-5 w-5 text-primary-foreground" />}
                    title="Naqd (yetkazishda)"
                    subtitle="Mahsulotni qo'lingizga olganda to'lang"
                    active={paymentMethod === 'cash'}
                    onSelect={() => setPaymentMethod('cash')}
                  />

                  {/* Manage cards link */}
                  <button
                    type="button"
                    onClick={goToPaymentSettings}
                    className="w-full flex items-center justify-between p-3 rounded-xl border border-dashed border-border/50 hover:border-primary/50 hover:bg-primary/5 transition-colors text-sm"
                  >
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Plus className="h-4 w-4" />
                      To'lov usullarini boshqarish
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
                      {paymentLabel[paymentMethod]}
                    </div>
                    <button
                      onClick={() => setStep('payment')}
                      className="text-xs text-primary font-semibold"
                    >
                      O'zgartirish
                    </button>
                  </div>

                  <div className="space-y-2">
                    <h4 className="text-sm font-medium">Mahsulotlar ({cartItems.length})</h4>
                    {cartItems.map(item => {
                      const product = item.product;
                      if (!product) return null;
                      const image = product.images?.[0]?.url || 'https://placehold.co/60x60?text=No';
                      return (
                        <div key={item.id} className="flex gap-3 p-2 rounded-xl bg-muted/20">
                          <div className="w-14 h-14 rounded-lg overflow-hidden bg-muted shrink-0">
                            <img src={image} alt="" className="w-full h-full object-cover" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium line-clamp-1">{product.title}</p>
                            <p className="text-xs text-muted-foreground">{item.quantity} × ${product.price}</p>
                          </div>
                          <p className="text-sm font-bold">${(product.price * item.quantity).toLocaleString()}</p>
                        </div>
                      );
                    })}
                  </div>

                  <div className="p-3 rounded-xl bg-muted/30 border border-border/20 space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Mahsulotlar</span>
                      <span>${cartTotal.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Yetkazib berish</span>
                      <span>{shippingCost > 0 ? `$${shippingCost.toLocaleString()}` : 'Bepul'}</span>
                    </div>
                    <div className="h-px bg-border/30" />
                    <div className="flex justify-between font-bold">
                      <span>Jami</span>
                      <span className="text-primary text-lg">${grandTotal.toLocaleString()}</span>
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
                    {lastResult?.payment_status === 'paid' ? "To'lov muvaffaqiyatli!" : 'Buyurtma qabul qilindi!'}
                  </h2>
                  <p className="text-muted-foreground text-sm mb-5 max-w-xs">
                    {lastResult?.payment_status === 'paid'
                      ? "Hamyondan yechildi. Kvitansiya profilingizga saqlandi."
                      : "Yetkazganda to'lang. Sotuvchi tayyorlashni boshladi."}
                  </p>
                  <div className="w-full rounded-2xl border border-border/50 bg-muted/20 p-4 mb-5 text-left">
                    <div className="flex justify-between text-sm mb-2">
                      <span className="text-muted-foreground">Buyurtmalar</span>
                      <span className="font-semibold">{lastResult?.order_ids.length ?? 0}</span>
                    </div>
                    <div className="flex justify-between text-sm mb-2">
                      <span className="text-muted-foreground">To'lov usuli</span>
                      <span className="font-semibold">{paymentLabel[paymentMethod]}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Umumiy</span>
                      <span className="font-bold text-primary">${grandTotal.toLocaleString()}</span>
                    </div>
                  </div>
                  <div className="flex flex-col gap-2 w-full">
                    <Button className="rounded-xl h-11" onClick={() => { onOpenChange(false); onSuccess?.(); navigate('/marketplace?tab=orders'); }}>
                      <Package className="h-4 w-4 mr-2" />
                      Buyurtmalarim
                    </Button>
                    <Button variant="ghost" className="rounded-xl h-11" onClick={handleClose}>
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
                  <h2 className="text-xl font-bold mb-1">To'lov amalga oshmadi</h2>
                  <p className="text-muted-foreground text-sm mb-5 max-w-xs">
                    {lastResult?.error || "Kutilmagan xatolik yuz berdi. Iltimos, qayta urinib ko'ring."}
                  </p>
                  <div className="flex flex-col gap-2 w-full">
                    <Button className="rounded-xl h-11" onClick={() => setStep('review')}>
                      Qayta urinish
                    </Button>
                    {paymentMethod === 'wallet' && (
                      <Button variant="outline" className="rounded-xl h-11" onClick={goToPaymentSettings}>
                        <Wallet className="h-4 w-4 mr-2" />
                        Hamyonni to'ldirish
                      </Button>
                    )}
                    <Button variant="ghost" className="rounded-xl h-11" onClick={() => onOpenChange(false)}>
                      Yopish
                    </Button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </ScrollArea>

          {step !== 'success' && step !== 'failed' && (
            <div className="p-4 border-t border-border/30 bg-background/95 backdrop-blur-xl">
              {step === 'address' && (
                <Button
                  className="w-full h-12 rounded-xl text-sm font-semibold shadow-lg shadow-primary/20"
                  disabled={!isAddressValid}
                  onClick={() => setStep('payment')}
                >
                  Davom etish
                  <ChevronRight className="h-4 w-4 ml-2" />
                </Button>
              )}
              {step === 'payment' && (
                <Button
                  className="w-full h-12 rounded-xl text-sm font-semibold shadow-lg shadow-primary/20"
                  disabled={walletInsufficient}
                  onClick={() => setStep('review')}
                >
                  Ko'rib chiqish
                  <ChevronRight className="h-4 w-4 ml-2" />
                </Button>
              )}
              {step === 'review' && (
                <Button
                  className="w-full h-12 rounded-xl text-sm font-semibold shadow-lg shadow-primary/20"
                  disabled={isProcessing || walletInsufficient}
                  onClick={handlePlaceOrder}
                >
                  {isProcessing ? (
                    <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Buyurtma berilmoqda...</>
                  ) : (
                    <>Buyurtma berish — ${grandTotal.toLocaleString()}</>
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
        "w-full text-left rounded-2xl p-4 border transition-all",
        active
          ? "border-primary bg-primary/5 ring-2 ring-primary/20"
          : "border-border/50 hover:border-border bg-muted/20"
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

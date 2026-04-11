import { useState } from 'react';
import { 
  MapPin, CreditCard, Truck, ShieldCheck, ChevronRight, 
  Loader2, CheckCircle, Package, ArrowLeft
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useCheckout } from '@/hooks/useOrders';
import { useAuth } from '@/contexts/AuthContext';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';

interface CheckoutSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

export function CheckoutSheet({ open, onOpenChange, onSuccess }: CheckoutSheetProps) {
  const { user } = useAuth();
  const { placeOrder, isProcessing, cartItems, cartTotal } = useCheckout();
  const [step, setStep] = useState<'address' | 'review' | 'success'>('address');
  const [address, setAddress] = useState({
    full_name: '',
    phone: '',
    street: '',
    city: '',
    region: '',
    zip: '',
  });
  const [notes, setNotes] = useState('');

  const shippingCost = cartItems.reduce((sum, i) => sum + (i.product?.shipping_price || 0), 0);
  const grandTotal = cartTotal + shippingCost;

  const isAddressValid = address.full_name && address.phone && address.street && address.city;

  const handlePlaceOrder = async () => {
    const result = await placeOrder(address, notes || undefined);
    if (result) {
      setStep('success');
    }
  };

  const handleClose = () => {
    if (step === 'success') {
      setStep('address');
      onSuccess?.();
    }
    onOpenChange(false);
  };

  return (
    <Sheet open={open} onOpenChange={handleClose}>
      <SheetContent side="bottom" className="h-[95vh] p-0 rounded-t-3xl border-t border-border/30">
        <div className="flex flex-col h-full">
          <SheetHeader className="p-4 border-b border-border/30">
            <div className="flex items-center gap-3">
              {step === 'review' && (
                <Button variant="ghost" size="icon" className="h-9 w-9 rounded-xl" onClick={() => setStep('address')}>
                  <ArrowLeft className="h-4 w-4" />
                </Button>
              )}
              <SheetTitle className="flex-1">
                {step === 'address' && 'Yetkazib berish manzili'}
                {step === 'review' && 'Buyurtmani tasdiqlash'}
                {step === 'success' && 'Buyurtma qabul qilindi!'}
              </SheetTitle>
            </div>
            {/* Steps indicator */}
            {step !== 'success' && (
              <div className="flex gap-2 mt-2">
                {['address', 'review'].map((s, i) => (
                  <div key={s} className={cn(
                    "h-1 flex-1 rounded-full transition-all",
                    (s === step || (s === 'address' && step === 'review'))
                      ? "bg-primary"
                      : "bg-muted"
                  )} />
                ))}
              </div>
            )}
          </SheetHeader>

          <ScrollArea className="flex-1">
            <AnimatePresence mode="wait">
              {/* Address Step */}
              {step === 'address' && (
                <motion.div
                  key="address"
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 20 }}
                  className="p-4 space-y-4"
                >
                  <div className="space-y-3">
                    <div className="space-y-1.5">
                      <label className="text-sm font-medium">To'liq ism *</label>
                      <Input
                        value={address.full_name}
                        onChange={e => setAddress(p => ({ ...p, full_name: e.target.value }))}
                        placeholder="Ism Familiya"
                        className="rounded-xl h-11"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-sm font-medium">Telefon raqam *</label>
                      <Input
                        value={address.phone}
                        onChange={e => setAddress(p => ({ ...p, phone: e.target.value }))}
                        placeholder="+998 90 123 45 67"
                        className="rounded-xl h-11"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-sm font-medium">Ko'cha, uy *</label>
                      <Input
                        value={address.street}
                        onChange={e => setAddress(p => ({ ...p, street: e.target.value }))}
                        placeholder="Ko'cha nomi, uy raqami"
                        className="rounded-xl h-11"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <label className="text-sm font-medium">Shahar *</label>
                        <Input
                          value={address.city}
                          onChange={e => setAddress(p => ({ ...p, city: e.target.value }))}
                          placeholder="Toshkent"
                          className="rounded-xl h-11"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-sm font-medium">Viloyat</label>
                        <Input
                          value={address.region}
                          onChange={e => setAddress(p => ({ ...p, region: e.target.value }))}
                          placeholder="Toshkent sh."
                          className="rounded-xl h-11"
                        />
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-sm font-medium">Izoh (ixtiyoriy)</label>
                      <Textarea
                        value={notes}
                        onChange={e => setNotes(e.target.value)}
                        placeholder="Qo'shimcha izoh..."
                        className="rounded-xl resize-none"
                        rows={2}
                      />
                    </div>
                  </div>
                </motion.div>
              )}

              {/* Review Step */}
              {step === 'review' && (
                <motion.div
                  key="review"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  className="p-4 space-y-4"
                >
                  {/* Delivery Address */}
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

                  {/* Order Items */}
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

                  {/* Summary */}
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

                  {/* Trust badges */}
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

              {/* Success Step */}
              {step === 'success' && (
                <motion.div
                  key="success"
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="p-8 flex flex-col items-center justify-center text-center min-h-[400px]"
                >
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ type: 'spring', delay: 0.2 }}
                    className="w-20 h-20 rounded-full bg-green-500/10 flex items-center justify-center mb-5"
                  >
                    <CheckCircle className="h-10 w-10 text-green-500" />
                  </motion.div>
                  <h2 className="text-2xl font-bold mb-2">Buyurtma qabul qilindi!</h2>
                  <p className="text-muted-foreground mb-6 max-w-xs">
                    Buyurtmangiz muvaffaqiyatli yaratildi. Sotuvchi tez orada tayyorlab jo'natadi.
                  </p>
                  <Button className="rounded-xl" onClick={handleClose}>
                    <Package className="h-4 w-4 mr-2" />
                    Buyurtmalarimni ko'rish
                  </Button>
                </motion.div>
              )}
            </AnimatePresence>
          </ScrollArea>

          {/* Bottom Action */}
          {step !== 'success' && (
            <div className="p-4 border-t border-border/30 bg-background/95 backdrop-blur-xl">
              {step === 'address' ? (
                <Button
                  className="w-full h-12 rounded-xl text-sm font-semibold shadow-lg shadow-primary/20"
                  disabled={!isAddressValid}
                  onClick={() => setStep('review')}
                >
                  Davom etish
                  <ChevronRight className="h-4 w-4 ml-2" />
                </Button>
              ) : (
                <Button
                  className="w-full h-12 rounded-xl text-sm font-semibold shadow-lg shadow-primary/20"
                  disabled={isProcessing}
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

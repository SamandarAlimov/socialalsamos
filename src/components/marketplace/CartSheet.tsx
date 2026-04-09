import { useState } from 'react';
import { Minus, Plus, Trash2, ShoppingBag, ArrowRight, ShieldCheck, Truck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { useCart, CartItem } from '@/hooks/useMarketplace';
import { CheckoutSheet } from '@/components/marketplace/CheckoutSheet';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';

interface CartSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CartSheet({ open, onOpenChange }: CartSheetProps) {
  const { items, total, updateQuantity, removeFromCart } = useCart();
  const [showCheckout, setShowCheckout] = useState(false);

  return (
    <>
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-md p-0 flex flex-col border-l border-border/30">
        <SheetHeader className="p-4 border-b border-border/30">
          <SheetTitle className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-primary/10">
              <ShoppingBag className="h-4 w-4 text-primary" />
            </div>
            <span>Savat</span>
            {items.length > 0 && (
              <span className="ml-1 px-2 py-0.5 rounded-full bg-primary/10 text-primary text-xs font-bold">
                {items.length}
              </span>
            )}
          </SheetTitle>
        </SheetHeader>

        {items.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
            <div className="w-20 h-20 rounded-2xl bg-muted/50 flex items-center justify-center mb-5">
              <ShoppingBag className="h-10 w-10 text-muted-foreground/30" />
            </div>
            <h3 className="font-semibold text-lg mb-1">Savat bo'sh</h3>
            <p className="text-sm text-muted-foreground mb-5 max-w-xs">
              Yoqtirgan mahsulotlaringizni savatga qo'shing
            </p>
            <Button onClick={() => onOpenChange(false)} className="rounded-xl">
              Xarid qilish
            </Button>
          </div>
        ) : (
          <>
            <ScrollArea className="flex-1">
              <div className="p-4 space-y-3">
                <AnimatePresence>
                  {items.map((item) => (
                    <motion.div
                      key={item.id}
                      layout
                      initial={{ opacity: 0, x: 20 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -20 }}
                    >
                      <CartItemCard
                        item={item}
                        onUpdateQuantity={(qty) => updateQuantity(item.id, qty)}
                        onRemove={() => removeFromCart(item.id)}
                      />
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>
            </ScrollArea>

            {/* Checkout Summary */}
            <div className="p-4 border-t border-border/30 space-y-4 bg-background/95 backdrop-blur-xl">
              {/* Trust badges */}
              <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
                <div className="flex items-center gap-1">
                  <ShieldCheck className="h-3.5 w-3.5 text-green-500" />
                  <span>Xavfsiz to'lov</span>
                </div>
                <div className="flex items-center gap-1">
                  <Truck className="h-3.5 w-3.5 text-blue-500" />
                  <span>Yetkazib berish</span>
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Jami</span>
                  <span className="text-lg font-bold">${total.toLocaleString()}</span>
                </div>
                <p className="text-[11px] text-muted-foreground">
                  Yetkazish va soliq checkout da hisoblanadi
                </p>
              </div>
              
              <Button 
                className="w-full h-12 rounded-xl text-sm font-semibold shadow-lg shadow-primary/20"
                onClick={() => { setShowCheckout(true); onOpenChange(false); }}
              >
                Buyurtma berish — ${total.toLocaleString()}
                <ArrowRight className="h-4 w-4 ml-2" />
              </Button>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
    <CheckoutSheet open={showCheckout} onOpenChange={setShowCheckout} onSuccess={() => setShowCheckout(false)} />
    </>
  );
}

function CartItemCard({ item, onUpdateQuantity, onRemove }: { 
  item: CartItem; 
  onUpdateQuantity: (qty: number) => void;
  onRemove: () => void;
}) {
  const product = item.product;
  if (!product) return null;

  const image = product.images?.[0]?.url || 'https://placehold.co/100x100?text=No+Image';
  const itemTotal = product.price * item.quantity;

  return (
    <div className="flex gap-3 p-3 rounded-xl bg-muted/20 border border-border/20">
      <div className="w-20 h-20 rounded-xl overflow-hidden bg-muted shrink-0 ring-1 ring-border/20">
        <img src={image} alt={product.title} className="w-full h-full object-cover" />
      </div>

      <div className="flex-1 min-w-0 flex flex-col justify-between">
        <div>
          <h4 className="font-medium text-sm line-clamp-1">{product.title}</h4>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            {product.seller?.business_name}
          </p>
        </div>
        
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <button
              className="h-7 w-7 rounded-lg bg-muted/60 border border-border/30 flex items-center justify-center hover:bg-muted transition-colors"
              onClick={() => onUpdateQuantity(item.quantity - 1)}
            >
              <Minus className="h-3 w-3" />
            </button>
            <span className="w-7 text-center text-sm font-semibold">{item.quantity}</span>
            <button
              className="h-7 w-7 rounded-lg bg-muted/60 border border-border/30 flex items-center justify-center hover:bg-muted transition-colors disabled:opacity-40"
              onClick={() => onUpdateQuantity(item.quantity + 1)}
              disabled={item.quantity >= product.quantity}
            >
              <Plus className="h-3 w-3" />
            </button>
          </div>
          <span className="font-bold text-primary text-sm">${itemTotal.toLocaleString()}</span>
        </div>
      </div>

      <button
        className="self-start p-1.5 rounded-lg text-muted-foreground hover:text-red-500 hover:bg-red-500/10 transition-colors"
        onClick={onRemove}
      >
        <Trash2 className="h-4 w-4" />
      </button>
    </div>
  );
}

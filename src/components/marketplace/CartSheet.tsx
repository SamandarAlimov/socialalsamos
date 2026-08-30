import { useState } from 'react';
import { Minus, Plus, Trash2, ShoppingBag, ArrowRight, ShieldCheck, Truck, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { useCart, CartItem } from '@/hooks/useMarketplace';
import { CheckoutSheet } from '@/components/marketplace/CheckoutSheet';
import { formatPrice, getShippingCost, getStockState } from '@/lib/marketplace';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { marketplaceUz } from '@/i18n/marketplace';

interface CartSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CartSheet({ open, onOpenChange }: CartSheetProps) {
  const {
    items,
    total,
    shippingTotal,
    grandTotal,
    itemCount,
    unavailableItems,
    currency,
    updateQuantity,
    removeFromCart,
    refresh,
  } = useCart();
  const [showCheckout, setShowCheckout] = useState(false);

  const hasBlockingIssues = unavailableItems.length > 0;

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent className="w-full sm:max-w-md p-0 flex flex-col border-l border-border/30">
          <SheetHeader className="p-4 border-b border-border/30">
            <SheetTitle className="flex items-center gap-2.5">
              <div className="p-2 rounded-xl bg-primary/10">
                <ShoppingBag className="h-4 w-4 text-primary" />
              </div>
              <span>{marketplaceUz.cart.title}</span>
              {itemCount > 0 && (
                <span className="ml-1 px-2 py-0.5 rounded-full bg-primary/10 text-primary text-xs font-bold tabular-nums">
                  {itemCount}
                </span>
              )}
            </SheetTitle>
          </SheetHeader>

          {items.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
              <div className="w-20 h-20 rounded-2xl bg-muted/50 flex items-center justify-center mb-5">
                <ShoppingBag className="h-10 w-10 text-muted-foreground/30" />
              </div>
              <h3 className="font-semibold text-lg mb-1">{marketplaceUz.cart.emptyTitle}</h3>
              <p className="text-sm text-muted-foreground mb-5 max-w-xs">
                {marketplaceUz.cart.emptyDescription}
              </p>
              <Button onClick={() => onOpenChange(false)} className="rounded-xl">
                Xarid qilish
              </Button>
            </div>
          ) : (
            <>
              <ScrollArea className="flex-1">
                <div className="p-4 space-y-3">
                  {hasBlockingIssues && (
                    <div className="flex items-start gap-2 p-3 rounded-xl bg-destructive/10 text-destructive text-xs">
                      <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                      <span>
                        {marketplaceUz.cart.unavailable(unavailableItems.length)}
                      </span>
                    </div>
                  )}

                  <AnimatePresence initial={false}>
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
                          onUpdateQuantity={async (qty) => {
                            await updateQuantity(item.id, qty);
                          }}
                          onRemove={async () => {
                            await removeFromCart(item.id);
                            await refresh();
                          }}
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
                    <span>{marketplaceUz.cart.securePayment}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <Truck className="h-3.5 w-3.5 text-blue-500" />
                    <span>{marketplaceUz.cart.delivery}</span>
                  </div>
                </div>

                {/* Real totals — shipping is no longer a mystery "calculated later" */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">{marketplaceUz.cart.productsCount(itemCount)}</span>
                    <span className="tabular-nums">{formatPrice(total, currency)}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Yetkazib berish</span>
                    <span className="tabular-nums">
                      {shippingTotal > 0 ? formatPrice(shippingTotal, currency) : 'Bepul'}
                    </span>
                  </div>
                  <div className="h-px bg-border/30 my-1" />
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">{marketplaceUz.cart.total}</span>
                    <span className="text-lg font-bold tabular-nums">{formatPrice(grandTotal, currency)}</span>
                  </div>
                </div>

                <Button
                  className="w-full h-12 rounded-xl text-sm font-semibold shadow-lg shadow-primary/20"
                  disabled={hasBlockingIssues}
                  onClick={() => { setShowCheckout(true); onOpenChange(false); }}
                >
                  {marketplaceUz.cart.checkout} — {formatPrice(grandTotal, currency)}
                  <ArrowRight className="h-4 w-4 ml-2" />
                </Button>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
      <CheckoutSheet
        open={showCheckout}
        onOpenChange={setShowCheckout}
        onSuccess={() => { setShowCheckout(false); refresh(); }}
      />
    </>
  );
}

function CartItemCard({ item, onUpdateQuantity, onRemove }: {
  item: CartItem;
  onUpdateQuantity: (qty: number) => void;
  onRemove: () => void;
}) {
  const [imageFailed, setImageFailed] = useState(false);
  const product = item.product;
  if (!product) return null;

  const image = product.images?.[0]?.url;
  const currency = product.currency || 'USD';
  const { isSoldOut, stock } = getStockState(product);
  const itemTotal = product.price * item.quantity;
  const itemShipping = getShippingCost(product, item.quantity);
  const exceedsStock = !isSoldOut && item.quantity > stock;

  return (
    <div
      className={cn(
        'flex gap-3 p-3 rounded-xl bg-muted/20 border transition-colors',
        isSoldOut || exceedsStock ? 'border-destructive/40 bg-destructive/5' : 'border-border/20',
      )}
    >
      <div className="w-20 h-20 rounded-xl overflow-hidden bg-muted shrink-0 ring-1 ring-border/20">
        {image && !imageFailed ? (
          <img
            src={image}
            alt={product.title}
            className="w-full h-full object-cover"
            loading="lazy"
            onError={() => setImageFailed(true)}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-muted-foreground/40">
            <ShoppingBag className="h-5 w-5" />
          </div>
        )}
      </div>

      <div className="flex-1 min-w-0 flex flex-col justify-between">
        <div>
          <h4 className="font-medium text-sm line-clamp-1">{product.title}</h4>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            {product.seller?.business_name}
          </p>
          {isSoldOut ? (
            <p className="text-[11px] font-medium text-destructive mt-0.5">{marketplaceUz.cart.soldOut}</p>
          ) : exceedsStock ? (
            <p className="text-[11px] font-medium text-destructive mt-0.5">
              {marketplaceUz.cart.stockOnly(stock)}
            </p>
          ) : itemShipping > 0 ? (
            <p className="text-[11px] text-muted-foreground mt-0.5">
              + {formatPrice(itemShipping, currency)} {marketplaceUz.cart.shippingSuffix}
            </p>
          ) : null}
        </div>

        <div className="flex items-center justify-between mt-1.5">
          <div className="flex items-center gap-1.5">
            <button
              className="h-7 w-7 rounded-lg bg-muted/60 border border-border/30 flex items-center justify-center hover:bg-muted transition-colors"
              onClick={() => onUpdateQuantity(item.quantity - 1)}
              aria-label={marketplaceUz.cart.decrease}
            >
              <Minus className="h-3 w-3" />
            </button>
            <span className="w-7 text-center text-sm font-semibold tabular-nums">{item.quantity}</span>
            <button
              className="h-7 w-7 rounded-lg bg-muted/60 border border-border/30 flex items-center justify-center hover:bg-muted transition-colors disabled:opacity-40"
              onClick={() => onUpdateQuantity(item.quantity + 1)}
              disabled={item.quantity >= stock}
              aria-label={marketplaceUz.cart.increase}
            >
              <Plus className="h-3 w-3" />
            </button>
          </div>
          <span className="font-bold text-primary text-sm tabular-nums">
            {formatPrice(itemTotal, currency)}
          </span>
        </div>
      </div>

      <button
        className="self-start p-1.5 rounded-lg text-muted-foreground hover:text-red-500 hover:bg-red-500/10 transition-colors"
        onClick={onRemove}
        aria-label={marketplaceUz.cart.remove}
      >
        <Trash2 className="h-4 w-4" />
      </button>
    </div>
  );
}

import { useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  ChevronRight,
  MapPin,
  Minus,
  Plus,
  ShieldCheck,
  ShoppingBag,
  Trash2,
  Truck,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import {
  useCart, CartItem, getCartItemStock, getCartItemUnitPrice, getVariantOptionsLabel,
} from '@/hooks/useMarketplace';
import { CheckoutSheet } from '@/components/marketplace/CheckoutSheet';
import { formatPrice, getShippingCost } from '@/lib/marketplace';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { marketplaceUz } from '@/i18n/marketplace';
import { useIsMobile } from '@/hooks/use-mobile';
import { useMarketplaceDeliveryLocation } from '@/hooks/useMarketplaceDeliveryLocation';

interface CartSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CartSheet({ open, onOpenChange }: CartSheetProps) {
  const isMobile = useIsMobile();
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
  const { location, locate } = useMarketplaceDeliveryLocation();
  const [showCheckout, setShowCheckout] = useState(false);

  const hasBlockingIssues = unavailableItems.length > 0;

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent
          side={isMobile ? 'bottom' : 'right'}
          className={cn(
            'marketplace-neutral flex w-full flex-col p-0',
            isMobile
              ? 'h-[88dvh] max-h-[88dvh] rounded-t-[30px] border-x-0 border-b-0 border-t border-border/40'
              : 'border-l border-border/30 sm:max-w-md',
          )}
        >
          <SheetHeader className="border-b border-border/30 p-4">
            <SheetTitle className="flex items-center gap-2.5">
              <div className="rounded-xl bg-foreground/10 p-2">
                <ShoppingBag className="h-4 w-4 text-foreground" />
              </div>
              <span>{marketplaceUz.cart.title}</span>
              {itemCount > 0 && (
                <span className="ml-1 rounded-full bg-foreground/10 px-2 py-0.5 text-xs font-bold tabular-nums text-foreground">
                  {itemCount}
                </span>
              )}
            </SheetTitle>
          </SheetHeader>

          {items.length === 0 ? (
            <div className="flex flex-1 flex-col items-center justify-center p-8 text-center">
              <div className="mb-5 flex h-20 w-20 items-center justify-center rounded-2xl bg-muted/50">
                <ShoppingBag className="h-10 w-10 text-muted-foreground/30" />
              </div>
              <h3 className="mb-1 text-lg font-semibold">{marketplaceUz.cart.emptyTitle}</h3>
              <p className="mb-5 max-w-xs text-sm text-muted-foreground">
                {marketplaceUz.cart.emptyDescription}
              </p>
              <Button onClick={() => onOpenChange(false)} className="rounded-xl">
                Xarid qilish
              </Button>
            </div>
          ) : (
            <>
              <ScrollArea className="flex-1">
                <div className="space-y-3 p-4">
                  {hasBlockingIssues && (
                    <div className="flex items-start gap-2 rounded-xl bg-destructive/10 p-3 text-xs text-destructive">
                      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
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

              <div className="space-y-4 border-t border-border/30 bg-background/95 p-4 backdrop-blur-xl">
                <button
                  type="button"
                  onClick={() => void locate()}
                  className="group flex w-full min-w-0 items-center gap-3 rounded-2xl border border-border/50 bg-muted/25 p-3 text-left transition hover:bg-muted/50"
                >
                  <span className={cn(
                    'flex h-9 w-9 shrink-0 items-center justify-center rounded-xl',
                    location ? 'bg-foreground text-background' : 'bg-background text-muted-foreground shadow-sm',
                  )}>
                    <MapPin className="h-4 w-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[9px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
                      Yetkazish manzili
                    </span>
                    <span className="mt-0.5 block truncate text-xs font-semibold">
                      {location?.label || 'Xaritadan manzil tanlang'}
                    </span>
                  </span>
                  <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground transition group-hover:translate-x-0.5" />
                </button>

                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
                  <div className="flex items-center gap-1">
                    <ShieldCheck className="h-3.5 w-3.5 text-green-500" />
                    <span>{marketplaceUz.cart.securePayment}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <Truck className="h-3.5 w-3.5 text-blue-500" />
                    <span>{marketplaceUz.cart.delivery}</span>
                  </div>
                </div>

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
                  <div className="my-1 h-px bg-border/30" />
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">{marketplaceUz.cart.total}</span>
                    <span className="text-lg font-bold tabular-nums">{formatPrice(grandTotal, currency)}</span>
                  </div>
                </div>

                <Button
                  className="h-12 w-full rounded-xl text-sm font-semibold shadow-lg shadow-black/10"
                  disabled={hasBlockingIssues}
                  onClick={() => { setShowCheckout(true); onOpenChange(false); }}
                >
                  {marketplaceUz.cart.checkout} — {formatPrice(grandTotal, currency)}
                  <ArrowRight className="ml-2 h-4 w-4" />
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

  const image = item.variant?.image_url || product.images?.[0]?.url;
  const currency = product.currency || 'USD';
  const stock = getCartItemStock(item);
  const unitPrice = getCartItemUnitPrice(item);
  const isSoldOut =
    product.status !== 'active' ||
    stock <= 0 ||
    (item.product_variant_id != null && (!item.variant || !item.variant.is_active));
  const itemTotal = unitPrice * item.quantity;
  const variantLabel = getVariantOptionsLabel(item.variant);
  const itemShipping = getShippingCost(product, item.quantity);
  const exceedsStock = !isSoldOut && item.quantity > stock;

  return (
    <div
      className={cn(
        'flex gap-3 rounded-xl border p-3 transition-colors',
        isSoldOut || exceedsStock ? 'border-destructive/40 bg-destructive/5' : 'border-border/20 bg-muted/20',
      )}
    >
      <div className="h-20 w-20 shrink-0 overflow-hidden rounded-xl bg-muted ring-1 ring-border/20">
        {image && !imageFailed ? (
          <img
            src={image}
            alt={product.title}
            className="h-full w-full object-cover"
            loading="lazy"
            decoding="async"
            onError={() => setImageFailed(true)}
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-muted-foreground/40">
            <ShoppingBag className="h-5 w-5" />
          </div>
        )}
      </div>

      <div className="flex min-w-0 flex-1 flex-col justify-between">
        <div>
          <h4 className="line-clamp-1 text-sm font-medium">{product.title}</h4>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            {product.seller?.business_name}
          </p>
          {variantLabel && (
            <p className="mt-0.5 line-clamp-1 text-[11px] font-medium text-foreground/75">
              {variantLabel}
            </p>
          )}
          {isSoldOut ? (
            <p className="mt-0.5 text-[11px] font-medium text-destructive">{marketplaceUz.cart.soldOut}</p>
          ) : exceedsStock ? (
            <p className="mt-0.5 text-[11px] font-medium text-destructive">
              {marketplaceUz.cart.stockOnly(stock)}
            </p>
          ) : itemShipping > 0 ? (
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              + {formatPrice(itemShipping, currency)} {marketplaceUz.cart.shippingSuffix}
            </p>
          ) : null}
        </div>

        <div className="mt-1.5 flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <button
              className="flex h-7 w-7 items-center justify-center rounded-lg border border-border/30 bg-muted/60 transition-colors hover:bg-muted"
              onClick={() => onUpdateQuantity(item.quantity - 1)}
              aria-label={marketplaceUz.cart.decrease}
            >
              <Minus className="h-3 w-3" />
            </button>
            <span className="w-7 text-center text-sm font-semibold tabular-nums">{item.quantity}</span>
            <button
              className="flex h-7 w-7 items-center justify-center rounded-lg border border-border/30 bg-muted/60 transition-colors hover:bg-muted disabled:opacity-40"
              onClick={() => onUpdateQuantity(item.quantity + 1)}
              disabled={item.quantity >= stock}
              aria-label={marketplaceUz.cart.increase}
            >
              <Plus className="h-3 w-3" />
            </button>
          </div>
          <span className="text-sm font-bold tabular-nums text-foreground">
            {formatPrice(itemTotal, currency)}
          </span>
        </div>
      </div>

      <button
        className="self-start rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-red-500/10 hover:text-red-500"
        onClick={onRemove}
        aria-label={marketplaceUz.cart.remove}
      >
        <Trash2 className="h-4 w-4" />
      </button>
    </div>
  );
}

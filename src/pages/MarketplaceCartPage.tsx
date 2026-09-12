import { useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  ChevronRight,
  Globe2,
  MapPin,
  Minus,
  Plus,
  ShieldCheck,
  ShoppingBag,
  Trash2,
  Truck,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { CheckoutSheet } from '@/components/marketplace/CheckoutSheet';
import { InternationalCheckoutSheet } from '@/components/marketplace/InternationalCheckoutSheet';
import { MarketplaceBottomNav } from '@/components/marketplace/MarketplaceBottomNav';
import {
  CartItem,
  getCartItemStock,
  getCartItemUnitPrice,
  getVariantOptionsLabel,
  useCart,
  useSavedProducts,
} from '@/hooks/useMarketplace';
import { useMarketplaceDeliveryLocation } from '@/hooks/useMarketplaceDeliveryLocation';
import { formatPrice, getShippingCost } from '@/lib/marketplace';
import { cn } from '@/lib/utils';
import { marketplaceUz } from '@/i18n/marketplace';
import '@/styles/marketplace-premium.css';

export default function MarketplaceCartPage() {
  const navigate = useNavigate();
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
  const { products: savedProducts } = useSavedProducts();
  const { location, locate } = useMarketplaceDeliveryLocation();
  const [showCheckout, setShowCheckout] = useState(false);
  const [showInternationalCheckout, setShowInternationalCheckout] = useState(false);

  const hasBlockingIssues = unavailableItems.length > 0;
  const internationalEligibility = useMemo(() => {
    const sellerIds = new Set(items.map(item => item.product?.seller_id).filter(Boolean));
    const containsFood = items.some(item => Boolean((item.product as any)?.is_food));
    return {
      eligible: items.length > 0 && sellerIds.size === 1 && !containsFood && !hasBlockingIssues,
      containsFood,
      multiSeller: sellerIds.size > 1,
    };
  }, [hasBlockingIssues, items]);

  return (
    <div className="marketplace-neutral min-h-screen min-w-0 overflow-x-clip bg-background pb-8">
      <header className="sticky top-0 z-40 border-b border-border/40 bg-background/94 backdrop-blur-2xl">
        <div className="mx-auto flex w-full max-w-5xl items-center gap-3 px-4 py-3 lg:px-6">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-10 w-10 shrink-0 rounded-2xl"
            onClick={() => navigate('/marketplace')}
            aria-label="Bozorga qaytish"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h1 className="truncate text-lg font-extrabold tracking-tight sm:text-xl">Savat</h1>
              {itemCount > 0 && (
                <span className="rounded-full bg-foreground/10 px-2 py-0.5 text-xs font-extrabold tabular-nums">
                  {itemCount}
                </span>
              )}
            </div>
            <p className="hidden text-xs text-muted-foreground sm:block">Mahsulotlar, yetkazish va checkout bir joyda</p>
          </div>
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-foreground text-background">
            <ShoppingBag className="h-5 w-5" />
          </span>
        </div>
      </header>

      <main className="mx-auto w-full max-w-5xl px-4 py-5 lg:px-6 lg:py-7">
        {items.length === 0 ? (
          <div className="flex min-h-[58vh] flex-col items-center justify-center rounded-[32px] border border-dashed border-border/70 bg-card px-6 py-12 text-center">
            <div className="mb-5 flex h-20 w-20 items-center justify-center rounded-3xl bg-muted/60">
              <ShoppingBag className="h-10 w-10 text-muted-foreground/35" />
            </div>
            <h2 className="text-xl font-extrabold">{marketplaceUz.cart.emptyTitle}</h2>
            <p className="mt-2 max-w-sm text-sm leading-6 text-muted-foreground">{marketplaceUz.cart.emptyDescription}</p>
            <Button className="mt-5 rounded-xl" onClick={() => navigate('/marketplace')}>
              Bozorga o‘tish
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </div>
        ) : (
          <div className="grid min-w-0 gap-5 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start">
            <section className="min-w-0 space-y-3">
              <div className="mb-4">
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">Xaridlar</p>
                <h2 className="mt-1 text-xl font-extrabold tracking-tight">Savatdagi mahsulotlar</h2>
              </div>

              {hasBlockingIssues && (
                <div className="flex items-start gap-2 rounded-2xl border border-destructive/20 bg-destructive/10 p-3 text-xs text-destructive">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>{marketplaceUz.cart.unavailable(unavailableItems.length)}</span>
                </div>
              )}

              <AnimatePresence initial={false}>
                {items.map(item => (
                  <motion.div
                    key={item.id}
                    layout
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, x: -20 }}
                  >
                    <CartPageItem
                      item={item}
                      onUpdateQuantity={async quantity => {
                        await updateQuantity(item.id, quantity);
                      }}
                      onRemove={async () => {
                        await removeFromCart(item.id);
                        await refresh();
                      }}
                      onOpen={() => item.product && navigate(`/marketplace/product/${item.product.id}`)}
                    />
                  </motion.div>
                ))}
              </AnimatePresence>
            </section>

            <aside className="space-y-3 lg:sticky lg:top-24">
              <div className="rounded-[28px] border border-border/50 bg-card p-4 shadow-sm sm:p-5">
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">Buyurtma</p>
                <h2 className="mt-1 text-lg font-extrabold">Hisob-kitob</h2>

                <button
                  type="button"
                  onClick={() => void locate()}
                  className="group mt-4 flex w-full min-w-0 items-center gap-3 rounded-2xl border border-border/50 bg-muted/25 p-3 text-left transition hover:bg-muted/50"
                >
                  <span className={cn(
                    'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl',
                    location ? 'bg-foreground text-background' : 'bg-background text-muted-foreground shadow-sm',
                  )}>
                    <MapPin className="h-4 w-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[9px] font-bold uppercase tracking-[0.12em] text-muted-foreground">Yetkazish manzili</span>
                    <span className="mt-0.5 block truncate text-xs font-semibold">{location?.label || 'Xaritadan manzil tanlang'}</span>
                  </span>
                  <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground transition group-hover:translate-x-0.5" />
                </button>

                <div className="mt-5 space-y-2 text-sm">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-muted-foreground">{marketplaceUz.cart.productsCount(itemCount)}</span>
                    <span className="font-medium tabular-nums">{formatPrice(total, currency)}</span>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-muted-foreground">Mahalliy yetkazib berish</span>
                    <span className="font-medium tabular-nums">{shippingTotal > 0 ? formatPrice(shippingTotal, currency) : 'Bepul'}</span>
                  </div>
                  <div className="my-3 h-px bg-border/50" />
                  <div className="flex items-center justify-between gap-3">
                    <span className="font-bold">{marketplaceUz.cart.total}</span>
                    <span className="text-xl font-black tabular-nums">{formatPrice(grandTotal, currency)}</span>
                  </div>
                </div>

                <Button
                  className="mt-5 h-12 w-full rounded-xl text-sm font-bold shadow-lg shadow-black/10"
                  disabled={hasBlockingIssues}
                  onClick={() => setShowCheckout(true)}
                >
                  Checkout
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>

                {!internationalEligibility.containsFood && (
                  <button
                    type="button"
                    disabled={!internationalEligibility.eligible}
                    onClick={() => setShowInternationalCheckout(true)}
                    className={cn(
                      'mt-3 flex w-full min-w-0 items-center gap-3 rounded-2xl border p-3 text-left transition',
                      internationalEligibility.eligible
                        ? 'border-sky-500/25 bg-sky-500/[0.05] hover:bg-sky-500/[0.09]'
                        : 'cursor-not-allowed border-border/40 bg-muted/15 opacity-55',
                    )}
                  >
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-sky-500/10 text-sky-600">
                      <Globe2 className="h-4 w-4" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-xs font-extrabold">Xalqaro yetkazish</span>
                      <span className="mt-0.5 block text-[10px] leading-4 text-muted-foreground">
                        {internationalEligibility.multiSeller
                          ? 'Sotuvchilarni alohida rasmiylashtiring'
                          : 'Avia · avto · dengiz · multimodal'}
                      </span>
                    </span>
                    <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                  </button>
                )}

                <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
                  <span className="flex items-center gap-1"><ShieldCheck className="h-3.5 w-3.5 text-green-500" />{marketplaceUz.cart.securePayment}</span>
                  <span className="flex items-center gap-1"><Truck className="h-3.5 w-3.5 text-blue-500" />{marketplaceUz.cart.delivery}</span>
                </div>
              </div>
            </aside>
          </div>
        )}
      </main>

      <MarketplaceBottomNav
        activeTab="cart"
        itemCount={itemCount}
        savedCount={savedProducts.length}
      />

      <CheckoutSheet
        open={showCheckout}
        onOpenChange={setShowCheckout}
        onSuccess={() => {
          setShowCheckout(false);
          void refresh();
        }}
      />
      <InternationalCheckoutSheet
        open={showInternationalCheckout}
        onOpenChange={setShowInternationalCheckout}
        onSuccess={() => {
          setShowInternationalCheckout(false);
          void refresh();
        }}
      />
    </div>
  );
}

function CartPageItem({
  item,
  onUpdateQuantity,
  onRemove,
  onOpen,
}: {
  item: CartItem;
  onUpdateQuantity: (quantity: number) => void;
  onRemove: () => void;
  onOpen: () => void;
}) {
  const [imageFailed, setImageFailed] = useState(false);
  const product = item.product;
  if (!product) return null;

  const image = item.variant?.image_url || product.images?.[0]?.url;
  const stock = getCartItemStock(item);
  const unitPrice = getCartItemUnitPrice(item);
  const currency = product.currency || 'USD';
  const itemTotal = unitPrice * item.quantity;
  const variantLabel = getVariantOptionsLabel(item.variant);
  const itemShipping = getShippingCost(product, item.quantity);
  const isSoldOut =
    product.status !== 'active' ||
    stock <= 0 ||
    (item.product_variant_id != null && (!item.variant || !item.variant.is_active));
  const exceedsStock = !isSoldOut && item.quantity > stock;

  return (
    <article className={cn(
      'flex min-w-0 gap-3 rounded-2xl border bg-card p-3 shadow-sm sm:gap-4 sm:p-4',
      isSoldOut || exceedsStock ? 'border-destructive/35 bg-destructive/[0.03]' : 'border-border/50',
    )}>
      <button
        type="button"
        onClick={onOpen}
        className="h-24 w-24 shrink-0 overflow-hidden rounded-2xl bg-muted ring-1 ring-border/20 sm:h-28 sm:w-28"
        aria-label={product.title}
      >
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
          <span className="flex h-full w-full items-center justify-center text-muted-foreground/35">
            <ShoppingBag className="h-6 w-6" />
          </span>
        )}
      </button>

      <div className="flex min-w-0 flex-1 flex-col justify-between">
        <div className="min-w-0">
          <div className="flex min-w-0 items-start justify-between gap-2">
            <button type="button" onClick={onOpen} className="min-w-0 text-left">
              <h3 className="line-clamp-2 text-sm font-bold leading-5 sm:text-base">{product.title}</h3>
            </button>
            <button
              type="button"
              className="shrink-0 rounded-lg p-1.5 text-muted-foreground transition hover:bg-destructive/10 hover:text-destructive"
              onClick={onRemove}
              aria-label={marketplaceUz.cart.remove}
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
          <p className="mt-0.5 truncate text-[11px] text-muted-foreground">{product.seller?.business_name}</p>
          {variantLabel && <p className="mt-0.5 truncate text-[11px] font-medium text-foreground/75">{variantLabel}</p>}
          {isSoldOut ? (
            <p className="mt-1 text-[11px] font-semibold text-destructive">{marketplaceUz.cart.soldOut}</p>
          ) : exceedsStock ? (
            <p className="mt-1 text-[11px] font-semibold text-destructive">{marketplaceUz.cart.stockOnly(stock)}</p>
          ) : itemShipping > 0 ? (
            <p className="mt-1 text-[11px] text-muted-foreground">+ {formatPrice(itemShipping, currency)} {marketplaceUz.cart.shippingSuffix}</p>
          ) : null}
        </div>

        <div className="mt-3 flex flex-wrap items-end justify-between gap-2">
          <div className="flex items-center gap-1.5 rounded-xl border border-border/40 bg-muted/35 p-1">
            <button
              type="button"
              className="flex h-7 w-7 items-center justify-center rounded-lg transition hover:bg-background"
              onClick={() => onUpdateQuantity(item.quantity - 1)}
              aria-label={marketplaceUz.cart.decrease}
            >
              <Minus className="h-3 w-3" />
            </button>
            <span className="w-7 text-center text-sm font-bold tabular-nums">{item.quantity}</span>
            <button
              type="button"
              className="flex h-7 w-7 items-center justify-center rounded-lg transition hover:bg-background disabled:opacity-40"
              onClick={() => onUpdateQuantity(item.quantity + 1)}
              disabled={item.quantity >= stock}
              aria-label={marketplaceUz.cart.increase}
            >
              <Plus className="h-3 w-3" />
            </button>
          </div>
          <span className="text-base font-black tabular-nums">{formatPrice(itemTotal, currency)}</span>
        </div>
      </div>
    </article>
  );
}

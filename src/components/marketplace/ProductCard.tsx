import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent,
  type PointerEvent,
} from 'react';
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Eye,
  Heart,
  Loader2,
  MapPin,
  ShieldCheck,
  ShoppingCart,
  Star,
  Truck,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { marketplaceUz } from '@/i18n/marketplace';
import { Product, useProductActions } from '@/hooks/useMarketplace';
import { useHapticFeedback } from '@/hooks/useHapticFeedback';
import {
  conditionLabel,
  formatPrice,
  formatPriceCompact,
  getDiscount,
  getStockState,
} from '@/lib/marketplace';
import { MarketplaceProductImage } from '@/components/marketplace/MarketplaceProductImage';
import { motion } from 'framer-motion';

interface ProductCardProps {
  product: Product;
  onSelect?: (product: Product) => void;
  onLikeChange?: () => void;
  onAddToCart?: (productId: string) => boolean | Promise<boolean>;
  layout?: 'grid' | 'list';
}

function formatCount(value: number | null | undefined) {
  const count = Math.max(0, Number(value || 0));
  if (count < 1000) return String(count);
  if (count < 1_000_000) {
    const compact = count / 1000;
    return (compact >= 10 ? compact.toFixed(0) : compact.toFixed(1).replace(/\.0$/, '')) + 'K';
  }
  const compact = count / 1_000_000;
  return (compact >= 10 ? compact.toFixed(0) : compact.toFixed(1).replace(/\.0$/, '')) + 'M';
}

function VerifiedMerchantMark({ className }: { className?: string }) {
  return (
    <span
      className="inline-flex shrink-0 items-center"
      title="Alsamos tomonidan tasdiqlangan rasmiy sotuvchi"
      aria-label="Tasdiqlangan rasmiy sotuvchi"
    >
      <ShieldCheck className={cn('h-3 w-3 text-sky-500', className)} />
    </span>
  );
}

export function ProductCard({
  product,
  onSelect,
  onLikeChange,
  onAddToCart,
  layout = 'grid',
}: ProductCardProps) {
  const { triggerHaptic } = useHapticFeedback();
  const { toggleLike } = useProductActions();
  const [isLiked, setIsLiked] = useState(product.is_liked || false);
  const [isLiking, setIsLiking] = useState(false);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [isAddingToCart, setIsAddingToCart] = useState(false);
  const [justAdded, setJustAdded] = useState(false);

  const pointerStartX = useRef<number | null>(null);
  const pointerStartY = useRef<number | null>(null);
  const activePointerId = useRef<number | null>(null);
  const suppressSelectRef = useRef(false);
  const suppressTimerRef = useRef<number | null>(null);
  const addedTimerRef = useRef<number | null>(null);

  useEffect(() => {
    setIsLiked(Boolean(product.is_liked));
  }, [product.is_liked, product.id]);

  useEffect(() => {
    setCurrentImageIndex(0);
    setJustAdded(false);
  }, [product.id]);

  useEffect(() => {
    return () => {
      if (suppressTimerRef.current != null) window.clearTimeout(suppressTimerRef.current);
      if (addedTimerRef.current != null) window.clearTimeout(addedTimerRef.current);
    };
  }, []);

  const { hasDiscount, percent: discountPercent, savings } = getDiscount(
    product.price,
    product.compare_at_price,
  );
  const { isSoldOut, isLowStock, stock } = getStockState(product);
  const currency = product.currency || 'USD';
  const sellerRating = Number(product.seller?.rating ?? 0);
  const shippingPrice = Number(product.shipping_price ?? 0);
  const deliveryLabel = product.shipping_available
    ? shippingPrice > 0
      ? 'Yetkazish ' + formatPrice(shippingPrice, currency)
      : 'Bepul yetkazish'
    : 'Olib ketish';
  const productCondition = conditionLabel(product.condition);
  const views = Number(product.views_count ?? 0);
  const imageCount = product.images?.length ?? 0;
  const dotCount = Math.min(5, imageCount);
  const activeDotIndex =
    imageCount <= 1
      ? 0
      : imageCount <= 5
        ? currentImageIndex
        : Math.round((currentImageIndex / (imageCount - 1)) * (dotCount - 1));

  useEffect(() => {
    if (imageCount === 0) {
      setCurrentImageIndex(0);
      return;
    }
    setCurrentImageIndex(current => Math.min(current, imageCount - 1));
  }, [imageCount]);

  const temporarilySuppressSelect = () => {
    suppressSelectRef.current = true;
    if (suppressTimerRef.current != null) window.clearTimeout(suppressTimerRef.current);
    suppressTimerRef.current = window.setTimeout(() => {
      suppressSelectRef.current = false;
    }, 350);
  };

  const selectProduct = () => {
    if (suppressSelectRef.current) return;
    onSelect?.(product);
  };

  const shiftImage = (delta: number) => {
    if (imageCount <= 1) return;
    temporarilySuppressSelect();
    setCurrentImageIndex(current => (current + delta + imageCount) % imageCount);
    triggerHaptic('light');
  };

  const handleMediaPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (imageCount <= 1) return;
    if ((event.target as HTMLElement).closest('button')) return;

    pointerStartX.current = event.clientX;
    pointerStartY.current = event.clientY;
    activePointerId.current = event.pointerId;

    if (event.pointerType === 'mouse') {
      event.preventDefault();
    }

    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // Some embedded browsers do not expose pointer capture.
    }
  };

  const resetPointerGesture = () => {
    pointerStartX.current = null;
    pointerStartY.current = null;
    activePointerId.current = null;
  };

  const handleMediaPointerUp = (event: PointerEvent<HTMLDivElement>) => {
    if (
      imageCount <= 1 ||
      activePointerId.current !== event.pointerId ||
      pointerStartX.current == null ||
      pointerStartY.current == null
    ) {
      resetPointerGesture();
      return;
    }

    const deltaX = event.clientX - pointerStartX.current;
    const deltaY = event.clientY - pointerStartY.current;
    resetPointerGesture();

    if (Math.abs(deltaX) < 32 || Math.abs(deltaX) <= Math.abs(deltaY) * 1.05) return;
    shiftImage(deltaX < 0 ? 1 : -1);
  };

  const handleLike = async (event: MouseEvent<HTMLElement>) => {
    event.stopPropagation();
    if (isLiking) return;
    setIsLiking(true);
    triggerHaptic('medium');
    const success = await toggleLike(product.id, isLiked);
    if (success) {
      setIsLiked(!isLiked);
      onLikeChange?.();
    }
    setIsLiking(false);
  };

  const handleAddToCart = async (event: MouseEvent<HTMLElement>) => {
    event.stopPropagation();
    if (!onAddToCart || isAddingToCart || isSoldOut) return;

    triggerHaptic('medium');
    setIsAddingToCart(true);
    try {
      const success = await onAddToCart(product.id);
      if (!success) return;

      setJustAdded(true);
      if (addedTimerRef.current != null) window.clearTimeout(addedTimerRef.current);
      addedTimerRef.current = window.setTimeout(() => setJustAdded(false), 1400);
    } finally {
      setIsAddingToCart(false);
    }
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.target !== event.currentTarget) return;
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      selectProduct();
    }
  };

  const cartLabel = isAddingToCart
    ? marketplaceUz.card.addingToCart
    : justAdded
      ? marketplaceUz.card.addedToCart
      : marketplaceUz.card.addToCart;

  const CartIcon = isAddingToCart ? Loader2 : justAdded ? Check : ShoppingCart;

  if (layout === 'list') {
    return (
      <div
        role="button"
        tabIndex={0}
        aria-label={product.title}
        className="flex cursor-pointer gap-3 rounded-2xl border border-border/30 bg-card/50 p-3 backdrop-blur-sm transition-all hover:bg-card/80 active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/40"
        onClick={selectProduct}
        onKeyDown={handleKeyDown}
      >
        <div
          className="relative h-24 w-24 shrink-0 touch-pan-y select-none overflow-hidden rounded-xl bg-muted"
          onPointerDown={handleMediaPointerDown}
          onPointerUp={handleMediaPointerUp}
          onPointerCancel={resetPointerGesture}
          onDragStart={event => event.preventDefault()}
        >
          <MarketplaceProductImage
            product={product}
            imageIndex={currentImageIndex}
            className={cn('h-full w-full object-cover', isSoldOut && 'opacity-60 grayscale-[30%]')}
          />
          {isSoldOut && (
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="rounded-md bg-black/70 px-2 py-0.5 text-[10px] font-bold text-white">
                {marketplaceUz.card.sold}
              </span>
            </div>
          )}
          {hasDiscount && !isSoldOut && (
            <span className="absolute left-1.5 top-1.5 rounded-md bg-red-500 px-1.5 py-0.5 text-[9px] font-extrabold text-white shadow">
              −{discountPercent}%
            </span>
          )}
          {imageCount > 1 && (
            <div className="absolute bottom-1.5 left-1/2 flex -translate-x-1/2 items-center gap-1 rounded-full bg-black/35 px-1.5 py-1 backdrop-blur">
              {Array.from({ length: dotCount }).map((_, index) => (
                <span
                  key={index}
                  className={cn(
                    'h-1 rounded-full bg-white/60 transition-all',
                    index === activeDotIndex ? 'w-3 bg-white' : 'w-1',
                  )}
                />
              ))}
            </div>
          )}
        </div>

        <div className="flex min-w-0 flex-1 flex-col justify-between py-0.5">
          <div>
            <h3 className="line-clamp-2 text-sm font-medium leading-snug">{product.title}</h3>
            {product.seller && (
              <div className="mt-1 flex min-w-0 items-center gap-1 text-[11px] text-muted-foreground">
                <span className="truncate">{product.seller.business_name}</span>
                {product.seller.is_verified && <VerifiedMerchantMark />}
                {sellerRating > 0 && (
                  <span className="ml-1 inline-flex shrink-0 items-center gap-0.5">
                    <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
                    <span className="font-semibold text-foreground/80">{sellerRating.toFixed(1)}</span>
                  </span>
                )}
              </div>
            )}
            <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[10px] text-muted-foreground">
              <span className="rounded-md bg-muted/70 px-1.5 py-0.5 font-medium text-foreground/80">
                {productCondition}
              </span>
              <span className="inline-flex items-center gap-1">
                <Truck className="h-3 w-3" />
                {deliveryLabel}
              </span>
              {views > 0 && (
                <span className="inline-flex items-center gap-1">
                  <Eye className="h-3 w-3" />
                  {formatCount(views)}
                </span>
              )}
              {product.location && (
                <span className="inline-flex min-w-0 items-center gap-1">
                  <MapPin className="h-3 w-3 shrink-0" />
                  <span className="max-w-32 truncate">{product.location}</span>
                </span>
              )}
            </div>
          </div>

          <div className="mt-2 flex items-end justify-between gap-2">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-baseline gap-1.5">
                <span className="text-base font-bold tabular-nums text-foreground">
                  {formatPrice(product.price, currency)}
                </span>
                {hasDiscount && (
                  <span className="text-[11px] tabular-nums text-muted-foreground line-through">
                    {formatPrice(product.compare_at_price, currency)}
                  </span>
                )}
              </div>
              {hasDiscount && (
                <span className="mt-0.5 inline-block text-[9px] font-extrabold uppercase tracking-wide text-orange-600 dark:text-orange-400">
                  {marketplaceUz.card.priceDropped}
                </span>
              )}
            </div>

            <div className="flex shrink-0 items-center gap-1">
              {onAddToCart && (
                <Button
                  type="button"
                  size="sm"
                  className={cn(
                    'h-8 rounded-xl px-2.5 text-[11px] font-bold text-white shadow-sm transition',
                    justAdded
                      ? 'bg-emerald-600 hover:bg-emerald-600'
                      : 'bg-zinc-950 hover:bg-zinc-800 dark:bg-white dark:text-zinc-950 dark:hover:bg-zinc-200',
                  )}
                  onClick={handleAddToCart}
                  disabled={isAddingToCart || isSoldOut}
                  aria-label={marketplaceUz.card.addToCart}
                >
                  <CartIcon className={cn('mr-1 h-3.5 w-3.5', isAddingToCart && 'animate-spin')} />
                  {isSoldOut ? marketplaceUz.card.sold : cartLabel}
                </Button>
              )}
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 shrink-0"
                onClick={handleLike}
                disabled={isLiking}
                aria-label={isLiked ? marketplaceUz.card.removeSaved : marketplaceUz.card.save}
                aria-pressed={isLiked}
                aria-busy={isLiking}
              >
                <Heart className={cn('h-4 w-4', isLiked && 'fill-red-500 text-red-500')} />
              </Button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={product.title}
      className="group flex h-full cursor-pointer flex-col overflow-hidden rounded-2xl border border-border/40 bg-card transition-all duration-300 hover:border-foreground/30 hover:shadow-xl hover:shadow-black/5 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/40"
      onClick={selectProduct}
      onKeyDown={handleKeyDown}
    >
      <div
        className="relative aspect-square touch-pan-y select-none overflow-hidden bg-muted"
        onPointerDown={handleMediaPointerDown}
        onPointerUp={handleMediaPointerUp}
        onPointerCancel={resetPointerGesture}
        onDragStart={event => event.preventDefault()}
      >
        <MarketplaceProductImage
          product={product}
          imageIndex={currentImageIndex}
          className={cn(
            'h-full w-full object-cover transition-transform duration-500 ease-out group-hover:scale-[1.02]',
            isSoldOut && 'opacity-60 grayscale-[30%]',
          )}
        />

        {isSoldOut && (
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="rounded-lg bg-black/70 px-3 py-1 text-xs font-bold tracking-wide text-white">
              {marketplaceUz.card.sold}
            </span>
          </div>
        )}

        <motion.div className="absolute right-2 top-2 z-20" whileTap={{ scale: 0.85 }}>
          <Button
            variant="ghost"
            size="icon"
            className={cn(
              'h-8 w-8 rounded-full shadow-md backdrop-blur-md transition-all',
              isLiked
                ? 'bg-red-500/95 text-white hover:bg-red-500'
                : 'border border-border/30 bg-background/90 hover:bg-background',
            )}
            onClick={handleLike}
            disabled={isLiking}
            aria-label={isLiked ? marketplaceUz.card.removeSaved : marketplaceUz.card.save}
            aria-pressed={isLiked}
            aria-busy={isLiking}
          >
            <Heart className={cn('h-3.5 w-3.5', isLiked && 'fill-current')} />
          </Button>
        </motion.div>

        <div className="absolute left-2 top-2 z-20 flex flex-col gap-1">
          {hasDiscount && (
            <span className="rounded-md bg-red-500 px-2 py-0.5 text-[10px] font-extrabold text-white shadow-lg">
              −{discountPercent}%
            </span>
          )}
          {product.is_featured && (
            <span className="rounded-md bg-gradient-to-r from-amber-400 to-orange-500 px-2 py-0.5 text-[10px] font-bold text-black shadow-lg">
              TOP
            </span>
          )}
          {isLowStock && (
            <span className="rounded-md bg-orange-500/95 px-2 py-0.5 text-[10px] font-bold text-white shadow-lg">
              {marketplaceUz.card.stockLeft(stock)}
            </span>
          )}
        </div>

        {imageCount > 1 && (
          <>
            <button
              type="button"
              aria-label={marketplaceUz.card.previousImage}
              className="absolute left-2 top-1/2 z-20 hidden h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full bg-background/90 text-foreground opacity-0 shadow-md backdrop-blur transition-opacity group-hover:opacity-100 sm:flex"
              onClick={event => {
                event.stopPropagation();
                shiftImage(-1);
              }}
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              type="button"
              aria-label={marketplaceUz.card.nextImage}
              className="absolute right-2 top-1/2 z-20 hidden h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full bg-background/90 text-foreground opacity-0 shadow-md backdrop-blur transition-opacity group-hover:opacity-100 sm:flex"
              onClick={event => {
                event.stopPropagation();
                shiftImage(1);
              }}
            >
              <ChevronRight className="h-4 w-4" />
            </button>
            <div className="absolute bottom-2 left-1/2 z-20 flex -translate-x-1/2 items-center gap-1 rounded-full bg-black/35 px-2 py-1.5 backdrop-blur">
              {Array.from({ length: dotCount }).map((_, index) => (
                <button
                  key={index}
                  type="button"
                  aria-label={marketplaceUz.card.imageNumber(index + 1)}
                  className={cn(
                    'h-1.5 rounded-full bg-white/60 transition-all',
                    index === activeDotIndex ? 'w-4 bg-white' : 'w-1.5',
                  )}
                  onClick={event => {
                    event.stopPropagation();
                    temporarilySuppressSelect();
                    const targetIndex =
                      dotCount <= 1
                        ? 0
                        : Math.round((index / (dotCount - 1)) * (imageCount - 1));
                    setCurrentImageIndex(targetIndex);
                  }}
                />
              ))}
            </div>
          </>
        )}

        {product.is_negotiable && !isSoldOut && (
          <div className="absolute bottom-2 left-2 z-10">
            <span className="rounded-md border border-foreground/20 bg-background/90 px-2 py-0.5 text-[10px] font-semibold text-foreground backdrop-blur-md">
              {marketplaceUz.card.negotiable}
            </span>
          </div>
        )}

        {views > 0 && (
          <div className="absolute bottom-2 right-2 z-10 inline-flex items-center gap-1 rounded-full bg-black/45 px-2 py-1 text-[9px] font-semibold text-white backdrop-blur-md">
            <Eye className="h-3 w-3" />
            <span className="tabular-nums">{formatCount(views)}</span>
          </div>
        )}
      </div>

      <div className="flex flex-1 flex-col gap-1.5 p-2.5">
        <div className="flex flex-wrap items-baseline gap-1.5">
          <span className="text-[15px] font-extrabold tabular-nums text-foreground">
            {formatPrice(product.price, currency)}
          </span>
          {hasDiscount && (
            <span className="text-[11px] tabular-nums text-muted-foreground line-through">
              {formatPrice(product.compare_at_price, currency)}
            </span>
          )}
        </div>

        {hasDiscount && (
          <div className="flex flex-wrap items-center gap-1">
            <span className="text-[9px] font-extrabold uppercase tracking-[0.08em] text-orange-600 dark:text-orange-400">
              {marketplaceUz.card.priceDropped}
            </span>
            <span className="rounded-md bg-yellow-300 px-1.5 py-0.5 text-[9px] font-bold text-black">
              {marketplaceUz.card.youSave(formatPriceCompact(savings, currency))}
            </span>
          </div>
        )}

        <h3 className="min-h-[2.1rem] line-clamp-2 text-[12.5px] leading-snug text-foreground/90 sm:text-[13px]">
          {product.title}
        </h3>

        <div className="flex min-w-0 flex-wrap items-center gap-1 text-[9.5px]">
          <span className="rounded-md bg-muted/65 px-1.5 py-0.5 font-semibold text-foreground/80">
            {productCondition}
          </span>
          <span className="inline-flex max-w-full items-center gap-1 rounded-md bg-muted/45 px-1.5 py-0.5 text-muted-foreground">
            <Truck className="h-2.5 w-2.5 shrink-0" />
            <span className="truncate">{deliveryLabel}</span>
          </span>
        </div>

        {product.location && (
          <div className="flex min-w-0 items-center gap-1 text-[10px] text-muted-foreground">
            <MapPin className="h-3 w-3 shrink-0" />
            <span className="truncate">{product.location}</span>
          </div>
        )}

        {product.seller && (
          <div className="mt-auto flex items-center gap-1 border-t border-border/30 pt-1 text-[11px] text-muted-foreground">
            <span className="min-w-0 flex-1 truncate">{product.seller.business_name}</span>
            {product.seller.is_verified && <VerifiedMerchantMark />}
            {sellerRating > 0 && (
              <span className="inline-flex shrink-0 items-center gap-0.5 text-[10px]">
                <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
                <span className="font-semibold tabular-nums text-foreground/80">
                  {sellerRating.toFixed(1)}
                </span>
              </span>
            )}
            {(product.seller.total_sales ?? 0) > 0 && (
              <span className="hidden shrink-0 text-[9px] sm:inline">
                {marketplaceUz.card.sales(product.seller.total_sales ?? 0)}
              </span>
            )}
          </div>
        )}

        {onAddToCart && (
          <Button
            type="button"
            className={cn(
              'mt-1 h-9 w-full rounded-xl text-xs font-extrabold text-white shadow-sm transition active:scale-[0.99]',
              justAdded
                ? 'bg-emerald-600 hover:bg-emerald-600'
                : 'bg-zinc-950 hover:bg-zinc-800 dark:bg-white dark:text-zinc-950 dark:hover:bg-zinc-200',
            )}
            onClick={handleAddToCart}
            disabled={isAddingToCart || isSoldOut}
            aria-label={marketplaceUz.card.addToCart}
          >
            <CartIcon className={cn('mr-1.5 h-4 w-4', isAddingToCart && 'animate-spin')} />
            {isSoldOut ? marketplaceUz.card.sold : cartLabel}
          </Button>
        )}
      </div>
    </div>
  );
}

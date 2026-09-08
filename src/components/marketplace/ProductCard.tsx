import { useState } from 'react';
import { Heart, MapPin, ShieldCheck, Star, Truck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { marketplaceUz } from '@/i18n/marketplace';
import { Product, useProductActions } from '@/hooks/useMarketplace';
import { useHapticFeedback } from '@/hooks/useHapticFeedback';
import { conditionLabel, formatPrice, getDiscount, getStockState } from '@/lib/marketplace';
import { CategoryIcon } from '@/components/marketplace/CategoryIcon';
import { motion } from 'framer-motion';

interface ProductCardProps {
  product: Product;
  onSelect?: (product: Product) => void;
  onLikeChange?: () => void;
  layout?: 'grid' | 'list';
}

export function ProductCard({ product, onSelect, onLikeChange, layout = 'grid' }: ProductCardProps) {
  const { triggerHaptic } = useHapticFeedback();
  const { toggleLike } = useProductActions();
  const [isLiked, setIsLiked] = useState(product.is_liked || false);
  const [isLiking, setIsLiking] = useState(false);
  const [imageFailed, setImageFailed] = useState(false);

  const mainImage = product.images?.[0]?.url;
  const { hasDiscount, percent: discountPercent } = getDiscount(product.price, product.compare_at_price);
  const { isSoldOut, isLowStock, stock } = getStockState(product);
  const currency = product.currency || 'USD';
  const sellerRating = Number(product.seller?.rating ?? 0);
  const shippingPrice = Number(product.shipping_price ?? 0);
  const deliveryLabel = product.shipping_available
    ? shippingPrice > 0
      ? 'Yetkazish bor'
      : 'Bepul yetkazish'
    : 'Olib ketish';
  const productCondition = conditionLabel(product.condition);

  const handleLike = async (e: React.MouseEvent) => {
    e.stopPropagation();
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

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onSelect?.(product);
    }
  };

  /** Local category fallback; no external placeholder request. */
  const ImageFallback = () => (
    <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-muted to-muted/40 text-muted-foreground/40">
      <CategoryIcon
        slug={product.category?.slug}
        name={product.category?.name}
        className="h-7 w-7"
      />
    </div>
  );

  if (layout === 'list') {
    return (
      <div
        role="button"
        tabIndex={0}
        aria-label={product.title}
        className="flex cursor-pointer gap-3 rounded-2xl border border-border/30 bg-card/50 p-3 backdrop-blur-sm transition-all hover:bg-card/80 active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/40"
        onClick={() => onSelect?.(product)}
        onKeyDown={handleKeyDown}
      >
        <div className="relative h-24 w-24 shrink-0 overflow-hidden rounded-xl bg-muted">
          {mainImage && !imageFailed ? (
            <img
              src={mainImage}
              alt={product.title}
              className={cn('h-full w-full object-cover', isSoldOut && 'opacity-60 grayscale-[30%]')}
              loading="lazy"
              onError={() => setImageFailed(true)}
            />
          ) : (
            <ImageFallback />
          )}
          {isSoldOut && (
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="rounded-md bg-black/70 px-2 py-0.5 text-[10px] font-bold text-white">{marketplaceUz.card.sold}</span>
            </div>
          )}
        </div>
        <div className="flex min-w-0 flex-1 flex-col justify-between py-0.5">
          <div>
            <h3 className="line-clamp-2 text-sm font-medium leading-snug">{product.title}</h3>
            {product.seller && (
              <div className="mt-1 flex items-center gap-1 text-[11px] text-muted-foreground">
                <span className="truncate">{product.seller.business_name}</span>
                {product.seller.is_verified && <ShieldCheck className="h-3 w-3 shrink-0 text-foreground" />}
              </div>
            )}
            <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[10px] text-muted-foreground">
              <span className="rounded-md bg-muted/70 px-1.5 py-0.5 font-medium text-foreground/80">{productCondition}</span>
              <span className="inline-flex items-center gap-1"><Truck className="h-3 w-3" />{deliveryLabel}</span>
              {product.location && <span className="inline-flex min-w-0 items-center gap-1"><MapPin className="h-3 w-3 shrink-0" /><span className="max-w-32 truncate">{product.location}</span></span>}
            </div>
          </div>
          <div className="flex items-center justify-between gap-2">
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
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 shrink-0"
              onClick={handleLike}
              disabled={isLiking}
              aria-label={isLiked ? marketplaceUz.card.removeSaved : marketplaceUz.card.save}
              aria-pressed={isLiked}
            >
              <Heart className={cn('h-4 w-4', isLiked && 'fill-red-500 text-red-500')} />
            </Button>
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
      className="group flex cursor-pointer flex-col overflow-hidden rounded-2xl border border-border/40 bg-card transition-all duration-300 hover:border-foreground/30 hover:shadow-xl hover:shadow-black/5 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/40"
      onClick={() => onSelect?.(product)}
      onKeyDown={handleKeyDown}
    >
      <div className="relative aspect-square overflow-hidden bg-muted">
        {mainImage && !imageFailed ? (
          <img
            src={mainImage}
            alt={product.title}
            className={cn(
              'h-full w-full object-cover transition-transform duration-700 ease-out group-hover:scale-105',
              isSoldOut && 'opacity-60 grayscale-[30%]',
            )}
            loading="lazy"
            decoding="async"
            onError={() => setImageFailed(true)}
          />
        ) : (
          <ImageFallback />
        )}

        {isSoldOut && (
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="rounded-lg bg-black/70 px-3 py-1 text-xs font-bold tracking-wide text-white">{marketplaceUz.card.sold}</span>
          </div>
        )}

        <motion.div className="absolute right-2 top-2" whileTap={{ scale: 0.85 }}>
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
          >
            <Heart className={cn('h-3.5 w-3.5', isLiked && 'fill-current')} />
          </Button>
        </motion.div>

        <div className="absolute left-2 top-2 flex flex-col gap-1">
          {hasDiscount && (
            <span className="rounded-md bg-red-500 px-2 py-0.5 text-[10px] font-extrabold text-white shadow-lg">
              −{discountPercent}%
            </span>
          )}
          {product.is_featured && (
            <span className="rounded-md bg-gradient-to-r from-amber-500 to-orange-500 px-2 py-0.5 text-[10px] font-bold text-white shadow-lg">
              TOP
            </span>
          )}
          {isLowStock && (
            <span className="rounded-md bg-orange-500/95 px-2 py-0.5 text-[10px] font-bold text-white shadow-lg">
              {marketplaceUz.card.stockLeft(stock)}
            </span>
          )}
        </div>

        {product.is_negotiable && !isSoldOut && (
          <div className="absolute bottom-2 left-2">
            <span className="rounded-md border border-foreground/20 bg-background/90 px-2 py-0.5 text-[10px] font-semibold text-foreground backdrop-blur-md">
              Kelishiladi
            </span>
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

        <h3 className="min-h-[2.1rem] line-clamp-2 text-[12.5px] leading-snug text-foreground/90">
          {product.title}
        </h3>

        <div className="flex min-w-0 flex-wrap items-center gap-1 text-[9.5px]">
          <span className="rounded-md bg-muted/65 px-1.5 py-0.5 font-semibold text-foreground/80">
            {productCondition}
          </span>
          <span className="inline-flex items-center gap-1 rounded-md bg-muted/45 px-1.5 py-0.5 text-muted-foreground">
            <Truck className="h-2.5 w-2.5" />
            {deliveryLabel}
          </span>
        </div>

        {sellerRating > 0 && (
          <div className="flex items-center gap-1 text-[11px]">
            <div className="flex items-center gap-0.5">
              <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
              <span className="font-semibold tabular-nums">{sellerRating.toFixed(1)}</span>
            </div>
            <span className="text-muted-foreground">·</span>
            <span className="text-muted-foreground">{marketplaceUz.card.sales(product.seller?.total_sales ?? 0)}</span>
          </div>
        )}

        {product.location && (
          <div className="flex min-w-0 items-center gap-1 text-[10px] text-muted-foreground">
            <MapPin className="h-3 w-3 shrink-0" />
            <span className="truncate">{product.location}</span>
          </div>
        )}

        {product.seller && (
          <div className="mt-auto flex items-center gap-1 border-t border-border/30 pt-1 text-[11px] text-muted-foreground">
            <span className="min-w-0 flex-1 truncate">{product.seller.business_name}</span>
            {product.seller.is_verified && <ShieldCheck className="h-3 w-3 shrink-0 text-foreground" />}
          </div>
        )}
      </div>
    </div>
  );
}

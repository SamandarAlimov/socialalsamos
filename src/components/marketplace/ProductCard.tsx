import { useState } from 'react';
import { Heart, Star, MapPin, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { marketplaceUz } from '@/i18n/marketplace';
import { Product, useProductActions } from '@/hooks/useMarketplace';
import { useHapticFeedback } from '@/hooks/useHapticFeedback';
import { formatPrice, getDiscount, getStockState } from '@/lib/marketplace';
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
    <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-muted to-muted/40 text-muted-foreground/40">
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
        className="flex gap-3 p-3 rounded-2xl bg-card/50 backdrop-blur-sm border border-border/30 cursor-pointer hover:bg-card/80 transition-all active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
        onClick={() => onSelect?.(product)}
        onKeyDown={handleKeyDown}
      >
        <div className="relative w-24 h-24 rounded-xl overflow-hidden bg-muted shrink-0">
          {mainImage && !imageFailed ? (
            <img
              src={mainImage}
              alt={product.title}
              className={cn('w-full h-full object-cover', isSoldOut && 'opacity-60 grayscale-[30%]')}
              loading="lazy"
              onError={() => setImageFailed(true)}
            />
          ) : (
            <ImageFallback />
          )}
          {isSoldOut && (
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="px-2 py-0.5 rounded-md bg-black/70 text-white text-[10px] font-bold">{marketplaceUz.card.sold}</span>
            </div>
          )}
        </div>
        <div className="flex-1 min-w-0 flex flex-col justify-between py-0.5">
          <div>
            <h3 className="font-medium text-sm line-clamp-2 leading-snug">{product.title}</h3>
            {product.seller && (
              <div className="flex items-center gap-1 mt-1 text-[11px] text-muted-foreground">
                <span className="truncate">{product.seller.business_name}</span>
                {product.seller.is_verified && <ShieldCheck className="h-3 w-3 text-primary shrink-0" />}
              </div>
            )}
          </div>
          <div className="flex items-center justify-between">
            <div className="flex items-baseline gap-1.5 flex-wrap">
              <span className="text-base font-bold text-primary tabular-nums">
                {formatPrice(product.price, currency)}
              </span>
              {hasDiscount && (
                <span className="text-[11px] text-muted-foreground line-through tabular-nums">
                  {formatPrice(product.compare_at_price, currency)}
                </span>
              )}
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
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
      className="group cursor-pointer rounded-2xl overflow-hidden bg-card border border-border/40 hover:border-primary/30 hover:shadow-xl hover:shadow-primary/5 transition-all duration-300 active:scale-[0.98] flex flex-col focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
      onClick={() => onSelect?.(product)}
      onKeyDown={handleKeyDown}
    >
      <div className="relative aspect-square bg-muted overflow-hidden">
        {mainImage && !imageFailed ? (
          <img
            src={mainImage}
            alt={product.title}
            className={cn(
              'w-full h-full object-cover group-hover:scale-105 transition-transform duration-700 ease-out',
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
            <span className="px-3 py-1 rounded-lg bg-black/70 text-white text-xs font-bold tracking-wide">{marketplaceUz.card.sold}</span>
          </div>
        )}

        {/* Like button */}
        <motion.div className="absolute top-2 right-2" whileTap={{ scale: 0.85 }}>
          <Button
            variant="ghost"
            size="icon"
            className={cn(
              'h-8 w-8 rounded-full backdrop-blur-md shadow-md transition-all',
              isLiked
                ? 'bg-red-500/95 text-white hover:bg-red-500'
                : 'bg-background/90 hover:bg-background border border-border/30',
            )}
            onClick={handleLike}
            disabled={isLiking}
            aria-label={isLiked ? marketplaceUz.card.removeSaved : marketplaceUz.card.save}
            aria-pressed={isLiked}
          >
            <Heart className={cn('h-3.5 w-3.5', isLiked && 'fill-current')} />
          </Button>
        </motion.div>

        {/* Top-left badges */}
        <div className="absolute top-2 left-2 flex flex-col gap-1">
          {hasDiscount && (
            <span className="px-2 py-0.5 rounded-md bg-red-500 text-white text-[10px] font-extrabold shadow-lg">
              −{discountPercent}%
            </span>
          )}
          {product.is_featured && (
            <span className="px-2 py-0.5 rounded-md bg-gradient-to-r from-amber-500 to-orange-500 text-white text-[10px] font-bold shadow-lg">
              TOP
            </span>
          )}
          {isLowStock && (
            <span className="px-2 py-0.5 rounded-md bg-orange-500/95 text-white text-[10px] font-bold shadow-lg">
              {marketplaceUz.card.stockLeft(stock)}
            </span>
          )}
        </div>

        {/* Bottom badge */}
        {product.is_negotiable && !isSoldOut && (
          <div className="absolute bottom-2 left-2">
            <span className="px-2 py-0.5 rounded-md bg-background/90 backdrop-blur-md text-[10px] font-semibold text-primary border border-primary/20">
              Kelishiladi
            </span>
          </div>
        )}
      </div>

      <div className="p-2.5 flex-1 flex flex-col gap-1.5">
        <div className="flex items-baseline gap-1.5 flex-wrap">
          <span className="text-[15px] font-extrabold text-foreground tabular-nums">
            {formatPrice(product.price, currency)}
          </span>
          {hasDiscount && (
            <span className="text-[11px] text-muted-foreground line-through tabular-nums">
              {formatPrice(product.compare_at_price, currency)}
            </span>
          )}
        </div>

        <h3 className="text-[12.5px] line-clamp-2 leading-snug min-h-[2.1rem] text-foreground/90">
          {product.title}
        </h3>

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

        {product.seller ? (
          <div className="flex items-center gap-1 text-[11px] text-muted-foreground mt-auto pt-1 border-t border-border/30">
            <span className="truncate flex-1">{product.seller.business_name}</span>
            {product.seller.is_verified && <ShieldCheck className="h-3 w-3 text-primary shrink-0" />}
          </div>
        ) : (
          (product.location || null) && (
            <div className="flex items-center gap-1 text-[11px] text-muted-foreground mt-auto pt-1 border-t border-border/30">
              <MapPin className="h-3 w-3 shrink-0" />
              <span className="truncate">{product.location}</span>
            </div>
          )
        )}
      </div>
    </div>
  );
}

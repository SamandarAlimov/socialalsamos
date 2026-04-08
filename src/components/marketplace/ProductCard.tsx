import { useState } from 'react';
import { Heart, Star, MapPin, ShieldCheck, Eye } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { Product, useProductActions } from '@/hooks/useMarketplace';
import { useHapticFeedback } from '@/hooks/useHapticFeedback';
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

  const mainImage = product.images?.[0]?.url || 'https://placehold.co/400x400?text=No+Image';
  const hasDiscount = product.compare_at_price && product.compare_at_price > product.price;
  const discountPercent = hasDiscount
    ? Math.round((1 - product.price / product.compare_at_price!) * 100)
    : 0;

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

  if (layout === 'list') {
    return (
      <div
        className="flex gap-3 p-3 rounded-2xl bg-card/50 backdrop-blur-sm border border-border/30 cursor-pointer hover:bg-card/80 transition-all active:scale-[0.99]"
        onClick={() => onSelect?.(product)}
      >
        <div className="w-24 h-24 rounded-xl overflow-hidden bg-muted shrink-0">
          <img src={mainImage} alt={product.title} className="w-full h-full object-cover" loading="lazy" />
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
            <div className="flex items-baseline gap-1.5">
              <span className="text-base font-bold text-primary">${product.price.toLocaleString()}</span>
              {hasDiscount && (
                <span className="text-[11px] text-muted-foreground line-through">${product.compare_at_price?.toLocaleString()}</span>
              )}
            </div>
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={handleLike} disabled={isLiking}>
              <Heart className={cn("h-4 w-4", isLiked && "fill-red-500 text-red-500")} />
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className="group cursor-pointer rounded-2xl overflow-hidden bg-card/50 backdrop-blur-sm border border-border/30 hover:border-primary/20 hover:shadow-xl hover:shadow-primary/5 transition-all duration-300 active:scale-[0.98]"
      onClick={() => onSelect?.(product)}
    >
      <div className="relative aspect-square bg-muted overflow-hidden">
        <img
          src={mainImage}
          alt={product.title}
          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700 ease-out"
          loading="lazy"
        />
        
        {/* Gradient overlay */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/20 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
        
        {/* Like button */}
        <motion.div className="absolute top-2.5 right-2.5" whileTap={{ scale: 0.85 }}>
          <Button
            variant="ghost"
            size="icon"
            className={cn(
              "h-8 w-8 rounded-full backdrop-blur-md shadow-sm transition-all",
              isLiked 
                ? "bg-red-500/20 text-red-500 hover:bg-red-500/30 border border-red-500/20" 
                : "bg-background/70 hover:bg-background/90 border border-border/30"
            )}
            onClick={handleLike}
            disabled={isLiking}
          >
            <Heart className={cn("h-3.5 w-3.5", isLiked && "fill-current")} />
          </Button>
        </motion.div>

        {/* Top-left badges */}
        <div className="absolute top-2.5 left-2.5 flex flex-col gap-1">
          {hasDiscount && (
            <span className="px-2 py-0.5 rounded-lg bg-red-500 text-white text-[10px] font-bold shadow-lg">
              -{discountPercent}%
            </span>
          )}
          {product.is_featured && (
            <span className="px-2 py-0.5 rounded-lg bg-primary/90 text-primary-foreground text-[10px] font-bold shadow-lg backdrop-blur-sm">
              ⭐ Featured
            </span>
          )}
        </div>

        {/* Bottom badges */}
        {product.is_negotiable && (
          <div className="absolute bottom-2.5 left-2.5">
            <span className="px-2 py-0.5 rounded-lg bg-background/80 backdrop-blur-md text-[10px] font-medium text-primary border border-primary/20">
              Kelishiladi
            </span>
          </div>
        )}
      </div>

      <div className="p-3 space-y-1.5">
        <h3 className="font-medium text-[13px] line-clamp-2 leading-snug min-h-[2.25rem]">
          {product.title}
        </h3>

        <div className="flex items-baseline gap-2">
          <span className="text-base font-bold text-primary">
            ${product.price.toLocaleString()}
          </span>
          {hasDiscount && (
            <span className="text-[11px] text-muted-foreground line-through">
              ${product.compare_at_price?.toLocaleString()}
            </span>
          )}
        </div>

        {product.seller && (
          <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <span className="truncate">{product.seller.business_name}</span>
            {product.seller.is_verified && <ShieldCheck className="h-3 w-3 text-primary shrink-0" />}
            {product.seller.rating > 0 && (
              <div className="flex items-center gap-0.5 shrink-0 ml-auto">
                <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
                <span>{product.seller.rating.toFixed(1)}</span>
              </div>
            )}
          </div>
        )}

        {(product.location || product.seller?.location) && (
          <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
            <MapPin className="h-3 w-3 shrink-0" />
            <span className="truncate">{product.location || product.seller?.location}</span>
          </div>
        )}
      </div>
    </div>
  );
}

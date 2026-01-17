import { useState } from 'react';
import { Heart, Star, MapPin, ShieldCheck } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { Product, useProductActions } from '@/hooks/useMarketplace';
import { useHapticFeedback } from '@/hooks/useHapticFeedback';

interface ProductCardProps {
  product: Product;
  onSelect?: (product: Product) => void;
  onLikeChange?: () => void;
}

export function ProductCard({ product, onSelect, onLikeChange }: ProductCardProps) {
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

  return (
    <Card 
      className="overflow-hidden group cursor-pointer hover:shadow-lg transition-all duration-300 border-border/50"
      onClick={() => onSelect?.(product)}
    >
      <div className="relative aspect-square bg-muted">
        <img
          src={mainImage}
          alt={product.title}
          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
          loading="lazy"
        />
        
        {/* Like button */}
        <Button
          variant="ghost"
          size="icon"
          className={cn(
            "absolute top-2 right-2 h-8 w-8 rounded-full backdrop-blur-sm transition-all",
            isLiked 
              ? "bg-red-500/20 text-red-500 hover:bg-red-500/30" 
              : "bg-background/80 hover:bg-background"
          )}
          onClick={handleLike}
          disabled={isLiking}
        >
          <Heart className={cn("h-4 w-4", isLiked && "fill-current")} />
        </Button>

        {/* Badges */}
        <div className="absolute top-2 left-2 flex flex-col gap-1">
          {hasDiscount && (
            <Badge className="bg-red-500 text-white text-[10px] px-1.5">
              -{discountPercent}%
            </Badge>
          )}
          {product.is_featured && (
            <Badge variant="secondary" className="text-[10px] px-1.5">
              Featured
            </Badge>
          )}
          {product.condition !== 'new' && (
            <Badge variant="outline" className="bg-background/80 text-[10px] px-1.5">
              {product.condition === 'like_new' ? 'Like New' : product.condition}
            </Badge>
          )}
        </div>

        {/* Negotiable badge */}
        {product.is_negotiable && (
          <div className="absolute bottom-2 left-2">
            <Badge variant="outline" className="bg-primary/10 text-primary border-primary/20 text-[10px]">
              Negotiable
            </Badge>
          </div>
        )}
      </div>

      <div className="p-3 space-y-2">
        {/* Title */}
        <h3 className="font-medium text-sm line-clamp-2 leading-snug min-h-[2.5rem]">
          {product.title}
        </h3>

        {/* Price */}
        <div className="flex items-baseline gap-2">
          <span className="text-lg font-bold text-primary">
            ${product.price.toLocaleString()}
          </span>
          {hasDiscount && (
            <span className="text-xs text-muted-foreground line-through">
              ${product.compare_at_price?.toLocaleString()}
            </span>
          )}
        </div>

        {/* Seller info */}
        {product.seller && (
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span className="truncate">{product.seller.business_name}</span>
            {product.seller.is_verified && (
              <ShieldCheck className="h-3 w-3 text-primary flex-shrink-0" />
            )}
            {product.seller.rating > 0 && (
              <div className="flex items-center gap-0.5 flex-shrink-0">
                <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
                <span>{product.seller.rating.toFixed(1)}</span>
              </div>
            )}
          </div>
        )}

        {/* Location */}
        {(product.location || product.seller?.location) && (
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <MapPin className="h-3 w-3" />
            <span className="truncate">{product.location || product.seller?.location}</span>
          </div>
        )}
      </div>
    </Card>
  );
}

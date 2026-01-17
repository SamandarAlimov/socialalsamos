import { useState } from 'react';
import { 
  X, Heart, Share2, ShoppingCart, MessageCircle, 
  Star, MapPin, ShieldCheck, ChevronLeft, ChevronRight,
  Truck, Package, Clock, AlertCircle
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Separator } from '@/components/ui/separator';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Product, useProductActions, useCart } from '@/hooks/useMarketplace';
import { useHapticFeedback } from '@/hooks/useHapticFeedback';
import { formatDistanceToNow } from 'date-fns';
import { cn } from '@/lib/utils';

interface ProductDetailProps {
  product: Product | null;
  onClose: () => void;
}

export function ProductDetail({ product, onClose }: ProductDetailProps) {
  const { triggerHaptic } = useHapticFeedback();
  const { toggleLike } = useProductActions();
  const { addToCart } = useCart();
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [isLiked, setIsLiked] = useState(product?.is_liked || false);
  const [isAddingToCart, setIsAddingToCart] = useState(false);

  if (!product) return null;

  const images = product.images?.length > 0 
    ? product.images.map(i => i.url) 
    : ['https://placehold.co/600x600?text=No+Image'];

  const hasDiscount = product.compare_at_price && product.compare_at_price > product.price;
  const discountPercent = hasDiscount
    ? Math.round((1 - product.price / product.compare_at_price!) * 100)
    : 0;

  const handleLike = async () => {
    triggerHaptic('medium');
    const success = await toggleLike(product.id, isLiked);
    if (success) setIsLiked(!isLiked);
  };

  const handleAddToCart = async () => {
    setIsAddingToCart(true);
    triggerHaptic('medium');
    await addToCart(product.id);
    setIsAddingToCart(false);
  };

  const nextImage = () => {
    setCurrentImageIndex(prev => (prev + 1) % images.length);
  };

  const prevImage = () => {
    setCurrentImageIndex(prev => (prev - 1 + images.length) % images.length);
  };

  return (
    <Sheet open={!!product} onOpenChange={() => onClose()}>
      <SheetContent side="bottom" className="h-[95vh] p-0 rounded-t-3xl">
        <div className="flex flex-col h-full">
          {/* Image Carousel */}
          <div className="relative aspect-square bg-muted flex-shrink-0">
            <img
              src={images[currentImageIndex]}
              alt={product.title}
              className="w-full h-full object-cover"
            />
            
            {/* Close button */}
            <Button
              variant="ghost"
              size="icon"
              className="absolute top-4 left-4 bg-background/80 backdrop-blur-sm rounded-full"
              onClick={onClose}
            >
              <X className="h-5 w-5" />
            </Button>

            {/* Action buttons */}
            <div className="absolute top-4 right-4 flex gap-2">
              <Button
                variant="ghost"
                size="icon"
                className={cn(
                  "bg-background/80 backdrop-blur-sm rounded-full",
                  isLiked && "text-red-500"
                )}
                onClick={handleLike}
              >
                <Heart className={cn("h-5 w-5", isLiked && "fill-current")} />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="bg-background/80 backdrop-blur-sm rounded-full"
              >
                <Share2 className="h-5 w-5" />
              </Button>
            </div>

            {/* Navigation arrows */}
            {images.length > 1 && (
              <>
                <Button
                  variant="ghost"
                  size="icon"
                  className="absolute left-2 top-1/2 -translate-y-1/2 bg-background/80 rounded-full"
                  onClick={prevImage}
                >
                  <ChevronLeft className="h-5 w-5" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="absolute right-2 top-1/2 -translate-y-1/2 bg-background/80 rounded-full"
                  onClick={nextImage}
                >
                  <ChevronRight className="h-5 w-5" />
                </Button>

                {/* Dots indicator */}
                <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-1.5">
                  {images.map((_, i) => (
                    <button
                      key={i}
                      className={cn(
                        "w-2 h-2 rounded-full transition-all",
                        i === currentImageIndex
                          ? "bg-white w-6"
                          : "bg-white/50"
                      )}
                      onClick={() => setCurrentImageIndex(i)}
                    />
                  ))}
                </div>
              </>
            )}
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto pb-24">
            <div className="p-4 space-y-4">
              {/* Price & Title */}
              <div className="space-y-2">
                <div className="flex items-baseline gap-3">
                  <span className="text-3xl font-bold text-primary">
                    ${product.price.toLocaleString()}
                  </span>
                  {hasDiscount && (
                    <>
                      <span className="text-lg text-muted-foreground line-through">
                        ${product.compare_at_price?.toLocaleString()}
                      </span>
                      <Badge className="bg-red-500 text-white">
                        -{discountPercent}%
                      </Badge>
                    </>
                  )}
                </div>
                <h1 className="text-xl font-semibold">{product.title}</h1>
              </div>

              {/* Badges */}
              <div className="flex flex-wrap gap-2">
                {product.condition !== 'new' && (
                  <Badge variant="outline">
                    {product.condition === 'like_new' ? 'Like New' : product.condition}
                  </Badge>
                )}
                {product.is_negotiable && (
                  <Badge variant="outline" className="border-primary text-primary">
                    Price Negotiable
                  </Badge>
                )}
                {product.quantity > 1 && (
                  <Badge variant="secondary">
                    {product.quantity} available
                  </Badge>
                )}
              </div>

              {/* Shipping info */}
              <div className="flex items-center gap-4 text-sm">
                {product.shipping_available ? (
                  <div className="flex items-center gap-2 text-green-600">
                    <Truck className="h-4 w-4" />
                    <span>
                      {product.shipping_price > 0 
                        ? `Shipping: $${product.shipping_price}` 
                        : 'Free Shipping'}
                    </span>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Package className="h-4 w-4" />
                    <span>Local pickup only</span>
                  </div>
                )}
                {product.location && (
                  <div className="flex items-center gap-1 text-muted-foreground">
                    <MapPin className="h-4 w-4" />
                    <span>{product.location}</span>
                  </div>
                )}
              </div>

              <Separator />

              {/* Seller info */}
              {product.seller && (
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Avatar className="h-12 w-12">
                      <AvatarImage src={product.seller.logo_url || product.seller.profile?.avatar_url || ''} />
                      <AvatarFallback>
                        {product.seller.business_name[0].toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <div className="flex items-center gap-1.5">
                        <span className="font-semibold">{product.seller.business_name}</span>
                        {product.seller.is_verified && (
                          <ShieldCheck className="h-4 w-4 text-primary" />
                        )}
                      </div>
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        {product.seller.rating > 0 && (
                          <div className="flex items-center gap-1">
                            <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
                            <span>{product.seller.rating.toFixed(1)}</span>
                          </div>
                        )}
                        {product.seller.total_sales > 0 && (
                          <span>{product.seller.total_sales} sales</span>
                        )}
                      </div>
                    </div>
                  </div>
                  <Button variant="outline" size="sm">
                    <MessageCircle className="h-4 w-4 mr-2" />
                    Message
                  </Button>
                </div>
              )}

              <Separator />

              {/* Description */}
              {product.description && (
                <div className="space-y-2">
                  <h3 className="font-semibold">Description</h3>
                  <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                    {product.description}
                  </p>
                </div>
              )}

              {/* Posted time */}
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Clock className="h-3.5 w-3.5" />
                <span>Posted {formatDistanceToNow(new Date(product.created_at))} ago</span>
                <span>•</span>
                <span>{product.views_count} views</span>
              </div>
            </div>
          </div>

          {/* Bottom bar */}
          <div className="absolute bottom-0 left-0 right-0 p-4 bg-background/95 backdrop-blur border-t flex gap-3">
            <Button
              variant="outline"
              className="flex-1"
              onClick={handleLike}
            >
              <Heart className={cn("h-4 w-4 mr-2", isLiked && "fill-red-500 text-red-500")} />
              {isLiked ? 'Saved' : 'Save'}
            </Button>
            <Button 
              className="flex-[2]"
              onClick={handleAddToCart}
              disabled={isAddingToCart || product.status !== 'active'}
            >
              <ShoppingCart className="h-4 w-4 mr-2" />
              {product.status === 'sold' ? 'Sold Out' : 'Add to Cart'}
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

import { useState } from 'react';
import { 
  X, Heart, Share2, ShoppingCart, MessageCircle, 
  Star, MapPin, ShieldCheck, ChevronLeft, ChevronRight,
  Truck, Package, Clock, Copy, Check
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import { Product, useProductActions, useCart } from '@/hooks/useMarketplace';
import { useHapticFeedback } from '@/hooks/useHapticFeedback';
import { formatDistanceToNow } from 'date-fns';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';

interface ProductDetailProps {
  product: Product | null;
  onClose: () => void;
  onSellerClick?: (sellerId: string) => void;
}

export function ProductDetail({ product, onClose, onSellerClick }: ProductDetailProps) {
  const { triggerHaptic } = useHapticFeedback();
  const { toggleLike } = useProductActions();
  const { addToCart } = useCart();
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [isLiked, setIsLiked] = useState(product?.is_liked || false);
  const [isAddingToCart, setIsAddingToCart] = useState(false);
  const [addedToCart, setAddedToCart] = useState(false);

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
    setAddedToCart(true);
    setTimeout(() => setAddedToCart(false), 2000);
  };

  return (
    <Sheet open={!!product} onOpenChange={() => onClose()}>
      <SheetContent side="bottom" className="h-[95vh] p-0 rounded-t-3xl border-t border-border/30">
        <div className="flex flex-col h-full">
          {/* Image Gallery */}
          <div className="relative aspect-square bg-muted shrink-0 overflow-hidden">
            <AnimatePresence mode="wait">
              <motion.img
                key={currentImageIndex}
                src={images[currentImageIndex]}
                alt={product.title}
                className="w-full h-full object-cover"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
              />
            </AnimatePresence>
            
            {/* Top bar */}
            <div className="absolute top-0 left-0 right-0 p-4 flex items-center justify-between">
              <Button
                variant="ghost"
                size="icon"
                className="h-10 w-10 rounded-full bg-background/70 backdrop-blur-xl border border-border/30 shadow-lg"
                onClick={onClose}
              >
                <X className="h-5 w-5" />
              </Button>
              <div className="flex gap-2">
                <motion.div whileTap={{ scale: 0.85 }}>
                  <Button
                    variant="ghost"
                    size="icon"
                    className={cn(
                      "h-10 w-10 rounded-full backdrop-blur-xl border shadow-lg",
                      isLiked 
                        ? "bg-red-500/20 text-red-500 border-red-500/20" 
                        : "bg-background/70 border-border/30"
                    )}
                    onClick={handleLike}
                  >
                    <Heart className={cn("h-5 w-5", isLiked && "fill-current")} />
                  </Button>
                </motion.div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-10 w-10 rounded-full bg-background/70 backdrop-blur-xl border border-border/30 shadow-lg"
                >
                  <Share2 className="h-5 w-5" />
                </Button>
              </div>
            </div>

            {/* Navigation */}
            {images.length > 1 && (
              <>
                <Button
                  variant="ghost"
                  size="icon"
                  className="absolute left-3 top-1/2 -translate-y-1/2 h-9 w-9 rounded-full bg-background/70 backdrop-blur-xl border border-border/30"
                  onClick={() => setCurrentImageIndex(prev => (prev - 1 + images.length) % images.length)}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="absolute right-3 top-1/2 -translate-y-1/2 h-9 w-9 rounded-full bg-background/70 backdrop-blur-xl border border-border/30"
                  onClick={() => setCurrentImageIndex(prev => (prev + 1) % images.length)}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
                <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-1.5 px-3 py-1.5 rounded-full bg-background/60 backdrop-blur-xl">
                  {images.map((_, i) => (
                    <button
                      key={i}
                      className={cn(
                        "rounded-full transition-all duration-300",
                        i === currentImageIndex ? "w-5 h-1.5 bg-primary" : "w-1.5 h-1.5 bg-foreground/30"
                      )}
                      onClick={() => setCurrentImageIndex(i)}
                    />
                  ))}
                </div>
              </>
            )}
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto pb-28">
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
                      <span className="px-2 py-0.5 rounded-lg bg-red-500/10 text-red-500 text-sm font-bold">
                        -{discountPercent}%
                      </span>
                    </>
                  )}
                </div>
                <h1 className="text-xl font-semibold leading-tight">{product.title}</h1>
              </div>

              {/* Info Badges */}
              <div className="flex flex-wrap gap-2">
                {product.condition !== 'new' && (
                  <span className="px-3 py-1.5 rounded-xl bg-muted/60 text-xs font-medium border border-border/30">
                    {product.condition === 'like_new' ? 'Yangiday' : product.condition}
                  </span>
                )}
                {product.is_negotiable && (
                  <span className="px-3 py-1.5 rounded-xl bg-primary/10 text-primary text-xs font-medium border border-primary/20">
                    Narx kelishiladi
                  </span>
                )}
                {product.quantity > 1 && (
                  <span className="px-3 py-1.5 rounded-xl bg-muted/60 text-xs font-medium border border-border/30">
                    {product.quantity} dona mavjud
                  </span>
                )}
              </div>

              {/* Shipping */}
              <div className="flex items-center gap-4 p-3 rounded-xl bg-muted/30 border border-border/20">
                {product.shipping_available ? (
                  <div className="flex items-center gap-2 text-sm">
                    <Truck className="h-4 w-4 text-green-500" />
                    <span className="font-medium">
                      {product.shipping_price > 0 ? `Yetkazish: $${product.shipping_price}` : 'Bepul yetkazib berish'}
                    </span>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Package className="h-4 w-4" />
                    <span>Faqat olib ketish</span>
                  </div>
                )}
                {product.location && (
                  <div className="flex items-center gap-1.5 text-sm text-muted-foreground ml-auto">
                    <MapPin className="h-3.5 w-3.5" />
                    <span>{product.location}</span>
                  </div>
                )}
              </div>

              {/* Divider */}
              <div className="h-px bg-border/30" />

              {/* Seller */}
              {product.seller && (
                <div 
                  className="flex items-center justify-between p-3 rounded-xl bg-muted/20 border border-border/20 cursor-pointer hover:bg-muted/30 transition-colors"
                  onClick={() => onSellerClick?.(product.seller!.id)}
                >
                  <div className="flex items-center gap-3">
                    <Avatar className="h-11 w-11 ring-2 ring-border/30">
                      <AvatarImage src={product.seller.logo_url || product.seller.profile?.avatar_url || ''} />
                      <AvatarFallback className="bg-primary/10 text-primary font-bold">
                        {product.seller.business_name[0].toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <div className="flex items-center gap-1.5">
                        <span className="font-semibold text-sm">{product.seller.business_name}</span>
                        {product.seller.is_verified && <ShieldCheck className="h-4 w-4 text-primary" />}
                      </div>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        {product.seller.rating > 0 && (
                          <div className="flex items-center gap-0.5">
                            <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
                            <span>{product.seller.rating.toFixed(1)}</span>
                          </div>
                        )}
                        {product.seller.total_sales > 0 && (
                          <span>{product.seller.total_sales} ta sotuv</span>
                        )}
                      </div>
                    </div>
                  </div>
                  <Button variant="outline" size="sm" className="rounded-xl h-9">
                    <MessageCircle className="h-3.5 w-3.5 mr-1.5" />
                    Xabar
                  </Button>
                </div>
              )}

              <div className="h-px bg-border/30" />

              {/* Description */}
              {product.description && (
                <div className="space-y-2">
                  <h3 className="font-semibold text-sm">Tavsif</h3>
                  <p className="text-sm text-muted-foreground whitespace-pre-wrap leading-relaxed">
                    {product.description}
                  </p>
                </div>
              )}

              {/* Meta */}
              <div className="flex items-center gap-3 text-xs text-muted-foreground">
                <div className="flex items-center gap-1.5">
                  <Clock className="h-3.5 w-3.5" />
                  <span>{formatDistanceToNow(new Date(product.created_at))} oldin</span>
                </div>
                <span>•</span>
                <span>{product.views_count} ko'rish</span>
                <span>•</span>
                <span>{product.likes_count} yoqtirish</span>
              </div>
            </div>
          </div>

          {/* Premium Action Bar */}
          <div className="absolute bottom-0 left-0 right-0 p-4 bg-background/90 backdrop-blur-xl border-t border-border/30">
            <div className="flex gap-3">
              <Button
                variant="outline"
                className="rounded-xl h-12 px-5 border-border/50"
                onClick={handleLike}
              >
                <Heart className={cn("h-4 w-4", isLiked && "fill-red-500 text-red-500")} />
              </Button>
              <Button 
                className={cn(
                  "flex-1 rounded-xl h-12 text-sm font-semibold shadow-lg transition-all",
                  addedToCart 
                    ? "bg-green-500 hover:bg-green-600 shadow-green-500/20" 
                    : "shadow-primary/20"
                )}
                onClick={handleAddToCart}
                disabled={isAddingToCart || product.status !== 'active'}
              >
                {product.status === 'sold' ? (
                  'Sotilgan'
                ) : addedToCart ? (
                  <><Check className="h-4 w-4 mr-2" /> Savatga qo'shildi</>
                ) : (
                  <><ShoppingCart className="h-4 w-4 mr-2" /> Savatga qo'shish</>
                )}
              </Button>
            </div>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

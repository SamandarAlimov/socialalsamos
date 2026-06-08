import { useState, useRef, useEffect } from 'react';
import {
  X, Heart, Share2, ShoppingCart, MessageCircle, Zap,
  Star, MapPin, ShieldCheck, ChevronLeft, ChevronRight,
  Truck, Package, Clock, Check, Minus, Plus, RotateCcw, Lock,
  Award, ChevronDown, Eye, Store, BadgeCheck
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import { Product, useProductActions, useCart } from '@/hooks/useMarketplace';
import { useHapticFeedback } from '@/hooks/useHapticFeedback';
import { useToast } from '@/hooks/use-toast';
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
  const { toast } = useToast();

  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [isLiked, setIsLiked] = useState(product?.is_liked || false);
  const [isAddingToCart, setIsAddingToCart] = useState(false);
  const [addedToCart, setAddedToCart] = useState(false);
  const [quantity, setQuantity] = useState(1);
  const [descExpanded, setDescExpanded] = useState(false);
  const [isZoomed, setIsZoomed] = useState(false);
  const [naturalRatio, setNaturalRatio] = useState(1);

  const touchStartX = useRef<number | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Reset state on product change
  useEffect(() => {
    if (product) {
      setCurrentImageIndex(0);
      setIsLiked(product.is_liked || false);
      setQuantity(1);
      setDescExpanded(false);
      setIsZoomed(false);
      scrollRef.current?.scrollTo({ top: 0 });
    }
  }, [product?.id]);

  if (!product) return null;

  const images = product.images?.length > 0
    ? product.images.map(i => i.url)
    : ['https://placehold.co/800x800?text=No+Image'];

  const hasDiscount = product.compare_at_price && product.compare_at_price > product.price;
  const discountPercent = hasDiscount
    ? Math.round((1 - product.price / product.compare_at_price!) * 100)
    : 0;
  const savings = hasDiscount ? product.compare_at_price! - product.price : 0;

  const stock = product.quantity ?? 0;
  const lowStock = stock > 0 && stock <= 5;
  const isSold = product.status === 'sold' || stock === 0;

  const conditionLabel: Record<string, string> = {
    new: 'Yangi',
    like_new: 'Yangiday',
    good: 'Yaxshi',
    fair: "O'rtacha",
    used: 'Ishlatilgan',
  };

  const goPrev = () => {
    triggerHaptic('light');
    setCurrentImageIndex(prev => (prev - 1 + images.length) % images.length);
  };
  const goNext = () => {
    triggerHaptic('light');
    setCurrentImageIndex(prev => (prev + 1) % images.length);
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
  };
  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX.current == null) return;
    const dx = e.changedTouches[0].clientX - touchStartX.current;
    if (Math.abs(dx) > 50) (dx > 0 ? goPrev : goNext)();
    touchStartX.current = null;
  };

  const handleLike = async () => {
    triggerHaptic('medium');
    const success = await toggleLike(product.id, isLiked);
    if (success) setIsLiked(!isLiked);
  };

  const handleAddToCart = async () => {
    setIsAddingToCart(true);
    triggerHaptic('medium');
    await addToCart(product.id, quantity);
    setIsAddingToCart(false);
    setAddedToCart(true);
    setTimeout(() => setAddedToCart(false), 2000);
  };

  const handleBuyNow = async () => {
    triggerHaptic('heavy');
    await addToCart(product.id, quantity);
    toast({ title: 'Buyurtma boshlandi', description: "Savat sahifasiga o'ting" });
  };

  const handleShare = async () => {
    triggerHaptic('light');
    const shareData = {
      title: product.title,
      text: `${product.title} — $${product.price.toLocaleString()}`,
      url: typeof window !== 'undefined' ? window.location.href : '',
    };
    try {
      if (navigator.share) await navigator.share(shareData);
      else {
        await navigator.clipboard.writeText(shareData.url);
        toast({ title: 'Havola nusxalandi' });
      }
    } catch { /* user cancelled */ }
  };

  const trustBadges = [
    { icon: Truck, label: product.shipping_available
        ? (product.shipping_price > 0 ? `Yetkazish $${product.shipping_price}` : 'Bepul yetkazish')
        : 'Olib ketish', accent: 'text-emerald-500' },
    { icon: RotateCcw, label: '14 kun qaytarish', accent: 'text-blue-500' },
    { icon: Lock, label: 'Xavfsiz to\'lov', accent: 'text-violet-500' },
    { icon: BadgeCheck, label: 'Asl mahsulot', accent: 'text-amber-500' },
  ];

  return (
    <Sheet open={!!product} onOpenChange={() => onClose()}>
      <SheetContent
        side="bottom"
        className="h-[98vh] p-0 rounded-t-3xl border-t border-border/30 overflow-hidden"
      >
        <div className="flex flex-col h-full bg-background">
          {/* Floating top controls (always visible above gallery) */}
          <div className="absolute top-0 left-0 right-0 z-30 p-3 flex items-center justify-between pointer-events-none">
            <Button
              variant="ghost" size="icon"
              className="pointer-events-auto h-10 w-10 rounded-full bg-background/80 backdrop-blur-xl border border-border/30 shadow-lg"
              onClick={onClose}
            >
              <X className="h-5 w-5" />
            </Button>
            <div className="flex gap-2 pointer-events-auto">
              <motion.div whileTap={{ scale: 0.85 }}>
                <Button
                  variant="ghost" size="icon"
                  className={cn(
                    "h-10 w-10 rounded-full backdrop-blur-xl border shadow-lg",
                    isLiked
                      ? "bg-red-500/20 text-red-500 border-red-500/30"
                      : "bg-background/80 border-border/30"
                  )}
                  onClick={handleLike}
                >
                  <Heart className={cn("h-5 w-5", isLiked && "fill-current")} />
                </Button>
              </motion.div>
              <Button
                variant="ghost" size="icon"
                className="h-10 w-10 rounded-full bg-background/80 backdrop-blur-xl border border-border/30 shadow-lg"
                onClick={handleShare}
              >
                <Share2 className="h-5 w-5" />
              </Button>
            </div>
          </div>

          {/* Scrollable content */}
          <div ref={scrollRef} className="flex-1 overflow-y-auto pb-32">
            {/* Gallery */}
            <div
              className="relative bg-black overflow-hidden select-none"
              style={{ aspectRatio: '1 / 1' }}
              onTouchStart={handleTouchStart}
              onTouchEnd={handleTouchEnd}
              onDoubleClick={() => setIsZoomed(z => !z)}
            >
              <AnimatePresence mode="wait">
                <motion.img
                  key={currentImageIndex}
                  src={images[currentImageIndex]}
                  alt={product.title}
                  draggable={false}
                  className={cn(
                    "absolute inset-0 w-full h-full object-contain transition-transform duration-300",
                    isZoomed && "scale-150 cursor-zoom-out",
                  )}
                  onLoad={(e) => {
                    const t = e.currentTarget;
                    if (t.naturalWidth && t.naturalHeight) setNaturalRatio(t.naturalWidth / t.naturalHeight);
                  }}
                  initial={{ opacity: 0, scale: 1.02 }}
                  animate={{ opacity: 1, scale: isZoomed ? 1.5 : 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.25 }}
                />
              </AnimatePresence>

              {/* Top corner badges */}
              <div className="absolute top-16 left-3 z-10 flex flex-col gap-1.5">
                {hasDiscount && (
                  <span className="px-2.5 py-1 rounded-lg bg-red-500 text-white text-xs font-extrabold shadow-lg">
                    −{discountPercent}%
                  </span>
                )}
                {product.is_featured && (
                  <span className="px-2.5 py-1 rounded-lg bg-gradient-to-r from-amber-500 to-orange-500 text-white text-[11px] font-bold shadow-lg flex items-center gap-1">
                    <Award className="h-3 w-3" /> Tanlangan
                  </span>
                )}
              </div>
              <div className="absolute top-16 right-3 z-10">
                <span className="flex items-center gap-1 px-2 py-1 rounded-lg bg-black/50 backdrop-blur text-white text-[11px] font-medium">
                  <Eye className="h-3 w-3" /> {product.views_count}
                </span>
              </div>

              {/* Navigation arrows (desktop) */}
              {images.length > 1 && (
                <>
                  <Button
                    variant="ghost" size="icon"
                    className="hidden md:flex absolute left-3 top-1/2 -translate-y-1/2 h-10 w-10 rounded-full bg-background/80 backdrop-blur-xl border border-border/30 z-10"
                    onClick={goPrev}
                  >
                    <ChevronLeft className="h-5 w-5" />
                  </Button>
                  <Button
                    variant="ghost" size="icon"
                    className="hidden md:flex absolute right-3 top-1/2 -translate-y-1/2 h-10 w-10 rounded-full bg-background/80 backdrop-blur-xl border border-border/30 z-10"
                    onClick={goNext}
                  >
                    <ChevronRight className="h-5 w-5" />
                  </Button>
                </>
              )}

              {/* Image counter */}
              {images.length > 1 && (
                <div className="absolute bottom-3 right-3 px-2.5 py-1 rounded-full bg-black/60 backdrop-blur text-white text-[11px] font-semibold z-10">
                  {currentImageIndex + 1} / {images.length}
                </div>
              )}
            </div>

            {/* Thumbnail strip */}
            {images.length > 1 && (
              <div className="px-4 py-3 border-b border-border/20">
                <div className="flex gap-2 overflow-x-auto scrollbar-hide -mx-1 px-1">
                  {images.map((url, i) => (
                    <button
                      key={i}
                      onClick={() => { setCurrentImageIndex(i); triggerHaptic('light'); }}
                      className={cn(
                        "shrink-0 w-16 h-16 rounded-xl overflow-hidden border-2 transition-all",
                        i === currentImageIndex
                          ? "border-primary ring-2 ring-primary/20 scale-[1.02]"
                          : "border-border/30 opacity-70 hover:opacity-100"
                      )}
                    >
                      <img src={url} alt="" className="w-full h-full object-cover" />
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="p-4 space-y-5">
              {/* Title + meta row */}
              <div className="space-y-2.5">
                <h1 className="text-[19px] font-semibold leading-snug">{product.title}</h1>

                <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
                  {product.seller?.rating > 0 && (
                    <div className="flex items-center gap-1">
                      <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
                      <span className="font-semibold text-foreground">{product.seller.rating.toFixed(1)}</span>
                      <span>({product.seller.total_sales} sotuv)</span>
                    </div>
                  )}
                  <span className="text-border">•</span>
                  <span>{product.likes_count} yoqtirish</span>
                  <span className="text-border">•</span>
                  <span>{product.views_count} ko'rish</span>
                </div>
              </div>

              {/* Price block */}
              <div className="rounded-2xl p-4 bg-gradient-to-br from-primary/5 via-primary/3 to-transparent border border-primary/10">
                <div className="flex items-baseline gap-3 flex-wrap">
                  <span className="text-3xl font-extrabold tracking-tight text-primary">
                    ${product.price.toLocaleString()}
                  </span>
                  {hasDiscount && (
                    <>
                      <span className="text-base text-muted-foreground line-through">
                        ${product.compare_at_price?.toLocaleString()}
                      </span>
                      <span className="px-2 py-0.5 rounded-md bg-red-500/10 text-red-500 text-xs font-bold">
                        −{discountPercent}%
                      </span>
                    </>
                  )}
                </div>
                {hasDiscount && (
                  <p className="text-xs text-emerald-600 dark:text-emerald-400 font-medium mt-1.5">
                    ${savings.toLocaleString()} tejaysiz
                  </p>
                )}
                <div className="flex items-center gap-2 mt-3 text-xs flex-wrap">
                  {!isSold && (
                    <span className={cn(
                      "flex items-center gap-1 px-2 py-1 rounded-md font-medium",
                      lowStock
                        ? "bg-orange-500/10 text-orange-600 dark:text-orange-400"
                        : "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                    )}>
                      <span className={cn("h-1.5 w-1.5 rounded-full", lowStock ? "bg-orange-500" : "bg-emerald-500")} />
                      {lowStock ? `Faqat ${stock} ta qoldi` : 'Sotuvda mavjud'}
                    </span>
                  )}
                  {isSold && (
                    <span className="flex items-center gap-1 px-2 py-1 rounded-md bg-muted text-muted-foreground font-medium">
                      Sotilgan
                    </span>
                  )}
                  {product.is_negotiable && (
                    <span className="px-2 py-1 rounded-md bg-primary/10 text-primary font-medium">
                      Narx kelishiladi
                    </span>
                  )}
                  {product.condition && product.condition !== 'new' && (
                    <span className="px-2 py-1 rounded-md bg-muted text-foreground/80 font-medium">
                      {conditionLabel[product.condition] || product.condition}
                    </span>
                  )}
                </div>
              </div>

              {/* Quantity selector */}
              {!isSold && (
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">Soni</span>
                  <div className="flex items-center gap-2 rounded-xl border border-border/40 bg-muted/30 p-1">
                    <Button
                      variant="ghost" size="icon"
                      className="h-8 w-8 rounded-lg"
                      onClick={() => { setQuantity(q => Math.max(1, q - 1)); triggerHaptic('light'); }}
                      disabled={quantity <= 1}
                    >
                      <Minus className="h-3.5 w-3.5" />
                    </Button>
                    <span className="w-8 text-center text-sm font-bold tabular-nums">{quantity}</span>
                    <Button
                      variant="ghost" size="icon"
                      className="h-8 w-8 rounded-lg"
                      onClick={() => { setQuantity(q => Math.min(stock || 99, q + 1)); triggerHaptic('light'); }}
                      disabled={quantity >= (stock || 99)}
                    >
                      <Plus className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              )}

              {/* Trust badges grid */}
              <div className="grid grid-cols-2 gap-2">
                {trustBadges.map((b, i) => {
                  const Icon = b.icon;
                  return (
                    <div key={i} className="flex items-center gap-2 p-2.5 rounded-xl bg-muted/30 border border-border/20">
                      <div className={cn("h-8 w-8 rounded-lg bg-background flex items-center justify-center shrink-0", b.accent)}>
                        <Icon className="h-4 w-4" />
                      </div>
                      <span className="text-[11px] font-medium leading-tight">{b.label}</span>
                    </div>
                  );
                })}
              </div>

              {/* Location */}
              {product.location && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <MapPin className="h-4 w-4 shrink-0" />
                  <span>{product.location}</span>
                </div>
              )}

              {/* Seller card */}
              {product.seller && (
                <button
                  onClick={() => onSellerClick?.(product.seller!.id)}
                  className="w-full text-left p-3.5 rounded-2xl bg-gradient-to-br from-muted/40 to-muted/10 border border-border/30 hover:border-primary/30 transition-all active:scale-[0.99]"
                >
                  <div className="flex items-center gap-3">
                    <Avatar className="h-12 w-12 ring-2 ring-background shadow">
                      <AvatarImage src={product.seller.logo_url || product.seller.profile?.avatar_url || ''} />
                      <AvatarFallback className="bg-primary/10 text-primary font-bold">
                        {product.seller.business_name[0].toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="font-semibold text-sm truncate">{product.seller.business_name}</span>
                        {product.seller.is_verified && <ShieldCheck className="h-4 w-4 text-primary shrink-0" />}
                      </div>
                      <div className="flex items-center gap-2 text-[11px] text-muted-foreground mt-0.5">
                        <Store className="h-3 w-3" />
                        <span className="capitalize">{product.seller.business_type}</span>
                        {product.seller.rating > 0 && (
                          <>
                            <span>•</span>
                            <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
                            <span>{product.seller.rating.toFixed(1)}</span>
                          </>
                        )}
                      </div>
                    </div>
                    <div className="flex gap-1.5">
                      <Button
                        variant="outline" size="sm"
                        className="rounded-xl h-9 px-3"
                        onClick={(e) => { e.stopPropagation(); }}
                      >
                        <MessageCircle className="h-3.5 w-3.5" />
                      </Button>
                      <Button size="sm" className="rounded-xl h-9 px-3 shadow-sm">
                        Do'kon
                      </Button>
                    </div>
                  </div>
                </button>
              )}

              {/* Description */}
              {product.description && (
                <div className="space-y-2">
                  <h3 className="font-semibold text-sm">Tavsif</h3>
                  <div className={cn(
                    "relative text-sm text-muted-foreground leading-relaxed whitespace-pre-wrap",
                    !descExpanded && "max-h-32 overflow-hidden"
                  )}>
                    {product.description}
                    {!descExpanded && product.description.length > 220 && (
                      <div className="absolute inset-x-0 bottom-0 h-12 bg-gradient-to-t from-background to-transparent" />
                    )}
                  </div>
                  {product.description.length > 220 && (
                    <button
                      onClick={() => setDescExpanded(v => !v)}
                      className="flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
                    >
                      {descExpanded ? "Yopish" : "To'liq o'qish"}
                      <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", descExpanded && "rotate-180")} />
                    </button>
                  )}
                </div>
              )}

              {/* Specifications */}
              <div className="space-y-2">
                <h3 className="font-semibold text-sm">Xususiyatlar</h3>
                <div className="rounded-xl border border-border/30 overflow-hidden">
                  {[
                    { label: 'Holati', value: conditionLabel[product.condition] || product.condition || '—' },
                    { label: 'Mavjud', value: `${stock} dona` },
                    { label: 'Kategoriya', value: product.category?.name || '—' },
                    { label: 'Yetkazish', value: product.shipping_available ? 'Bor' : "Yo'q" },
                    { label: 'Joylangan', value: formatDistanceToNow(new Date(product.created_at)) + ' oldin' },
                  ].map((row, i, arr) => (
                    <div
                      key={i}
                      className={cn(
                        "flex items-center justify-between px-3 py-2.5 text-sm",
                        i % 2 === 0 ? "bg-muted/20" : "bg-transparent",
                        i < arr.length - 1 && "border-b border-border/20",
                      )}
                    >
                      <span className="text-muted-foreground">{row.label}</span>
                      <span className="font-medium text-right">{row.value}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Meta footer */}
              <div className="flex items-center gap-2 text-[11px] text-muted-foreground pt-2">
                <Clock className="h-3 w-3" />
                <span>ID: {product.id.slice(0, 8)}</span>
                <span>•</span>
                <span>{formatDistanceToNow(new Date(product.created_at))} oldin joylangan</span>
              </div>
            </div>
          </div>

          {/* Sticky bottom action bar */}
          <div className="absolute bottom-0 left-0 right-0 px-4 pt-3 pb-[max(env(safe-area-inset-bottom),0.75rem)] bg-background/95 backdrop-blur-xl border-t border-border/30">
            <div className="flex gap-2 items-stretch">
              <Button
                variant="outline"
                className="rounded-2xl h-12 w-12 p-0 border-border/50 shrink-0"
                onClick={handleLike}
              >
                <Heart className={cn("h-5 w-5", isLiked && "fill-red-500 text-red-500")} />
              </Button>
              <Button
                variant="outline"
                className={cn(
                  "flex-1 rounded-2xl h-12 text-sm font-semibold border-primary/30 text-primary hover:bg-primary/5",
                  addedToCart && "border-emerald-500/40 text-emerald-600 bg-emerald-500/5"
                )}
                onClick={handleAddToCart}
                disabled={isAddingToCart || isSold}
              >
                {addedToCart ? (
                  <><Check className="h-4 w-4 mr-1.5" /> Qo'shildi</>
                ) : (
                  <><ShoppingCart className="h-4 w-4 mr-1.5" /> Savatga</>
                )}
              </Button>
              <Button
                className={cn(
                  "flex-1 rounded-2xl h-12 text-sm font-bold shadow-lg shadow-primary/30",
                  "bg-gradient-to-r from-primary to-primary/90 hover:to-primary"
                )}
                onClick={handleBuyNow}
                disabled={isSold}
              >
                {isSold ? 'Sotilgan' : (<><Zap className="h-4 w-4 mr-1.5" /> Sotib olish</>)}
              </Button>
            </div>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft, Award, BadgeCheck, CalendarClock, Check, ChevronLeft, ChevronRight,
  Clock, Copy, Eye, Heart, Loader2, Lock, MapPin, MessageCircle, Minus,
  PackageX, Plus, RotateCcw, Share2, ShieldCheck, ShoppingCart, Star, Store,
  Tag, Truck, X, Zap,
} from 'lucide-react';
import { addDays, format, formatDistanceToNow } from 'date-fns';
import { uz } from 'date-fns/locale';
import { AnimatePresence, motion } from 'framer-motion';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import { CategoryIcon } from '@/components/marketplace/CategoryIcon';
import { ProductCard } from '@/components/marketplace/ProductCard';
import { Product, useCart, useProductActions, useProducts } from '@/hooks/useMarketplace';
import { useProductReviews } from '@/hooks/useProductReviews';
import { useHapticFeedback } from '@/hooks/useHapticFeedback';
import { useToast } from '@/hooks/use-toast';
import { conditionLabel, formatPrice, getDiscount, getStockState } from '@/lib/marketplace';
import { cn } from '@/lib/utils';

interface ProductDetailProps {
  product: Product | null;
  onClose: () => void;
  onSellerClick?: (sellerId: string) => void;
  onBuyNow?: (product: Product) => void | Promise<void>;
  onCartChange?: () => void;
  onMessageSeller?: (sellerId: string) => void;
  onProductSelect?: (product: Product) => void;
}

export function ProductDetail({
  product: productProp,
  onClose,
  onSellerClick,
  onBuyNow,
  onCartChange,
  onMessageSeller,
  onProductSelect,
}: ProductDetailProps) {
  const { triggerHaptic } = useHapticFeedback();
  const { toggleLike, registerView } = useProductActions();
  const { addToCart, items: cartItems } = useCart();
  const { toast } = useToast();

  const [stack, setStack] = useState<Product[]>([]);
  const product = stack.length > 0 ? stack[stack.length - 1] : productProp;
  const stockState = getStockState(product ?? ({} as Product));

  const { products: relatedSource, isLoading: relatedLoading } = useProducts(
    product?.category?.slug || 'all',
    '',
  );

  const {
    reviews,
    averageRating,
    reviewCount,
    page: reviewPage,
    pageCount: reviewPageCount,
    isLoading: reviewsLoading,
    eligibility: reviewEligibility,
    createReview,
    setPage: setReviewPage,
  } = useProductReviews(product?.id);

  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [isLiked, setIsLiked] = useState(product?.is_liked || false);
  const [quantity, setQuantity] = useState(1);
  const [isAddingToCart, setIsAddingToCart] = useState(false);
  const [isBuying, setIsBuying] = useState(false);
  const [addedToCart, setAddedToCart] = useState(false);
  const [descExpanded, setDescExpanded] = useState(false);
  const [imageFailed, setImageFailed] = useState<Record<number, boolean>>({});
  const [isZoomed, setIsZoomed] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [reviewRating, setReviewRating] = useState(5);
  const [reviewTitle, setReviewTitle] = useState('');
  const [reviewContent, setReviewContent] = useState('');
  const [isSubmittingReview, setIsSubmittingReview] = useState(false);

  const touchStartX = useRef<number | null>(null);
  const mobileScrollRef = useRef<HTMLDivElement>(null);
  const detailScrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => setStack([]), [productProp?.id]);

  useEffect(() => {
    if (!product) return;
    setCurrentImageIndex(0);
    setIsLiked(product.is_liked || false);
    setQuantity(1);
    setAddedToCart(false);
    setDescExpanded(false);
    setImageFailed({});
    setIsZoomed(false);
    setScrolled(false);
    setReviewRating(5);
    setReviewTitle('');
    setReviewContent('');
    mobileScrollRef.current?.scrollTo({ top: 0 });
    detailScrollRef.current?.scrollTo({ top: 0 });
  }, [product?.id]);

  useEffect(() => {
    setQuantity(q => Math.min(q, Math.max(1, stockState.stock)));
  }, [stockState.stock]);

  useEffect(() => {
    if (!product?.id) return;
    const key = `alsamos:viewed:${product.id}`;
    try {
      if (sessionStorage.getItem(key)) return;
      sessionStorage.setItem(key, '1');
      void registerView(product.id);
    } catch {
      void registerView(product.id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [product?.id]);

  const images = product?.images?.length ? product.images.map(image => image.url) : [];

  useEffect(() => {
    if (!product || images.length < 2) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'ArrowLeft') {
        setCurrentImageIndex(i => (i - 1 + images.length) % images.length);
      } else if (event.key === 'ArrowRight') {
        setCurrentImageIndex(i => (i + 1) % images.length);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [product?.id, images.length]);

  const relatedProducts = useMemo(
    () => relatedSource.filter(item => item.id !== product?.id).slice(0, 10),
    [relatedSource, product?.id],
  );

  if (!product) return null;

  const currency = product.currency || 'USD';
  const { hasDiscount, percent: discountPercent, savings } = getDiscount(
    product.price,
    product.compare_at_price,
  );
  const { stock, isSoldOut, isLowStock } = stockState;
  const sellerRating = Number(product.seller?.rating ?? 0);
  const currentImage = images[currentImageIndex];
  const showFallback = !currentImage || imageFailed[currentImageIndex];
  const canGoBack = stack.length > 0;

  const shippingCost = product.shipping_available ? Number(product.shipping_price ?? 0) : 0;
  const lineTotal = Number(product.price) * quantity;
  const grandTotal = lineTotal + shippingCost * quantity;
  const shippingApplies = shippingCost > 0;

  const inCartQty = cartItems.reduce((sum, item) => {
    const productId = (item as { product_id?: string }).product_id;
    return productId === product.id ? sum + Number(item.quantity || 0) : sum;
  }, 0);

  const deliveryFrom = format(addDays(new Date(), 2), 'd MMM', { locale: uz });
  const deliveryTo = format(addDays(new Date(), 5), 'd MMM', { locale: uz });

  const goPrev = () => {
    if (images.length < 2) return;
    triggerHaptic('light');
    setCurrentImageIndex(i => (i - 1 + images.length) % images.length);
  };

  const goNext = () => {
    if (images.length < 2) return;
    triggerHaptic('light');
    setCurrentImageIndex(i => (i + 1) % images.length);
  };

  const handleTouchStart = (event: React.TouchEvent) => {
    touchStartX.current = event.touches[0].clientX;
  };

  const handleTouchEnd = (event: React.TouchEvent) => {
    if (touchStartX.current == null || images.length < 2) return;
    const dx = event.changedTouches[0].clientX - touchStartX.current;
    if (Math.abs(dx) > 50) (dx > 0 ? goPrev : goNext)();
    touchStartX.current = null;
  };

  const handleBackOrClose = () => {
    triggerHaptic('light');
    if (canGoBack) setStack(prev => prev.slice(0, -1));
    else onClose();
  };

  const openRelated = (next: Product) => {
    triggerHaptic('light');
    if (onProductSelect) onProductSelect(next);
    else setStack(prev => [...prev, next]);
  };

  const handleLike = async () => {
    triggerHaptic('medium');
    const success = await toggleLike(product.id, isLiked);
    if (success) setIsLiked(value => !value);
  };

  const handleAddToCart = async () => {
    if (isAddingToCart || isBuying || isSoldOut) return;
    setIsAddingToCart(true);
    triggerHaptic('medium');
    const success = await addToCart(product.id, quantity);
    setIsAddingToCart(false);
    if (!success) return;
    setAddedToCart(true);
    onCartChange?.();
    window.setTimeout(() => setAddedToCart(false), 1800);
  };

  const handleBuyNow = async () => {
    if (isBuying || isAddingToCart || isSoldOut) return;
    setIsBuying(true);
    triggerHaptic('heavy');
    const success = await addToCart(product.id, quantity);
    setIsBuying(false);
    if (!success) return;
    onCartChange?.();

    if (onBuyNow) {
      await onBuyNow(product);
      return;
    }

    toast({
      title: "Savatga qo'shildi",
      description: "Buyurtmani yakunlash uchun savatga o'ting",
    });
    onClose();
  };

  const handleShare = async () => {
    triggerHaptic('light');
    const shareData = {
      title: product.title,
      text: `${product.title} — ${formatPrice(product.price, currency)}`,
      url: typeof window !== 'undefined' ? window.location.href : '',
    };
    try {
      if (navigator.share) await navigator.share(shareData);
      else {
        await navigator.clipboard.writeText(shareData.url);
        toast({ title: 'Havola nusxalandi' });
      }
    } catch {
      // Foydalanuvchi ulashishni bekor qilishi mumkin.
    }
  };

  const handleSubmitReview = async () => {
    if (isSubmittingReview || reviewContent.trim().length < 3) return;
    setIsSubmittingReview(true);
    const success = await createReview(reviewRating, reviewTitle, reviewContent);
    setIsSubmittingReview(false);
    if (success) {
      setReviewRating(5);
      setReviewTitle('');
      setReviewContent('');
    }
  };

  const copyProductId = async () => {
    try {
      await navigator.clipboard.writeText(product.id);
      toast({ title: 'Mahsulot ID nusxalandi' });
    } catch {
      toast({ title: 'Nusxalab bo‘lmadi', variant: 'destructive' });
    }
  };

  const trustBadges = [
    {
      icon: Truck,
      label: product.shipping_available
        ? shippingCost > 0
          ? `Yetkazish ${formatPrice(shippingCost, currency)}`
          : 'Bepul yetkazish'
        : 'Olib ketish',
      accent: 'text-emerald-500',
    },
    {
      icon: RotateCcw,
      label: product.condition === 'new' ? '14 kun qaytarish' : 'Kelishuv asosida qaytarish',
      accent: 'text-blue-500',
    },
    { icon: Lock, label: "Xavfsiz to'lov", accent: 'text-violet-500' },
    {
      icon: BadgeCheck,
      label: product.seller?.is_verified ? 'Tasdiqlangan sotuvchi' : 'Xaridor himoyasi',
      accent: 'text-amber-500',
    },
  ];

  const actionButtons = (
    <div className="flex w-full max-w-md items-stretch gap-2">
      <Button
        variant="outline"
        className={cn(
          'flex-1 rounded-2xl h-12 text-sm font-semibold border-primary/30 text-primary hover:bg-primary/5',
          addedToCart && 'border-emerald-500/40 text-emerald-600 bg-emerald-500/5',
        )}
        onClick={handleAddToCart}
        disabled={isAddingToCart || isBuying || isSoldOut}
      >
        {isAddingToCart ? (
          <><Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> Qo‘shilmoqda</>
        ) : addedToCart ? (
          <><Check className="mr-1.5 h-4 w-4" /> Qo‘shildi</>
        ) : (
          <><ShoppingCart className="mr-1.5 h-4 w-4" /> Savatga</>
        )}
        {inCartQty > 0 && !isAddingToCart && (
          <span className="ml-2 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-bold">
            savatda {inCartQty}
          </span>
        )}
      </Button>

      <Button
        className="flex-1 rounded-2xl h-12 text-sm font-bold shadow-lg shadow-primary/20"
        onClick={handleBuyNow}
        disabled={isSoldOut || isBuying || isAddingToCart}
      >
        {isSoldOut ? 'Sotilgan' : isBuying ? (
          <><Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> Ochilmoqda</>
        ) : (
          <><Zap className="mr-1.5 h-4 w-4" /> Sotib olish</>
        )}
      </Button>
    </div>
  );

  return (
    <Sheet open={!!productProp} onOpenChange={(open) => { if (!open) onClose(); }}>
      <SheetContent
        side="bottom"
        className={cn(
          'h-[98vh] p-0 rounded-t-3xl border-t border-border/30 overflow-hidden [&>button]:hidden',
          'md:max-w-6xl md:mx-auto md:rounded-3xl md:h-[90vh] md:my-[5vh] md:top-0 md:bottom-auto',
        )}
      >
        <div className="relative flex h-full flex-col bg-background">
          <AnimatePresence>
            {scrolled && (
              <motion.div
                initial={{ opacity: 0, y: -12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -12 }}
                className="absolute inset-x-0 top-0 z-50 flex h-16 items-center gap-2 border-b border-border/30 bg-background/95 px-3 backdrop-blur-xl"
              >
                <Button variant="ghost" size="icon" className="h-10 w-10 rounded-full" onClick={handleBackOrClose}>
                  {canGoBack ? <ArrowLeft className="h-5 w-5" /> : <X className="h-5 w-5" />}
                </Button>
                <div className="h-10 w-10 overflow-hidden rounded-lg bg-muted">
                  {images[0] && !imageFailed[0] ? (
                    <img
                      src={images[0]}
                      alt=""
                      className="h-full w-full object-contain"
                      onError={() => setImageFailed(prev => ({ ...prev, 0: true }))}
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center">
                      <CategoryIcon slug={product.category?.slug} name={product.category?.name} className="h-5 w-5" />
                    </div>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">{product.title}</p>
                  <p className="text-xs font-bold text-primary">{formatPrice(product.price, currency)}</p>
                </div>
                <Button variant="ghost" size="icon" className="h-10 w-10 rounded-full" onClick={handleShare}>
                  <Share2 className="h-4 w-4" />
                </Button>
              </motion.div>
            )}
          </AnimatePresence>

          {!scrolled && (
            <div className="absolute inset-x-0 top-0 z-40 flex items-center justify-between p-3 pointer-events-none">
              <Button
                variant="ghost"
                size="icon"
                className="pointer-events-auto h-10 w-10 rounded-full border border-border/30 bg-background/85 shadow-lg backdrop-blur-xl"
                onClick={handleBackOrClose}
              >
                {canGoBack ? <ArrowLeft className="h-5 w-5" /> : <X className="h-5 w-5" />}
              </Button>
              <div className="flex gap-2 pointer-events-auto">
                <Button
                  variant="ghost"
                  size="icon"
                  className={cn(
                    'h-10 w-10 rounded-full border shadow-lg backdrop-blur-xl',
                    isLiked ? 'border-red-500/30 bg-red-500/15 text-red-500' : 'border-border/30 bg-background/85',
                  )}
                  onClick={handleLike}
                >
                  <Heart className={cn('h-5 w-5', isLiked && 'fill-current')} />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-10 w-10 rounded-full border border-border/30 bg-background/85 shadow-lg backdrop-blur-xl"
                  onClick={handleShare}
                >
                  <Share2 className="h-5 w-5" />
                </Button>
              </div>
            </div>
          )}

          <div
            ref={mobileScrollRef}
            onScroll={(event) => setScrolled(event.currentTarget.scrollTop > 300)}
            className="flex-1 min-h-0 overflow-y-auto md:grid md:grid-cols-2 md:gap-8 md:overflow-hidden md:p-4"
          >
            <div className="md:sticky md:top-0 md:self-start">
              <div
                className="relative aspect-[4/5] select-none overflow-hidden bg-muted/40 md:max-h-[calc(90vh-2rem)] md:rounded-2xl md:bg-muted"
                onTouchStart={handleTouchStart}
                onTouchEnd={handleTouchEnd}
                onDoubleClick={() => setIsZoomed(value => !value)}
              >
                {showFallback ? (
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-muted-foreground/50">
                    <CategoryIcon slug={product.category?.slug} name={product.category?.name} className="h-12 w-12" />
                    <span className="text-xs">Rasm mavjud emas</span>
                  </div>
                ) : (
                  <AnimatePresence mode="wait">
                    <motion.img
                      key={currentImageIndex}
                      src={currentImage}
                      alt={product.title}
                      draggable={false}
                      className="absolute inset-0 h-full w-full object-contain"
                      onError={() => setImageFailed(prev => ({ ...prev, [currentImageIndex]: true }))}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1, scale: isZoomed ? 1.5 : 1 }}
                      exit={{ opacity: 0 }}
                    />
                  </AnimatePresence>
                )}

                <div className="absolute left-3 top-16 z-10 flex flex-col gap-1.5">
                  {hasDiscount && (
                    <span className="rounded-lg bg-red-500 px-2.5 py-1 text-xs font-extrabold text-white shadow-lg">
                      −{discountPercent}%
                    </span>
                  )}
                  {product.is_featured && (
                    <span className="flex items-center gap-1 rounded-lg bg-amber-500 px-2.5 py-1 text-[11px] font-bold text-white shadow-lg">
                      <Award className="h-3 w-3" /> Tanlangan
                    </span>
                  )}
                  {isSoldOut && (
                    <span className="flex items-center gap-1 rounded-lg bg-foreground/80 px-2.5 py-1 text-[11px] font-bold text-background shadow-lg">
                      <PackageX className="h-3 w-3" /> Sotilgan
                    </span>
                  )}
                </div>

                <span className="absolute right-3 top-16 z-10 flex items-center gap-1 rounded-lg bg-background/80 px-2 py-1 text-[11px] font-medium shadow-sm backdrop-blur">
                  <Eye className="h-3 w-3" /> {product.views_count ?? 0}
                </span>

                {images.length > 1 && (
                  <>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="hidden md:flex absolute left-3 top-1/2 z-10 h-10 w-10 -translate-y-1/2 rounded-full border bg-background/85"
                      onClick={goPrev}
                    >
                      <ChevronLeft className="h-5 w-5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="hidden md:flex absolute right-3 top-1/2 z-10 h-10 w-10 -translate-y-1/2 rounded-full border bg-background/85"
                      onClick={goNext}
                    >
                      <ChevronRight className="h-5 w-5" />
                    </Button>
                    <div className="absolute bottom-3 left-1/2 z-10 flex -translate-x-1/2 items-center gap-1.5 rounded-full bg-background/80 px-2.5 py-1.5 backdrop-blur">
                      {images.map((_, index) => (
                        <button
                          key={index}
                          type="button"
                          aria-label={`Rasm ${index + 1}`}
                          onClick={() => setCurrentImageIndex(index)}
                          className={cn(
                            'h-1.5 rounded-full transition-all',
                            index === currentImageIndex ? 'w-5 bg-primary' : 'w-1.5 bg-muted-foreground/40',
                          )}
                        />
                      ))}
                    </div>
                  </>
                )}
              </div>

              {images.length > 1 && (
                <div className="border-b border-border/20 px-4 py-3 md:border-b-0 md:px-0 md:pb-0">
                  <div className="flex gap-2 overflow-x-auto scrollbar-hide">
                    {images.map((url, index) => (
                      <button
                        key={url + index}
                        type="button"
                        onClick={() => setCurrentImageIndex(index)}
                        className={cn(
                          'h-16 w-16 shrink-0 overflow-hidden rounded-xl border-2 bg-muted transition-all',
                          index === currentImageIndex ? 'border-primary ring-2 ring-primary/20' : 'border-border/30 opacity-70',
                        )}
                      >
                        {imageFailed[index] ? (
                          <div className="flex h-full w-full items-center justify-center">
                            <CategoryIcon slug={product.category?.slug} name={product.category?.name} className="h-5 w-5" />
                          </div>
                        ) : (
                          <img
                            src={url}
                            alt=""
                            loading="lazy"
                            className="h-full w-full object-contain"
                            onError={() => setImageFailed(prev => ({ ...prev, [index]: true }))}
                          />
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div
              ref={detailScrollRef}
              onScroll={(event) => setScrolled(event.currentTarget.scrollTop > 300)}
              className="pb-36 md:h-full md:min-h-0 md:overflow-y-auto md:pb-6 md:pr-2"
            >
              <div className="space-y-5 p-4 md:p-0">
                {product.category && (
                  <div className="inline-flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">
                    <Tag className="h-3.5 w-3.5" /> {product.category.name}
                  </div>
                )}

                <div className="space-y-2">
                  <h1 className="text-xl font-bold leading-snug md:text-2xl">{product.title}</h1>
                  <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                    {sellerRating > 0 && (
                      <span className="flex items-center gap-1">
                        <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
                        <strong className="text-foreground">{sellerRating.toFixed(1)}</strong>
                        <span>({product.seller?.total_sales ?? 0} sotuv)</span>
                      </span>
                    )}
                    <span>{product.likes_count ?? 0} yoqtirish</span>
                    <span>{product.views_count ?? 0} ko‘rish</span>
                  </div>
                </div>

                <div className="rounded-2xl border border-primary/10 bg-primary/[0.035] p-4">
                  <div className="flex flex-wrap items-baseline gap-2">
                    <span className="text-3xl font-extrabold tracking-tight text-primary">
                      {formatPrice(product.price, currency)}
                    </span>
                    {hasDiscount && (
                      <>
                        <span className="text-sm text-muted-foreground line-through">
                          {formatPrice(product.compare_at_price, currency)}
                        </span>
                        <span className="rounded-md bg-red-500/10 px-2 py-0.5 text-xs font-bold text-red-500">
                          −{discountPercent}%
                        </span>
                      </>
                    )}
                  </div>
                  {hasDiscount && (
                    <p className="mt-1 text-xs font-medium text-emerald-600">
                      {formatPrice(savings, currency)} tejaysiz
                    </p>
                  )}
                  <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
                    {!isSoldOut ? (
                      <span className={cn(
                        'rounded-md px-2 py-1 font-medium',
                        isLowStock ? 'bg-orange-500/10 text-orange-600' : 'bg-emerald-500/10 text-emerald-600',
                      )}>
                        {isLowStock ? `Faqat ${stock} ta qoldi` : 'Sotuvda mavjud'}
                      </span>
                    ) : (
                      <span className="rounded-md bg-muted px-2 py-1 text-muted-foreground">Sotilgan</span>
                    )}
                    {product.is_negotiable && (
                      <span className="rounded-md bg-primary/10 px-2 py-1 font-medium text-primary">Narx kelishiladi</span>
                    )}
                  </div>
                </div>

                {!isSoldOut && (
                  <div className="flex items-center justify-between gap-4 rounded-2xl border border-border/40 p-3">
                    <div>
                      <p className="text-sm font-semibold">Soni</p>
                      <p className="text-[11px] text-muted-foreground">Omborda {stock} dona</p>
                    </div>
                    <div className="flex items-center gap-1 rounded-xl bg-muted/50 p-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 rounded-lg"
                        onClick={() => setQuantity(value => Math.max(1, value - 1))}
                        disabled={quantity <= 1}
                      >
                        <Minus className="h-3.5 w-3.5" />
                      </Button>
                      <span className="w-8 text-center text-sm font-bold">{quantity}</span>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 rounded-lg"
                        onClick={() => setQuantity(value => Math.min(stockState.stock, value + 1))}
                        disabled={quantity >= stockState.stock}
                      >
                        <Plus className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                )}

                <div className="rounded-2xl border border-border/40 bg-muted/20 p-3">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-sm text-muted-foreground">
                      {shippingApplies ? `Mahsulot + yetkazish (${quantity} ta)` : `Jami (${quantity} ta)`}
                    </span>
                    <span className="text-lg font-extrabold text-primary">
                      {formatPrice(grandTotal, currency)}
                    </span>
                  </div>
                  {shippingApplies && (
                    <div className="mt-1 flex justify-between text-[11px] text-muted-foreground">
                      <span>Mahsulot: {formatPrice(lineTotal, currency)}</span>
                      <span>Yetkazish: {formatPrice(shippingCost * quantity, currency)}</span>
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-3 rounded-2xl border border-border/30 bg-muted/20 p-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                    <CalendarClock className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold">Taxminiy yetkazish</p>
                    <p className="text-xs text-muted-foreground">{deliveryFrom} — {deliveryTo}</p>
                  </div>
                </div>

                <div className="hidden md:flex md:flex-col md:gap-2">
                  {actionButtons}
                  {product.is_negotiable && (
                    <Button
                      variant="outline"
                      className="h-11 max-w-md rounded-xl"
                      disabled={!product.seller || !onMessageSeller}
                      onClick={() => product.seller && onMessageSeller?.(product.seller.id)}
                    >
                      <MessageCircle className="mr-2 h-4 w-4" /> Narx taklif qilish
                    </Button>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-2">
                  {trustBadges.map(({ icon: Icon, label, accent }) => (
                    <div key={label} className="flex items-center gap-2 rounded-xl border border-border/30 bg-card p-2.5">
                      <Icon className={cn('h-4 w-4 shrink-0', accent)} />
                      <span className="text-[11px] font-medium">{label}</span>
                    </div>
                  ))}
                </div>

                {product.location && (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <MapPin className="h-4 w-4" /> <span>{product.location}</span>
                  </div>
                )}

                {product.seller && (
                  <div className="rounded-2xl border border-border/30 bg-muted/20 p-3.5">
                    <div className="flex items-center gap-3">
                      <Avatar className="h-12 w-12 ring-2 ring-background">
                        <AvatarImage src={product.seller.logo_url || product.seller.profile?.avatar_url || ''} />
                        <AvatarFallback className="bg-primary/10 font-bold text-primary">
                          {(product.seller.business_name || '?')[0].toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <span className="truncate text-sm font-semibold">{product.seller.business_name}</span>
                          {product.seller.is_verified && <ShieldCheck className="h-4 w-4 text-primary" />}
                        </div>
                        <div className="mt-0.5 flex items-center gap-2 text-[11px] text-muted-foreground">
                          <Store className="h-3 w-3" /> {product.seller.business_type}
                        </div>
                      </div>
                      <div className="flex gap-1.5">
                        {onMessageSeller && (
                          <Button variant="outline" size="icon" className="h-9 w-9 rounded-xl" onClick={() => onMessageSeller(product.seller!.id)}>
                            <MessageCircle className="h-4 w-4" />
                          </Button>
                        )}
                        {onSellerClick && (
                          <Button size="sm" className="h-9 rounded-xl" onClick={() => onSellerClick(product.seller!.id)}>
                            Do‘kon
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {product.description && (
                  <div className="space-y-2">
                    <h3 className="text-sm font-semibold">Tavsif</h3>
                    <div className={cn(
                      'relative whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground',
                      !descExpanded && 'max-h-32 overflow-hidden',
                    )}>
                      {product.description}
                      {!descExpanded && product.description.length > 220 && (
                        <div className="absolute inset-x-0 bottom-0 h-12 bg-gradient-to-t from-background to-transparent" />
                      )}
                    </div>
                    {product.description.length > 220 && (
                      <button type="button" onClick={() => setDescExpanded(value => !value)} className="text-xs font-semibold text-primary">
                        {descExpanded ? 'Yopish' : 'To‘liq o‘qish'}
                      </button>
                    )}
                  </div>
                )}

                <div className="space-y-2">
                  <h3 className="text-sm font-semibold">Xususiyatlar</h3>
                  <div className="overflow-hidden rounded-xl border border-border/30">
                    {[
                      { label: 'Holati', value: conditionLabel(product.condition) },
                      { label: 'Mavjud', value: `${stock} dona` },
                      { label: 'Kategoriya', value: product.category?.name || '—' },
                      {
                        label: 'Yetkazish',
                        value: product.shipping_available
                          ? (shippingCost > 0 ? formatPrice(shippingCost, currency) : 'Bepul')
                          : 'Olib ketish',
                      },
                      {
                        label: 'Joylangan',
                        value: product.created_at
                          ? `${formatDistanceToNow(new Date(product.created_at), { locale: uz })} oldin`
                          : '—',
                      },
                    ].map((row, index, rows) => (
                      <div
                        key={row.label}
                        className={cn(
                          'flex items-center justify-between px-3 py-2.5 text-sm',
                          index % 2 === 0 ? 'bg-muted/20' : 'bg-transparent',
                          index < rows.length - 1 && 'border-b border-border/20',
                        )}
                      >
                        <span className="text-muted-foreground">{row.label}</span>
                        <span className="text-right font-medium">{row.value}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <section className="space-y-4 rounded-2xl border border-border/30 bg-muted/10 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <h3 className="text-base font-semibold">Xaridorlar sharhlari</h3>
                      <p className="text-xs text-muted-foreground">
                        Faqat yetkazilgan buyurtmalar tasdiqlangan xaridor sharhi sifatida qabul qilinadi.
                      </p>
                    </div>
                    <div className="flex items-center gap-2 rounded-xl bg-background px-3 py-2 shadow-sm">
                      <Star className="h-5 w-5 fill-amber-400 text-amber-400" />
                      <div>
                        <p className="text-lg font-extrabold leading-none">
                          {reviewCount > 0 ? averageRating.toFixed(1) : '—'}
                        </p>
                        <p className="mt-1 text-[10px] text-muted-foreground">{reviewCount} ta sharh</p>
                      </div>
                    </div>
                  </div>

                  {reviewEligibility === 'eligible' && (
                    <div className="space-y-3 rounded-xl border border-primary/20 bg-primary/[0.03] p-3">
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-sm font-semibold">Baholang</p>
                        <div className="flex gap-1">
                          {[1, 2, 3, 4, 5].map(value => (
                            <button
                              key={value}
                              type="button"
                              onClick={() => setReviewRating(value)}
                              className="rounded-md p-0.5"
                              aria-label={`${value} yulduz`}
                            >
                              <Star
                                className={cn(
                                  'h-5 w-5',
                                  value <= reviewRating
                                    ? 'fill-amber-400 text-amber-400'
                                    : 'text-muted-foreground/30',
                                )}
                              />
                            </button>
                          ))}
                        </div>
                      </div>
                      <Input
                        value={reviewTitle}
                        onChange={event => setReviewTitle(event.target.value)}
                        placeholder="Sarlavha (ixtiyoriy)"
                        maxLength={120}
                        className="rounded-xl"
                      />
                      <Textarea
                        value={reviewContent}
                        onChange={event => setReviewContent(event.target.value)}
                        placeholder="Mahsulot haqida fikringiz"
                        maxLength={2000}
                        rows={3}
                        className="resize-none rounded-xl"
                      />
                      <Button
                        className="h-10 w-full rounded-xl"
                        onClick={handleSubmitReview}
                        disabled={isSubmittingReview || reviewContent.trim().length < 3}
                      >
                        {isSubmittingReview ? (
                          <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Saqlanmoqda</>
                        ) : (
                          'Sharhni e’lon qilish'
                        )}
                      </Button>
                    </div>
                  )}

                  {reviewEligibility === 'already_reviewed' && (
                    <p className="rounded-xl bg-muted/40 p-3 text-xs text-muted-foreground">
                      Bu mahsulot uchun sharhingiz allaqachon mavjud.
                    </p>
                  )}
                  {reviewEligibility === 'not_delivered' && (
                    <p className="rounded-xl bg-muted/40 p-3 text-xs text-muted-foreground">
                      Sharh yozish uchun shu mahsulot qatnashgan buyurtma avval yetkazilgan bo‘lishi kerak.
                    </p>
                  )}
                  {reviewEligibility === 'signed_out' && (
                    <p className="rounded-xl bg-muted/40 p-3 text-xs text-muted-foreground">
                      Sharh yozish uchun tizimga kiring. Xarid tasdiqlangan buyurtma orqali tekshiriladi.
                    </p>
                  )}

                  {reviewsLoading ? (
                    <div className="space-y-2">
                      {[0, 1].map(item => (
                        <div key={item} className="h-24 animate-pulse rounded-xl bg-muted" />
                      ))}
                    </div>
                  ) : reviews.length > 0 ? (
                    <div className="space-y-3">
                      {reviews.map(review => {
                        const reviewName =
                          review.user?.display_name ||
                          review.user?.username ||
                          'Alsamos xaridori';
                        return (
                          <article key={review.id} className="rounded-xl border border-border/30 bg-background p-3">
                            <div className="flex items-start gap-3">
                              <Avatar className="h-9 w-9">
                                <AvatarImage src={review.user?.avatar_url || ''} />
                                <AvatarFallback>{reviewName[0]?.toUpperCase() || 'A'}</AvatarFallback>
                              </Avatar>
                              <div className="min-w-0 flex-1">
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                  <div>
                                    <p className="text-sm font-semibold">{reviewName}</p>
                                    <div className="mt-0.5 flex items-center gap-0.5">
                                      {[1, 2, 3, 4, 5].map(value => (
                                        <Star
                                          key={value}
                                          className={cn(
                                            'h-3.5 w-3.5',
                                            value <= review.rating
                                              ? 'fill-amber-400 text-amber-400'
                                              : 'text-muted-foreground/25',
                                          )}
                                        />
                                      ))}
                                    </div>
                                  </div>
                                  <span className="text-[10px] text-muted-foreground">
                                    {formatDistanceToNow(new Date(review.created_at), { locale: uz })} oldin
                                  </span>
                                </div>
                                {review.title && <p className="mt-2 text-sm font-semibold">{review.title}</p>}
                                {review.content && (
                                  <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">
                                    {review.content}
                                  </p>
                                )}
                              </div>
                            </div>
                          </article>
                        );
                      })}

                      {reviewPageCount > 1 && (
                        <div className="flex items-center justify-between gap-3 pt-1">
                          <Button
                            variant="outline"
                            size="sm"
                            className="rounded-lg"
                            disabled={reviewPage <= 0}
                            onClick={() => setReviewPage(Math.max(0, reviewPage - 1))}
                          >
                            Oldingi
                          </Button>
                          <span className="text-xs text-muted-foreground">
                            {reviewPage + 1} / {reviewPageCount}
                          </span>
                          <Button
                            variant="outline"
                            size="sm"
                            className="rounded-lg"
                            disabled={reviewPage + 1 >= reviewPageCount}
                            onClick={() => setReviewPage(Math.min(reviewPageCount - 1, reviewPage + 1))}
                          >
                            Keyingi
                          </Button>
                        </div>
                      )}
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground">
                      Hozircha sharh yo‘q. Birinchi tasdiqlangan sharh shu yerda ko‘rinadi.
                    </p>
                  )}
                </section>

                <div className="space-y-3">
                  <h3 className="text-sm font-semibold">O‘xshash mahsulotlar</h3>
                  {relatedLoading ? (
                    <div className="flex gap-3 overflow-hidden">
                      {[0, 1, 2].map(item => <div key={item} className="h-52 w-40 shrink-0 animate-pulse rounded-2xl bg-muted" />)}
                    </div>
                  ) : relatedProducts.length > 0 ? (
                    <div className="-mx-4 flex gap-3 overflow-x-auto px-4 pb-2 md:mx-0 md:px-0">
                      {relatedProducts.map(related => (
                        <div key={related.id} className="w-40 shrink-0">
                          <ProductCard product={related} onSelect={openRelated} />
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground">Hozircha o‘xshash mahsulot topilmadi.</p>
                  )}
                </div>

                <div className="flex items-center justify-between border-t border-border/30 pt-3 text-[11px] text-muted-foreground">
                  <span className="flex items-center gap-1.5"><Clock className="h-3 w-3" /> ID: {product.id.slice(0, 8)}</span>
                  <Button variant="ghost" size="sm" className="h-8 rounded-lg px-2 text-xs" onClick={copyProductId}>
                    <Copy className="mr-1.5 h-3.5 w-3.5" /> Nusxalash
                  </Button>
                </div>
              </div>
            </div>
          </div>

          <div className="absolute inset-x-0 bottom-0 z-40 border-t border-border/30 bg-background/95 px-4 pt-3 pb-[max(env(safe-area-inset-bottom),0.75rem)] backdrop-blur-xl md:hidden">
            {actionButtons}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

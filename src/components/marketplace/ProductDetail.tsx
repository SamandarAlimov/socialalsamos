import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft, Award, BadgeCheck, CalendarClock, Check, ChevronLeft, ChevronRight,
  Clock, Copy, Eye, Heart, Loader2, Lock, MapPin, MessageCircle, Minus,
  PackageX, Plus, RotateCcw, Share2, ShieldCheck, ShoppingCart, Star, Store,
  Tag, Truck, X, Zap, LocateFixed, Navigation, TimerReset,
} from 'lucide-react';
import { addDays, format, formatDistanceToNow } from 'date-fns';
import { uz } from 'date-fns/locale';
import { AnimatePresence, motion } from 'framer-motion';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { CategoryIcon } from '@/components/marketplace/CategoryIcon';
import { ProductCard } from '@/components/marketplace/ProductCard';
import {
  Product,
  useCart,
  useProductActions,
  useProducts,
  useRecentlyViewedProducts,
  useSellerResponseStats,
  useProductVariants,
} from '@/hooks/useMarketplace';
import { useProductReviews } from '@/hooks/useProductReviews';
import { useHapticFeedback } from '@/hooks/useHapticFeedback';
import { useToast } from '@/hooks/use-toast';
import { conditionLabel, formatPrice, getDiscount } from '@/lib/marketplace';
import { cn } from '@/lib/utils';
import { marketplaceUz } from '@/i18n/marketplace';
import { useMarketplaceDeliveryLocation } from '@/hooks/useMarketplaceDeliveryLocation';

// Galereya ramkasi rasmning haqiqiy nisbatiga moslashadi, lekin cheksiz emas:
// juda cho'ziq panorama sahifani yorib yubormasligi, juda tik portret esa
// ekranni egallab ketmasligi kerak. Nisbat = kenglik / balandlik.
const MIN_MEDIA_RATIO = 4 / 5;   // 0.80 — eng tik ruxsat etilgan ramka
const MAX_MEDIA_RATIO = 16 / 9;  // 1.78 — eng keng ruxsat etilgan ramka

interface ProductDetailProps {
  product: Product | null;
  onClose: () => void;
  onSellerClick?: (sellerId: string) => void;
  onBuyNow?: (product: Product) => void | Promise<void>;
  onCartChange?: () => void;
  onMessageSeller?: (sellerId: string) => void;
  onProductSelect?: (product: Product) => void;
  onOpenCart?: () => void;
  onBrowseMarketplace?: () => void;
  onBrowseCategory?: (slug: string) => void;
}

export function ProductDetail({
  product: productProp,
  onClose,
  onSellerClick,
  onBuyNow,
  onCartChange,
  onMessageSeller,
  onProductSelect,
  onOpenCart,
  onBrowseMarketplace,
  onBrowseCategory,
}: ProductDetailProps) {
  const { triggerHaptic } = useHapticFeedback();
  const { toggleLike, registerView } = useProductActions();
  const { addToCart, items: cartItems } = useCart();
  const { toast } = useToast();

  const [stack, setStack] = useState<Product[]>([]);
  const product = stack.length > 0 ? stack[stack.length - 1] : productProp;

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

  const {
    products: recentlyViewedProducts,
    isLoading: recentlyViewedLoading,
  } = useRecentlyViewedProducts(product?.id);
  const {
    stats: sellerResponseStats,
    isLoading: sellerStatsLoading,
  } = useSellerResponseStats(product?.seller?.user_id);
  const {
    location: deliveryLocation,
    isLocating: isLocatingDelivery,
    error: deliveryLocationError,
    locate: locateDelivery,
  } = useMarketplaceDeliveryLocation();

  const {
    variants,
    isLoading: variantsLoading,
  } = useProductVariants(product?.id);

  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [isLiked, setIsLiked] = useState(product?.is_liked || false);
  const [quantity, setQuantity] = useState(1);
  const [isAddingToCart, setIsAddingToCart] = useState(false);
  const [isBuying, setIsBuying] = useState(false);
  const [addedToCart, setAddedToCart] = useState(false);
  const [descExpanded, setDescExpanded] = useState(false);
  const [imageFailed, setImageFailed] = useState<Record<number, boolean>>({});
  const [imageRatio, setImageRatio] = useState<number | null>(null);
  const [isZoomed, setIsZoomed] = useState(false);
  const [reviewRating, setReviewRating] = useState(5);
  const [reviewTitle, setReviewTitle] = useState('');
  const [reviewContent, setReviewContent] = useState('');
  const [isSubmittingReview, setIsSubmittingReview] = useState(false);
  const [selectedOptions, setSelectedOptions] = useState<Record<string, string>>({});

  const touchStartX = useRef<number | null>(null);

  useEffect(() => setStack([]), [productProp?.id]);

  useEffect(() => {
    if (!product) return;
    setCurrentImageIndex(0);
    setIsLiked(product.is_liked || false);
    setQuantity(1);
    setAddedToCart(false);
    setDescExpanded(false);
    setImageFailed({});
    setImageRatio(null);
    setIsZoomed(false);
    setReviewRating(5);
    setReviewTitle('');
    setReviewContent('');
    setSelectedOptions({});
  }, [product?.id]);

  const variantOptionNames = useMemo(
    () => Array.from(new Set(variants.flatMap(variant => Object.keys(variant.options || {})))),
    [variants],
  );

  const selectedVariant = useMemo(() => {
    if (variants.length === 0) return null;
    const hasSelection = Object.keys(selectedOptions).length > 0;
    if (!hasSelection) return variants[0] ?? null;

    return variants.find(variant =>
      variantOptionNames.every(
        name => String(variant.options?.[name] ?? '') === String(selectedOptions[name] ?? ''),
      ),
    ) ?? null;
  }, [selectedOptions, variantOptionNames, variants]);

  const selectedStock = variants.length > 0
    ? Math.max(0, Number(selectedVariant?.quantity ?? 0))
    : Math.max(0, Number(product?.quantity ?? 0));

  useEffect(() => {
    if (variants.length === 0) {
      setSelectedOptions({});
      return;
    }
    setSelectedOptions({ ...variants[0].options });
    setQuantity(1);
    setCurrentImageIndex(0);
  }, [product?.id, variants]);

  useEffect(() => {
    setQuantity(q => Math.min(q, Math.max(1, selectedStock)));
  }, [selectedStock]);

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

  const images = useMemo(() => {
    const base = product?.images?.length ? product.images.map(image => image.url) : [];
    const variantImage = selectedVariant?.image_url;
    if (!variantImage) return base;
    return [variantImage, ...base.filter(url => url !== variantImage)];
  }, [product?.images, selectedVariant?.image_url]);

  useEffect(() => {
    setCurrentImageIndex(0);
    setImageFailed({});
    setImageRatio(null);
  }, [selectedVariant?.id]);

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
  const displayPrice = Number(selectedVariant?.price ?? product.price);
  const displayCompareAt =
    selectedVariant?.compare_at_price ?? product.compare_at_price;
  const { hasDiscount, percent: discountPercent, savings } = getDiscount(
    displayPrice,
    displayCompareAt,
  );
  const stock = selectedStock;
  const isSoldOut =
    product.status !== 'active' ||
    stock <= 0 ||
    (variants.length > 0 && !selectedVariant);
  const isLowStock = !isSoldOut && stock <= 5;
  const sellerRating = Number(product.seller?.rating ?? 0);
  const currentImage = images[currentImageIndex];
  const showFallback = !currentImage || imageFailed[currentImageIndex];
  const canGoBack = stack.length > 0;

  // Rasm yuklanmaguncha 4/5 ishlatiladi (eski xatti-harakat), yuklangach ramka
  // rasmning o'z nisbatiga tortiladi. Shu sababli 16:9 rasm tagida bo'sh
  // kulrang tasma qolmaydi.
  const frameRatio = showFallback || !imageRatio
    ? MIN_MEDIA_RATIO
    : Math.min(MAX_MEDIA_RATIO, Math.max(MIN_MEDIA_RATIO, imageRatio));

  const handleImageLoad = (event: React.SyntheticEvent<HTMLImageElement>) => {
    const { naturalWidth, naturalHeight } = event.currentTarget;
    if (naturalWidth > 0 && naturalHeight > 0) {
      setImageRatio(naturalWidth / naturalHeight);
    }
  };

  const shippingCost = product.shipping_available ? Number(product.shipping_price ?? 0) : 0;
  const lineTotal = displayPrice * quantity;
  const grandTotal = lineTotal + shippingCost * quantity;
  const shippingApplies = shippingCost > 0;

  const inCartQty = cartItems.reduce((sum, item) => {
    if (item.product_id !== product.id) return sum;
    if (variants.length > 0 && (item.product_variant_id ?? null) !== (selectedVariant?.id ?? null)) {
      return sum;
    }
    return sum + Number(item.quantity || 0);
  }, 0);

  const distanceKm =
    deliveryLocation &&
    Number.isFinite(Number(product.latitude)) &&
    Number.isFinite(Number(product.longitude))
      ? (() => {
          const toRad = (value: number) => (value * Math.PI) / 180;
          const lat1 = Number(product.latitude);
          const lon1 = Number(product.longitude);
          const lat2 = deliveryLocation.latitude;
          const lon2 = deliveryLocation.longitude;
          const dLat = toRad(lat2 - lat1);
          const dLon = toRad(lon2 - lon1);
          const a =
            Math.sin(dLat / 2) ** 2 +
            Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
          return 2 * 6371 * Math.asin(Math.sqrt(a));
        })()
      : null;

  const minDeliveryDays =
    distanceKm == null ? 2 :
    distanceKm <= 25 ? 1 :
    distanceKm <= 200 ? 2 :
    distanceKm <= 600 ? 3 : 4;
  const maxDeliveryDays = minDeliveryDays + (distanceKm != null && distanceKm <= 25 ? 1 : 2);
  const deliveryFrom = format(addDays(new Date(), minDeliveryDays), 'd MMM', { locale: uz });
  const deliveryTo = format(addDays(new Date(), maxDeliveryDays), 'd MMM', { locale: uz });

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

  const handleVariantOptionSelect = (name: string, value: string) => {
    triggerHaptic('light');

    const preferred = variants.find(variant =>
      String(variant.options?.[name] ?? '') === value &&
      Object.entries(selectedOptions).every(([otherName, otherValue]) =>
        otherName === name ||
        String(variant.options?.[otherName] ?? '') === String(otherValue),
      ),
    );
    const fallback = variants.find(
      variant => String(variant.options?.[name] ?? '') === value,
    );
    const next = preferred ?? fallback;
    if (!next) return;

    setSelectedOptions({ ...next.options });
    setQuantity(1);
    setCurrentImageIndex(0);
  };

  const handleAddToCart = async () => {
    if (isAddingToCart || isBuying || isSoldOut || variantsLoading) return;
    setIsAddingToCart(true);
    triggerHaptic('medium');
    const success = await addToCart(product.id, quantity, selectedVariant?.id);
    setIsAddingToCart(false);
    if (!success) return;
    setAddedToCart(true);
    onCartChange?.();
    window.setTimeout(() => setAddedToCart(false), 1800);
  };

  const handleBuyNow = async () => {
    if (isBuying || isAddingToCart || isSoldOut || variantsLoading) return;
    setIsBuying(true);
    triggerHaptic('heavy');
    const success = await addToCart(product.id, quantity, selectedVariant?.id);
    setIsBuying(false);
    if (!success) return;
    onCartChange?.();

    if (onBuyNow) {
      await onBuyNow(product);
      return;
    }

    toast({
      title: marketplaceUz.productDetail.cartAdded,
      description: marketplaceUz.productDetail.finishInCart,
    });
    onClose();
  };

  const handleShare = async () => {
    triggerHaptic('light');
    const shareData = {
      title: product.title,
      text: `${product.title}${selectedVariant ? ` · ${Object.values(selectedVariant.options).join(' / ')}` : ''} — ${formatPrice(displayPrice, currency)}`,
      url: typeof window !== 'undefined' ? window.location.href : '',
    };
    try {
      if (navigator.share) await navigator.share(shareData);
      else {
        await navigator.clipboard.writeText(shareData.url);
        toast({ title: marketplaceUz.productDetail.linkCopied });
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
      toast({ title: marketplaceUz.productDetail.idCopied });
    } catch {
      toast({ title: marketplaceUz.productDetail.copyFailed, variant: 'destructive' });
    }
  };

  const trustBadges = [
    {
      icon: Truck,
      label: product.shipping_available
        ? shippingCost > 0
          ? `Yetkazish ${formatPrice(shippingCost, currency)}`
          : marketplaceUz.productDetail.freeDelivery
        : marketplaceUz.productDetail.pickup,
      accent: 'text-emerald-500',
    },
    {
      icon: RotateCcw,
      label: product.condition === 'new' ? marketplaceUz.productDetail.returnNew : marketplaceUz.productDetail.returnAgreement,
      accent: 'text-blue-500',
    },
    { icon: Lock, label: marketplaceUz.productDetail.securePayment, accent: 'text-violet-500' },
    {
      icon: BadgeCheck,
      label: product.seller?.is_verified ? marketplaceUz.productDetail.verifiedSeller : marketplaceUz.productDetail.buyerProtection,
      accent: 'text-amber-500',
    },
  ];

  // DIQQAT: bitta sahifada faqat BITTA ko'rinadigan nusxasi bo'lishi kerak.
  // Hozir: o'ng ustun (md+) va mobil pastki panel (md dan kichik) — ular hech
  // qachon bir vaqtda ko'rinmaydi. Xarid xulosasi kartasiga qo'shmang, aks
  // holda 1024px dan katta ekranda ikkita bir xil tugmalar qatori chiqadi.
  const actionButtons = (
    <div className="flex w-full max-w-md items-stretch gap-2">
      <Button
        variant="outline"
        className={cn(
          'flex-1 rounded-2xl h-12 text-sm font-semibold border-foreground/30 text-foreground hover:bg-foreground/5',
          addedToCart && 'border-emerald-500/40 text-emerald-600 bg-emerald-500/5',
        )}
        onClick={handleAddToCart}
        disabled={isAddingToCart || isBuying || isSoldOut || variantsLoading}
      >
        {isAddingToCart ? (
          <><Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> {marketplaceUz.productDetail.adding}</>
        ) : addedToCart ? (
          <><Check className="mr-1.5 h-4 w-4" /> {marketplaceUz.productDetail.added}</>
        ) : (
          <><ShoppingCart className="mr-1.5 h-4 w-4" /> {marketplaceUz.productDetail.addToCart}</>
        )}
        {inCartQty > 0 && !isAddingToCart && (
          <span className="ml-2 rounded-full bg-foreground/10 px-2 py-0.5 text-[10px] font-bold">
            savatda {inCartQty}
          </span>
        )}
      </Button>

      <Button
        className="flex-1 rounded-2xl h-12 text-sm font-bold shadow-lg shadow-black/10"
        onClick={handleBuyNow}
        disabled={isSoldOut || isBuying || isAddingToCart || variantsLoading}
      >
        {isSoldOut ? marketplaceUz.productDetail.sold : isBuying ? (
          <><Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> {marketplaceUz.productDetail.opening}</>
        ) : (
          <><Zap className="mr-1.5 h-4 w-4" /> {marketplaceUz.productDetail.buyNow}</>
        )}
      </Button>
    </div>
  );

  // Tavsif va Xususiyatlar: desktopda galereya tagida (chap ustunni to'ldiradi),
  // mobilda esa pastki oqimda. Ikkala joy o'zaro istisno breakpointlarda, ya'ni
  // bir vaqtda hech qachon ikkitasi chiqmaydi.
  const descriptionBlock = product.description ? (
    <div className="space-y-2">
      <h3 className="text-sm font-semibold">{marketplaceUz.productDetail.description}</h3>
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
        <button type="button" onClick={() => setDescExpanded(value => !value)} className="text-xs font-semibold text-foreground">
          {descExpanded ? marketplaceUz.productDetail.collapse : marketplaceUz.productDetail.readAll}
        </button>
      )}
    </div>
  ) : null;

  const specsBlock = (
    <div className="space-y-2">
      <h3 className="text-sm font-semibold">{marketplaceUz.productDetail.properties}</h3>
      <div className="overflow-hidden rounded-xl border border-border/30">
        {[
          { label: marketplaceUz.productDetail.condition, value: conditionLabel(product.condition) },
          { label: marketplaceUz.productDetail.available, value: `${stock} dona` },
          ...(selectedVariant?.sku
            ? [{ label: 'SKU', value: selectedVariant.sku }]
            : []),
          { label: marketplaceUz.productDetail.category, value: product.category?.name || '—' },
          {
            label: marketplaceUz.productDetail.delivery,
            value: product.shipping_available
              ? (shippingCost > 0 ? formatPrice(shippingCost, currency) : 'Bepul')
              : 'Olib ketish',
          },
          {
            label: marketplaceUz.productDetail.posted,
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
  );

  return (
    <div className="relative min-h-full bg-background">
      <div className="sticky top-0 z-40 border-b border-border/35 bg-background/88 backdrop-blur-2xl">
        <div className="mx-auto flex h-16 w-full max-w-7xl items-center gap-3 px-4 lg:px-6">
          <Button
            variant="ghost"
            size="icon"
            className="h-10 w-10 shrink-0 rounded-full border border-border/40 bg-background/80 shadow-sm"
            onClick={handleBackOrClose}
            aria-label={marketplaceUz.productDetail.back}
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>

          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold md:text-base">{product.title}</p>
            <div className="mt-0.5 flex items-center gap-2 text-[11px] text-muted-foreground">
              {product.category?.name && <span className="truncate">{product.category.name}</span>}
              <span className="font-bold text-foreground">{formatPrice(displayPrice, currency)}</span>
            </div>
          </div>

          {onOpenCart && (
            <Button
              variant="ghost"
              size="icon"
              className="relative h-10 w-10 rounded-full border border-border/40 bg-background/80 shadow-sm"
              onClick={onOpenCart}
              aria-label={marketplaceUz.cart.title}
            >
              <ShoppingCart className="h-[18px] w-[18px]" />
              {inCartQty > 0 && (
                <span className="absolute -right-1 -top-1 min-w-4 rounded-full bg-foreground px-1 text-[9px] font-bold leading-4 text-background">
                  {inCartQty > 99 ? '99+' : inCartQty}
                </span>
              )}
            </Button>
          )}

          <Button
            variant="ghost"
            size="icon"
            className={cn(
              'h-10 w-10 rounded-full border shadow-sm',
              isLiked
                ? 'border-red-500/30 bg-red-500/10 text-red-500'
                : 'border-border/40 bg-background/80',
            )}
            onClick={handleLike}
            aria-label={isLiked ? marketplaceUz.card.removeSaved : marketplaceUz.card.save}
          >
            <Heart className={cn('h-[18px] w-[18px]', isLiked && 'fill-current')} />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-10 w-10 rounded-full border border-border/40 bg-background/80 shadow-sm"
            onClick={handleShare}
            aria-label={marketplaceUz.productDetail.share}
          >
            <Share2 className="h-[18px] w-[18px]" />
          </Button>
        </div>
      </div>

      <div className="mx-auto w-full max-w-7xl px-4 pt-4 lg:px-6">
        <nav
          className="flex min-w-0 items-center gap-1.5 overflow-hidden text-xs text-muted-foreground"
          aria-label="Breadcrumb"
        >
          <button
            type="button"
            onClick={onBrowseMarketplace}
            className="shrink-0 transition-colors hover:text-foreground"
          >
            {marketplaceUz.productDetail.marketplace}
          </button>
          <ChevronRight className="h-3.5 w-3.5 shrink-0 opacity-50" />
          {product.category ? (
            <>
              <button
                type="button"
                onClick={() => onBrowseCategory?.(product.category!.slug)}
                className="max-w-40 truncate transition-colors hover:text-foreground"
              >
                {product.category.name}
              </button>
              <ChevronRight className="h-3.5 w-3.5 shrink-0 opacity-50" />
            </>
          ) : null}
          <span className="truncate font-medium text-foreground">{product.title}</span>
        </nav>
      </div>

      <div
        className="mx-auto grid w-full max-w-7xl gap-6 px-4 py-5 md:grid-cols-[minmax(0,1.05fr)_minmax(360px,0.95fr)] md:items-start md:gap-8 lg:gap-10 lg:px-6"
      >
            <div>
              <div
                className="relative select-none overflow-hidden rounded-3xl border border-border/30 bg-muted/40 shadow-sm transition-[aspect-ratio] duration-300 md:max-h-[calc(100dvh-7rem)] md:bg-muted"
                style={{ aspectRatio: frameRatio }}
                onTouchStart={handleTouchStart}
                onTouchEnd={handleTouchEnd}
                onDoubleClick={() => setIsZoomed(value => !value)}
              >
                {showFallback ? (
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-muted-foreground/50">
                    <CategoryIcon slug={product.category?.slug} name={product.category?.name} className="h-12 w-12" />
                    <span className="text-xs">{marketplaceUz.productDetail.noImage}</span>
                  </div>
                ) : (
                  <>
                    {/* Nisbat cheklovga tirab qolganda qoladigan tasma tekis kulrang
                        emas, o'sha rasmning xiralashtirilgan nusxasi bilan to'ladi. */}
                    <div
                      aria-hidden
                      className="pointer-events-none absolute inset-0 scale-110 bg-cover bg-center opacity-35 blur-2xl saturate-150"
                      style={{ backgroundImage: `url("${currentImage}")` }}
                    />
                    <AnimatePresence mode="wait">
                      <motion.img
                        key={currentImageIndex}
                        src={currentImage}
                        alt={product.title}
                        draggable={false}
                        className="absolute inset-0 h-full w-full object-contain"
                        onLoad={handleImageLoad}
                        onError={() => setImageFailed(prev => ({ ...prev, [currentImageIndex]: true }))}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1, scale: isZoomed ? 1.5 : 1 }}
                        exit={{ opacity: 0 }}
                      />
                    </AnimatePresence>
                  </>
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
                  <div className="alsamos-scrollbar flex gap-2 overflow-x-auto pb-1">
                    {images.map((url, index) => (
                      <button
                        key={url + index}
                        type="button"
                        onClick={() => setCurrentImageIndex(index)}
                        className={cn(
                          'h-16 w-16 shrink-0 overflow-hidden rounded-xl border-2 bg-muted transition-all',
                          index === currentImageIndex ? 'border-foreground ring-2 ring-foreground/20' : 'border-border/30 opacity-70',
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

              {/* Desktopda galereya tagidagi joy bo'sh qolmasligi uchun. */}
              <div className="mt-6 hidden space-y-6 md:block">
                {descriptionBlock}
                {specsBlock}
              </div>
            </div>

            <div className="pb-36 md:sticky md:top-20 md:self-start md:pb-0">
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

                <div className="rounded-2xl border border-foreground/10 bg-foreground/[0.035] p-4">
                  <div className="flex flex-wrap items-baseline gap-2">
                    <span className="text-3xl font-extrabold tracking-tight text-foreground">
                      {formatPrice(displayPrice, currency)}
                    </span>
                    {hasDiscount && (
                      <>
                        <span className="text-sm text-muted-foreground line-through">
                          {formatPrice(displayCompareAt, currency)}
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
                        {isLowStock ? `Faqat ${stock} ta qoldi` : marketplaceUz.productDetail.inStock}
                      </span>
                    ) : (
                      <span className="rounded-md bg-muted px-2 py-1 text-muted-foreground">{marketplaceUz.productDetail.sold}</span>
                    )}
                    {product.is_negotiable && (
                      <span className="rounded-md bg-foreground/10 px-2 py-1 font-medium text-foreground">{marketplaceUz.productDetail.negotiable}</span>
                    )}
                  </div>
                </div>

                {variantsLoading ? (
                  <div className="space-y-2 rounded-2xl border border-border/40 p-3">
                    <div className="h-4 w-24 animate-pulse rounded bg-muted" />
                    <div className="flex gap-2">
                      {[0, 1, 2].map(item => (
                        <div key={item} className="h-9 w-20 animate-pulse rounded-xl bg-muted" />
                      ))}
                    </div>
                  </div>
                ) : variants.length > 0 ? (
                  <div className="space-y-4 rounded-2xl border border-border/40 bg-card p-3.5">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold">{marketplaceUz.productDetail.options}</p>
                        <p className="text-[11px] text-muted-foreground">
                          {marketplaceUz.productDetail.chooseVariant}
                        </p>
                      </div>
                      {selectedVariant?.sku && (
                        <span className="rounded-lg bg-muted px-2 py-1 text-[10px] font-medium text-muted-foreground">
                          SKU: {selectedVariant.sku}
                        </span>
                      )}
                    </div>

                    {variantOptionNames.map(name => {
                      const values = Array.from(
                        new Set(
                          variants
                            .map(variant => String(variant.options?.[name] ?? ''))
                            .filter(Boolean),
                        ),
                      );
                      return (
                        <div key={name} className="space-y-2">
                          <div className="flex items-center justify-between text-xs">
                            <span className="font-medium">{name}</span>
                            <span className="text-muted-foreground">{selectedOptions[name] || '—'}</span>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            {values.map(value => {
                              const valueVariants = variants.filter(
                                variant => String(variant.options?.[name] ?? '') === value,
                              );
                              const soldOutValue = valueVariants.every(
                                variant => Number(variant.quantity ?? 0) <= 0,
                              );
                              const selected = selectedOptions[name] === value;
                              return (
                                <button
                                  key={value}
                                  type="button"
                                  onClick={() => handleVariantOptionSelect(name, value)}
                                  disabled={soldOutValue}
                                  className={cn(
                                    'min-h-9 rounded-xl border px-3 py-1.5 text-xs font-medium transition-all',
                                    selected
                                      ? 'border-foreground bg-foreground/10 text-foreground ring-2 ring-foreground/10'
                                      : 'border-border/50 bg-background hover:border-foreground/50',
                                    soldOutValue && 'cursor-not-allowed opacity-40 line-through',
                                  )}
                                >
                                  {value}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : null}

                {!isSoldOut && (
                  <div className="flex items-center justify-between gap-4 rounded-2xl border border-border/40 p-3">
                    <div>
                      <p className="text-sm font-semibold">{marketplaceUz.productDetail.quantity}</p>
                      <p className="text-[11px] text-muted-foreground">{marketplaceUz.productDetail.warehouse(stock)}</p>
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
                        onClick={() => setQuantity(value => Math.min(stock, value + 1))}
                        disabled={quantity >= stock}
                      >
                        <Plus className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                )}

                <div className="rounded-2xl border border-border/40 bg-muted/20 p-3">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-sm text-muted-foreground">
                      {shippingApplies ? marketplaceUz.productDetail.productDeliveryTotal(quantity) : marketplaceUz.productDetail.total(quantity)}
                    </span>
                    <span className="text-lg font-extrabold text-foreground">
                      {formatPrice(grandTotal, currency)}
                    </span>
                  </div>
                  {shippingApplies && (
                    <div className="mt-1 flex justify-between text-[11px] text-muted-foreground">
                      <span>{marketplaceUz.productDetail.product}: {formatPrice(lineTotal, currency)}</span>
                      <span>{marketplaceUz.productDetail.delivery}: {formatPrice(shippingCost * quantity, currency)}</span>
                    </div>
                  )}
                </div>

                <div className="space-y-3 rounded-2xl border border-border/30 bg-muted/20 p-3">
                  <div className="flex items-start gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-foreground/10 text-foreground">
                      <CalendarClock className="h-5 w-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold">{marketplaceUz.productDetail.estimatedDelivery}</p>
                      <p className="text-xs text-muted-foreground">
                        {deliveryFrom} — {deliveryTo}
                        {distanceKm != null ? ` · ~${Math.round(distanceKm)} km` : ''}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-start gap-3 rounded-xl border border-border/30 bg-background/70 p-3">
                    <Navigation className="mt-0.5 h-4 w-4 shrink-0 text-foreground" />
                    <div className="min-w-0 flex-1">
                      <p className="text-[11px] font-medium text-muted-foreground">
                        {marketplaceUz.productDetail.deliveryTo}
                      </p>
                      <p className="mt-0.5 truncate text-sm font-semibold">
                        {deliveryLocation?.label || marketplaceUz.productDetail.deliveryLocationUnknown}
                      </p>
                      {deliveryLocationError && (
                        <p className="mt-1 text-[11px] text-destructive">{deliveryLocationError}</p>
                      )}
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-8 shrink-0 rounded-lg px-2 text-xs text-foreground"
                      onClick={() => void locateDelivery()}
                      disabled={isLocatingDelivery}
                    >
                      {isLocatingDelivery ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <LocateFixed className="mr-1 h-3.5 w-3.5" />
                      )}
                      {!isLocatingDelivery && marketplaceUz.productDetail.locateMe}
                    </Button>
                  </div>

                  {(product.location || product.seller?.location) && (
                    <div className="flex items-center gap-2 px-1 text-[11px] text-muted-foreground">
                      <MapPin className="h-3.5 w-3.5 shrink-0" />
                      <span className="truncate">
                        {marketplaceUz.productDetail.shipFrom}: {product.location || product.seller?.location}
                      </span>
                    </div>
                  )}
                </div>

                <div className="hidden md:flex md:flex-col md:gap-2">
                  {actionButtons}
                  {product.is_negotiable && (
                    <Button
                      variant="outline"
                      className="h-11 max-w-md rounded-xl"
                      disabled={!product.seller || !onMessageSeller}
                      onClick={() => product.seller && onMessageSeller?.(product.seller.user_id)}
                    >
                      <MessageCircle className="mr-2 h-4 w-4" /> {marketplaceUz.productDetail.makeOffer}
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
                        <AvatarFallback className="bg-foreground/10 font-bold text-foreground">
                          {(product.seller.business_name || '?')[0].toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <span className="truncate text-sm font-semibold">{product.seller.business_name}</span>
                          {product.seller.is_verified && <ShieldCheck className="h-4 w-4 text-foreground" />}
                        </div>
                        <div className="mt-0.5 flex items-center gap-2 text-[11px] text-muted-foreground">
                          <Store className="h-3 w-3" /> {product.seller.business_type}
                        </div>
                        <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-muted-foreground">
                          {sellerStatsLoading ? (
                            <span className="flex items-center gap-1">
                              <Loader2 className="h-3 w-3 animate-spin" />
                              {marketplaceUz.productDetail.responseStatsLoading}
                            </span>
                          ) : (
                            <>
                              <span className={cn(
                                'flex items-center gap-1',
                                (sellerResponseStats?.is_online || product.seller.profile?.is_online) &&
                                  'font-medium text-emerald-600',
                              )}>
                                <span className={cn(
                                  'h-1.5 w-1.5 rounded-full',
                                  (sellerResponseStats?.is_online || product.seller.profile?.is_online)
                                    ? 'bg-emerald-500'
                                    : 'bg-muted-foreground/40',
                                )} />
                                {sellerResponseStats?.is_online || product.seller.profile?.is_online
                                  ? marketplaceUz.productDetail.online
                                  : marketplaceUz.productDetail.offline}
                              </span>
                              {sellerResponseStats?.response_rate != null && (
                                <span>
                                  {marketplaceUz.productDetail.responseRate}: {Math.round(sellerResponseStats.response_rate)}%
                                </span>
                              )}
                              {sellerResponseStats?.average_response_minutes != null && (
                                <span className="flex items-center gap-1">
                                  <TimerReset className="h-3 w-3" />
                                  {formatResponseTime(sellerResponseStats.average_response_minutes)}
                                </span>
                              )}
                            </>
                          )}
                        </div>
                      </div>
                      <div className="flex gap-1.5">
                        {onMessageSeller && (
                          <Button variant="outline" size="icon" className="h-9 w-9 rounded-xl" onClick={() => onMessageSeller(product.seller!.user_id)}>
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

              </div>
            </div>
          </div>

      <div className="mx-auto w-full max-w-7xl px-4 pb-12 lg:px-6">
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(320px,0.42fr)] lg:items-start">
          <div className="space-y-6">
                {/* Mobil oqim: desktopda bular galereya tagida turadi. */}
                <div className="space-y-6 md:hidden">
                  {descriptionBlock}
                  {specsBlock}
                </div>

                <section className="space-y-4 rounded-2xl border border-border/30 bg-muted/10 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <h3 className="text-base font-semibold">{marketplaceUz.productDetail.reviewsTitle}</h3>
                      <p className="text-xs text-muted-foreground">
                        {marketplaceUz.productDetail.verifiedReviewHint}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 rounded-xl bg-background px-3 py-2 shadow-sm">
                      <Star className="h-5 w-5 fill-amber-400 text-amber-400" />
                      <div>
                        <p className="text-lg font-extrabold leading-none">
                          {reviewCount > 0 ? averageRating.toFixed(1) : '—'}
                        </p>
                        <p className="mt-1 text-[10px] text-muted-foreground">{marketplaceUz.productDetail.reviewCount(reviewCount)}</p>
                      </div>
                    </div>
                  </div>

                  {reviewEligibility === 'eligible' && (
                    <div className="space-y-3 rounded-xl border border-foreground/20 bg-foreground/[0.03] p-3">
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-sm font-semibold">{marketplaceUz.productDetail.rate}</p>
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
                        placeholder={marketplaceUz.productDetail.reviewTitlePlaceholder}
                        maxLength={120}
                        className="rounded-xl"
                      />
                      <Textarea
                        value={reviewContent}
                        onChange={event => setReviewContent(event.target.value)}
                        placeholder={marketplaceUz.productDetail.reviewContentPlaceholder}
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
                          <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> {marketplaceUz.productDetail.saving}</>
                        ) : (
                          marketplaceUz.productDetail.publishReview
                        )}
                      </Button>
                    </div>
                  )}

                  {reviewEligibility === 'already_reviewed' && (
                    <p className="rounded-xl bg-muted/40 p-3 text-xs text-muted-foreground">
                      {marketplaceUz.productDetail.alreadyReviewed}
                    </p>
                  )}
                  {reviewEligibility === 'not_delivered' && (
                    <p className="rounded-xl bg-muted/40 p-3 text-xs text-muted-foreground">
                      {marketplaceUz.productDetail.deliveredRequired}
                    </p>
                  )}
                  {reviewEligibility === 'signed_out' && (
                    <p className="rounded-xl bg-muted/40 p-3 text-xs text-muted-foreground">
                      {marketplaceUz.productDetail.signInReview}
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
                      {marketplaceUz.productDetail.noReviews}
                    </p>
                  )}
                </section>

                <div className="space-y-3">
                  <h3 className="text-sm font-semibold">{marketplaceUz.productDetail.related}</h3>
                  {relatedLoading ? (
                    <div className="flex gap-3 overflow-hidden">
                      {[0, 1, 2].map(item => <div key={item} className="h-52 w-40 shrink-0 animate-pulse rounded-2xl bg-muted" />)}
                    </div>
                  ) : relatedProducts.length > 0 ? (
                    <div className="alsamos-scrollbar -mx-4 flex gap-3 overflow-x-auto px-4 pb-2 md:mx-0 md:px-0">
                      {relatedProducts.map(related => (
                        <div key={related.id} className="w-40 shrink-0">
                          <ProductCard product={related} onSelect={openRelated} />
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground">{marketplaceUz.productDetail.noRelated}</p>
                  )}
                </div>

                {(recentlyViewedLoading || recentlyViewedProducts.length > 0) && (
                  <section className="space-y-3 rounded-2xl border border-border/30 bg-muted/10 p-4">
                    <div className="flex items-center gap-2">
                      <Clock className="h-4 w-4 text-foreground" />
                      <h3 className="text-sm font-semibold">{marketplaceUz.productDetail.recentlyViewed}</h3>
                    </div>
                    {recentlyViewedLoading ? (
                      <div className="flex gap-3 overflow-hidden">
                        {[0, 1, 2, 3].map(item => (
                          <div key={item} className="h-52 w-40 shrink-0 animate-pulse rounded-2xl bg-muted" />
                        ))}
                      </div>
                    ) : (
                      <div className="alsamos-scrollbar -mx-1 flex gap-3 overflow-x-auto px-1 pb-2">
                        {recentlyViewedProducts.map(recent => (
                          <div key={recent.id} className="w-40 shrink-0">
                            <ProductCard product={recent} onSelect={openRelated} />
                          </div>
                        ))}
                      </div>
                    )}
                  </section>
                )}

                <div className="flex items-center justify-between border-t border-border/30 pt-3 text-[11px] text-muted-foreground">
                  <span className="flex items-center gap-1.5"><Clock className="h-3 w-3" /> ID: {product.id.slice(0, 8)}</span>
                  <Button variant="ghost" size="sm" className="h-8 rounded-lg px-2 text-xs" onClick={copyProductId}>
                    <Copy className="mr-1.5 h-3.5 w-3.5" /> {marketplaceUz.productDetail.copy}
                  </Button>
                </div>

          </div>
          {/* Xarid xulosasi: faqat hisob-kitob. Tugmalar yuqoridagi o'ng ustunda
              turadi — bu yerga takrorlamang. */}
          <aside className="hidden space-y-4 lg:sticky lg:top-20 lg:block lg:self-start">
            <div className="rounded-2xl border border-border/30 bg-card p-4">
              <h3 className="text-sm font-semibold">{marketplaceUz.productDetail.purchaseSummary}</h3>
              <div className="mt-3 space-y-1.5 text-xs text-muted-foreground">
                <div className="flex items-center justify-between gap-3">
                  <span>{marketplaceUz.productDetail.product} × {quantity}</span>
                  <span className="font-medium text-foreground">{formatPrice(lineTotal, currency)}</span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span>{marketplaceUz.productDetail.delivery}</span>
                  <span className="font-medium text-foreground">
                    {shippingApplies
                      ? formatPrice(shippingCost * quantity, currency)
                      : marketplaceUz.productDetail.freeDelivery}
                  </span>
                </div>
              </div>
              <div className="mt-3 flex items-baseline justify-between gap-3 border-t border-border/30 pt-3">
                <span className="text-xs text-muted-foreground">{marketplaceUz.productDetail.total(quantity)}</span>
                <strong className="text-xl text-foreground">{formatPrice(grandTotal, currency)}</strong>
              </div>
              {inCartQty > 0 && onOpenCart && (
                <Button
                  variant="ghost"
                  className="mt-3 h-9 w-full rounded-xl text-xs text-foreground"
                  onClick={onOpenCart}
                >
                  <ShoppingCart className="mr-1.5 h-3.5 w-3.5" />
                  Savatda {inCartQty} dona — savatni ochish
                </Button>
              )}
            </div>
          </aside>
        </div>
      </div>

      <div className="fixed inset-x-0 bottom-[78px] z-40 flex justify-center border-t border-border/30 bg-background/92 px-4 pt-3 pb-3 backdrop-blur-2xl md:hidden">
            {actionButtons}
          </div>
    </div>
  );
}

function formatResponseTime(minutes: number) {
  const safe = Math.max(0, Math.round(minutes));
  if (safe < 1) return marketplaceUz.productDetail.respondsVeryFast;
  if (safe < 60) return marketplaceUz.productDetail.respondsInMinutes(safe);
  if (safe < 24 * 60) {
    const hours = Math.max(1, Math.round(safe / 60));
    return marketplaceUz.productDetail.respondsInHours(hours);
  }
  const days = Math.max(1, Math.round(safe / (24 * 60)));
  return marketplaceUz.productDetail.respondsInDays(days);
}


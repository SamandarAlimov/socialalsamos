import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  AlertTriangle,
  ChevronRight,
  ClipboardList,
  Crown,
  Flame,
  Grid3X3,
  Heart,
  LayoutDashboard,
  LayoutList,
  MapPin,
  Package,
  Plus,
  RotateCcw,
  Search,
  ShoppingBag,
  SlidersHorizontal,
  Sparkles,
  Store,
  X,
} from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import { useAuth } from '@/contexts/AuthContext';
import { useHapticFeedback } from '@/hooks/useHapticFeedback';
import { useIsMobile } from '@/hooks/use-mobile';
import {
  Product,
  useCart,
  useCategories,
  useNearbyMarketplaceProducts,
  useProducts,
  useSavedProducts,
  useSellerProducts,
} from '@/hooks/useMarketplace';
import { PullToRefresh } from '@/components/PullToRefresh';
import { ProductCard } from '@/components/marketplace/ProductCard';
import { BecomeSeller } from '@/components/marketplace/BecomeSeller';
import { CreateProductDialog } from '@/components/marketplace/CreateProductDialog';
import { CartSheet } from '@/components/marketplace/CartSheet';
import { SellerDashboard } from '@/components/marketplace/SellerDashboard';
import { OrdersView } from '@/components/marketplace/OrdersView';
import { SellerOrdersView } from '@/components/marketplace/SellerOrdersView';
import { SellerStorefront } from '@/components/marketplace/SellerStorefront';
import { VideoCommerceSection } from '@/components/marketplace/VideoCommerceSection';
import { CategoryIcon } from '@/components/marketplace/CategoryIcon';
import { MarketplaceBottomNav } from '@/components/marketplace/MarketplaceBottomNav';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Slider } from '@/components/ui/slider';
import { cn } from '@/lib/utils';
import { conditionLabel, formatPrice } from '@/lib/marketplace';
import { marketplaceUz } from '@/i18n/marketplace';
import '@/styles/marketplace-premium.css';

const SEARCH_DEBOUNCE_MS = 300;

type MarketplaceTab = 'browse' | 'orders' | 'selling' | 'saved';

function isMarketplaceTab(value: string | null): value is MarketplaceTab {
  return value === 'browse' || value === 'orders' || value === 'selling' || value === 'saved';
}

export default function MarketplacePage() {
  const isMobile = useIsMobile();
  const { user } = useAuth();
  const { triggerHaptic } = useHapticFeedback();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const initialTab = searchParams.get('tab');
  const [activeTab, setActiveTab] = useState<MarketplaceTab>(
    isMarketplaceTab(initialTab) ? initialTab : 'browse',
  );
  const [selectedCategory, setSelectedCategory] = useState(
    () => searchParams.get('category') || 'all',
  );
  const initialQuery = searchParams.get('q') || '';
  const [searchInput, setSearchInput] = useState(initialQuery);
  const [searchQuery, setSearchQuery] = useState(initialQuery);
  const [searchFocused, setSearchFocused] = useState(false);

  const [showCreateProduct, setShowCreateProduct] = useState(false);
  const [showCart, setShowCart] = useState(false);
  const [showDashboard, setShowDashboard] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [showCatalog, setShowCatalog] = useState(false);
  const [gridLayout, setGridLayout] = useState<'grid' | 'list'>('grid');
  const [sortBy, setSortBy] = useState('newest');
  const [priceRange, setPriceRange] = useState<[number, number] | null>(null);
  const [conditionFilter, setConditionFilter] = useState('all');
  const [inStockOnly, setInStockOnly] = useState(false);
  const [shippingOnly, setShippingOnly] = useState(false);
  const [selectedSellerId, setSelectedSellerId] = useState<string | null>(null);
  const [sellingView, setSellingView] = useState<'products' | 'orders'>('products');

  useEffect(() => {
    const tab = searchParams.get('tab');
    const next = isMarketplaceTab(tab) ? tab : 'browse';
    setActiveTab(current => (current === next ? current : next));
  }, [searchParams]);

  useEffect(() => {
    const nextCategory = searchParams.get('category') || 'all';
    setSelectedCategory(current => (current === nextCategory ? current : nextCategory));
    setSelectedSellerId(searchParams.get('seller'));

    const q = searchParams.get('q') || '';
    setSearchInput(current => (current === q ? current : q));
  }, [searchParams]);

  useEffect(() => {
    const productId = searchParams.get('product');
    if (productId) navigate(`/marketplace/product/${productId}`, { replace: true });
  }, [navigate, searchParams]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const query = searchInput.trim();
      setSearchQuery(query);

      const current = searchParams.get('q') || '';
      if (current === query) return;

      const next = new URLSearchParams(searchParams);
      if (query) next.set('q', query);
      else next.delete('q');
      setSearchParams(next, { replace: true });
    }, SEARCH_DEBOUNCE_MS);

    return () => window.clearTimeout(timer);
  }, [searchInput, searchParams, setSearchParams]);

  const selectTab = useCallback((tab: MarketplaceTab) => {
    triggerHaptic('light');
    setActiveTab(tab);
    const next = new URLSearchParams(searchParams);
    if (tab === 'browse') next.delete('tab');
    else next.set('tab', tab);
    setSearchParams(next, { replace: true });
    setSearchFocused(false);
  }, [searchParams, setSearchParams, triggerHaptic]);

  const { categories } = useCategories();
  const {
    products: catalogueProducts,
    isLoading: catalogueLoading,
    error: catalogueError,
    refresh: refreshCatalogue,
  } = useProducts(selectedCategory, searchQuery);

  const nearLatParam = searchParams.get('lat');
  const nearLngParam = searchParams.get('lng');
  const nearRadiusParam = searchParams.get('near');
  const nearLat = nearLatParam == null ? Number.NaN : Number(nearLatParam);
  const nearLng = nearLngParam == null ? Number.NaN : Number(nearLngParam);
  const nearRadiusRaw = nearRadiusParam == null ? Number.NaN : Number(nearRadiusParam);
  const nearCenter =
    Number.isFinite(nearLat) &&
    Number.isFinite(nearLng) &&
    Math.abs(nearLat) <= 90 &&
    Math.abs(nearLng) <= 180
      ? { latitude: nearLat, longitude: nearLng }
      : null;
  const nearRadiusKm =
    Number.isFinite(nearRadiusRaw) && nearRadiusRaw > 0 ? Math.min(50, nearRadiusRaw) : 5;

  const nearbyProducts = useNearbyMarketplaceProducts(nearCenter, nearRadiusKm);
  const products = nearCenter ? nearbyProducts.products : catalogueProducts;
  const productsLoading = nearCenter ? nearbyProducts.isLoading : catalogueLoading;
  const productsError = nearCenter ? nearbyProducts.error : catalogueError;
  const refreshProducts = nearCenter ? nearbyProducts.refresh : refreshCatalogue;

  const {
    products: sellerProducts,
    seller,
    isLoading: sellerLoading,
    refresh: refreshSeller,
  } = useSellerProducts();
  const {
    products: savedProducts,
    isLoading: savedLoading,
    refresh: refreshSaved,
  } = useSavedProducts();
  const { itemCount } = useCart();

  const handleRefresh = useCallback(async () => {
    if (activeTab === 'browse') await refreshProducts();
    else if (activeTab === 'selling') await refreshSeller();
    else if (activeTab === 'saved') await refreshSaved();
  }, [activeTab, refreshProducts, refreshSaved, refreshSeller]);

  const handleCategorySelect = useCallback((slug: string) => {
    triggerHaptic('light');
    setSelectedCategory(slug);
    setActiveTab('browse');
    setShowCatalog(false);

    const next = new URLSearchParams(searchParams);
    next.delete('tab');
    if (slug === 'all') next.delete('category');
    else next.set('category', slug);
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams, triggerHaptic]);

  const handleProductSelect = useCallback((product: Product) => {
    triggerHaptic('light');
    navigate(`/marketplace/product/${product.id}`);
  }, [navigate, triggerHaptic]);

  const handleOrderProductSelect = useCallback((productId: string) => {
    triggerHaptic('light');
    navigate(`/marketplace/product/${productId}`);
  }, [navigate, triggerHaptic]);

  const maxProductPrice = useMemo(
    () => products.reduce((max, product) => Math.max(max, Number(product.price) || 0), 0),
    [products],
  );

  const sliderMax = useMemo(() => {
    if (maxProductPrice <= 0) return 1000;
    const step = Math.pow(10, Math.max(1, String(Math.round(maxProductPrice)).length - 2));
    return Math.ceil(maxProductPrice / step) * step;
  }, [maxProductPrice]);

  const activeRange = priceRange ?? [0, sliderMax];
  const availableConditions = useMemo(
    () => Array.from(new Set(products.map(product => product.condition).filter(Boolean))),
    [products],
  );

  const sortedProducts = useMemo(() => {
    const filtered = products.filter(product => {
      if (priceRange && (product.price < activeRange[0] || product.price > activeRange[1])) return false;
      if (conditionFilter !== 'all' && product.condition !== conditionFilter) return false;
      if (inStockOnly && Number(product.quantity) <= 0) return false;
      if (shippingOnly && !product.shipping_available) return false;
      return true;
    });

    return [...filtered].sort((a, b) => {
      switch (sortBy) {
        case 'price_low':
          return a.price - b.price;
        case 'price_high':
          return b.price - a.price;
        case 'popular':
          return (b.likes_count ?? 0) - (a.likes_count ?? 0);
        default:
          return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      }
    });
  }, [
    activeRange,
    conditionFilter,
    inStockOnly,
    priceRange,
    products,
    shippingOnly,
    sortBy,
  ]);

  const activeFilterCount =
    (priceRange ? 1 : 0) +
    (conditionFilter !== 'all' ? 1 : 0) +
    (inStockOnly ? 1 : 0) +
    (shippingOnly ? 1 : 0) +
    (sortBy !== 'newest' ? 1 : 0);

  const resetFilters = useCallback(() => {
    setPriceRange(null);
    setConditionFilter('all');
    setInStockOnly(false);
    setShippingOnly(false);
    setSortBy('newest');
  }, []);

  const featuredProducts = useMemo(
    () => products.filter(product => product.is_featured),
    [products],
  );
  const trendingProducts = useMemo(
    () =>
      [...products]
        .sort((a, b) => (b.views_count ?? 0) - (a.views_count ?? 0))
        .slice(0, 10),
    [products],
  );

  const searchSuggestions = useMemo(() => {
    if (!searchInput.trim()) return [];
    return sortedProducts.slice(0, 6);
  }, [searchInput, sortedProducts]);

  const categorySuggestions = useMemo(() => {
    const query = searchInput.trim().toLocaleLowerCase();
    if (!query) return [];
    return categories
      .filter(category => category.name.toLocaleLowerCase().includes(query))
      .slice(0, 4);
  }, [categories, searchInput]);

  const desktopTabs: Array<{ id: MarketplaceTab; label: string; icon: typeof Store }> = [
    { id: 'browse', label: 'Bozor', icon: Store },
    { id: 'orders', label: 'Buyurtmalar', icon: ClipboardList },
    { id: 'saved', label: 'Saqlangan', icon: Heart },
    { id: 'selling', label: 'Sotuvchi markazi', icon: Package },
  ];

  const sellerViews = [
    { id: 'products' as const, label: 'Mahsulotlar', icon: Package },
    { id: 'orders' as const, label: 'Buyurtmalar', icon: ClipboardList },
  ];

  const filtersPanel = (
    <div className="space-y-6">
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold">Saralash</p>
          {activeFilterCount > 0 && (
            <button
              type="button"
              onClick={resetFilters}
              className="text-xs font-semibold text-muted-foreground transition hover:text-foreground"
            >
              Tiklash
            </button>
          )}
        </div>
        <div className="grid grid-cols-2 gap-2">
          {[
            { id: 'newest', label: 'Eng yangi' },
            { id: 'popular', label: 'Mashhur' },
            { id: 'price_low', label: 'Arzon → Qimmat' },
            { id: 'price_high', label: 'Qimmat → Arzon' },
          ].map(option => (
            <button
              key={option.id}
              type="button"
              onClick={() => setSortBy(option.id)}
              className={cn(
                'min-h-10 rounded-xl border px-3 py-2 text-xs font-semibold transition',
                sortBy === option.id
                  ? 'border-foreground bg-foreground text-background'
                  : 'border-border/60 bg-background hover:border-foreground/30',
              )}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-3">
        <p className="text-sm font-semibold">Holati</p>
        <div className="flex flex-wrap gap-2">
          <FilterChip
            active={conditionFilter === 'all'}
            onClick={() => setConditionFilter('all')}
            label="Barchasi"
          />
          {availableConditions.map(condition => (
            <FilterChip
              key={condition}
              active={conditionFilter === condition}
              onClick={() => setConditionFilter(condition)}
              label={conditionLabel(condition)}
            />
          ))}
        </div>
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm font-semibold">Narx</p>
          <span className="text-[11px] text-muted-foreground">
            {formatPrice(activeRange[0])} — {formatPrice(activeRange[1])}
          </span>
        </div>
        <Slider
          value={activeRange}
          min={0}
          max={sliderMax}
          step={Math.max(1, Math.round(sliderMax / 100))}
          onValueChange={value => setPriceRange([value[0], value[1]])}
        />
        {priceRange && (
          <button
            type="button"
            onClick={() => setPriceRange(null)}
            className="text-xs font-semibold text-muted-foreground hover:text-foreground"
          >
            Narx filtrini tozalash
          </button>
        )}
      </div>

      <div className="space-y-2">
        <ToggleRow
          checked={inStockOnly}
          onChange={setInStockOnly}
          label="Faqat omborda bor"
          description="Sotilib ketgan e’lonlarni yashiradi"
        />
        <ToggleRow
          checked={shippingOnly}
          onChange={setShippingOnly}
          label="Yetkazib berish mavjud"
          description="Yetkazish yoqilgan mahsulotlar"
        />
      </div>
    </div>
  );

  const browseContent = (
    <div className="min-w-0 space-y-6">
      {nearCenter && (
        <div className="flex min-w-0 items-center gap-2 rounded-2xl border border-border/60 bg-muted/30 px-3 py-2.5 text-sm">
          <MapPin className="h-4 w-4 shrink-0 text-muted-foreground" />
          <span className="min-w-0 flex-1 truncate">
            Xaritadagi nuqtadan {nearRadiusKm} km ichidagi e’lonlar
          </span>
          <button
            type="button"
            className="shrink-0 text-xs font-bold text-foreground"
            onClick={() => {
              const next = new URLSearchParams(searchParams);
              next.delete('lat');
              next.delete('lng');
              next.delete('near');
              setSearchParams(next, { replace: true });
            }}
          >
            Barchasi
          </button>
        </div>
      )}

      <section className="space-y-3 lg:hidden">
        <SectionHeading title="Kategoriyalar" action="Barchasi" onAction={() => setShowCatalog(true)} />
        <div className="marketplace-x-rail -mx-4 flex gap-3 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0">
          <CategoryTile
            active={selectedCategory === 'all'}
            label="Barchasi"
            icon={<Sparkles className="h-5 w-5" />}
            onClick={() => handleCategorySelect('all')}
          />
          {categories.map(category => (
            <CategoryTile
              key={category.id}
              active={selectedCategory === category.slug}
              label={category.name}
              icon={<CategoryIcon slug={category.slug} name={category.name} className="h-5 w-5" />}
              onClick={() => handleCategorySelect(category.slug)}
            />
          ))}
        </div>
      </section>

      {featuredProducts.length > 0 && selectedCategory === 'all' && !searchQuery && (
        <section className="relative overflow-hidden rounded-[28px] border border-border/60 bg-card">
          <div className="absolute inset-0 bg-gradient-to-br from-muted/80 via-background to-background" />
          <div className="relative grid min-w-0 gap-5 p-5 sm:grid-cols-[minmax(0,1fr)_180px] sm:items-center lg:p-7">
            <div className="min-w-0">
              <div className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.14em] text-muted-foreground">
                <Crown className="h-4 w-4" />
                Tanlangan
              </div>
              <h2 className="max-w-xl text-xl font-extrabold tracking-tight sm:text-2xl">
                Ishonchli savdo, bitta qulay bozorda
              </h2>
              <p className="mt-2 max-w-xl text-sm leading-relaxed text-muted-foreground">
                Oziq-ovqatdan elektronikagacha, avtomobildan uy-ro‘zg‘or buyumlarigacha — keraklisini tez toping.
              </p>
              <Button
                className="mt-4 rounded-xl"
                onClick={() => handleProductSelect(featuredProducts[0])}
              >
                Tanlangan mahsulot
                <ChevronRight className="ml-1 h-4 w-4" />
              </Button>
            </div>
            {featuredProducts[0]?.images?.[0]?.url && (
              <button
                type="button"
                onClick={() => handleProductSelect(featuredProducts[0])}
                className="mx-auto aspect-square w-full max-w-[180px] overflow-hidden rounded-2xl bg-muted shadow-xl"
                aria-label={featuredProducts[0].title}
              >
                <MarketplaceProductImage product={featuredProducts[0]} className="h-full w-full object-cover" />
              </button>
            )}
          </div>
        </section>
      )}

      {trendingProducts.length > 0 && selectedCategory === 'all' && !searchQuery && (
        <section className="space-y-3">
          <SectionHeading
            title="Hozir ommabop"
            icon={<Flame className="h-4 w-4" />}
            action="Ko‘proq"
            onAction={() => setSortBy('popular')}
          />
          <div className="marketplace-x-rail -mx-4 flex gap-3 overflow-x-auto px-4 pb-2 sm:mx-0 sm:px-0">
            {trendingProducts.map(product => (
              <button
                type="button"
                key={product.id}
                className="w-[46vw] min-w-[154px] max-w-[190px] shrink-0 snap-start text-left sm:w-44"
                onClick={() => handleProductSelect(product)}
              >
                <div className="aspect-square overflow-hidden rounded-2xl border border-border/40 bg-muted">
                  <MarketplaceProductImage
                    product={product}
                    className="h-full w-full object-cover transition duration-500 hover:scale-105"
                  />
                </div>
                <p className="mt-2 line-clamp-1 text-xs font-semibold">{product.title}</p>
                <p className="mt-0.5 text-sm font-extrabold tabular-nums">
                  {formatPrice(product.price, product.currency)}
                </p>
              </button>
            ))}
          </div>
        </section>
      )}

      {selectedCategory === 'all' && !searchQuery && (
        <VideoCommerceSection onProductSelect={handleProductSelect} />
      )}

      <div className="flex min-w-0 items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground">Natijalar</p>
          <p className="truncate text-sm font-bold">
            {sortedProducts.length} ta mahsulot
            {activeFilterCount > 0 && (
              <span className="ml-1.5 font-medium text-muted-foreground">
                · {activeFilterCount} filtr
              </span>
            )}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1 rounded-xl border border-border/50 bg-muted/30 p-1">
          <Button
            variant="ghost"
            size="icon"
            className={cn('h-8 w-8 rounded-lg', gridLayout === 'grid' && 'bg-background shadow-sm')}
            onClick={() => setGridLayout('grid')}
            aria-label="Katak ko‘rinishi"
          >
            <Grid3X3 className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className={cn('h-8 w-8 rounded-lg', gridLayout === 'list' && 'bg-background shadow-sm')}
            onClick={() => setGridLayout('list')}
            aria-label="Ro‘yxat ko‘rinishi"
          >
            <LayoutList className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {productsError ? (
        <EmptyState
          icon={<AlertTriangle className="h-14 w-14" />}
          title={marketplaceUz.page.loadFailed}
          description={productsError}
          action={
            <Button variant="outline" className="rounded-xl" onClick={() => refreshProducts()}>
              <RotateCcw className="mr-2 h-4 w-4" />
              Qayta urinish
            </Button>
          }
        />
      ) : productsLoading ? (
        <ProductSkeletonGrid layout={gridLayout} />
      ) : sortedProducts.length > 0 ? (
        <div
          className={cn(
            'min-w-0 gap-3 sm:gap-4',
            gridLayout === 'grid'
              ? 'grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4'
              : 'grid grid-cols-1',
          )}
        >
          {sortedProducts.map((product, index) => (
            <motion.div
              key={product.id}
              className="min-w-0"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: Math.min(index, 6) * 0.025, duration: 0.2 }}
            >
              <ProductCard
                product={product}
                onSelect={handleProductSelect}
                onLikeChange={refreshProducts}
                layout={gridLayout}
              />
            </motion.div>
          ))}
        </div>
      ) : (
        <EmptyState
          icon={<Package className="h-14 w-14" />}
          title="Mahsulot topilmadi"
          description={
            searchQuery
              ? 'So‘rovni qisqartiring yoki boshqa kategoriya tanlang.'
              : activeFilterCount > 0
                ? 'Filtrlarni yumshatib ko‘ring.'
                : 'Bu bo‘limda hali mahsulot yo‘q.'
          }
          action={
            activeFilterCount > 0 ? (
              <Button variant="outline" className="rounded-xl" onClick={resetFilters}>
                Filtrlarni tozalash
              </Button>
            ) : undefined
          }
        />
      )}
    </div>
  );

  const pageContent = (
    <div className="marketplace-neutral min-h-screen min-w-0 overflow-x-clip bg-background pb-32 md:pb-8">
      <header className="sticky top-0 z-40 border-b border-border/40 bg-background/92 backdrop-blur-2xl">
        <div className="mx-auto w-full max-w-7xl min-w-0 px-4 py-3 lg:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <div className="hidden min-w-0 items-center gap-3 md:flex">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-foreground text-background">
                <Store className="h-5 w-5" />
              </span>
              <div className="min-w-0">
                <h1 className="truncate text-lg font-extrabold tracking-tight">Alsamos Bozor</h1>
                <p className="truncate text-[11px] text-muted-foreground">Xavfsiz savdo · keng katalog</p>
              </div>
            </div>

            <div className="relative min-w-0 flex-1 md:mx-3">
              <Search className="pointer-events-none absolute left-3.5 top-1/2 z-10 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                type="search"
                inputMode="search"
                value={searchInput}
                onChange={event => setSearchInput(event.target.value)}
                onFocus={() => setSearchFocused(true)}
                onKeyDown={event => {
                  if (event.key === 'Escape') {
                    setSearchFocused(false);
                    event.currentTarget.blur();
                  }
                }}
                placeholder="Mahsulot, brend yoki turkum qidiring"
                aria-label="Marketplace qidiruvi"
                className="h-11 w-full rounded-2xl border-border/60 bg-muted/45 pl-10 pr-10 text-sm shadow-none transition focus:bg-background"
              />
              {searchInput && (
                <button
                  type="button"
                  aria-label="Qidiruvni tozalash"
                  className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                  onMouseDown={event => event.preventDefault()}
                  onClick={() => setSearchInput('')}
                >
                  <X className="h-4 w-4" />
                </button>
              )}

              <AnimatePresence>
                {searchFocused && searchInput.trim() && (
                  <motion.div
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -4 }}
                    className="absolute inset-x-0 top-[calc(100%+8px)] z-50 max-h-[60vh] overflow-y-auto rounded-2xl border border-border/60 bg-background p-2 shadow-2xl"
                  >
                    {categorySuggestions.length > 0 && (
                      <div className="border-b border-border/40 pb-2">
                        <p className="px-2 pb-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                          Turkumlar
                        </p>
                        {categorySuggestions.map(category => (
                          <button
                            type="button"
                            key={category.id}
                            className="flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left hover:bg-muted/60"
                            onMouseDown={event => event.preventDefault()}
                            onClick={() => {
                              handleCategorySelect(category.slug);
                              setSearchInput('');
                              setSearchFocused(false);
                            }}
                          >
                            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-muted">
                              <CategoryIcon slug={category.slug} name={category.name} />
                            </span>
                            <span className="text-sm font-semibold">{category.name}</span>
                          </button>
                        ))}
                      </div>
                    )}
                    <div className="pt-2">
                      <p className="px-2 pb-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                        Mahsulotlar
                      </p>
                      {searchSuggestions.length > 0 ? (
                        searchSuggestions.map(product => (
                          <button
                            type="button"
                            key={product.id}
                            className="flex w-full min-w-0 items-center gap-3 rounded-xl px-2 py-2 text-left hover:bg-muted/60"
                            onMouseDown={event => event.preventDefault()}
                            onClick={() => {
                              setSearchFocused(false);
                              handleProductSelect(product);
                            }}
                          >
                            <span className="h-10 w-10 shrink-0 overflow-hidden rounded-xl bg-muted">
                              <MarketplaceProductImage product={product} className="h-full w-full object-cover" />
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-sm font-semibold">{product.title}</span>
                              <span className="block text-xs font-bold text-muted-foreground">
                                {formatPrice(product.price, product.currency)}
                              </span>
                            </span>
                          </button>
                        ))
                      ) : (
                        <p className="px-2 py-4 text-center text-xs text-muted-foreground">
                          Natija topilmadi
                        </p>
                      )}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            <Button
              variant="outline"
              size="icon"
              className={cn(
                'relative h-11 w-11 shrink-0 rounded-2xl',
                activeFilterCount > 0 && 'border-foreground/30 bg-foreground text-background',
              )}
              onClick={() => setShowFilters(true)}
              aria-label="Filtrlar"
            >
              <SlidersHorizontal className="h-4 w-4" />
              {activeFilterCount > 0 && (
                <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-destructive px-1 text-[9px] font-bold text-destructive-foreground">
                  {activeFilterCount}
                </span>
              )}
            </Button>

            <Button
              variant="outline"
              size="icon"
              className="relative hidden h-11 w-11 shrink-0 rounded-2xl sm:inline-flex"
              onClick={() => setShowCart(true)}
              aria-label="Savat"
            >
              <ShoppingBag className="h-4 w-4" />
              {itemCount > 0 && (
                <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-foreground px-1 text-[9px] font-bold text-background">
                  {itemCount > 99 ? '99+' : itemCount}
                </span>
              )}
            </Button>

            <Button
              className="hidden h-11 shrink-0 rounded-2xl md:inline-flex"
              onClick={() => selectTab('selling')}
            >
              <Plus className="mr-1.5 h-4 w-4" />
              Sotish
            </Button>
          </div>

          <nav className="mt-3 hidden items-center gap-5 md:flex" aria-label="Marketplace bo‘limlari">
            {desktopTabs.map(tab => {
              const Icon = tab.icon;
              const active = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => selectTab(tab.id)}
                  className={cn(
                    'relative flex items-center gap-1.5 py-2 text-sm font-semibold transition',
                    active ? 'text-foreground' : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  <Icon className="h-4 w-4" />
                  {tab.label}
                  {active && <span className="absolute inset-x-0 -bottom-[13px] h-0.5 rounded-full bg-foreground" />}
                </button>
              );
            })}
          </nav>
        </div>
      </header>

      <main className="mx-auto w-full max-w-7xl min-w-0 px-4 py-5 lg:px-6">
        <AnimatePresence mode="wait">
          {activeTab === 'browse' && (
            <motion.div
              key="browse"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="grid min-w-0 gap-6 lg:grid-cols-[250px_minmax(0,1fr)]"
            >
              <aside className="hidden min-w-0 lg:block">
                <div className="sticky top-32 space-y-5">
                  <section className="rounded-3xl border border-border/50 bg-card p-3">
                    <div className="flex items-center justify-between px-2 pb-2">
                      <p className="text-sm font-extrabold">Katalog</p>
                      <span className="text-[10px] text-muted-foreground">{categories.length} turkum</span>
                    </div>
                    <div className="max-h-[38vh] space-y-1 overflow-y-auto pr-1">
                      <CategoryListButton
                        active={selectedCategory === 'all'}
                        label="Barcha mahsulotlar"
                        icon={<Sparkles className="h-4 w-4" />}
                        onClick={() => handleCategorySelect('all')}
                      />
                      {categories.map(category => (
                        <CategoryListButton
                          key={category.id}
                          active={selectedCategory === category.slug}
                          label={category.name}
                          icon={<CategoryIcon slug={category.slug} name={category.name} />}
                          onClick={() => handleCategorySelect(category.slug)}
                        />
                      ))}
                    </div>
                  </section>

                  <section className="rounded-3xl border border-border/50 bg-card p-4">
                    <div className="mb-4 flex items-center gap-2">
                      <SlidersHorizontal className="h-4 w-4" />
                      <p className="text-sm font-extrabold">Filtrlar</p>
                      {activeFilterCount > 0 && (
                        <span className="ml-auto rounded-full bg-foreground px-2 py-0.5 text-[10px] font-bold text-background">
                          {activeFilterCount}
                        </span>
                      )}
                    </div>
                    {filtersPanel}
                  </section>
                </div>
              </aside>

              {browseContent}
            </motion.div>
          )}

          {activeTab === 'orders' && (
            <motion.section
              key="orders"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="min-w-0"
            >
              <PageTitle title="Buyurtmalar" subtitle="Xaridlaringiz holatini bir joyda kuzating." />
              {!user ? (
                <EmptyState
                  icon={<ClipboardList className="h-14 w-14" />}
                  title="Kirish talab qilinadi"
                  description="Buyurtmalaringizni ko‘rish uchun hisobga kiring."
                />
              ) : (
                <OrdersView onProductSelect={handleOrderProductSelect} />
              )}
            </motion.section>
          )}

          {activeTab === 'selling' && (
            <motion.section
              key="selling"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="min-w-0"
            >
              <PageTitle title="Sotuvchi markazi" subtitle="Mahsulot, buyurtma va savdo boshqaruvi." />
              {!user ? (
                <EmptyState
                  icon={<Store className="h-14 w-14" />}
                  title="Kirish talab qilinadi"
                  description="Sotishni boshlash uchun hisobga kiring."
                />
              ) : !seller ? (
                <BecomeSeller onSuccess={refreshSeller} />
              ) : showDashboard ? (
                <div className="space-y-4">
                  <Button variant="outline" className="rounded-xl" onClick={() => setShowDashboard(false)}>
                    Orqaga
                  </Button>
                  <SellerDashboard onClose={() => setShowDashboard(false)} />
                </div>
              ) : (
                <div className="space-y-5">
                  <div className="overflow-hidden rounded-3xl border border-border/60 bg-card">
                    <div className="flex min-w-0 items-center justify-between gap-3 border-b border-border/50 px-4 py-4">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-extrabold">{seller.business_name}</p>
                        <p className="text-xs text-muted-foreground">Sotuvchi markazi</p>
                      </div>
                      <Button variant="outline" size="sm" className="shrink-0 rounded-xl" onClick={() => setShowDashboard(true)}>
                        <LayoutDashboard className="mr-1.5 h-4 w-4" />
                        Analitika
                      </Button>
                    </div>
                    <div className="grid grid-cols-3 divide-x divide-border/50">
                      {[
                        { value: sellerProducts.length, label: 'Mahsulotlar' },
                        { value: seller.total_sales ?? 0, label: 'Sotuvlar' },
                        { value: (seller.rating ?? 0) > 0 ? seller.rating.toFixed(1) : '—', label: 'Reyting' },
                      ].map(stat => (
                        <div key={stat.label} className="min-w-0 px-2 py-4 text-center">
                          <p className="truncate text-xl font-extrabold tabular-nums">{stat.value}</p>
                          <p className="truncate text-[10px] text-muted-foreground">{stat.label}</p>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="inline-flex rounded-2xl border border-border/60 bg-muted/30 p-1">
                    {sellerViews.map(view => {
                      const Icon = view.icon;
                      return (
                        <button
                          key={view.id}
                          type="button"
                          onClick={() => setSellingView(view.id)}
                          className={cn(
                            'flex items-center gap-1.5 rounded-xl px-4 py-2.5 text-sm font-semibold transition',
                            sellingView === view.id
                              ? 'bg-background text-foreground shadow-sm'
                              : 'text-muted-foreground',
                          )}
                        >
                          <Icon className="h-4 w-4" />
                          {view.label}
                        </button>
                      );
                    })}
                  </div>

                  {sellingView === 'orders' ? (
                    <SellerOrdersView />
                  ) : (
                    <>
                      <div className="flex flex-wrap gap-2">
                        <Button className="rounded-xl" onClick={() => setShowCreateProduct(true)}>
                          <Plus className="mr-2 h-4 w-4" />
                          Mahsulot qo‘shish
                        </Button>
                        <Button variant="outline" className="rounded-xl" onClick={() => setShowDashboard(true)}>
                          <LayoutDashboard className="mr-2 h-4 w-4" />
                          Dashboard
                        </Button>
                      </div>

                      {sellerLoading ? (
                        <ProductSkeletonGrid layout="grid" />
                      ) : sellerProducts.length > 0 ? (
                        <div className="grid min-w-0 grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                          {sellerProducts.map(product => (
                            <div key={product.id} className="min-w-0">
                              <ProductCard product={product} onSelect={handleProductSelect} />
                            </div>
                          ))}
                        </div>
                      ) : (
                        <EmptyState
                          icon={<Package className="h-12 w-12" />}
                          title="Mahsulotlar yo‘q"
                          description="Birinchi mahsulotingizni joylang."
                        />
                      )}
                    </>
                  )}
                </div>
              )}
            </motion.section>
          )}

          {activeTab === 'saved' && (
            <motion.section
              key="saved"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="min-w-0"
            >
              <PageTitle title="Saqlangan" subtitle="Keyinroq ko‘rish uchun belgilagan mahsulotlaringiz." />
              {!user ? (
                <EmptyState
                  icon={<Heart className="h-14 w-14" />}
                  title="Kirish talab qilinadi"
                  description="Saqlangan mahsulotlarni ko‘rish uchun hisobga kiring."
                />
              ) : savedLoading ? (
                <ProductSkeletonGrid layout="grid" />
              ) : savedProducts.length > 0 ? (
                <div className="grid min-w-0 grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
                  {savedProducts.map(product => (
                    <div key={product.id} className="min-w-0">
                      <ProductCard
                        product={product}
                        onSelect={handleProductSelect}
                        onLikeChange={refreshSaved}
                      />
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyState
                  icon={<Heart className="h-14 w-14" />}
                  title="Hali saqlangan mahsulot yo‘q"
                  description="Yurak belgisini bosgan mahsulotlaringiz shu yerda paydo bo‘ladi."
                />
              )}
            </motion.section>
          )}
        </AnimatePresence>
      </main>

      <MarketplaceBottomNav
        activeTab={activeTab}
        itemCount={itemCount}
        savedCount={savedProducts.length}
        onBrowse={() => selectTab('browse')}
        onCatalog={() => setShowCatalog(true)}
        onCart={() => setShowCart(true)}
        onSaved={() => selectTab('saved')}
        onOrders={() => selectTab('orders')}
      />

      <CreateProductDialog
        open={showCreateProduct}
        onOpenChange={setShowCreateProduct}
        onSuccess={() => {
          void refreshSeller();
          void refreshProducts();
        }}
      />
      <CartSheet open={showCart} onOpenChange={setShowCart} />
      <SellerStorefront
        sellerId={selectedSellerId}
        onMessageSeller={userId => navigate(`/messages?user=${userId}`)}
        onClose={() => {
          setSelectedSellerId(null);
          if (searchParams.has('seller')) {
            const next = new URLSearchParams(searchParams);
            next.delete('seller');
            setSearchParams(next, { replace: true });
          }
        }}
        onProductSelect={handleProductSelect}
      />

      <Sheet open={showCatalog} onOpenChange={setShowCatalog}>
        <SheetContent
          side="bottom"
          className="max-h-[88dvh] rounded-t-[30px] border-x border-t border-border/60 px-4 pb-[calc(1rem+env(safe-area-inset-bottom))]"
        >
          <SheetHeader className="text-left">
            <SheetTitle>Katalog</SheetTitle>
            <p className="text-xs text-muted-foreground">
              Kerakli turkumni tanlang — qidiruv va filtrlar shu katalogga moslashadi.
            </p>
          </SheetHeader>
          <div className="mt-4 grid grid-cols-2 gap-2 overflow-y-auto pb-4 sm:grid-cols-3">
            <CategoryListButton
              active={selectedCategory === 'all'}
              label="Barcha mahsulotlar"
              icon={<Sparkles className="h-4 w-4" />}
              onClick={() => handleCategorySelect('all')}
            />
            {categories.map(category => (
              <CategoryListButton
                key={category.id}
                active={selectedCategory === category.slug}
                label={category.name}
                icon={<CategoryIcon slug={category.slug} name={category.name} />}
                onClick={() => handleCategorySelect(category.slug)}
              />
            ))}
          </div>
        </SheetContent>
      </Sheet>

      <Sheet open={showFilters} onOpenChange={setShowFilters}>
        <SheetContent
          side={isMobile ? 'bottom' : 'right'}
          className={cn(
            'p-0',
            isMobile
              ? 'max-h-[90dvh] rounded-t-[30px] border-x border-t border-border/60'
              : 'w-[420px] border-l border-border/60 sm:max-w-[420px]',
          )}
        >
          <SheetHeader className="border-b border-border/50 px-5 py-4 text-left">
            <SheetTitle>Filtr va saralash</SheetTitle>
            <p className="text-xs text-muted-foreground">
              Natijalarni sizga mos holatga keltiring.
            </p>
          </SheetHeader>
          <div className="max-h-[calc(90dvh-82px)] overflow-y-auto px-5 py-5">
            {filtersPanel}
            <div className="sticky bottom-0 mt-6 grid grid-cols-2 gap-2 border-t border-border/50 bg-background pt-4">
              <Button variant="outline" className="h-11 rounded-xl" onClick={resetFilters}>
                Tiklash
              </Button>
              <Button className="h-11 rounded-xl" onClick={() => setShowFilters(false)}>
                {sortedProducts.length} natijani ko‘rish
              </Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );

  if (isMobile) {
    return (
      <PullToRefresh onRefresh={handleRefresh} className="h-full">
        {pageContent}
      </PullToRefresh>
    );
  }

  return pageContent;
}

function FilterChip({
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'rounded-full border px-3 py-1.5 text-xs font-semibold transition',
        active
          ? 'border-foreground bg-foreground text-background'
          : 'border-border/60 bg-background text-muted-foreground hover:text-foreground',
      )}
    >
      {label}
    </button>
  );
}

function ToggleRow({
  checked,
  label,
  description,
  onChange,
}: {
  checked: boolean;
  label: string;
  description: string;
  onChange: (value: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="flex w-full items-center justify-between gap-3 rounded-2xl border border-border/50 bg-background p-3 text-left"
    >
      <span className="min-w-0">
        <span className="block text-sm font-semibold">{label}</span>
        <span className="block text-[11px] text-muted-foreground">{description}</span>
      </span>
      <span
        className={cn(
          'relative h-6 w-11 shrink-0 rounded-full transition',
          checked ? 'bg-foreground' : 'bg-muted',
        )}
      >
        <span
          className={cn(
            'absolute top-1 h-4 w-4 rounded-full bg-background shadow transition',
            checked ? 'left-6' : 'left-1',
          )}
        />
      </span>
    </button>
  );
}

function CategoryTile({
  active,
  label,
  icon,
  onClick,
}: {
  active: boolean;
  label: string;
  icon: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-[86px] shrink-0 snap-start text-center"
      aria-pressed={active}
    >
      <span
        className={cn(
          'mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border transition',
          active
            ? 'border-foreground bg-foreground text-background shadow-lg'
            : 'border-border/50 bg-muted/55 text-muted-foreground',
        )}
      >
        {icon}
      </span>
      <span className={cn('mt-1.5 block line-clamp-2 text-[11px] leading-tight', active && 'font-bold')}>
        {label}
      </span>
    </button>
  );
}

function CategoryListButton({
  active,
  label,
  icon,
  onClick,
}: {
  active: boolean;
  label: string;
  icon: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'flex min-w-0 items-center gap-3 rounded-2xl px-3 py-2.5 text-left transition',
        active
          ? 'bg-foreground text-background'
          : 'bg-muted/35 text-foreground hover:bg-muted/70',
      )}
    >
      <span
        className={cn(
          'flex h-9 w-9 shrink-0 items-center justify-center rounded-xl',
          active ? 'bg-background/15' : 'bg-background',
        )}
      >
        {icon}
      </span>
      <span className="min-w-0 flex-1 truncate text-sm font-semibold">{label}</span>
      <ChevronRight className="h-4 w-4 shrink-0 opacity-40" />
    </button>
  );
}

function SectionHeading({
  title,
  action,
  icon,
  onAction,
}: {
  title: string;
  action?: string;
  icon?: React.ReactNode;
  onAction?: () => void;
}) {
  return (
    <div className="flex min-w-0 items-center justify-between gap-3">
      <div className="flex min-w-0 items-center gap-2">
        {icon && <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-muted">{icon}</span>}
        <h2 className="truncate text-base font-extrabold sm:text-lg">{title}</h2>
      </div>
      {action && onAction && (
        <button
          type="button"
          onClick={onAction}
          className="flex shrink-0 items-center gap-0.5 text-xs font-bold text-muted-foreground hover:text-foreground"
        >
          {action}
          <ChevronRight className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}

function PageTitle({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="mb-5">
      <h1 className="text-xl font-extrabold tracking-tight sm:text-2xl">{title}</h1>
      <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>
    </div>
  );
}

function ProductSkeletonGrid({ layout }: { layout: 'grid' | 'list' }) {
  return (
    <div
      className={cn(
        'min-w-0 gap-3',
        layout === 'grid'
          ? 'grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4'
          : 'grid grid-cols-1',
      )}
    >
      {Array.from({ length: 8 }).map((_, index) => (
        <div
          key={index}
          className={cn(
            'animate-pulse rounded-2xl bg-muted/55',
            layout === 'grid' ? 'aspect-[3/4]' : 'h-28',
          )}
        />
      ))}
    </div>
  );
}

function MarketplaceProductImage({
  product,
  className,
}: {
  product: Product;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  const src = product.images?.[0]?.url;

  if (!src || failed) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-muted text-muted-foreground/40">
        <CategoryIcon
          slug={product.category?.slug}
          name={product.category?.name}
          className="h-7 w-7"
        />
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={product.title}
      className={className}
      loading="lazy"
      decoding="async"
      onError={() => setFailed(true)}
    />
  );
}

function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex min-h-64 flex-col items-center justify-center px-4 py-12 text-center">
      <div className="mb-4 text-muted-foreground/25">{icon}</div>
      <h3 className="text-lg font-bold">{title}</h3>
      <p className="mt-1 max-w-sm text-sm text-muted-foreground">{description}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

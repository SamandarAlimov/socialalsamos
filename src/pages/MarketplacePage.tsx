import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  AlertTriangle,
  BadgePercent,
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
import {
  MarketplaceFilters,
  MarketplaceQuickFilters,
  marketplaceProductMatchesFilters,
  type MarketplaceDeliveryMode,
  type MarketplaceSortMode,
} from '@/components/marketplace/MarketplaceFilters';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet';
import { cn } from '@/lib/utils';
import { conditionLabel, formatPrice } from '@/lib/marketplace';
import { marketplaceUz } from '@/i18n/marketplace';
import '@/styles/marketplace-premium.css';

const SEARCH_DEBOUNCE_MS = 300;

type MarketplaceTab = 'browse' | 'orders' | 'selling' | 'saved';

function isMarketplaceTab(value: string | null): value is MarketplaceTab {
  return value === 'browse' || value === 'orders' || value === 'selling' || value === 'saved';
}

function discountRate(product: Product) {
  const price = Number(product.price || 0);
  const compare = Number(product.compare_at_price || 0);
  if (price < 0 || compare <= price) return 0;
  return Math.round(((compare - price) / compare) * 100);
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
  const [gridLayout, setGridLayout] = useState<'grid' | 'list'>('grid');
  const [sortBy, setSortBy] = useState<MarketplaceSortMode>('recommended');
  const [priceRange, setPriceRange] = useState<[number, number] | null>(null);
  const [conditionFilter, setConditionFilter] = useState('all');
  const [inStockOnly, setInStockOnly] = useState(false);
  const [deliveryMode, setDeliveryMode] = useState<MarketplaceDeliveryMode>('all');
  const [minDiscount, setMinDiscount] = useState(0);
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
  const { itemCount, addToCart } = useCart();

  const handleRefresh = useCallback(async () => {
    if (activeTab === 'browse') await refreshProducts();
    else if (activeTab === 'selling') await refreshSeller();
    else if (activeTab === 'saved') await refreshSaved();
  }, [activeTab, refreshProducts, refreshSaved, refreshSeller]);

  const handleCategorySelect = useCallback((slug: string) => {
    triggerHaptic('light');
    setSelectedCategory(slug);
    setActiveTab('browse');

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

  const availableConditions = useMemo(
    () => Array.from(new Set(products.map(product => product.condition).filter(Boolean))),
    [products],
  );

  useEffect(() => {
    setPriceRange(current => {
      if (!current) return current;
      const nextMin = Math.min(current[0], sliderMax);
      const nextMax = Math.min(Math.max(current[1], nextMin), sliderMax);
      if (nextMin === current[0] && nextMax === current[1]) return current;
      return [nextMin, nextMax];
    });
  }, [sliderMax]);

  const sortedProducts = useMemo(() => {
    const filtered = products.filter(product =>
      marketplaceProductMatchesFilters(product, {
        priceRange,
        conditionFilter,
        minDiscount,
        inStockOnly,
        deliveryMode,
      }),
    );

    return [...filtered].sort((a, b) => {
      switch (sortBy) {
        case 'price_low':
          return a.price - b.price;
        case 'price_high':
          return b.price - a.price;
        case 'popular':
          return (
            (b.views_count ?? 0) +
            (b.likes_count ?? 0) * 4 -
            ((a.views_count ?? 0) + (a.likes_count ?? 0) * 4)
          );
        case 'newest':
          return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
        default: {
          const score = (product: Product) =>
            (product.is_featured ? 1000 : 0) +
            (product.views_count ?? 0) +
            (product.likes_count ?? 0) * 5 +
            Number(product.seller?.rating ?? 0) * 20 +
            (Number(product.quantity ?? 0) > 0 ? 80 : 0);
          return score(b) - score(a);
        }
      }
    });
  }, [
    conditionFilter,
    deliveryMode,
    inStockOnly,
    minDiscount,
    priceRange,
    products,
    sortBy,
  ]);

  const activeFilterCount =
    (selectedCategory !== 'all' ? 1 : 0) +
    (priceRange ? 1 : 0) +
    (conditionFilter !== 'all' ? 1 : 0) +
    (inStockOnly ? 1 : 0) +
    (deliveryMode !== 'all' ? 1 : 0) +
    (minDiscount > 0 ? 1 : 0);

  const nonCategoryFilterCount =
    activeFilterCount - (selectedCategory !== 'all' ? 1 : 0);

  const resetFilters = useCallback(() => {
    setPriceRange(null);
    setConditionFilter('all');
    setInStockOnly(false);
    setDeliveryMode('all');
    setMinDiscount(0);
    setSortBy('recommended');
    if (selectedCategory !== 'all') handleCategorySelect('all');
  }, [handleCategorySelect, selectedCategory]);

  const featuredProducts = useMemo(
    () => products.filter(product => product.is_featured),
    [products],
  );
  const discountedProducts = useMemo(
    () => [...products]
      .filter(product => discountRate(product) > 0 && Number(product.quantity) > 0)
      .sort((a, b) => discountRate(b) - discountRate(a))
      .slice(0, 10),
    [products],
  );
  const highestDiscount = useMemo(
    () => discountedProducts.reduce((max, product) => Math.max(max, discountRate(product)), 0),
    [discountedProducts],
  );
  const hasBrowseCriteria = Boolean(
    searchQuery ||
    selectedCategory !== 'all' ||
    activeFilterCount > 0 ||
    nearCenter,
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

  const selectedCategoryLabel = useMemo(() => {
    if (selectedCategory === 'all') return 'Katalog';
    return categories.find(category => category.slug === selectedCategory)?.name || 'Katalog';
  }, [categories, selectedCategory]);

  const desktopTabs: Array<{ id: MarketplaceTab; label: string; icon: typeof Store }> = [
    { id: 'browse', label: 'Bozor', icon: Store },
    { id: 'orders', label: 'Buyurtmalar', icon: ClipboardList },
    { id: 'saved', label: 'Saqlangan', icon: Heart },
    { id: 'selling', label: 'Sotuvchi markazi', icon: Package },
  ];

  const sellerViews = [
    { id: 'products' as const, label: seller?.business_type === 'restaurant' ? 'Menyu' : 'Mahsulotlar', icon: Package },
    { id: 'orders' as const, label: 'Buyurtmalar', icon: ClipboardList },
  ];

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
        <SectionHeading title="Kategoriyalar" action="Barchasi" onAction={() => navigate('/marketplace/catalog')} />
        <div className="marketplace-x-rail -mx-4 flex gap-3 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0">
          <CategoryTile
            active={selectedCategory === 'all'}
            label="Barchasi"
            icon={<Sparkles className="h-5 w-5 text-violet-500" />}
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

      {discountedProducts.length > 0 && selectedCategory === 'all' && !searchQuery && (
        <section className="space-y-3">
          <div className="relative overflow-hidden rounded-[26px] border border-white/10 bg-zinc-950 px-4 py-4 text-white shadow-[0_20px_56px_rgba(0,0,0,0.12)] sm:px-5 sm:py-5">
            <div className="pointer-events-none absolute -right-12 -top-16 h-44 w-44 rounded-full bg-red-500/25 blur-3xl" />
            <div className="pointer-events-none absolute -bottom-16 left-1/3 h-40 w-40 rounded-full bg-orange-400/15 blur-3xl" />
            <div className="relative flex min-w-0 flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <div className="inline-flex items-center gap-2 rounded-full border border-red-400/25 bg-red-500/15 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-red-100">
                  <BadgePercent className="h-3.5 w-3.5" />
                  Alsamos Deals
                </div>
                <h2 className="mt-2 text-xl font-black tracking-tight sm:text-2xl">
                  Narxi tushgan mahsulotlar
                </h2>
                <p className="mt-1 max-w-2xl text-xs leading-5 text-white/60 sm:text-sm">
                  Trenddagi va turkumlar bo‘yicha saralangan real chegirmalar. Eski narx va yangi narx bir qarashda.
                </p>
                <div className="mt-3 flex flex-wrap items-center gap-2 text-[10px] font-bold text-white/65">
                  <span className="rounded-full border border-white/10 bg-white/[0.07] px-2.5 py-1">
                    {discountedProducts.length} ta tanlangan taklif
                  </span>
                  {highestDiscount > 0 && (
                    <span className="rounded-full border border-red-400/20 bg-red-500/15 px-2.5 py-1 text-red-100">
                      −{highestDiscount}% gacha
                    </span>
                  )}
                </div>
              </div>

              <Button
                type="button"
                className="h-10 shrink-0 rounded-xl bg-white px-4 text-xs font-extrabold text-zinc-950 hover:bg-zinc-100"
                onClick={() => navigate('/marketplace/deals')}
              >
                Barchasini ko‘rish
                <ChevronRight className="ml-1 h-4 w-4" />
              </Button>
            </div>
          </div>

          <div className="marketplace-x-rail -mx-4 flex gap-3 overflow-x-auto px-4 pb-2 sm:mx-0 sm:px-0">
            {discountedProducts.map(product => (
              <div key={product.id} className="w-[46vw] min-w-[158px] max-w-[210px] shrink-0 sm:w-48 lg:w-52">
                <ProductCard product={product} onSelect={handleProductSelect} onLikeChange={refreshProducts} onAddToCart={addToCart} />
              </div>
            ))}
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
              <div
                key={product.id}
                className="w-[46vw] min-w-[158px] max-w-[210px] shrink-0 snap-start sm:w-48 lg:w-52"
              >
                <ProductCard
                  product={product}
                  onSelect={handleProductSelect}
                  onLikeChange={refreshProducts}
                  onAddToCart={addToCart}
                />
              </div>
            ))}
          </div>
        </section>
      )}

      {selectedCategory === 'all' && !searchQuery && (
        <VideoCommerceSection onProductSelect={handleProductSelect} />
      )}

      <MarketplaceQuickFilters
        categories={categories}
        selectedCategory={selectedCategory}
        onCategoryChange={handleCategorySelect}
        sortBy={sortBy}
        onSortChange={setSortBy}
        priceRange={priceRange}
        sliderMax={sliderMax}
        onPriceRangeChange={setPriceRange}
        conditionFilter={conditionFilter}
        availableConditions={availableConditions}
        onConditionChange={setConditionFilter}
        minDiscount={minDiscount}
        onMinDiscountChange={setMinDiscount}
        inStockOnly={inStockOnly}
        onInStockOnlyChange={setInStockOnly}
        deliveryMode={deliveryMode}
        onDeliveryModeChange={setDeliveryMode}
        activeFilterCount={activeFilterCount}
        resultCount={sortedProducts.length}
        onReset={resetFilters}
        onOpenAll={() => setShowFilters(true)}
      />

      <div className="flex min-w-0 items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground">
            {hasBrowseCriteria ? 'Natijalar' : 'Barcha mahsulotlar'}
          </p>
          <p className="truncate text-sm font-bold">
            {sortedProducts.length} ta mahsulot
            {selectedCategory !== 'all' && (
              <span className="ml-1.5 font-medium text-muted-foreground">· {selectedCategoryLabel}</span>
            )}
            {nonCategoryFilterCount > 0 && (
              <span className="ml-1.5 font-medium text-muted-foreground">
                · {nonCategoryFilterCount} filtr
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
              ? 'grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5'
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
                onAddToCart={addToCart}
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
          <div className="flex min-w-0 items-center gap-2.5">
            <div className="hidden min-w-0 items-center gap-3 md:flex">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-foreground text-background">
                <Store className="h-5 w-5" />
              </span>
              <div className="hidden min-w-0 xl:block">
                <h1 className="truncate text-lg font-extrabold tracking-tight">Alsamos Bozor</h1>
                <p className="truncate text-[11px] text-muted-foreground">Xavfsiz savdo · keng katalog</p>
              </div>
            </div>

            <div className="relative min-w-0 flex-1 md:ml-1 xl:ml-3">
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
                            <CategoryIcon slug={category.slug} name={category.name} boxed />
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
              className={cn(
                'hidden h-11 shrink-0 rounded-2xl px-3 sm:inline-flex',
                selectedCategory !== 'all' && 'border-foreground/20 bg-foreground/[0.05]',
              )}
              onClick={() => navigate('/marketplace/catalog')}
              aria-label="Katalogni ochish"
            >
              <Grid3X3 className="h-4 w-4 xl:mr-1.5" />
              <span className="hidden max-w-28 truncate text-xs font-semibold xl:inline">{selectedCategoryLabel}</span>
            </Button>

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
              className="h-11 shrink-0 rounded-2xl px-3 text-xs font-extrabold md:px-4"
              onClick={() => selectTab('selling')}
            >
              <Plus className="h-4 w-4 min-[390px]:mr-1.5" />
              <span className="hidden min-[390px]:inline">Sotish</span>
            </Button>
          </div>

          <div className="mt-2 hidden min-w-0 items-center justify-between gap-3 md:flex">
            <nav
              className="flex min-w-0 items-center gap-1 rounded-xl bg-muted/35 p-1"
              aria-label="Marketplace bo‘limlari"
            >
              {desktopTabs.map(tab => {
                const Icon = tab.icon;
                const active = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => selectTab(tab.id)}
                    className={cn(
                      'flex min-w-0 items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition lg:px-3',
                      active
                        ? 'bg-background text-foreground shadow-sm ring-1 ring-border/40'
                        : 'text-muted-foreground hover:bg-background/60 hover:text-foreground',
                    )}
                  >
                    <Icon className="h-3.5 w-3.5 shrink-0" />
                    <span className="truncate">{tab.label}</span>
                  </button>
                );
              })}
            </nav>
            <div data-marketplace-location-slot className="flex min-w-0 shrink-0 justify-end" />
          </div>
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
              className="min-w-0"
            >
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
              <PageTitle
                title={seller?.business_type === 'restaurant' ? 'Restoran markazi' : 'Sotuvchi markazi'}
                subtitle={seller?.business_type === 'restaurant' ? 'Menyu, buyurtma va tayyorlash oqimini boshqaring.' : 'Mahsulot, buyurtma va savdo boshqaruvi.'}
              />
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
                        <p className="text-xs text-muted-foreground">{seller.business_type === 'restaurant' ? 'Restoran markazi' : 'Sotuvchi markazi'}</p>
                      </div>
                      <Button variant="outline" size="sm" className="shrink-0 rounded-xl" onClick={() => setShowDashboard(true)}>
                        <LayoutDashboard className="mr-1.5 h-4 w-4" />
                        Analitika
                      </Button>
                    </div>
                    <div className="grid grid-cols-3 divide-x divide-border/50">
                      {[
                        { value: sellerProducts.length, label: seller.business_type === 'restaurant' ? 'Menyu' : 'Mahsulotlar' },
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
                          {seller.business_type === 'restaurant' ? 'Taom qo‘shish' : 'Mahsulot qo‘shish'}
                        </Button>
                        <Button variant="outline" className="rounded-xl" onClick={() => setShowDashboard(true)}>
                          <LayoutDashboard className="mr-2 h-4 w-4" />
                          Dashboard
                        </Button>
                      </div>

                      {sellerLoading ? (
                        <ProductSkeletonGrid layout="grid" />
                      ) : sellerProducts.length > 0 ? (
                        <div className="grid min-w-0 grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
                          {sellerProducts.map(product => (
                            <div key={product.id} className="min-w-0">
                              <ProductCard product={product} onSelect={handleProductSelect} onAddToCart={addToCart} />
                            </div>
                          ))}
                        </div>
                      ) : (
                        <EmptyState
                          icon={<Package className="h-12 w-12" />}
                          title={seller.business_type === 'restaurant' ? 'Menyu bo‘sh' : 'Mahsulotlar yo‘q'}
                          description={seller.business_type === 'restaurant' ? 'Birinchi taomingizni menyuga qo‘shing.' : 'Birinchi mahsulotingizni joylang.'}
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
                        onAddToCart={addToCart}
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

      <Sheet open={showFilters} onOpenChange={setShowFilters}>
        <SheetContent
          side={isMobile ? 'bottom' : 'right'}
          className={cn(
            'flex overflow-hidden p-0',
            isMobile
              ? 'h-[92dvh] max-h-[92dvh] rounded-t-[30px] border-x border-t border-border/60'
              : 'h-full w-[460px] border-l border-border/60 sm:max-w-[460px]',
          )}
        >
          <SheetTitle className="sr-only">Filtr va saralash</SheetTitle>
          <MarketplaceFilters
            categories={categories}
            selectedCategory={selectedCategory}
            onCategoryChange={handleCategorySelect}
            sortBy={sortBy}
            onSortChange={setSortBy}
            priceRange={priceRange}
            sliderMax={sliderMax}
            onPriceRangeChange={setPriceRange}
            conditionFilter={conditionFilter}
            availableConditions={availableConditions}
            onConditionChange={setConditionFilter}
            minDiscount={minDiscount}
            onMinDiscountChange={setMinDiscount}
            inStockOnly={inStockOnly}
            onInStockOnlyChange={setInStockOnly}
            deliveryMode={deliveryMode}
            onDeliveryModeChange={setDeliveryMode}
            activeFilterCount={activeFilterCount}
            resultCount={sortedProducts.length}
            onReset={resetFilters}
            onApply={() => setShowFilters(false)}
          />
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
          'mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border bg-background transition',
          active
            ? 'border-foreground/15 shadow-md ring-2 ring-foreground/[0.06]'
            : 'border-border/50 shadow-sm hover:border-foreground/15 hover:shadow-md',
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
        'min-w-0 gap-3 sm:gap-4',
        layout === 'grid'
          ? 'grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5'
          : 'grid grid-cols-1',
      )}
    >
      {Array.from({ length: 10 }).map((_, index) => (
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

import { useState, useCallback, useEffect, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Search, ShoppingBag, Plus, Store, Package, Heart, TrendingUp, Sparkles,
  LayoutDashboard, Flame, Crown, ChevronRight, SlidersHorizontal, Grid3X3,
  LayoutList, ClipboardList, AlertTriangle, RotateCcw, X, MapPin,
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useHapticFeedback } from '@/hooks/useHapticFeedback';
import { PullToRefresh } from '@/components/PullToRefresh';
import { useIsMobile } from '@/hooks/use-mobile';
import { useAuth } from '@/contexts/AuthContext';
import { motion, AnimatePresence } from 'framer-motion';
import {
  useCategories,
  useProducts,
  useSellerProducts,
  useSavedProducts,
  useCart,
  useNearbyMarketplaceProducts,
  Product,
} from '@/hooks/useMarketplace';
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
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Slider } from '@/components/ui/slider';
import { formatPrice } from '@/lib/marketplace';
import { cn } from '@/lib/utils';
import { marketplaceUz } from '@/i18n/marketplace';

const SEARCH_DEBOUNCE_MS = 350;

export default function MarketplacePage() {
  const isMobile = useIsMobile();
  const { user } = useAuth();
  const { triggerHaptic } = useHapticFeedback();
  const navigate = useNavigate();

  const [searchParams, setSearchParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState(() => searchParams.get('tab') || 'browse');

  // URL is the source of truth for the tab, so links like ?tab=orders work
  // and the tab is preserved on refresh / share / back navigation.
  useEffect(() => {
    const t = searchParams.get('tab') || 'browse';
    if (t !== activeTab) setActiveTab(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  const selectTab = useCallback((tab: string) => {
    triggerHaptic('light');
    setActiveTab(tab);
    const next = new URLSearchParams(searchParams);
    if (tab === 'browse') next.delete('tab');
    else next.set('tab', tab);
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams, triggerHaptic]);

  const [selectedCategory, setSelectedCategory] = useState('all');
  const [searchInput, setSearchInput] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [showCreateProduct, setShowCreateProduct] = useState(false);
  const [showCart, setShowCart] = useState(false);
  const [showDashboard, setShowDashboard] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [gridLayout, setGridLayout] = useState<'grid' | 'list'>('grid');
  const [sortBy, setSortBy] = useState('newest');
  /** null = no price filter applied (previously a hardcoded 0–10 000 window silently hid every expensive listing). */
  const [priceRange, setPriceRange] = useState<[number, number] | null>(null);
  const [searchFocused, setSearchFocused] = useState(false);
  const [selectedSellerId, setSelectedSellerId] = useState<string | null>(null);
  /** Seller area sub-view: own catalogue vs incoming order queue. */
  const [sellingView, setSellingView] = useState<'products' | 'orders'>('products');

  // Legacy/map links may still use ?product=<id>. Canonical route is a real page.
  useEffect(() => {
    const productId = searchParams.get('product');
    if (!productId) return;
    navigate(`/marketplace/product/${productId}`, { replace: true });
  }, [navigate, searchParams]);

  // Seller links are URL-addressable so product page -> store -> back works naturally.
  useEffect(() => {
    const sellerId = searchParams.get('seller');
    if (sellerId) setSelectedSellerId(sellerId);
  }, [searchParams]);

  // Debounced search: one query per pause, not one per keystroke.
  useEffect(() => {
    const timer = setTimeout(() => setSearchQuery(searchInput.trim()), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [searchInput]);

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
  const { products: sellerProducts, seller, isLoading: sellerLoading, refresh: refreshSeller } = useSellerProducts();
  const { products: savedProducts, isLoading: savedLoading, refresh: refreshSaved } = useSavedProducts();
  const { itemCount, refresh: refreshCart } = useCart();

  const handleRefresh = useCallback(async () => {
    if (activeTab === 'browse') await refreshProducts();
    else if (activeTab === 'selling') await refreshSeller();
    else if (activeTab === 'saved') await refreshSaved();
  }, [activeTab, refreshProducts, refreshSeller, refreshSaved]);

  const handleCategorySelect = (slug: string) => {
    triggerHaptic('light');
    setSelectedCategory(slug);
  };

  const handleProductSelect = useCallback((product: Product) => {
    triggerHaptic('light');
    navigate(`/marketplace/product/${product.id}`);
  }, [navigate, triggerHaptic]);

  const handleOrderProductSelect = useCallback((productId: string) => {
    triggerHaptic('light');
    navigate(`/marketplace/product/${productId}`);
  }, [navigate, triggerHaptic]);

  const maxProductPrice = useMemo(
    () => products.reduce((max, p) => Math.max(max, Number(p.price) || 0), 0),
    [products],
  );

  /** Slider bounds follow the catalogue instead of a fixed $10 000 ceiling. */
  const sliderMax = useMemo(() => {
    if (maxProductPrice <= 0) return 1000;
    const step = Math.pow(10, Math.max(1, String(Math.round(maxProductPrice)).length - 2));
    return Math.ceil(maxProductPrice / step) * step;
  }, [maxProductPrice]);

  const activeRange = priceRange ?? [0, sliderMax];
  const priceFilterActive = priceRange !== null;

  const featuredProducts = useMemo(() => products.filter(p => p.is_featured), [products]);

  const trendingProducts = useMemo(
    () => [...products].sort((a, b) => (b.views_count ?? 0) - (a.views_count ?? 0)).slice(0, 6),
    [products],
  );

  const sortedProducts = useMemo(() => {
    const filtered = priceFilterActive
      ? products.filter(p => p.price >= activeRange[0] && p.price <= activeRange[1])
      : products;

    return [...filtered].sort((a, b) => {
      switch (sortBy) {
        case 'price_low': return a.price - b.price;
        case 'price_high': return b.price - a.price;
        case 'popular': return (b.likes_count ?? 0) - (a.likes_count ?? 0);
        case 'newest':
        default:
          return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [products, sortBy, priceFilterActive, activeRange[0], activeRange[1]]);

  const hiddenByPriceFilter = priceFilterActive ? products.length - sortedProducts.length : 0;

  const resetFilters = () => {
    setPriceRange(null);
    setSortBy('newest');
  };

  const tabs = [
    { id: 'browse', label: 'Barchasi', icon: TrendingUp },
    { id: 'orders', label: 'Buyurtmalar', icon: ClipboardList },
    { id: 'selling', label: 'Sotish', icon: Package },
    { id: 'saved', label: 'Saqlangan', icon: Heart },
  ];

  const sellerViews = [
    { id: 'products' as const, label: 'Mahsulotlar', icon: Package },
    { id: 'orders' as const, label: 'Buyurtmalar', icon: ClipboardList },
  ];

  const pageContent = (
    <div className="min-h-screen bg-background pb-24 md:pb-4">
      {/* Premium Glass Header */}
      <div className="sticky top-0 z-30 border-b border-border/30">
        <div className="bg-gradient-to-b from-background via-background/98 to-background/95 backdrop-blur-2xl">
          <div className="max-w-7xl mx-auto px-4 py-3 space-y-3">
            {/* Top Row */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="relative">
                  <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-primary via-primary/80 to-primary/60 flex items-center justify-center shadow-lg shadow-primary/20">
                    <Store className="h-5 w-5 text-primary-foreground" />
                  </div>
                  <div className="absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full bg-green-500 border-2 border-background" />
                </div>
                <div>
                  <h1 className="text-xl font-bold tracking-tight">Marketplace</h1>
                  <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                    <span className="px-1.5 py-0.5 rounded-md bg-primary/10 text-primary font-medium">B2B</span>
                    <span className="px-1.5 py-0.5 rounded-md bg-primary/10 text-primary font-medium">B2C</span>
                    <span className="px-1.5 py-0.5 rounded-md bg-primary/10 text-primary font-medium">C2C</span>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="icon"
                  className="relative h-10 w-10 rounded-xl bg-muted/50 hover:bg-muted"
                  onClick={() => setShowCart(true)}
                  aria-label={itemCount > 0 ? `Savat, ${itemCount} dona ${marketplaceUz.page.products}` : 'Savat'}
                >
                  <ShoppingBag className="h-5 w-5" />
                  {itemCount > 0 && (
                    <motion.span
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      className="absolute -top-1 -right-1 min-w-5 h-5 px-1 rounded-full bg-primary text-primary-foreground text-[10px] flex items-center justify-center font-bold shadow-lg shadow-primary/30 tabular-nums"
                    >
                      {itemCount > 99 ? '99+' : itemCount}
                    </motion.span>
                  )}
                </Button>
              </div>
            </div>

            {/* Premium Search */}
            <div className="flex gap-2">
              <div className={cn(
                'relative flex-1 transition-all duration-300',
                searchFocused && 'scale-[1.01]',
              )}>
                <div className="absolute left-3.5 top-1/2 -translate-y-1/2 z-10">
                  <Search className={cn(
                    'h-4 w-4 transition-colors',
                    searchFocused ? 'text-primary' : 'text-muted-foreground',
                  )} />
                </div>
                <Input
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  onFocus={() => setSearchFocused(true)}
                  onBlur={() => setSearchFocused(false)}
                  placeholder={marketplaceUz.page.searchPlaceholder}
                  aria-label={marketplaceUz.page.searchLabel}
                  className={cn(
                    'pl-10 pr-9 h-11 rounded-xl border-border/50 bg-muted/40 backdrop-blur-sm',
                    'focus:bg-background focus:border-primary/30 focus:ring-2 focus:ring-primary/10',
                    'placeholder:text-muted-foreground/60 transition-all duration-300',
                  )}
                />
                {searchInput && (
                  <button
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    onClick={() => setSearchInput('')}
                    aria-label={marketplaceUz.page.clearSearch}
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>
              <Button
                variant="outline"
                size="icon"
                className={cn(
                  'h-11 w-11 rounded-xl border-border/50 bg-muted/40 hover:bg-muted shrink-0 relative',
                  priceFilterActive && 'border-primary/50 text-primary',
                )}
                onClick={() => setShowFilters(true)}
                aria-label={marketplaceUz.page.filters}
              >
                <SlidersHorizontal className="h-4 w-4" />
                {priceFilterActive && (
                  <span className="absolute -top-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-primary" />
                )}
              </Button>
            </div>

            {/* Premium Tab Navigation */}
            <div className="flex gap-1 p-1 rounded-xl bg-muted/40 backdrop-blur-sm" role="tablist">
              {tabs.map((tab) => {
                const Icon = tab.icon;
                const isActive = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    role="tab"
                    aria-selected={isActive}
                    onClick={() => selectTab(tab.id)}
                    className={cn(
                      'flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-lg text-sm font-medium transition-all duration-300',
                      isActive
                        ? 'bg-background text-foreground shadow-sm'
                        : 'text-muted-foreground hover:text-foreground',
                    )}
                  >
                    <Icon className="h-4 w-4" />
                    <span>{tab.label}</span>
                    {tab.id === 'saved' && savedProducts.length > 0 && (
                      <span className="ml-0.5 px-1.5 py-0.5 rounded-full bg-primary/10 text-primary text-[10px] font-bold">
                        {savedProducts.length}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-7xl mx-auto">
        <AnimatePresence mode="wait">
          {/* Browse Tab */}
          {activeTab === 'browse' && (
            <motion.div
              key="browse"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.2 }}
              className="space-y-5 p-4"
            >
              {nearCenter && (
                <div className="flex items-center gap-2 rounded-xl border border-primary/20 bg-primary/5 px-3 py-2 text-sm">
                  <MapPin className="h-4 w-4 shrink-0 text-primary" />
                  <span className="min-w-0 flex-1">
                    Xaritadagi nuqtadan {nearRadiusKm} km ichidagi e'lonlar
                  </span>
                  <button
                    type="button"
                    className="text-xs font-semibold text-primary hover:underline"
                    onClick={() => {
                      const next = new URLSearchParams(searchParams);
                      next.delete('lat');
                      next.delete('lng');
                      next.delete('near');
                      setSearchParams(next, { replace: true });
                    }}
                  >
                    {marketplaceUz.page.all}
                  </button>
                </div>
              )}

              {/* Category Chips — professional Lucide icons, no emoji stickers */}
              <ScrollArea className="w-full">
                <div className="flex gap-2 pb-1">
                  <button
                    onClick={() => handleCategorySelect('all')}
                    aria-pressed={selectedCategory === 'all'}
                    className={cn(
                      'flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium whitespace-nowrap transition-all duration-300',
                      selectedCategory === 'all'
                        ? 'bg-primary text-primary-foreground shadow-lg shadow-primary/25'
                        : 'bg-muted/60 text-muted-foreground hover:bg-muted hover:text-foreground',
                    )}
                  >
                    <Sparkles className="h-3.5 w-3.5" />
                    {marketplaceUz.page.all}
                  </button>
                  {categories.map((cat) => (
                    <button
                      key={cat.id}
                      onClick={() => handleCategorySelect(cat.slug)}
                      aria-pressed={selectedCategory === cat.slug}
                      className={cn(
                        'flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium whitespace-nowrap transition-all duration-300',
                        selectedCategory === cat.slug
                          ? 'bg-primary text-primary-foreground shadow-lg shadow-primary/25'
                          : 'bg-muted/60 text-muted-foreground hover:bg-muted hover:text-foreground',
                      )}
                    >
                      <CategoryIcon slug={cat.slug} name={cat.name} />
                      {cat.name}
                    </button>
                  ))}
                </div>
              </ScrollArea>

              {/* Hero Banner */}
              {featuredProducts.length > 0 && selectedCategory === 'all' && !searchQuery && (
                <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-primary/10 via-primary/5 to-transparent border border-primary/10">
                  <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,hsl(var(--primary)/0.15),transparent_70%)]" />
                  <div className="relative p-5 flex items-center gap-4">
                    <div className="flex-1 space-y-2">
                      <div className="flex items-center gap-2">
                        <Crown className="h-4 w-4 text-primary" />
                        <span className="text-xs font-semibold text-primary uppercase tracking-wider">{marketplaceUz.page.selected}</span>
                      </div>
                      <h2 className="text-lg font-bold leading-tight">
                        {marketplaceUz.page.heroTitle}
                      </h2>
                      <p className="text-sm text-muted-foreground">
                        {marketplaceUz.page.heroDescription}
                      </p>
                      <Button
                        size="sm"
                        className="mt-2 rounded-lg shadow-lg shadow-primary/20"
                        onClick={() => handleProductSelect(featuredProducts[0])}
                      >
                        {marketplaceUz.page.view}
                        <ChevronRight className="h-3.5 w-3.5 ml-1" />
                      </Button>
                    </div>
                    {featuredProducts[0]?.images?.[0]?.url && (
                      <button
                        className="w-28 h-28 rounded-xl overflow-hidden ring-2 ring-primary/20 shadow-xl shrink-0"
                        onClick={() => handleProductSelect(featuredProducts[0])}
                        aria-label={featuredProducts[0].title}
                      >
                        <MarketplaceProductImage
                          product={featuredProducts[0]}
                          className="w-full h-full object-cover"
                        />
                      </button>
                    )}
                  </div>
                </div>
              )}

              {/* Trending Section */}
              {trendingProducts.length > 0 && selectedCategory === 'all' && !searchQuery && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="p-1.5 rounded-lg bg-orange-500/10">
                        <Flame className="h-4 w-4 text-orange-500" />
                      </div>
                      <h3 className="font-bold">{marketplaceUz.page.trending}</h3>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-xs text-muted-foreground"
                      onClick={() => { setSortBy('popular'); setPriceRange(null); }}
                    >
                      {marketplaceUz.page.all} <ChevronRight className="h-3 w-3 ml-0.5" />
                    </Button>
                  </div>
                  <ScrollArea className="w-full">
                    <div className="flex gap-3 pb-2">
                      {trendingProducts.map((product) => (
                        <button
                          key={product.id}
                          className="w-36 shrink-0 text-left cursor-pointer group"
                          onClick={() => handleProductSelect(product)}
                        >
                          <div className="aspect-square rounded-xl overflow-hidden bg-muted mb-2 ring-1 ring-border/30 group-hover:ring-primary/30 transition-all">
                            {product.images?.[0]?.url ? (
                              <MarketplaceProductImage
                                product={product}
                                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                              />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center text-muted-foreground/40">
                                <CategoryIcon slug={product.category?.slug} name={product.category?.name} className="h-6 w-6" />
                              </div>
                            )}
                          </div>
                          <p className="text-xs font-medium line-clamp-1">{product.title}</p>
                          <p className="text-sm font-bold text-primary tabular-nums">
                            {formatPrice(product.price, product.currency)}
                          </p>
                        </button>
                      ))}
                    </div>
                  </ScrollArea>
                </div>
              )}

              {/* Video Commerce */}
              {selectedCategory === 'all' && !searchQuery && (
                <VideoCommerceSection onProductSelect={handleProductSelect} />
              )}

              {/* Sort & Layout Controls */}
              <div className="flex items-center justify-between">
                <div className="text-sm text-muted-foreground">
                  <span className="font-semibold text-foreground tabular-nums">{sortedProducts.length}</span> {marketplaceUz.page.products}
                  {hiddenByPriceFilter > 0 && (
                    <button
                      className="ml-2 text-xs text-primary font-medium hover:underline"
                      onClick={resetFilters}
                    >
                      ({hiddenByPriceFilter} ta filtr bilan yashirilgan — tozalash)
                    </button>
                  )}
                </div>
                <div className="flex items-center gap-1.5">
                  <Button
                    variant="ghost"
                    size="icon"
                    className={cn('h-8 w-8 rounded-lg', gridLayout === 'grid' && 'bg-muted')}
                    onClick={() => setGridLayout('grid')}
                    aria-label={marketplaceUz.page.gridView}
                    aria-pressed={gridLayout === 'grid'}
                  >
                    <Grid3X3 className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className={cn('h-8 w-8 rounded-lg', gridLayout === 'list' && 'bg-muted')}
                    onClick={() => setGridLayout('list')}
                    aria-label={marketplaceUz.page.listView}
                    aria-pressed={gridLayout === 'list'}
                  >
                    <LayoutList className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>

              {/* Products Grid */}
              {productsError ? (
                <div className="flex flex-col items-center justify-center py-14 text-center">
                  <div className="w-16 h-16 rounded-2xl bg-destructive/10 flex items-center justify-center mb-4">
                    <AlertTriangle className="h-8 w-8 text-destructive" />
                  </div>
                  <h3 className="font-semibold text-lg mb-1">{marketplaceUz.page.loadFailed}</h3>
                  <p className="text-sm text-muted-foreground max-w-xs mb-4">{productsError}</p>
                  <Button variant="outline" className="rounded-xl" onClick={() => refreshProducts()}>
                    <RotateCcw className="h-4 w-4 mr-2" />
                    {marketplaceUz.page.retry}
                  </Button>
                </div>
              ) : productsLoading ? (
                <div className={cn(
                  'gap-3',
                  gridLayout === 'grid'
                    ? 'grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4'
                    : 'space-y-3',
                )}>
                  {[...Array(8)].map((_, i) => (
                    <div key={i} className={cn(
                      'rounded-2xl bg-muted/50 animate-pulse',
                      gridLayout === 'grid' ? 'aspect-[3/4]' : 'h-32',
                    )} />
                  ))}
                </div>
              ) : sortedProducts.length > 0 ? (
                <div className={cn(
                  'gap-3',
                  gridLayout === 'grid'
                    ? 'grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4'
                    : 'space-y-3',
                )}>
                  {sortedProducts.map((product, i) => (
                    <motion.div
                      key={product.id}
                      initial={{ opacity: 0, y: 12 }}
                      animate={{ opacity: 1, y: 0 }}
                      // Stagger is capped so large result sets don't feel laggy
                      transition={{ delay: Math.min(i, 8) * 0.03, duration: 0.3 }}
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
                  icon={<Package className="h-16 w-16" />}
                  title={marketplaceUz.page.notFound}
                  description={
                    searchQuery
                      ? "Boshqa so'z bilan izlab ko'ring"
                      : priceFilterActive
                        ? "Narx filtri juda tor — filtrni tozalab ko'ring"
                        : marketplaceUz.page.firstListing
                  }
                />
              )}
            </motion.div>
          )}

          {/* Orders Tab */}
          {activeTab === 'orders' && (
            <motion.div
              key="orders"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              className="p-4"
            >
              {!user ? (
                <EmptyState
                  icon={<ClipboardList className="h-16 w-16" />}
                  title={marketplaceUz.page.signIn}
                  description={marketplaceUz.page.ordersSignIn}
                />
              ) : (
                <OrdersView onProductSelect={handleOrderProductSelect} />
              )}
            </motion.div>
          )}

          {/* Selling Tab */}
          {activeTab === 'selling' && (
            <motion.div
              key="selling"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              className="p-4"
            >
              {!user ? (
                <EmptyState
                  icon={<Store className="h-16 w-16" />}
                  title={marketplaceUz.page.signIn}
                  description={marketplaceUz.page.sellingSignIn}
                />
              ) : !seller ? (
                <BecomeSeller onSuccess={refreshSeller} />
              ) : showDashboard ? (
                <div className="space-y-4">
                  <Button variant="outline" onClick={() => setShowDashboard(false)} className="rounded-xl">
                    ← Orqaga
                  </Button>
                  <SellerDashboard onClose={() => setShowDashboard(false)} />
                </div>
              ) : (
                <div className="space-y-5">
                  {/* Seller Stats Glass Cards */}
                  <div className="grid grid-cols-3 gap-3">
                    {[
                      { value: sellerProducts.length, label: 'Mahsulotlar', color: 'from-blue-500/10 to-blue-500/5' },
                      { value: seller.total_sales ?? 0, label: marketplaceUz.page.sales, color: 'from-green-500/10 to-green-500/5' },
                      { value: (seller.rating ?? 0) > 0 ? seller.rating.toFixed(1) : '—', label: marketplaceUz.page.rating, color: 'from-amber-500/10 to-amber-500/5' },
                    ].map((stat, i) => (
                      <div key={i} className={cn(
                        'rounded-2xl p-4 text-center border border-border/30',
                        `bg-gradient-to-br ${stat.color}`,
                      )}>
                        <p className="text-2xl font-bold tabular-nums">{stat.value}</p>
                        <p className="text-[11px] text-muted-foreground mt-0.5">{stat.label}</p>
                      </div>
                    ))}
                  </div>

                  {/*
                    Seller sub-navigation. The incoming order queue used to be
                    buried inside the analytics dashboard, so sellers had no
                    obvious place to accept or ship an order.
                  */}
                  <div className="flex gap-1 p-1 rounded-xl bg-muted/40" role="tablist">
                    {sellerViews.map((view) => {
                      const Icon = view.icon;
                      const isActive = sellingView === view.id;
                      return (
                        <button
                          key={view.id}
                          role="tab"
                          aria-selected={isActive}
                          onClick={() => { triggerHaptic('light'); setSellingView(view.id); }}
                          className={cn(
                            'flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-lg text-sm font-medium transition-all',
                            isActive
                              ? 'bg-background text-foreground shadow-sm'
                              : 'text-muted-foreground hover:text-foreground',
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
                      <Button
                        variant="outline"
                        className="w-full rounded-xl h-11"
                        onClick={() => setShowDashboard(true)}
                      >
                        <LayoutDashboard className="h-4 w-4 mr-2" />
                        {marketplaceUz.page.sellerDashboard}
                      </Button>

                      <Button
                        className="w-full rounded-xl h-12 shadow-lg shadow-primary/20"
                        onClick={() => setShowCreateProduct(true)}
                      >
                        <Plus className="h-4 w-4 mr-2" />
                        {marketplaceUz.page.addProduct}
                      </Button>

                      {sellerLoading ? (
                        <div className="grid grid-cols-2 gap-3">
                          {[...Array(4)].map((_, i) => (
                            <div key={i} className="aspect-[3/4] rounded-2xl bg-muted/50 animate-pulse" />
                          ))}
                        </div>
                      ) : sellerProducts.length > 0 ? (
                        <div className="grid grid-cols-2 gap-3">
                          {sellerProducts.map((product) => (
                            <ProductCard key={product.id} product={product} onSelect={handleProductSelect} />
                          ))}
                        </div>
                      ) : (
                        <EmptyState
                          icon={<Package className="h-12 w-12" />}
                          title={marketplaceUz.page.emptyProductsTitle}
                          description={marketplaceUz.page.firstProduct}
                        />
                      )}
                    </>
                  )}
                </div>
              )}
            </motion.div>
          )}

          {/* Saved Tab */}
          {activeTab === 'saved' && (
            <motion.div
              key="saved"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              className="p-4"
            >
              {!user ? (
                <EmptyState
                  icon={<Heart className="h-16 w-16" />}
                  title={marketplaceUz.page.signIn}
                  description={marketplaceUz.page.savedSignIn}
                />
              ) : savedLoading ? (
                <div className="grid grid-cols-2 gap-3">
                  {[...Array(4)].map((_, i) => (
                    <div key={i} className="aspect-[3/4] rounded-2xl bg-muted/50 animate-pulse" />
                  ))}
                </div>
              ) : savedProducts.length > 0 ? (
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                  {savedProducts.map((product) => (
                    <ProductCard
                      key={product.id}
                      product={product}
                      onSelect={handleProductSelect}
                      onLikeChange={refreshSaved}
                    />
                  ))}
                </div>
              ) : (
                <EmptyState
                  icon={<Heart className="h-16 w-16" />}
                  title={marketplaceUz.page.savedEmptyTitle}
                  description={marketplaceUz.page.savedEmptyDescription}
                />
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <CreateProductDialog
        open={showCreateProduct}
        onOpenChange={setShowCreateProduct}
        onSuccess={() => { refreshSeller(); refreshProducts(); }}
      />
      <CartSheet open={showCart} onOpenChange={setShowCart} />
      <SellerStorefront
        sellerId={selectedSellerId}
        onMessageSeller={(userId) => navigate(`/messages?user=${userId}`)}
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

      {/* Filters Sheet */}
      <Sheet open={showFilters} onOpenChange={setShowFilters}>
        <SheetContent side="bottom" className="rounded-t-3xl">
          <SheetHeader>
            <SheetTitle>Filtrlar</SheetTitle>
          </SheetHeader>
          <div className="space-y-6 py-4">
            <div className="space-y-3">
              <label className="text-sm font-medium">Saralash</label>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { id: 'newest', label: 'Eng yangi' },
                  { id: 'popular', label: 'Mashhur' },
                  { id: 'price_low', label: 'Arzon → Qimmat' },
                  { id: 'price_high', label: 'Qimmat → Arzon' },
                ].map(s => (
                  <button
                    key={s.id}
                    onClick={() => setSortBy(s.id)}
                    className={cn(
                      'py-2.5 px-3 rounded-xl text-sm font-medium transition-all border',
                      sortBy === s.id
                        ? 'bg-primary text-primary-foreground border-primary shadow-lg shadow-primary/20'
                        : 'bg-muted/50 border-border/30 text-muted-foreground hover:bg-muted',
                    )}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium">
                  Narx: {formatPrice(activeRange[0])} — {formatPrice(activeRange[1])}
                </label>
                {priceFilterActive && (
                  <button
                    className="text-xs text-primary font-semibold"
                    onClick={() => setPriceRange(null)}
                  >
                    Tozalash
                  </button>
                )}
              </div>
              <Slider
                value={activeRange}
                min={0}
                max={sliderMax}
                step={Math.max(1, Math.round(sliderMax / 100))}
                onValueChange={(value) => setPriceRange([value[0], value[1]])}
                className="py-2"
              />
              <p className="text-[11px] text-muted-foreground">
                Katalogdagi eng yuqori narx: {formatPrice(maxProductPrice)}
              </p>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1 rounded-xl h-11" onClick={resetFilters}>
                Tiklash
              </Button>
              <Button className="flex-1 rounded-xl h-11" onClick={() => setShowFilters(false)}>
                Qo'llash
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

function EmptyState({ icon, title, description }: { icon: React.ReactNode; title: string; description: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="text-muted-foreground/20 mb-4">{icon}</div>
      <h3 className="font-semibold text-lg mb-1">{title}</h3>
      <p className="text-sm text-muted-foreground max-w-xs">{description}</p>
    </div>
  );
}

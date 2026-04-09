import { useState, useCallback } from 'react';
import { 
  Search, Filter, ShoppingBag, Plus, Store, Package, Heart, 
  TrendingUp, Sparkles, LayoutDashboard, MapPin, Star, 
  Flame, Crown, ChevronRight, Video, Zap, SlidersHorizontal,
  Grid3X3, LayoutList, ArrowUpDown, ClipboardList
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
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
  Product 
} from '@/hooks/useMarketplace';
import { ProductCard } from '@/components/marketplace/ProductCard';
import { ProductDetail } from '@/components/marketplace/ProductDetail';
import { BecomeSeller } from '@/components/marketplace/BecomeSeller';
import { CreateProductDialog } from '@/components/marketplace/CreateProductDialog';
import { CartSheet } from '@/components/marketplace/CartSheet';
import { SellerDashboard } from '@/components/marketplace/SellerDashboard';
import { OrdersView } from '@/components/marketplace/OrdersView';
import { SellerStorefront } from '@/components/marketplace/SellerStorefront';
import { VideoCommerceSection } from '@/components/marketplace/VideoCommerceSection';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Slider } from '@/components/ui/slider';
import { cn } from '@/lib/utils';

export default function MarketplacePage() {
  const isMobile = useIsMobile();
  const { user } = useAuth();
  const { triggerHaptic } = useHapticFeedback();
  
  const [activeTab, setActiveTab] = useState('browse');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [showCreateProduct, setShowCreateProduct] = useState(false);
  const [showCart, setShowCart] = useState(false);
  const [showDashboard, setShowDashboard] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [gridLayout, setGridLayout] = useState<'grid' | 'list'>('grid');
  const [sortBy, setSortBy] = useState('newest');
  const [priceRange, setPriceRange] = useState([0, 10000]);
  const [searchFocused, setSearchFocused] = useState(false);
  const [selectedSellerId, setSelectedSellerId] = useState<string | null>(null);
  
  const { categories } = useCategories();
  const { products, isLoading: productsLoading, refresh: refreshProducts } = useProducts(selectedCategory, searchQuery);
  const { products: sellerProducts, seller, isLoading: sellerLoading, refresh: refreshSeller } = useSellerProducts();
  const { products: savedProducts, isLoading: savedLoading, refresh: refreshSaved } = useSavedProducts();
  const { items: cartItems } = useCart();

  const handleRefresh = useCallback(async () => {
    if (activeTab === 'browse') await refreshProducts();
    else if (activeTab === 'selling') await refreshSeller();
    else if (activeTab === 'saved') await refreshSaved();
  }, [activeTab, refreshProducts, refreshSeller, refreshSaved]);

  const handleCategorySelect = (slug: string) => {
    triggerHaptic('light');
    setSelectedCategory(slug);
  };

  const handleProductSelect = (product: Product) => {
    triggerHaptic('light');
    setSelectedProduct(product);
  };

  const featuredProducts = products.filter(p => p.is_featured);
  const trendingProducts = [...products].sort((a, b) => b.views_count - a.views_count).slice(0, 6);

  const sortedProducts = [...products].sort((a, b) => {
    switch (sortBy) {
      case 'price_low': return a.price - b.price;
      case 'price_high': return b.price - a.price;
      case 'popular': return b.likes_count - a.likes_count;
      default: return 0;
    }
  }).filter(p => p.price >= priceRange[0] && p.price <= priceRange[1]);

  const tabs = [
    { id: 'browse', label: 'Barchasi', icon: TrendingUp },
    { id: 'orders', label: 'Buyurtmalar', icon: ClipboardList },
    { id: 'selling', label: 'Sotish', icon: Package },
    { id: 'saved', label: 'Saqlangan', icon: Heart },
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
                >
                  <ShoppingBag className="h-5 w-5" />
                  {cartItems.length > 0 && (
                    <motion.span 
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      className="absolute -top-1 -right-1 h-5 w-5 rounded-full bg-primary text-primary-foreground text-[10px] flex items-center justify-center font-bold shadow-lg shadow-primary/30"
                    >
                      {cartItems.length}
                    </motion.span>
                  )}
                </Button>
              </div>
            </div>
            
            {/* Premium Search */}
            <div className="flex gap-2">
              <div className={cn(
                "relative flex-1 transition-all duration-300",
                searchFocused && "scale-[1.01]"
              )}>
                <div className="absolute left-3.5 top-1/2 -translate-y-1/2 z-10">
                  <Search className={cn(
                    "h-4 w-4 transition-colors",
                    searchFocused ? "text-primary" : "text-muted-foreground"
                  )} />
                </div>
                <Input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onFocus={() => setSearchFocused(true)}
                  onBlur={() => setSearchFocused(false)}
                  placeholder="Mahsulot, do'kon izlash..."
                  className={cn(
                    "pl-10 h-11 rounded-xl border-border/50 bg-muted/40 backdrop-blur-sm",
                    "focus:bg-background focus:border-primary/30 focus:ring-2 focus:ring-primary/10",
                    "placeholder:text-muted-foreground/60 transition-all duration-300"
                  )}
                />
              </div>
              <Button 
                variant="outline" 
                size="icon"
                className="h-11 w-11 rounded-xl border-border/50 bg-muted/40 hover:bg-muted shrink-0"
                onClick={() => setShowFilters(true)}
              >
                <SlidersHorizontal className="h-4 w-4" />
              </Button>
            </div>

            {/* Premium Tab Navigation */}
            <div className="flex gap-1 p-1 rounded-xl bg-muted/40 backdrop-blur-sm">
              {tabs.map((tab) => {
                const Icon = tab.icon;
                const isActive = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    onClick={() => { setActiveTab(tab.id); triggerHaptic('light'); }}
                    className={cn(
                      "flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-lg text-sm font-medium transition-all duration-300",
                      isActive 
                        ? "bg-background text-foreground shadow-sm" 
                        : "text-muted-foreground hover:text-foreground"
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
              {/* Category Chips */}
              <ScrollArea className="w-full">
                <div className="flex gap-2 pb-1">
                  <button
                    onClick={() => handleCategorySelect('all')}
                    className={cn(
                      "flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium whitespace-nowrap transition-all duration-300",
                      selectedCategory === 'all'
                        ? "bg-primary text-primary-foreground shadow-lg shadow-primary/25"
                        : "bg-muted/60 text-muted-foreground hover:bg-muted hover:text-foreground"
                    )}
                  >
                    <Sparkles className="h-3.5 w-3.5" />
                    Barchasi
                  </button>
                  {categories.map((cat) => (
                    <button
                      key={cat.id}
                      onClick={() => handleCategorySelect(cat.slug)}
                      className={cn(
                        "flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium whitespace-nowrap transition-all duration-300",
                        selectedCategory === cat.slug
                          ? "bg-primary text-primary-foreground shadow-lg shadow-primary/25"
                          : "bg-muted/60 text-muted-foreground hover:bg-muted hover:text-foreground"
                      )}
                    >
                      {cat.icon && <span>{cat.icon}</span>}
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
                        <span className="text-xs font-semibold text-primary uppercase tracking-wider">Featured</span>
                      </div>
                      <h2 className="text-lg font-bold leading-tight">
                        Premium mahsulotlarni kashf eting
                      </h2>
                      <p className="text-sm text-muted-foreground">
                        Eng yaxshi sotuvchilardan tanlangan mahsulotlar
                      </p>
                      <Button size="sm" className="mt-2 rounded-lg shadow-lg shadow-primary/20">
                        Ko'rish
                        <ChevronRight className="h-3.5 w-3.5 ml-1" />
                      </Button>
                    </div>
                    {featuredProducts[0]?.images?.[0]?.url && (
                      <div className="w-28 h-28 rounded-xl overflow-hidden ring-2 ring-primary/20 shadow-xl shrink-0">
                        <img 
                          src={featuredProducts[0].images[0].url} 
                          alt="" 
                          className="w-full h-full object-cover"
                        />
                      </div>
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
                      <h3 className="font-bold">Trendda</h3>
                    </div>
                    <Button variant="ghost" size="sm" className="text-xs text-muted-foreground">
                      Barchasi <ChevronRight className="h-3 w-3 ml-0.5" />
                    </Button>
                  </div>
                  <ScrollArea className="w-full">
                    <div className="flex gap-3 pb-2">
                      {trendingProducts.slice(0, 6).map((product) => (
                        <div 
                          key={product.id} 
                          className="w-36 shrink-0 cursor-pointer group"
                          onClick={() => handleProductSelect(product)}
                        >
                          <div className="aspect-square rounded-xl overflow-hidden bg-muted mb-2 ring-1 ring-border/30 group-hover:ring-primary/30 transition-all">
                            <img
                              src={product.images?.[0]?.url || 'https://placehold.co/200x200?text=No+Image'}
                              alt={product.title}
                              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                              loading="lazy"
                            />
                          </div>
                          <p className="text-xs font-medium line-clamp-1">{product.title}</p>
                          <p className="text-sm font-bold text-primary">${product.price.toLocaleString()}</p>
                        </div>
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
                <p className="text-sm text-muted-foreground">
                  <span className="font-semibold text-foreground">{sortedProducts.length}</span> mahsulot
                </p>
                <div className="flex items-center gap-1.5">
                  <Button
                    variant="ghost"
                    size="icon"
                    className={cn("h-8 w-8 rounded-lg", gridLayout === 'grid' && "bg-muted")}
                    onClick={() => setGridLayout('grid')}
                  >
                    <Grid3X3 className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className={cn("h-8 w-8 rounded-lg", gridLayout === 'list' && "bg-muted")}
                    onClick={() => setGridLayout('list')}
                  >
                    <LayoutList className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>

              {/* Products Grid */}
              {productsLoading ? (
                <div className={cn(
                  "gap-3",
                  gridLayout === 'grid' 
                    ? "grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4" 
                    : "space-y-3"
                )}>
                  {[...Array(8)].map((_, i) => (
                    <div key={i} className={cn(
                      "rounded-2xl bg-muted/50 animate-pulse",
                      gridLayout === 'grid' ? "aspect-[3/4]" : "h-32"
                    )} />
                  ))}
                </div>
              ) : sortedProducts.length > 0 ? (
                <div className={cn(
                  "gap-3",
                  gridLayout === 'grid' 
                    ? "grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4" 
                    : "space-y-3"
                )}>
                  {sortedProducts.map((product, i) => (
                    <motion.div
                      key={product.id}
                      initial={{ opacity: 0, y: 12 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.03, duration: 0.3 }}
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
                  title="Mahsulot topilmadi"
                  description={searchQuery ? "Boshqa so'z bilan izlab ko'ring" : "Birinchi bo'lib mahsulot joylashtiring!"}
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
                  title="Tizimga kiring"
                  description="Buyurtmalarni ko'rish uchun tizimga kiring"
                />
              ) : (
                <OrdersView />
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
                  title="Tizimga kiring"
                  description="Mahsulot sotish uchun ro'yxatdan o'ting"
                />
              ) : !seller ? (
                <BecomeSeller onSuccess={refreshSeller} />
              ) : showDashboard ? (
                <div className="space-y-4">
                  <Button variant="outline" onClick={() => setShowDashboard(false)} className="rounded-xl">
                    ← Orqaga
                  </Button>
                  <SellerDashboard />
                </div>
              ) : (
                <div className="space-y-5">
                  {/* Seller Stats Glass Cards */}
                  <div className="grid grid-cols-3 gap-3">
                    {[
                      { value: sellerProducts.length, label: "Mahsulotlar", color: "from-blue-500/10 to-blue-500/5" },
                      { value: seller.total_sales, label: "Sotuvlar", color: "from-green-500/10 to-green-500/5" },
                      { value: seller.rating > 0 ? seller.rating.toFixed(1) : '—', label: "Reyting", color: "from-amber-500/10 to-amber-500/5" },
                    ].map((stat, i) => (
                      <div key={i} className={cn(
                        "rounded-2xl p-4 text-center border border-border/30",
                        `bg-gradient-to-br ${stat.color}`
                      )}>
                        <p className="text-2xl font-bold">{stat.value}</p>
                        <p className="text-[11px] text-muted-foreground mt-0.5">{stat.label}</p>
                      </div>
                    ))}
                  </div>

                  <Button 
                    variant="outline" 
                    className="w-full rounded-xl h-11"
                    onClick={() => setShowDashboard(true)}
                  >
                    <LayoutDashboard className="h-4 w-4 mr-2" />
                    Seller Dashboard
                  </Button>

                  <Button 
                    className="w-full rounded-xl h-12 shadow-lg shadow-primary/20" 
                    onClick={() => setShowCreateProduct(true)}
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    Yangi mahsulot qo'shish
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
                      title="Mahsulotlar yo'q"
                      description="Birinchi mahsulotingizni joylashtiring!"
                    />
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
              {savedLoading ? (
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
                  title="Saqlangan mahsulotlar yo'q"
                  description="Yoqtirgan mahsulotlaringizni saqlang"
                />
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Product Detail */}
      <ProductDetail 
        product={selectedProduct} 
        onClose={() => setSelectedProduct(null)} 
        onSellerClick={(id) => { setSelectedProduct(null); setSelectedSellerId(id); }}
      />
      <CreateProductDialog open={showCreateProduct} onOpenChange={setShowCreateProduct} onSuccess={() => { refreshSeller(); refreshProducts(); }} />
      <CartSheet open={showCart} onOpenChange={setShowCart} />
      <SellerStorefront 
        sellerId={selectedSellerId} 
        onClose={() => setSelectedSellerId(null)} 
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
                  { id: 'newest', label: "Eng yangi" },
                  { id: 'popular', label: "Mashhur" },
                  { id: 'price_low', label: "Arzon → Qimmat" },
                  { id: 'price_high', label: "Qimmat → Arzon" },
                ].map(s => (
                  <button
                    key={s.id}
                    onClick={() => setSortBy(s.id)}
                    className={cn(
                      "py-2.5 px-3 rounded-xl text-sm font-medium transition-all border",
                      sortBy === s.id 
                        ? "bg-primary text-primary-foreground border-primary shadow-lg shadow-primary/20" 
                        : "bg-muted/50 border-border/30 text-muted-foreground hover:bg-muted"
                    )}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-3">
              <label className="text-sm font-medium">Narx oralig'i: ${priceRange[0]} — ${priceRange[1]}</label>
              <Slider
                value={priceRange}
                min={0}
                max={10000}
                step={100}
                onValueChange={setPriceRange}
                className="py-2"
              />
            </div>
            <Button className="w-full rounded-xl h-11" onClick={() => setShowFilters(false)}>
              Qo'llash
            </Button>
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

function EmptyState({ icon, title, description }: { icon: React.ReactNode; title: string; description: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="text-muted-foreground/20 mb-4">{icon}</div>
      <h3 className="font-semibold text-lg mb-1">{title}</h3>
      <p className="text-sm text-muted-foreground max-w-xs">{description}</p>
    </div>
  );
}

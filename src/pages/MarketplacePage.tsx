import { useState, useCallback } from 'react';
import { Search, Filter, ShoppingBag, Plus, Store, Package, Heart, TrendingUp, Sparkles, LayoutDashboard } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useHapticFeedback } from '@/hooks/useHapticFeedback';
import { PullToRefresh } from '@/components/PullToRefresh';
import { useIsMobile } from '@/hooks/use-mobile';
import { useAuth } from '@/contexts/AuthContext';
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
import { cn } from '@/lib/utils';

export default function MarketplacePage() {
  const isMobile = useIsMobile();
  const { user } = useAuth();
  const { triggerHaptic } = useHapticFeedback();
  
  // State
  const [activeTab, setActiveTab] = useState('browse');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [showCreateProduct, setShowCreateProduct] = useState(false);
  const [showCart, setShowCart] = useState(false);
  const [showDashboard, setShowDashboard] = useState(false);
  
  // Data hooks
  const { categories } = useCategories();
  const { products, isLoading: productsLoading, refresh: refreshProducts } = useProducts(
    selectedCategory,
    searchQuery
  );
  const { products: sellerProducts, seller, isLoading: sellerLoading, refresh: refreshSeller } = useSellerProducts();
  const { products: savedProducts, isLoading: savedLoading, refresh: refreshSaved } = useSavedProducts();
  const { items: cartItems } = useCart();

  const handleRefresh = useCallback(async () => {
    if (activeTab === 'browse') {
      await refreshProducts();
    } else if (activeTab === 'selling') {
      await refreshSeller();
    } else if (activeTab === 'saved') {
      await refreshSaved();
    }
  }, [activeTab, refreshProducts, refreshSeller, refreshSaved]);

  const handleCategorySelect = (slug: string) => {
    triggerHaptic('light');
    setSelectedCategory(slug);
  };

  const handleProductSelect = (product: Product) => {
    triggerHaptic('light');
    setSelectedProduct(product);
  };

  const pageContent = (
    <div className="min-h-screen bg-background pb-24 md:pb-4">
      {/* Header */}
      <div className="sticky top-0 z-30 bg-background/95 backdrop-blur-md border-b border-border">
        <div className="p-4 space-y-4">
          {/* Title & Cart */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                <Store className="h-5 w-5 text-primary" />
              </div>
              <div>
                <h1 className="text-xl font-bold">Marketplace</h1>
                <p className="text-xs text-muted-foreground">B2B · B2C · C2C</p>
              </div>
            </div>
            <Button 
              variant="outline" 
              size="icon" 
              className="relative"
              onClick={() => setShowCart(true)}
            >
              <ShoppingBag className="h-5 w-5" />
              {cartItems.length > 0 && (
                <span className="absolute -top-1.5 -right-1.5 h-5 w-5 rounded-full bg-primary text-primary-foreground text-xs flex items-center justify-center font-medium">
                  {cartItems.length}
                </span>
              )}
            </Button>
          </div>
          
          {/* Search */}
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search products, sellers..."
                className="pl-10 bg-muted/50 border-0"
              />
            </div>
            <Button variant="outline" size="icon">
              <Filter className="h-4 w-4" />
            </Button>
          </div>

          {/* Categories - only show in browse tab */}
          {activeTab === 'browse' && (
            <ScrollArea className="w-full">
              <div className="flex gap-2 pb-2">
                <Badge
                  variant={selectedCategory === 'all' ? 'default' : 'secondary'}
                  className="cursor-pointer whitespace-nowrap py-2 px-4 transition-all"
                  onClick={() => handleCategorySelect('all')}
                >
                  <Sparkles className="h-3 w-3 mr-1.5" />
                  All
                </Badge>
                {categories.map((cat) => (
                  <Badge
                    key={cat.id}
                    variant={selectedCategory === cat.slug ? 'default' : 'secondary'}
                    className="cursor-pointer whitespace-nowrap py-2 px-4 transition-all"
                    onClick={() => handleCategorySelect(cat.slug)}
                  >
                    <span className="mr-1.5">{cat.icon}</span>
                    {cat.name}
                  </Badge>
                ))}
              </div>
            </ScrollArea>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="p-4">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="w-full mb-4 grid grid-cols-3">
            <TabsTrigger value="browse" className="gap-2">
              <TrendingUp className="h-4 w-4" />
              <span className="hidden sm:inline">Browse</span>
            </TabsTrigger>
            <TabsTrigger value="selling" className="gap-2">
              <Package className="h-4 w-4" />
              <span className="hidden sm:inline">Selling</span>
            </TabsTrigger>
            <TabsTrigger value="saved" className="gap-2">
              <Heart className="h-4 w-4" />
              <span className="hidden sm:inline">Saved</span>
            </TabsTrigger>
          </TabsList>

          {/* Browse Tab */}
          <TabsContent value="browse" className="mt-0">
            {productsLoading ? (
              <div className="grid grid-cols-2 gap-3">
                {[...Array(6)].map((_, i) => (
                  <div key={i} className="aspect-[3/4] rounded-xl bg-muted animate-pulse" />
                ))}
              </div>
            ) : products.length > 0 ? (
              <div className="grid grid-cols-2 gap-3">
                {products.map((product) => (
                  <ProductCard
                    key={product.id}
                    product={product}
                    onSelect={handleProductSelect}
                    onLikeChange={refreshProducts}
                  />
                ))}
              </div>
            ) : (
              <div className="text-center py-12">
                <Package className="h-16 w-16 mx-auto text-muted-foreground/30 mb-4" />
                <h3 className="font-semibold mb-2">No products found</h3>
                <p className="text-sm text-muted-foreground">
                  {searchQuery 
                    ? 'Try a different search term' 
                    : 'Be the first to list a product!'}
                </p>
              </div>
            )}
          </TabsContent>

          {/* Selling Tab */}
          <TabsContent value="selling" className="mt-0">
            {!user ? (
              <div className="text-center py-12">
                <Store className="h-16 w-16 mx-auto text-muted-foreground/30 mb-4" />
                <h3 className="font-semibold mb-2">Login to start selling</h3>
                <p className="text-sm text-muted-foreground mb-4">
                  Create an account to list your products
                </p>
              </div>
            ) : !seller ? (
              <BecomeSeller onSuccess={refreshSeller} />
            ) : showDashboard ? (
              <div className="space-y-4">
                <Button 
                  variant="outline" 
                  onClick={() => setShowDashboard(false)}
                  className="mb-4"
                >
                  ← Back to Products
                </Button>
                <SellerDashboard />
              </div>
            ) : (
              <div className="space-y-4">
                {/* Seller stats */}
                <div className="grid grid-cols-3 gap-3">
                  <div className="bg-muted/50 rounded-xl p-4 text-center">
                    <p className="text-2xl font-bold">{sellerProducts.length}</p>
                    <p className="text-xs text-muted-foreground">Listings</p>
                  </div>
                  <div className="bg-muted/50 rounded-xl p-4 text-center">
                    <p className="text-2xl font-bold">{seller.total_sales}</p>
                    <p className="text-xs text-muted-foreground">Sales</p>
                  </div>
                  <div className="bg-muted/50 rounded-xl p-4 text-center">
                    <p className="text-2xl font-bold">{seller.rating > 0 ? seller.rating.toFixed(1) : '-'}</p>
                    <p className="text-xs text-muted-foreground">Rating</p>
                  </div>
                </div>

                {/* Dashboard button */}
                <Button 
                  variant="outline"
                  className="w-full"
                  onClick={() => setShowDashboard(true)}
                >
                  <LayoutDashboard className="h-4 w-4 mr-2" />
                  Seller Dashboard
                </Button>

                {/* Add product button */}
                <Button 
                  className="w-full" 
                  size="lg"
                  onClick={() => setShowCreateProduct(true)}
                >
                  <Plus className="h-4 w-4 mr-2" />
                  List New Product
                </Button>

                {/* Seller's products */}
                {sellerLoading ? (
                  <div className="grid grid-cols-2 gap-3">
                    {[...Array(4)].map((_, i) => (
                      <div key={i} className="aspect-[3/4] rounded-xl bg-muted animate-pulse" />
                    ))}
                  </div>
                ) : sellerProducts.length > 0 ? (
                  <div className="grid grid-cols-2 gap-3">
                    {sellerProducts.map((product) => (
                      <ProductCard
                        key={product.id}
                        product={product}
                        onSelect={handleProductSelect}
                      />
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8">
                    <Package className="h-12 w-12 mx-auto text-muted-foreground/30 mb-3" />
                    <p className="text-sm text-muted-foreground">
                      No products yet. List your first item!
                    </p>
                  </div>
                )}
              </div>
            )}
          </TabsContent>

          {/* Saved Tab */}
          <TabsContent value="saved" className="mt-0">
            {savedLoading ? (
              <div className="grid grid-cols-2 gap-3">
                {[...Array(4)].map((_, i) => (
                  <div key={i} className="aspect-[3/4] rounded-xl bg-muted animate-pulse" />
                ))}
              </div>
            ) : savedProducts.length > 0 ? (
              <div className="grid grid-cols-2 gap-3">
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
              <div className="text-center py-12">
                <Heart className="h-16 w-16 mx-auto text-muted-foreground/30 mb-4" />
                <h3 className="font-semibold mb-2">No saved items</h3>
                <p className="text-sm text-muted-foreground">
                  Tap the heart icon to save products
                </p>
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>

      {/* Product Detail Sheet */}
      <ProductDetail 
        product={selectedProduct} 
        onClose={() => setSelectedProduct(null)} 
      />

      {/* Create Product Dialog */}
      <CreateProductDialog
        open={showCreateProduct}
        onOpenChange={setShowCreateProduct}
        onSuccess={() => {
          refreshSeller();
          refreshProducts();
        }}
      />

      {/* Cart Sheet */}
      <CartSheet open={showCart} onOpenChange={setShowCart} />
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

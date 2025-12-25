import { useState } from 'react';
import { Search, Filter, ShoppingBag, Heart, Star, MapPin } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useHapticFeedback } from '@/hooks/useHapticFeedback';

interface Product {
  id: string;
  title: string;
  price: number;
  image: string;
  seller: string;
  location: string;
  rating: number;
  isFavorite: boolean;
  category: string;
}

const categories = [
  'All',
  'Electronics',
  'Fashion',
  'Home',
  'Sports',
  'Books',
  'Auto',
  'Services'
];

const mockProducts: Product[] = [
  {
    id: '1',
    title: 'iPhone 14 Pro Max',
    price: 899,
    image: 'https://images.unsplash.com/photo-1678685888221-cda773a3dcdb?w=400',
    seller: 'TechStore',
    location: 'New York',
    rating: 4.8,
    isFavorite: false,
    category: 'Electronics'
  },
  {
    id: '2',
    title: 'Nike Air Max 270',
    price: 150,
    image: 'https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=400',
    seller: 'SneakerWorld',
    location: 'Los Angeles',
    rating: 4.5,
    isFavorite: true,
    category: 'Fashion'
  },
  {
    id: '3',
    title: 'MacBook Pro M3',
    price: 1999,
    image: 'https://images.unsplash.com/photo-1517336714731-489689fd1ca8?w=400',
    seller: 'AppleReseller',
    location: 'San Francisco',
    rating: 4.9,
    isFavorite: false,
    category: 'Electronics'
  },
  {
    id: '4',
    title: 'Vintage Leather Jacket',
    price: 250,
    image: 'https://images.unsplash.com/photo-1551028719-00167b16eac5?w=400',
    seller: 'VintageStyle',
    location: 'Chicago',
    rating: 4.3,
    isFavorite: false,
    category: 'Fashion'
  },
  {
    id: '5',
    title: 'Modern Desk Lamp',
    price: 75,
    image: 'https://images.unsplash.com/photo-1507473885765-e6ed057f782c?w=400',
    seller: 'HomeDecor',
    location: 'Miami',
    rating: 4.6,
    isFavorite: true,
    category: 'Home'
  },
  {
    id: '6',
    title: 'Sony WH-1000XM5',
    price: 350,
    image: 'https://images.unsplash.com/photo-1618366712010-f4ae9c647dcb?w=400',
    seller: 'AudioHub',
    location: 'Seattle',
    rating: 4.7,
    isFavorite: false,
    category: 'Electronics'
  },
];

export default function MarketplacePage() {
  const { triggerHaptic } = useHapticFeedback();
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [products, setProducts] = useState(mockProducts);
  const [searchQuery, setSearchQuery] = useState('');

  const filteredProducts = products.filter(p => {
    const matchesCategory = selectedCategory === 'All' || p.category === selectedCategory;
    const matchesSearch = p.title.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  const toggleFavorite = (id: string) => {
    triggerHaptic('medium');
    setProducts(prev => prev.map(p => 
      p.id === id ? { ...p, isFavorite: !p.isFavorite } : p
    ));
  };

  return (
    <div className="min-h-screen bg-background pb-20">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-background/95 backdrop-blur-md border-b border-border p-4 space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold">Marketplace</h1>
          <Button variant="ghost" size="icon">
            <ShoppingBag className="h-5 w-5" />
          </Button>
        </div>
        
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search products..."
              className="pl-10 bg-muted/50 border-0"
            />
          </div>
          <Button variant="outline" size="icon">
            <Filter className="h-4 w-4" />
          </Button>
        </div>

        {/* Categories */}
        <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide -mx-4 px-4">
          {categories.map((cat) => (
            <Badge
              key={cat}
              variant={selectedCategory === cat ? 'default' : 'secondary'}
              className="cursor-pointer whitespace-nowrap py-2 px-4"
              onClick={() => {
                triggerHaptic('light');
                setSelectedCategory(cat);
              }}
            >
              {cat}
            </Badge>
          ))}
        </div>
      </div>

      {/* Products Grid */}
      <div className="p-4">
        <Tabs defaultValue="browse">
          <TabsList className="w-full mb-4">
            <TabsTrigger value="browse" className="flex-1">Browse</TabsTrigger>
            <TabsTrigger value="selling" className="flex-1">Selling</TabsTrigger>
            <TabsTrigger value="saved" className="flex-1">Saved</TabsTrigger>
          </TabsList>

          <TabsContent value="browse" className="mt-0">
            <div className="grid grid-cols-2 gap-3">
              {filteredProducts.map((product) => (
                <ProductCard
                  key={product.id}
                  product={product}
                  onFavorite={() => toggleFavorite(product.id)}
                />
              ))}
            </div>
            {filteredProducts.length === 0 && (
              <div className="text-center py-12 text-muted-foreground">
                No products found
              </div>
            )}
          </TabsContent>

          <TabsContent value="selling" className="mt-0">
            <div className="text-center py-12">
              <ShoppingBag className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <h3 className="font-medium mb-2">Start Selling</h3>
              <p className="text-sm text-muted-foreground mb-4">
                List your first item and reach thousands of buyers
              </p>
              <Button>
                List an Item
              </Button>
            </div>
          </TabsContent>

          <TabsContent value="saved" className="mt-0">
            <div className="grid grid-cols-2 gap-3">
              {products.filter(p => p.isFavorite).map((product) => (
                <ProductCard
                  key={product.id}
                  product={product}
                  onFavorite={() => toggleFavorite(product.id)}
                />
              ))}
            </div>
            {products.filter(p => p.isFavorite).length === 0 && (
              <div className="text-center py-12 text-muted-foreground">
                No saved items yet
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

function ProductCard({ product, onFavorite }: { product: Product; onFavorite: () => void }) {
  const { triggerHaptic } = useHapticFeedback();
  
  return (
    <Card className="overflow-hidden group cursor-pointer">
      <div className="relative aspect-square">
        <img
          src={product.image}
          alt={product.title}
          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
        />
        <Button
          variant="ghost"
          size="icon"
          className="absolute top-2 right-2 bg-background/80 backdrop-blur-sm h-8 w-8"
          onClick={(e) => {
            e.stopPropagation();
            onFavorite();
          }}
        >
          <Heart
            className={`h-4 w-4 ${product.isFavorite ? 'fill-red-500 text-red-500' : ''}`}
          />
        </Button>
      </div>
      <div className="p-3">
        <h3 className="font-medium text-sm truncate">{product.title}</h3>
        <p className="text-lg font-bold text-primary">${product.price}</p>
        <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
          <div className="flex items-center gap-1">
            <Star className="h-3 w-3 fill-yellow-400 text-yellow-400" />
            {product.rating}
          </div>
          <span>•</span>
          <div className="flex items-center gap-1">
            <MapPin className="h-3 w-3" />
            {product.location}
          </div>
        </div>
      </div>
    </Card>
  );
}

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { db } from '@/lib/supabaseAny';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { getShippingCost } from '@/lib/marketplace';

export interface Category {
  id: string;
  name: string;
  slug: string;
  icon: string | null;
  position: number;
}

export interface Seller {
  id: string;
  user_id: string;
  business_name: string;
  business_type: string;
  description: string | null;
  logo_url: string | null;
  location: string | null;
  is_verified: boolean;
  rating: number;
  total_sales: number;
  status: string;
  profile?: {
    username: string | null;
    display_name: string | null;
    avatar_url: string | null;
  };
}

export interface Product {
  id: string;
  seller_id: string;
  category_id: string | null;
  title: string;
  description: string | null;
  price: number;
  compare_at_price: number | null;
  currency: string;
  quantity: number;
  condition: string;
  location: string | null;
  latitude?: number | null;
  longitude?: number | null;
  shipping_available: boolean;
  shipping_price: number;
  is_negotiable: boolean;
  is_featured: boolean;
  status: string;
  views_count: number;
  likes_count: number;
  created_at: string;
  images: { id: string; url: string; position: number }[];
  seller?: Seller;
  category?: Category;
  is_liked?: boolean;
}

export interface CartItem {
  id: string;
  product_id: string;
  quantity: number;
  product?: Product;
}

export function useCategories() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchCategories = async () => {
      const { data, error: fetchError } = await supabase
        .from('product_categories')
        .select('*')
        .order('position');

      if (fetchError) {
        setError(fetchError.message);
      } else if (data) {
        setCategories(data);
      }
      setIsLoading(false);
    };

    fetchCategories();
  }, []);

  return { categories, isLoading, error };
}

export function useProducts(categorySlug?: string, searchQuery?: string) {
  const { user } = useAuth();
  const [products, setProducts] = useState<Product[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchProducts = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    let query = supabase
      .from('products')
      .select(`
        *,
        seller:sellers(
          id,
          user_id,
          business_name,
          business_type,
          logo_url,
          location,
          is_verified,
          rating,
          total_sales,
          profile:profiles(username, display_name, avatar_url)
        ),
        category:product_categories(id, name, slug, icon),
        images:product_images(id, url, position)
      `)
      .eq('status', 'active')
      .order('created_at', { ascending: false });

    if (categorySlug && categorySlug !== 'all') {
      const { data: cat } = await supabase
        .from('product_categories')
        .select('id')
        .eq('slug', categorySlug)
        .maybeSingle();

      if (cat) {
        query = query.eq('category_id', cat.id);
      }
    }

    if (searchQuery) {
      // Escape wildcard characters so a user typing % or _ cannot break the filter
      const safe = searchQuery.replace(/[%_]/g, (m) => `\\${m}`);
      query = query.or(`title.ilike.%${safe}%,description.ilike.%${safe}%`);
    }

    const { data, error: fetchError } = await query.limit(50);

    if (fetchError) {
      setError(fetchError.message);
      setIsLoading(false);
      return;
    }

    if (data) {
      // Get user likes
      let likedProductIds: string[] = [];
      if (user) {
        const { data: likes } = await supabase
          .from('product_likes')
          .select('product_id')
          .eq('user_id', user.id);

        likedProductIds = likes?.map(l => l.product_id) || [];
      }

      const productsWithLikes = data.map(p => ({
        ...p,
        seller: p.seller as unknown as Seller,
        category: p.category as unknown as Category,
        images: ((p.images ?? []) as { id: string; url: string; position: number }[])
          .slice()
          .sort((a, b) => a.position - b.position),
        is_liked: likedProductIds.includes(p.id),
      }));

      setProducts(productsWithLikes);
    }
    setIsLoading(false);
  }, [categorySlug, searchQuery, user]);

  useEffect(() => {
    fetchProducts();
  }, [fetchProducts]);

  return { products, isLoading, error, refresh: fetchProducts };
}


interface MarketplaceCenter {
  latitude: number;
  longitude: number;
}

function mapMarketplaceProduct(row: any, likedProductIds: string[] = []): Product {
  return {
    ...row,
    seller: row.seller as Seller | undefined,
    category: row.category as Category | undefined,
    images: ((row.images ?? []) as { id: string; url: string; position: number }[])
      .slice()
      .sort((a, b) => a.position - b.position),
    is_liked: likedProductIds.includes(row.id),
  } as Product;
}

/**
 * Xarita -> Marketplace yaqin e'lonlar rejimi. Query server tomonda koordinata
 * bounding-box bilan cheklanadi, shuning uchun faqat oxirgi 50 ta mahsulotni
 * clientda filtrlash xatosi yo'q.
 */
export function useNearbyMarketplaceProducts(center?: MarketplaceCenter | null, radiusKm = 5) {
  const { user } = useAuth();
  const [products, setProducts] = useState<Product[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchProducts = useCallback(async () => {
    if (!center) {
      setProducts([]);
      setError(null);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);
    try {
      const dLat = radiusKm / 111;
      const dLng = radiusKm / (111 * Math.max(0.2, Math.cos((center.latitude * Math.PI) / 180)));

      const { data, error: fetchError } = await db
        .from('products')
        .select(`
          *,
          seller:sellers(
            id, user_id, business_name, business_type, logo_url, location,
            is_verified, rating, total_sales,
            profile:profiles(username, display_name, avatar_url)
          ),
          category:product_categories(id, name, slug, icon),
          images:product_images(id, url, position)
        `)
        .eq('status', 'active')
        .not('latitude', 'is', null)
        .not('longitude', 'is', null)
        .gte('latitude', center.latitude - dLat)
        .lte('latitude', center.latitude + dLat)
        .gte('longitude', center.longitude - dLng)
        .lte('longitude', center.longitude + dLng)
        .order('created_at', { ascending: false })
        .limit(100);

      if (fetchError) throw fetchError;

      let likedProductIds: string[] = [];
      if (user && data?.length) {
        const ids = data.map((row: any) => row.id);
        const { data: likes } = await db
          .from('product_likes')
          .select('product_id')
          .eq('user_id', user.id)
          .in('product_id', ids);
        likedProductIds = (likes ?? []).map((row: any) => row.product_id);
      }

      const toRad = (value: number) => (value * Math.PI) / 180;
      const distanceM = (lat: number, lng: number) => {
        const dLatR = toRad(lat - center.latitude);
        const dLngR = toRad(lng - center.longitude);
        const a =
          Math.sin(dLatR / 2) ** 2 +
          Math.cos(toRad(center.latitude)) *
            Math.cos(toRad(lat)) *
            Math.sin(dLngR / 2) ** 2;
        return 2 * 6371000 * Math.asin(Math.sqrt(a));
      };

      const result = (data ?? [])
        .filter((row: any) => {
          const lat = Number(row.latitude);
          const lng = Number(row.longitude);
          return Number.isFinite(lat) && Number.isFinite(lng) && distanceM(lat, lng) <= radiusKm * 1000;
        })
        .sort((a: any, b: any) => distanceM(Number(a.latitude), Number(a.longitude)) - distanceM(Number(b.latitude), Number(b.longitude)))
        .map((row: any) => mapMarketplaceProduct(row, likedProductIds));

      setProducts(result);
    } catch (err) {
      setProducts([]);
      setError(err instanceof Error ? err.message : "Yaqin e'lonlar yuklanmadi");
    } finally {
      setIsLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [center?.latitude, center?.longitude, radiusKm, user?.id]);

  useEffect(() => {
    void fetchProducts();
  }, [fetchProducts]);

  return { products, isLoading, error, refresh: fetchProducts };
}

/** Marketplace deep-link kartasini ID bo'yicha to'liq yuklaydi. */
export async function fetchMarketplaceProductById(productId: string): Promise<Product | null> {
  if (!productId) return null;
  const { data, error } = await db
    .from('products')
    .select(`
      *,
      seller:sellers(
        id, user_id, business_name, business_type, description, logo_url, location,
        is_verified, rating, total_sales,
        profile:profiles(username, display_name, avatar_url)
      ),
      category:product_categories(id, name, slug, icon),
      images:product_images(id, url, position)
    `)
    .eq('id', productId)
    .maybeSingle();

  if (error || !data) return null;
  return mapMarketplaceProduct(data);
}

export function useSellerProducts() {
  const { user } = useAuth();
  const [products, setProducts] = useState<Product[]>([]);
  const [seller, setSeller] = useState<Seller | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const fetchSellerProducts = useCallback(async () => {
    if (!user) {
      setIsLoading(false);
      return;
    }

    // Get seller profile
    const { data: sellerData } = await supabase
      .from('sellers')
      .select('id, user_id, business_name, business_type, description, logo_url, cover_url, location, website, is_verified, rating, total_reviews, total_sales, status, created_at, updated_at')
      .eq('user_id', user.id)
      .maybeSingle();

    if (sellerData) {
      setSeller(sellerData as Seller);

      // Get seller's products
      const { data } = await supabase
        .from('products')
        .select(`
          *,
          category:product_categories(id, name, slug, icon),
          images:product_images(id, url, position)
        `)
        .eq('seller_id', sellerData.id)
        .neq('status', 'deleted')
        .order('created_at', { ascending: false });

      if (data) {
        setProducts(data.map(p => ({
          ...p,
          category: p.category as unknown as Category,
          images: ((p.images ?? []) as { id: string; url: string; position: number }[])
            .slice()
            .sort((a, b) => a.position - b.position),
        })));
      }
    }
    setIsLoading(false);
  }, [user]);

  useEffect(() => {
    fetchSellerProducts();
  }, [fetchSellerProducts]);

  return { products, seller, isLoading, refresh: fetchSellerProducts };
}

export function useSavedProducts() {
  const { user } = useAuth();
  const [products, setProducts] = useState<Product[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchSavedProducts = useCallback(async () => {
    if (!user) {
      setProducts([]);
      setIsLoading(false);
      return;
    }

    const { data } = await supabase
      .from('product_likes')
      .select(`
        product:products(
          *,
          seller:sellers(id, business_name, logo_url, is_verified, rating, location),
          category:product_categories(id, name, slug, icon),
          images:product_images(id, url, position)
        )
      `)
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (data) {
      const savedProducts = data
        .map(d => d.product)
        .filter(Boolean)
        .map(p => ({
          ...(p as unknown as Product),
          is_liked: true,
        }));
      setProducts(savedProducts);
    }
    setIsLoading(false);
  }, [user]);

  useEffect(() => {
    fetchSavedProducts();
  }, [fetchSavedProducts]);

  return { products, isLoading, refresh: fetchSavedProducts };
}

export function useCart() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [items, setItems] = useState<CartItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchCart = useCallback(async () => {
    if (!user) {
      setItems([]);
      setIsLoading(false);
      return;
    }

    const { data } = await supabase
      .from('cart_items')
      .select(`
        *,
        product:products(
          *,
          seller:sellers(id, business_name, is_verified),
          images:product_images(id, url, position)
        )
      `)
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (data) {
      setItems(data.map(item => ({
        ...item,
        product: item.product as unknown as Product,
      })));
    }
    setIsLoading(false);
  }, [user]);

  useEffect(() => {
    fetchCart();
  }, [fetchCart]);

  /**
   * Adds a product to the cart.
   *
   * The previous implementation upserted a *fixed* quantity, so adding the
   * same product twice silently overwrote the line instead of increasing it,
   * and nothing validated stock or product status. Now the quantity is merged
   * and clamped against live stock.
   */
  const addToCart = async (productId: string, quantity = 1) => {
    if (!user) {
      toast({
        title: 'Tizimga kiring',
        description: "Savatga qo'shish uchun avval tizimga kirishingiz kerak",
        variant: 'destructive',
      });
      return false;
    }

    const requestedQty = Math.max(1, Math.floor(quantity));

    const { data: product, error: productError } = await supabase
      .from('products')
      .select('id, title, quantity, status')
      .eq('id', productId)
      .maybeSingle();

    if (productError || !product) {
      toast({ title: 'Xatolik', description: 'Mahsulot topilmadi', variant: 'destructive' });
      return false;
    }

    const stock = Math.max(0, Number(product.quantity ?? 0));
    if (product.status !== 'active' || stock === 0) {
      toast({
        title: 'Mavjud emas',
        description: 'Bu mahsulot hozirda sotuvda emas',
        variant: 'destructive',
      });
      return false;
    }

    const existing = items.find(i => i.product_id === productId);
    const nextQuantity = Math.min((existing?.quantity ?? 0) + requestedQty, stock);

    if (existing && nextQuantity === existing.quantity) {
      toast({
        title: 'Maksimal miqdor',
        description: `Omborda faqat ${stock} dona mavjud`,
      });
      return false;
    }

    const { error } = existing
      ? await supabase.from('cart_items').update({ quantity: nextQuantity }).eq('id', existing.id)
      : await supabase.from('cart_items').insert({
          user_id: user.id,
          product_id: productId,
          quantity: nextQuantity,
        });

    if (error) {
      toast({ title: 'Xatolik', description: "Savatga qo'shilmadi", variant: 'destructive' });
      return false;
    }

    toast({
      title: "Savatga qo'shildi",
      description: `${product.title} — ${nextQuantity} dona`,
    });
    await fetchCart();
    return true;
  };

  const removeFromCart = async (itemId: string) => {
    const { error } = await supabase
      .from('cart_items')
      .delete()
      .eq('id', itemId);

    if (error) {
      toast({ title: 'Xatolik', description: "O'chirilmadi", variant: 'destructive' });
      return false;
    }

    setItems(prev => prev.filter(i => i.id !== itemId));
    toast({ title: "O'chirildi", description: 'Mahsulot savatdan olindi' });
    return true;
  };

  /** Quantity is clamped to the product's remaining stock. */
  const updateQuantity = async (itemId: string, quantity: number) => {
    if (quantity < 1) {
      return removeFromCart(itemId);
    }

    const item = items.find(i => i.id === itemId);
    const stock = Math.max(1, Number(item?.product?.quantity ?? 1));
    const nextQuantity = Math.min(Math.floor(quantity), stock);

    if (item && nextQuantity === item.quantity) return false;

    const { error } = await supabase
      .from('cart_items')
      .update({ quantity: nextQuantity })
      .eq('id', itemId);

    if (error) {
      toast({ title: 'Xatolik', description: "Miqdor o'zgartirilmadi", variant: 'destructive' });
      return false;
    }

    setItems(prev => prev.map(i => (i.id === itemId ? { ...i, quantity: nextQuantity } : i)));
    return true;
  };

  const clearCart = async () => {
    if (!user) return;

    await supabase
      .from('cart_items')
      .delete()
      .eq('user_id', user.id);

    setItems([]);
  };

  const total = items.reduce(
    (sum, item) => sum + (item.product?.price || 0) * item.quantity,
    0,
  );

  const shippingTotal = items.reduce(
    (sum, item) => sum + getShippingCost(item.product, item.quantity),
    0,
  );

  /** Total units, not lines — the header badge used to show the wrong number. */
  const itemCount = items.reduce((sum, item) => sum + item.quantity, 0);

  /** Lines that can no longer be purchased (sold out or delisted). */
  const unavailableItems = items.filter(
    item => !item.product || item.product.status !== 'active' || Number(item.product.quantity ?? 0) < item.quantity,
  );

  const currency = items[0]?.product?.currency || 'USD';

  return {
    items,
    isLoading,
    total,
    shippingTotal,
    grandTotal: total + shippingTotal,
    itemCount,
    unavailableItems,
    currency,
    addToCart,
    removeFromCart,
    updateQuantity,
    clearCart,
    refresh: fetchCart,
  };
}

export function useProductActions() {
  const { user } = useAuth();
  const { toast } = useToast();

  const toggleLike = async (productId: string, isLiked: boolean) => {
    if (!user) {
      toast({
        title: 'Tizimga kiring',
        description: 'Saqlash uchun tizimga kirishingiz kerak',
        variant: 'destructive',
      });
      return false;
    }

    const { error } = isLiked
      ? await supabase
          .from('product_likes')
          .delete()
          .eq('product_id', productId)
          .eq('user_id', user.id)
      : await supabase
          .from('product_likes')
          .insert({ product_id: productId, user_id: user.id });

    if (error) {
      toast({ title: 'Xatolik', description: error.message, variant: 'destructive' });
      return false;
    }

    return true;
  };

  /** Registers a product view (used by the detail sheet). */
  const registerView = async (productId: string) => {
    await supabase.rpc('increment_product_views', { _product_id: productId });
  };

  const createSeller = async (businessName: string, businessType: string, description?: string) => {
    if (!user) return null;

    const { data, error } = await supabase
      .from('sellers')
      .insert({
        user_id: user.id,
        business_name: businessName,
        business_type: businessType,
        description,
      })
      .select()
      .single();

    if (error) {
      toast({ title: 'Xatolik', description: error.message, variant: 'destructive' });
      return null;
    }

    toast({ title: 'Tayyor', description: "Sotuvchi hisobingiz ochildi!" });
    return data;
  };

  const createProduct = async (product: {
    title: string;
    description?: string;
    price: number;
    category_id?: string;
    condition?: string;
    location?: string;
    quantity?: number;
    is_negotiable?: boolean;
    shipping_available?: boolean;
    shipping_price?: number;
  }, imageUrls: string[]) => {
    if (!user) return null;

    // Get seller
    const { data: seller } = await supabase
      .from('sellers')
      .select('id')
      .eq('user_id', user.id)
      .maybeSingle();

    if (!seller) {
      toast({
        title: 'Xatolik',
        description: 'Avval sotuvchi hisobini yarating',
        variant: 'destructive',
      });
      return null;
    }

    const { data, error } = await supabase
      .from('products')
      .insert({
        seller_id: seller.id,
        ...product,
      })
      .select()
      .single();

    if (error) {
      toast({ title: 'Xatolik', description: error.message, variant: 'destructive' });
      return null;
    }

    // Add images
    if (imageUrls.length > 0) {
      await supabase
        .from('product_images')
        .insert(imageUrls.map((url, i) => ({
          product_id: data.id,
          url,
          position: i,
        })));
    }

    toast({ title: 'Tayyor', description: "Mahsulot e'lon qilindi!" });
    return data;
  };

  const updateProduct = async (productId: string, updates: Partial<Product>) => {
    const { error } = await supabase
      .from('products')
      .update(updates)
      .eq('id', productId);

    if (error) {
      toast({ title: 'Xatolik', description: error.message, variant: 'destructive' });
      return false;
    }

    toast({ title: 'Yangilandi', description: "Mahsulot ma'lumotlari saqlandi" });
    return true;
  };

  const deleteProduct = async (productId: string) => {
    const { error } = await supabase
      .from('products')
      .update({ status: 'deleted' })
      .eq('id', productId);

    if (error) {
      toast({ title: 'Xatolik', description: error.message, variant: 'destructive' });
      return false;
    }

    toast({ title: "O'chirildi", description: 'Mahsulot olib tashlandi' });
    return true;
  };

  return { toggleLike, registerView, createSeller, createProduct, updateProduct, deleteProduct };
}

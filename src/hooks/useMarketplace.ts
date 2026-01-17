import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';

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

  useEffect(() => {
    const fetchCategories = async () => {
      const { data, error } = await supabase
        .from('product_categories')
        .select('*')
        .order('position');

      if (!error && data) {
        setCategories(data);
      }
      setIsLoading(false);
    };

    fetchCategories();
  }, []);

  return { categories, isLoading };
}

export function useProducts(categorySlug?: string, searchQuery?: string) {
  const { user } = useAuth();
  const [products, setProducts] = useState<Product[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchProducts = useCallback(async () => {
    setIsLoading(true);
    
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
        .single();
      
      if (cat) {
        query = query.eq('category_id', cat.id);
      }
    }

    if (searchQuery) {
      query = query.ilike('title', `%${searchQuery}%`);
    }

    const { data, error } = await query.limit(50);

    if (!error && data) {
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
        images: (p.images as { id: string; url: string; position: number }[]).sort((a, b) => a.position - b.position),
        is_liked: likedProductIds.includes(p.id),
      }));

      setProducts(productsWithLikes);
    }
    setIsLoading(false);
  }, [categorySlug, searchQuery, user]);

  useEffect(() => {
    fetchProducts();
  }, [fetchProducts]);

  return { products, isLoading, refresh: fetchProducts };
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
      .select('*')
      .eq('user_id', user.id)
      .single();

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
          images: (p.images as { id: string; url: string; position: number }[]).sort((a, b) => a.position - b.position),
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
      .eq('user_id', user.id);

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

  const addToCart = async (productId: string, quantity = 1) => {
    if (!user) {
      toast({ title: 'Please login', description: 'You need to login to add items to cart', variant: 'destructive' });
      return false;
    }

    const { error } = await supabase
      .from('cart_items')
      .upsert({
        user_id: user.id,
        product_id: productId,
        quantity,
      }, { onConflict: 'user_id,product_id' });

    if (error) {
      toast({ title: 'Error', description: 'Failed to add to cart', variant: 'destructive' });
      return false;
    }

    toast({ title: 'Added to cart', description: 'Product added to your cart' });
    fetchCart();
    return true;
  };

  const removeFromCart = async (itemId: string) => {
    const { error } = await supabase
      .from('cart_items')
      .delete()
      .eq('id', itemId);

    if (!error) {
      setItems(prev => prev.filter(i => i.id !== itemId));
      toast({ title: 'Removed', description: 'Item removed from cart' });
    }
  };

  const updateQuantity = async (itemId: string, quantity: number) => {
    if (quantity < 1) {
      return removeFromCart(itemId);
    }

    const { error } = await supabase
      .from('cart_items')
      .update({ quantity })
      .eq('id', itemId);

    if (!error) {
      setItems(prev => prev.map(i => i.id === itemId ? { ...i, quantity } : i));
    }
  };

  const clearCart = async () => {
    if (!user) return;

    await supabase
      .from('cart_items')
      .delete()
      .eq('user_id', user.id);

    setItems([]);
  };

  const total = items.reduce((sum, item) => {
    return sum + (item.product?.price || 0) * item.quantity;
  }, 0);

  return { items, isLoading, total, addToCart, removeFromCart, updateQuantity, clearCart, refresh: fetchCart };
}

export function useProductActions() {
  const { user } = useAuth();
  const { toast } = useToast();

  const toggleLike = async (productId: string, isLiked: boolean) => {
    if (!user) {
      toast({ title: 'Please login', description: 'You need to login to save items', variant: 'destructive' });
      return false;
    }

    if (isLiked) {
      await supabase
        .from('product_likes')
        .delete()
        .eq('product_id', productId)
        .eq('user_id', user.id);
    } else {
      await supabase
        .from('product_likes')
        .insert({ product_id: productId, user_id: user.id });
    }

    return true;
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
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
      return null;
    }

    toast({ title: 'Success', description: 'Your seller account is ready!' });
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
      .single();

    if (!seller) {
      toast({ title: 'Error', description: 'Please create a seller account first', variant: 'destructive' });
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
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
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

    toast({ title: 'Success', description: 'Product listed successfully!' });
    return data;
  };

  const updateProduct = async (productId: string, updates: Partial<Product>) => {
    const { error } = await supabase
      .from('products')
      .update(updates)
      .eq('id', productId);

    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
      return false;
    }

    toast({ title: 'Updated', description: 'Product updated successfully' });
    return true;
  };

  const deleteProduct = async (productId: string) => {
    const { error } = await supabase
      .from('products')
      .update({ status: 'deleted' })
      .eq('id', productId);

    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
      return false;
    }

    toast({ title: 'Deleted', description: 'Product removed' });
    return true;
  };

  return { toggleLike, createSeller, createProduct, updateProduct, deleteProduct };
}

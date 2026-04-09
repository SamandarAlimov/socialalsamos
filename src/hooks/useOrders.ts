import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { useCart, Product } from '@/hooks/useMarketplace';

export interface OrderItem {
  id: string;
  product_id: string;
  title: string;
  quantity: number;
  price: number;
  total: number;
  product?: {
    images: { url: string }[];
  };
}

export interface Order {
  id: string;
  order_number: string;
  buyer_id: string;
  seller_id: string;
  status: string;
  subtotal: number;
  shipping_cost: number;
  total: number;
  currency: string;
  shipping_address: any;
  notes: string | null;
  created_at: string;
  updated_at: string;
  items: OrderItem[];
  seller?: {
    business_name: string;
    logo_url: string | null;
    is_verified: boolean;
  };
}

export function useOrders() {
  const { user } = useAuth();
  const [orders, setOrders] = useState<Order[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchOrders = useCallback(async () => {
    if (!user) {
      setOrders([]);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);

    const { data, error } = await supabase
      .from('orders')
      .select(`
        *,
        seller:sellers(business_name, logo_url, is_verified),
        items:order_items(
          id, product_id, title, quantity, price, total,
          product:products(images:product_images(url))
        )
      `)
      .eq('buyer_id', user.id)
      .order('created_at', { ascending: false });

    if (!error && data) {
      setOrders(data.map(o => ({
        ...o,
        seller: o.seller as any,
        items: (o.items as any[]) || [],
      })));
    }

    setIsLoading(false);
  }, [user]);

  useEffect(() => {
    fetchOrders();
  }, [fetchOrders]);

  return { orders, isLoading, refresh: fetchOrders };
}

export function useCheckout() {
  const { user } = useAuth();
  const { toast } = useToast();
  const { items: cartItems, total: cartTotal, clearCart } = useCart();
  const [isProcessing, setIsProcessing] = useState(false);

  const placeOrder = async (shippingAddress: any, notes?: string) => {
    if (!user || cartItems.length === 0) return null;

    setIsProcessing(true);

    try {
      // Group items by seller
      const sellerGroups: Record<string, typeof cartItems> = {};
      for (const item of cartItems) {
        const sellerId = item.product?.seller_id;
        if (!sellerId) continue;
        if (!sellerGroups[sellerId]) sellerGroups[sellerId] = [];
        sellerGroups[sellerId].push(item);
      }

      const orderIds: string[] = [];

      for (const [sellerId, items] of Object.entries(sellerGroups)) {
        const subtotal = items.reduce((sum, i) => sum + (i.product?.price || 0) * i.quantity, 0);
        const shippingCost = items.reduce((sum, i) => sum + (i.product?.shipping_price || 0), 0);
        const total = subtotal + shippingCost;

        // Create order
        const { data: order, error: orderError } = await supabase
          .from('orders')
          .insert({
            buyer_id: user.id,
            seller_id: sellerId,
            order_number: 'TMP',
            subtotal,
            shipping_cost: shippingCost,
            total,
            shipping_address: shippingAddress,
            notes: notes || null,
          })
          .select()
          .single();

        if (orderError || !order) {
          toast({ title: 'Xatolik', description: orderError?.message || 'Buyurtma yaratib bo\'lmadi', variant: 'destructive' });
          setIsProcessing(false);
          return null;
        }

        // Create order items
        const orderItems = items.map(item => ({
          order_id: order.id,
          product_id: item.product_id,
          title: item.product?.title || 'Product',
          quantity: item.quantity,
          price: item.product?.price || 0,
          total: (item.product?.price || 0) * item.quantity,
        }));

        await supabase.from('order_items').insert(orderItems);
        orderIds.push(order.id);
      }

      // Clear cart
      await clearCart();

      toast({ title: 'Buyurtma qabul qilindi! ✅', description: 'Buyurtmangiz muvaffaqiyatli yaratildi' });
      setIsProcessing(false);
      return orderIds;
    } catch (err) {
      toast({ title: 'Xatolik', description: 'Buyurtma yaratib bo\'lmadi', variant: 'destructive' });
      setIsProcessing(false);
      return null;
    }
  };

  return { placeOrder, isProcessing, cartItems, cartTotal };
}

export function useSellerStore(sellerId?: string) {
  const [seller, setSeller] = useState<any>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [reviews, setReviews] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchStore = useCallback(async () => {
    if (!sellerId) {
      setIsLoading(false);
      return;
    }

    setIsLoading(true);

    // Fetch seller
    const { data: sellerData } = await supabase
      .from('sellers')
      .select(`
        *,
        profile:profiles(username, display_name, avatar_url, bio, followers_count)
      `)
      .eq('id', sellerId)
      .single();

    if (sellerData) {
      setSeller(sellerData);
    }

    // Fetch products
    const { data: productsData } = await supabase
      .from('products')
      .select(`
        *,
        category:product_categories(id, name, slug, icon),
        images:product_images(id, url, position)
      `)
      .eq('seller_id', sellerId)
      .eq('status', 'active')
      .order('created_at', { ascending: false });

    if (productsData) {
      setProducts(productsData.map(p => ({
        ...p,
        category: p.category as any,
        images: (p.images as any[]).sort((a: any, b: any) => a.position - b.position),
      })));
    }

    // Fetch reviews
    const { data: reviewsData } = await supabase
      .from('product_reviews')
      .select(`
        *,
        user:profiles(username, display_name, avatar_url),
        product:products(title)
      `)
      .in('product_id', productsData?.map(p => p.id) || [])
      .order('created_at', { ascending: false })
      .limit(20);

    if (reviewsData) {
      setReviews(reviewsData);
    }

    setIsLoading(false);
  }, [sellerId]);

  useEffect(() => {
    fetchStore();
  }, [fetchStore]);

  return { seller, products, reviews, isLoading, refresh: fetchStore };
}

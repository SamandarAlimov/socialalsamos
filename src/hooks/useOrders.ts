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
  payment_status: string;
  payment_method: string | null;
  receipt_number: string | null;
  paid_at: string | null;
  failure_reason: string | null;
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


export type CheckoutPaymentMethod = 'wallet' | 'card_on_delivery' | 'cash';

export interface CheckoutResult {
  success: boolean;
  order_ids: string[];
  payment_status: 'paid' | 'pending' | 'failed';
  total: number;
  error?: string;
}

const FAILURE_MESSAGES: Record<string, string> = {
  not_authenticated: 'Iltimos, tizimga kiring',
  invalid_payment_method: "To'lov usuli noto'g'ri",
  empty_cart: "Savat bo'sh",
  insufficient_balance: "Hamyonda mablag' yetarli emas. To'ldiring yoki boshqa usul tanlang.",
};

export function useCheckout() {
  const { user } = useAuth();
  const { toast } = useToast();
  const { items: cartItems, total: cartTotal, refresh: refreshCart } = useCart();
  const [isProcessing, setIsProcessing] = useState(false);

  const placeOrder = async (
    shippingAddress: any,
    paymentMethod: CheckoutPaymentMethod,
    notes?: string,
  ): Promise<CheckoutResult> => {
    if (!user || cartItems.length === 0) {
      return { success: false, order_ids: [], payment_status: 'failed', total: 0, error: 'empty_cart' };
    }

    setIsProcessing(true);
    try {
      const { data, error } = await supabase.rpc('process_marketplace_order', {
        _shipping_address: shippingAddress,
        _payment_method: paymentMethod,
        _notes: notes ?? null,
      });

      if (error) {
        const code = (error.message || '').replace(/^.*:\s*/, '').trim();
        const friendly = FAILURE_MESSAGES[code] || error.message || "Buyurtma amalga oshmadi";
        toast({ title: "To'lov amalga oshmadi", description: friendly, variant: 'destructive' });
        return { success: false, order_ids: [], payment_status: 'failed', total: 0, error: friendly };
      }

      const payload = (data ?? {}) as {
        success?: boolean;
        order_ids?: string[];
        payment_status?: 'paid' | 'pending';
        total?: number;
      };

      await refreshCart();

      toast({
        title: payload.payment_status === 'paid' ? "To'lov muvaffaqiyatli!" : 'Buyurtma qabul qilindi',
        description:
          payload.payment_status === 'paid'
            ? 'Hamyondan yechildi. Sotuvchi tez orada tayyorlaydi.'
            : "Yetkazganda to'lang. Sotuvchi tayyorlashni boshladi.",
      });

      return {
        success: true,
        order_ids: payload.order_ids ?? [],
        payment_status: payload.payment_status ?? 'pending',
        total: payload.total ?? 0,
      };
    } catch (err: any) {
      const msg = err?.message || 'Kutilmagan xatolik';
      toast({ title: 'Xatolik', description: msg, variant: 'destructive' });
      return { success: false, order_ids: [], payment_status: 'failed', total: 0, error: msg };
    } finally {
      setIsProcessing(false);
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

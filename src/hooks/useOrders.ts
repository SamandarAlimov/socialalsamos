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
  status: OrderStatus;
  payment_status: string;
  payment_method: string | null;
  receipt_number: string | null;
  paid_at: string | null;
  failure_reason: string | null;
  cancel_reason?: string | null;
  cancelled_at?: string | null;
  shipped_at?: string | null;
  delivered_at?: string | null;
  refunded_at?: string | null;
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
  buyer?: {
    username: string | null;
    display_name: string | null;
    avatar_url: string | null;
  };
}

export type OrderStatus = 'pending' | 'processing' | 'shipped' | 'delivered' | 'cancelled';

const ORDER_SELECT = `
  *,
  seller:sellers(business_name, logo_url, is_verified),
  items:order_items(
    id, product_id, title, quantity, price, total,
    product:products(images:product_images(url))
  )
`;

/** Orders placed by the signed-in user. */
export function useOrders() {
  const { user } = useAuth();
  const [orders, setOrders] = useState<Order[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchOrders = useCallback(async () => {
    if (!user) {
      setOrders([]);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    const { data, error: queryError } = await supabase
      .from('orders')
      .select(ORDER_SELECT)
      .eq('buyer_id', user.id)
      .order('created_at', { ascending: false });

    if (queryError) {
      setError(queryError.message);
    } else if (data) {
      setOrders(data.map(o => ({
        ...o,
        seller: o.seller as any,
        items: (o.items as any[]) || [],
      })) as Order[]);
    }

    setIsLoading(false);
  }, [user]);

  useEffect(() => {
    fetchOrders();
  }, [fetchOrders]);

  return { orders, isLoading, error, refresh: fetchOrders };
}

/**
 * Orders received by the signed-in seller.
 * The seller side previously had no way to see or advance incoming orders.
 */
export function useSellerOrders() {
  const { user } = useAuth();
  const [orders, setOrders] = useState<Order[]>([]);
  const [sellerId, setSellerId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchOrders = useCallback(async () => {
    if (!user) {
      setOrders([]);
      setSellerId(null);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    const { data: seller } = await supabase
      .from('sellers')
      .select('id')
      .eq('user_id', user.id)
      .maybeSingle();

    if (!seller?.id) {
      setSellerId(null);
      setOrders([]);
      setIsLoading(false);
      return;
    }

    setSellerId(seller.id);

    const { data, error: queryError } = await supabase
      .from('orders')
      .select(`
        *,
        buyer:profiles!orders_buyer_id_fkey(username, display_name, avatar_url),
        items:order_items(
          id, product_id, title, quantity, price, total,
          product:products(images:product_images(url))
        )
      `)
      .eq('seller_id', seller.id)
      .order('created_at', { ascending: false });

    if (queryError) {
      setError(queryError.message);
    } else if (data) {
      setOrders(data.map(o => ({
        ...o,
        buyer: o.buyer as any,
        items: (o.items as any[]) || [],
      })) as Order[]);
    }

    setIsLoading(false);
  }, [user]);

  useEffect(() => {
    fetchOrders();
  }, [fetchOrders]);

  return { orders, sellerId, isLoading, error, refresh: fetchOrders };
}

/** Status codes raised by the SQL state machine, mapped to Uzbek copy. */
const LIFECYCLE_MESSAGES: Record<string, string> = {
  not_authenticated: 'Iltimos, tizimga kiring',
  invalid_status: "Noto'g'ri holat",
  order_not_found: 'Buyurtma topilmadi',
  not_authorized: 'Bu buyurtmani o\u2018zgartirishga ruxsatingiz yo\u2018q',
  seller_only: 'Faqat sotuvchi bu amalni bajara oladi',
  cancel_window_closed: 'Buyurtma yo\u2018lga chiqqan \u2014 bekor qilish uchun sotuvchiga murojaat qiling',
  status_unchanged: 'Buyurtma allaqachon shu holatda',
  order_finalized: 'Buyurtma yakunlangan',
  invalid_transition: "Bu holatga o'tish mumkin emas",
};

function extractCode(message?: string | null) {
  if (!message) return '';
  return message.replace(/^.*:\s*/, '').trim();
}

const STATUS_TOASTS: Record<OrderStatus, string> = {
  pending: 'Buyurtma kutilmoqda',
  processing: 'Buyurtma qabul qilindi va tayyorlanmoqda',
  shipped: "Buyurtma yo'lga chiqdi",
  delivered: 'Buyurtma yetkazildi',
  cancelled: 'Buyurtma bekor qilindi',
};

export interface OrderStatusResult {
  success: boolean;
  status?: OrderStatus;
  refunded?: number;
  receipt_number?: string | null;
  error?: string;
}

/**
 * Advance or cancel an order through the guarded database state machine.
 * All authorization, stock restoration and wallet refunding happens inside
 * `marketplace_update_order_status`, so the client cannot skip a step.
 */
export function useOrderActions() {
  const { toast } = useToast();
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  const updateStatus = useCallback(async (
    orderId: string,
    status: OrderStatus,
    reason?: string,
  ): Promise<OrderStatusResult> => {
    setUpdatingId(orderId);
    try {
      const { data, error } = await supabase.rpc('marketplace_update_order_status', {
        _order_id: orderId,
        _status: status,
        _reason: reason ?? null,
      });

      if (error) {
        const code = extractCode(error.message);
        const friendly = LIFECYCLE_MESSAGES[code] || error.message || 'Amal bajarilmadi';
        toast({ title: 'Amal bajarilmadi', description: friendly, variant: 'destructive' });
        return { success: false, error: friendly };
      }

      const payload = (data ?? {}) as {
        status?: OrderStatus;
        refunded?: number;
        receipt_number?: string | null;
      };
      const refunded = Number(payload.refunded ?? 0);

      toast({
        title: STATUS_TOASTS[status],
        description: refunded > 0
          ? 'Mablag\u2018 hamyoningizga qaytarildi'
          : undefined,
      });

      return {
        success: true,
        status: payload.status ?? status,
        refunded,
        receipt_number: payload.receipt_number ?? null,
      };
    } catch (err: any) {
      const msg = err?.message || 'Kutilmagan xatolik';
      toast({ title: 'Xatolik', description: msg, variant: 'destructive' });
      return { success: false, error: msg };
    } finally {
      setUpdatingId(null);
    }
  }, [toast]);

  const cancelOrder = useCallback(
    (orderId: string, reason?: string) => updateStatus(orderId, 'cancelled', reason),
    [updateStatus],
  );

  return { updateStatus, cancelOrder, updatingId, isUpdating: updatingId !== null };
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
  invalid_shipping_address: "Yetkazib berish manzili to'liq emas",
  empty_cart: "Savat bo'sh",
  invalid_quantity: "Mahsulot soni noto'g'ri",
  product_unavailable: "Mahsulot sotuvda yo'q",
  insufficient_stock: 'Omborda yetarli mahsulot qolmagan',
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
        const code = extractCode(error.message);
        const friendly = FAILURE_MESSAGES[code] || error.message || 'Buyurtma amalga oshmadi';
        toast({ title: "To'lov amalga oshmadi", description: friendly, variant: 'destructive' });
        // the raw code is returned so the UI can offer a targeted recovery action
        return { success: false, order_ids: [], payment_status: 'failed', total: 0, error: code || friendly };
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
        id, user_id, business_name, business_type, description, logo_url, cover_url, location, website, is_verified, rating, total_reviews, total_sales, status, created_at, updated_at,
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

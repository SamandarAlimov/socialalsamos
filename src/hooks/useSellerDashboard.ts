import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { format, subDays } from 'date-fns';
import { db } from '@/lib/db';

export interface Order {
  id: string;
  order_number: string;
  buyer_id: string;
  status: string;
  payment_status?: string;
  payment_method?: string | null;
  currency?: string;
  subtotal: number;
  shipping_cost: number;
  total: number;
  created_at: string;
  cancel_reason?: string | null;
  shipping_address?: any;
  notes?: string | null;
  buyer?: {
    username: string | null;
    display_name: string | null;
    avatar_url: string | null;
  };
  items: OrderItem[];
}

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

export interface DashboardStats {
  totalRevenue: number;
  totalOrders: number;
  totalProducts: number;
  totalViews: number;
  pendingOrders: number;
  completedOrders: number;
  cancelledOrders: number;
  averageOrderValue: number;
  conversionRate: number;
}

export interface RevenueData {
  date: string;
  revenue: number;
  orders: number;
}

/** Error codes raised by marketplace_update_order_status. */
export const ORDER_STATUS_ERRORS: Record<string, string> = {
  not_authenticated: 'Iltimos, tizimga kiring',
  invalid_status: "Noto'g'ri holat",
  order_not_found: 'Buyurtma topilmadi',
  not_authorized: 'Bu buyurtma sizga tegishli emas',
  seller_only: 'Faqat sotuvchi bu amalni bajara oladi',
  cancel_window_closed: 'Bekor qilish muddati tugagan',
  status_unchanged: 'Buyurtma allaqachon shu holatda',
  order_finalized: 'Buyurtma yakunlangan',
  invalid_transition: "Bu holatga o'tish mumkin emas",
};

const EMPTY_STATS: DashboardStats = {
  totalRevenue: 0,
  totalOrders: 0,
  totalProducts: 0,
  totalViews: 0,
  pendingOrders: 0,
  completedOrders: 0,
  cancelledOrders: 0,
  averageOrderValue: 0,
  conversionRate: 0,
};

function dashboardErrorMessage(error: unknown, fallback: string) {
  if (!error) return fallback;
  if (error instanceof Error) return error.message || fallback;
  if (typeof error === 'object') {
    const value = error as { message?: string; details?: string; hint?: string };
    return value.message || value.details || value.hint || fallback;
  }
  return typeof error === 'string' && error ? error : fallback;
}

/**
 * Seller analytics previously used a single deeply embedded PostgREST query:
 * orders -> profiles and orders -> order_items -> products -> product_images.
 * A missing/renamed FK in any cosmetic relationship made PostgREST reject the
 * whole request and the seller saw "Ma'lumotlarni yuklashda xatolik" even when
 * the orders themselves were healthy.
 *
 * Read the authoritative rows directly, then hydrate buyer/media information in
 * independent batch queries. Optional profile/image hydration can now fail
 * without hiding revenue, orders or inventory stats.
 */
async function fetchSellerOrders(sellerId: string): Promise<{
  orders: Order[];
  error: string | null;
}> {
  const { data: orderRows, error: ordersError } = await supabase
    .from('orders')
    .select('*')
    .eq('seller_id', sellerId)
    .order('created_at', { ascending: false });

  if (ordersError) {
    return {
      orders: [],
      error: dashboardErrorMessage(ordersError, 'Buyurtmalar yuklanmadi'),
    };
  }

  const rows = (orderRows ?? []) as any[];
  if (rows.length === 0) return { orders: [], error: null };

  const orderIds = rows.map(row => String(row.id)).filter(Boolean);
  const buyerIds = Array.from(
    new Set(rows.map(row => String(row.buyer_id || '')).filter(Boolean)),
  );

  const { data: itemRows, error: itemsError } = await supabase
    .from('order_items')
    .select('id, order_id, product_id, title, quantity, price, total')
    .in('order_id', orderIds);

  if (itemsError) {
    return {
      orders: rows.map(row => ({ ...row, items: [] })) as Order[],
      error: dashboardErrorMessage(itemsError, 'Buyurtma tarkibi yuklanmadi'),
    };
  }

  const rawItems = (itemRows ?? []) as any[];
  const productIds = Array.from(
    new Set(rawItems.map(item => String(item.product_id || '')).filter(Boolean)),
  );

  const [profilesResult, imagesResult] = await Promise.all([
    buyerIds.length > 0
      ? supabase
          .from('profiles')
          .select('id, username, display_name, avatar_url')
          .in('id', buyerIds)
      : Promise.resolve({ data: [], error: null }),
    productIds.length > 0
      ? supabase
          .from('product_images')
          .select('product_id, url, position')
          .in('product_id', productIds)
          .order('position', { ascending: true })
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (profilesResult.error) {
    console.warn('Seller dashboard buyer profiles unavailable:', profilesResult.error);
  }
  if (imagesResult.error) {
    console.warn('Seller dashboard product images unavailable:', imagesResult.error);
  }

  const buyers = new Map<string, Order['buyer']>();
  ((profilesResult.data ?? []) as any[]).forEach(profile => {
    buyers.set(String(profile.id), {
      username: profile.username ?? null,
      display_name: profile.display_name ?? null,
      avatar_url: profile.avatar_url ?? null,
    });
  });

  const imagesByProduct = new Map<string, { url: string }[]>();
  ((imagesResult.data ?? []) as any[]).forEach(image => {
    const productId = String(image.product_id || '');
    if (!productId || !image.url) return;
    const current = imagesByProduct.get(productId) ?? [];
    current.push({ url: String(image.url) });
    imagesByProduct.set(productId, current);
  });

  const itemsByOrder = new Map<string, OrderItem[]>();
  rawItems.forEach(item => {
    const orderId = String(item.order_id || '');
    if (!orderId) return;
    const productId = String(item.product_id || '');
    const mapped: OrderItem = {
      id: String(item.id),
      product_id: productId,
      title: String(item.title || ''),
      quantity: Number(item.quantity || 0),
      price: Number(item.price || 0),
      total: Number(item.total || 0),
      product: productId
        ? { images: imagesByProduct.get(productId) ?? [] }
        : undefined,
    };
    const current = itemsByOrder.get(orderId) ?? [];
    current.push(mapped);
    itemsByOrder.set(orderId, current);
  });

  return {
    orders: rows.map(row => ({
      ...row,
      buyer: buyers.get(String(row.buyer_id || '')),
      items: itemsByOrder.get(String(row.id)) ?? [],
    })) as Order[],
    error: null,
  };
}

export function useSellerDashboard() {
  const { user } = useAuth();
  const [sellerId, setSellerId] = useState<string | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [stats, setStats] = useState<DashboardStats>(EMPTY_STATS);
  const [revenueData, setRevenueData] = useState<RevenueData[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dateRange, setDateRange] = useState(30); // days

  const fetchSellerData = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    if (!user) {
      setSellerId(null);
      setOrders([]);
      setStats(EMPTY_STATS);
      setRevenueData([]);
      setIsLoading(false);
      return;
    }

    try {
      const { data: seller, error: sellerError } = await supabase
        .from('sellers')
        .select('id')
        .eq('user_id', user.id)
        .maybeSingle();

      if (sellerError) {
        setSellerId(null);
        setOrders([]);
        setStats(EMPTY_STATS);
        setError(dashboardErrorMessage(sellerError, "Sotuvchi profili yuklanmadi"));
        return;
      }

      if (!seller?.id) {
        setSellerId(null);
        setOrders([]);
        setStats(EMPTY_STATS);
        setRevenueData([]);
        return;
      }

      setSellerId(seller.id);

      const [{ orders: hydratedOrders, error: ordersError }, productsResult] = await Promise.all([
        fetchSellerOrders(seller.id),
        supabase
          .from('products')
          .select('id, views_count, status')
          .eq('seller_id', seller.id)
          .neq('status', 'deleted'),
      ]);

      setOrders(hydratedOrders);

      const productsError = productsResult.error;
      if (ordersError || productsError) {
        setError(
          ordersError ||
          dashboardErrorMessage(productsError, 'Mahsulot statistikasi yuklanmadi'),
        );
      }

      const products = productsResult.data ?? [];
      const totalProducts = products.length;
      const totalViews = products.reduce(
        (sum, product) => sum + Number(product.views_count || 0),
        0,
      );

      const allOrders = hydratedOrders;
      const completedOrders = allOrders.filter(order => order.status === 'delivered');
      const pendingOrders = allOrders.filter(order =>
        ['pending', 'processing', 'shipped'].includes(order.status || ''),
      );
      const cancelledOrders = allOrders.filter(order => order.status === 'cancelled');
      const totalRevenue = completedOrders.reduce(
        (sum, order) => sum + Number(order.total || 0),
        0,
      );
      const averageOrderValue = completedOrders.length > 0
        ? totalRevenue / completedOrders.length
        : 0;

      setStats({
        totalRevenue,
        totalOrders: allOrders.length,
        totalProducts,
        totalViews,
        pendingOrders: pendingOrders.length,
        completedOrders: completedOrders.length,
        cancelledOrders: cancelledOrders.length,
        averageOrderValue,
        conversionRate: totalViews > 0 ? (allOrders.length / totalViews) * 100 : 0,
      });

      const revenueByDate: Record<string, { revenue: number; orders: number }> = {};
      for (let index = dateRange - 1; index >= 0; index -= 1) {
        revenueByDate[format(subDays(new Date(), index), 'yyyy-MM-dd')] = {
          revenue: 0,
          orders: 0,
        };
      }

      allOrders.forEach(order => {
        const orderDate = format(new Date(order.created_at), 'yyyy-MM-dd');
        if (!revenueByDate[orderDate]) return;
        revenueByDate[orderDate].orders += 1;
        if (order.status !== 'cancelled' && order.payment_status === 'paid') {
          revenueByDate[orderDate].revenue += Number(order.total || 0);
        }
      });

      setRevenueData(
        Object.entries(revenueByDate).map(([date, data]) => ({
          date: format(new Date(date), 'MMM dd'),
          revenue: data.revenue,
          orders: data.orders,
        })),
      );
    } catch (fetchError) {
      console.error('Seller dashboard failed:', fetchError);
      setError(dashboardErrorMessage(fetchError, "Ma'lumotlarni yuklashda xatolik"));
    } finally {
      setIsLoading(false);
    }
  }, [user, dateRange]);

  useEffect(() => {
    void fetchSellerData();
  }, [fetchSellerData]);

  /**
   * Order state changes are delegated to the guarded database state machine.
   */
  const updateOrderStatus = async (
    orderId: string,
    status: 'processing' | 'shipped' | 'delivered' | 'cancelled',
    reason?: string,
  ): Promise<{ success: boolean; error?: string; refunded?: number }> => {
    const { data, error: rpcError } = await db.rpc('marketplace_update_order_status', {
      _order_id: orderId,
      _status: status,
      _reason: reason ?? null,
    });

    if (rpcError) {
      const code = (rpcError.message || '').replace(/^.*:\s*/, '').trim();
      return { success: false, error: ORDER_STATUS_ERRORS[code] || rpcError.message };
    }

    const payload = (data ?? {}) as { refunded?: number };
    setOrders(previous => previous.map(order =>
      order.id === orderId ? { ...order, status } : order,
    ));
    await fetchSellerData();

    return { success: true, refunded: Number(payload.refunded ?? 0) };
  };

  return {
    sellerId,
    orders,
    stats,
    revenueData,
    isLoading,
    error,
    dateRange,
    setDateRange,
    updateOrderStatus,
    refresh: fetchSellerData,
  };
}

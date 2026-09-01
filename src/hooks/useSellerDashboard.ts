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

export function useSellerDashboard() {
  const { user } = useAuth();
  const [sellerId, setSellerId] = useState<string | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [stats, setStats] = useState<DashboardStats>({
    totalRevenue: 0,
    totalOrders: 0,
    totalProducts: 0,
    totalViews: 0,
    pendingOrders: 0,
    completedOrders: 0,
    cancelledOrders: 0,
    averageOrderValue: 0,
    conversionRate: 0,
  });
  const [revenueData, setRevenueData] = useState<RevenueData[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dateRange, setDateRange] = useState(30); // days

  const fetchSellerData = useCallback(async () => {
    if (!user) {
      setIsLoading(false);
      return;
    }

    setError(null);

    // Get seller (maybeSingle: `single` threw for users without a store)
    const { data: seller } = await supabase
      .from('sellers')
      .select('id')
      .eq('user_id', user.id)
      .maybeSingle();

    if (!seller?.id) {
      setSellerId(null);
      setIsLoading(false);
      return;
    }

    setSellerId(seller.id);

    const { data: ordersData, error: ordersError } = await supabase
      .from('orders')
      .select(`
        *,
        buyer:profiles!orders_buyer_id_fkey(username, display_name, avatar_url),
        items:order_items(
          id,
          product_id,
          title,
          quantity,
          price,
          total,
          product:products(images:product_images(url))
        )
      `)
      .eq('seller_id', seller.id)
      .order('created_at', { ascending: false });

    if (ordersError) setError(ordersError.message);

    if (ordersData) {
      setOrders(ordersData.map(o => ({
        ...o,
        buyer: o.buyer as unknown as Order['buyer'],
        items: (o.items as OrderItem[]) || [],
      })));
    }

    const { data: products } = await supabase
      .from('products')
      .select('id, views_count, status')
      .eq('seller_id', seller.id)
      .neq('status', 'deleted');

    const totalProducts = products?.length || 0;
    const totalViews = products?.reduce((sum, p) => sum + (p.views_count || 0), 0) || 0;

    const allOrders = ordersData || [];
    const completedOrders = allOrders.filter(o => o.status === 'delivered');
    const pendingOrders = allOrders.filter(o => ['pending', 'processing', 'shipped'].includes(o.status || ''));
    const cancelledOrders = allOrders.filter(o => o.status === 'cancelled');
    const totalRevenue = completedOrders.reduce((sum, o) => sum + Number(o.total || 0), 0);

    // Average order value must divide by the same set it sums (delivered),
    // and must never divide by zero.
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

    // Revenue chart: only paid, non-cancelled orders count as revenue
    const revenueByDate: Record<string, { revenue: number; orders: number }> = {};
    for (let i = dateRange - 1; i >= 0; i--) {
      revenueByDate[format(subDays(new Date(), i), 'yyyy-MM-dd')] = { revenue: 0, orders: 0 };
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

    setIsLoading(false);
  }, [user, dateRange]);

  useEffect(() => {
    fetchSellerData();
  }, [fetchSellerData]);

  /**
   * Previously this wrote `orders.status` directly from the client, which
   * skipped every business rule: illegal jumps (pending -> delivered) were
   * allowed, cancelling never restored stock or refunded the buyer, and RLS
   * was the only thing standing between a buyer and another seller's orders.
   * Now it delegates to the guarded state machine in the database.
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
    setOrders(prev => prev.map(o => (o.id === orderId ? { ...o, status } : o)));
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

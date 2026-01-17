import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { format, subDays, startOfDay, endOfDay } from 'date-fns';

export interface Order {
  id: string;
  order_number: string;
  buyer_id: string;
  status: string;
  subtotal: number;
  shipping_cost: number;
  total: number;
  created_at: string;
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
  averageOrderValue: number;
  conversionRate: number;
}

export interface RevenueData {
  date: string;
  revenue: number;
  orders: number;
}

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
    averageOrderValue: 0,
    conversionRate: 0,
  });
  const [revenueData, setRevenueData] = useState<RevenueData[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [dateRange, setDateRange] = useState(30); // days

  const fetchSellerData = useCallback(async () => {
    if (!user) {
      setIsLoading(false);
      return;
    }

    // Get seller
    const { data: seller } = await supabase
      .from('sellers')
      .select('id')
      .eq('user_id', user.id)
      .single();

    if (!seller) {
      setIsLoading(false);
      return;
    }

    setSellerId(seller.id);

    // Fetch orders
    const { data: ordersData } = await supabase
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

    if (ordersData) {
      setOrders(ordersData.map(o => ({
        ...o,
        buyer: o.buyer as Order['buyer'],
        items: (o.items as OrderItem[]) || [],
      })));
    }

    // Fetch products for stats
    const { data: products } = await supabase
      .from('products')
      .select('id, views_count, status')
      .eq('seller_id', seller.id)
      .neq('status', 'deleted');

    const totalProducts = products?.length || 0;
    const totalViews = products?.reduce((sum, p) => sum + (p.views_count || 0), 0) || 0;

    // Calculate stats
    const allOrders = ordersData || [];
    const completedOrders = allOrders.filter(o => o.status === 'delivered');
    const pendingOrders = allOrders.filter(o => ['pending', 'processing', 'shipped'].includes(o.status || ''));
    const totalRevenue = completedOrders.reduce((sum, o) => sum + o.total, 0);
    const averageOrderValue = allOrders.length > 0 ? totalRevenue / completedOrders.length : 0;

    setStats({
      totalRevenue,
      totalOrders: allOrders.length,
      totalProducts,
      totalViews,
      pendingOrders: pendingOrders.length,
      completedOrders: completedOrders.length,
      averageOrderValue: isNaN(averageOrderValue) ? 0 : averageOrderValue,
      conversionRate: totalViews > 0 ? (allOrders.length / totalViews) * 100 : 0,
    });

    // Generate revenue chart data
    const revenueByDate: Record<string, { revenue: number; orders: number }> = {};
    for (let i = dateRange - 1; i >= 0; i--) {
      const date = format(subDays(new Date(), i), 'yyyy-MM-dd');
      revenueByDate[date] = { revenue: 0, orders: 0 };
    }

    allOrders.forEach(order => {
      const orderDate = format(new Date(order.created_at), 'yyyy-MM-dd');
      if (revenueByDate[orderDate]) {
        revenueByDate[orderDate].revenue += order.total;
        revenueByDate[orderDate].orders += 1;
      }
    });

    setRevenueData(
      Object.entries(revenueByDate).map(([date, data]) => ({
        date: format(new Date(date), 'MMM dd'),
        revenue: data.revenue,
        orders: data.orders,
      }))
    );

    setIsLoading(false);
  }, [user, dateRange]);

  useEffect(() => {
    fetchSellerData();
  }, [fetchSellerData]);

  const updateOrderStatus = async (orderId: string, status: string) => {
    const { error } = await supabase
      .from('orders')
      .update({ status })
      .eq('id', orderId);

    if (!error) {
      setOrders(prev => prev.map(o => o.id === orderId ? { ...o, status } : o));
      fetchSellerData();
    }

    return !error;
  };

  return {
    sellerId,
    orders,
    stats,
    revenueData,
    isLoading,
    dateRange,
    setDateRange,
    updateOrderStatus,
    refresh: fetchSellerData,
  };
}

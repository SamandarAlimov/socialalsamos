import { useState } from 'react';
import {
  DollarSign, Package, Eye, ShoppingCart, TrendingUp, Clock, CheckCircle, ChevronRight,
  BarChart3, ArrowUpRight, Loader2, Truck, XCircle, RotateCcw, AlertTriangle, MapPin, Phone,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, BarChart, Bar } from 'recharts';
import { useSellerDashboard, Order } from '@/hooks/useSellerDashboard';
import { useToast } from '@/hooks/use-toast';
import { formatPrice, formatPriceCompact } from '@/lib/marketplace';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';

interface SellerDashboardProps {
  onClose?: () => void;
}

const chartConfig = {
  revenue: { label: 'Tushum', color: 'hsl(var(--foreground))' },
  orders: { label: 'Buyurtmalar', color: 'hsl(var(--chart-2))' },
};

const statusColors: Record<string, string> = {
  pending: 'bg-yellow-500/10 text-yellow-600 border-yellow-500/20',
  processing: 'bg-blue-500/10 text-blue-600 border-blue-500/20',
  shipped: 'bg-purple-500/10 text-purple-600 border-purple-500/20',
  delivered: 'bg-green-500/10 text-green-600 border-green-500/20',
  cancelled: 'bg-red-500/10 text-red-600 border-red-500/20',
};

const statusLabels: Record<string, string> = {
  pending: 'Kutilmoqda',
  processing: 'Tayyorlanmoqda',
  shipped: "Jo'natildi",
  delivered: 'Yetkazildi',
  cancelled: 'Bekor qilindi',
};

/**
 * A seller can only take the single next step in the lifecycle. The old UI
 * offered processing / shipped / delivered as free choices, so an order could
 * jump straight to "delivered" without ever being accepted or shipped.
 */
const NEXT_ACTION: Record<string, { to: 'processing' | 'shipped' | 'delivered'; label: string; icon: any }> = {
  pending: { to: 'processing', label: 'Qabul qilish', icon: Package },
  processing: { to: 'shipped', label: "Jo'natildi", icon: Truck },
  shipped: { to: 'delivered', label: 'Yetkazildi', icon: CheckCircle },
};

export function SellerDashboard({ onClose }: SellerDashboardProps) {
  const {
    stats, orders, revenueData, isLoading, error, dateRange, setDateRange,
    updateOrderStatus, refresh, sellerId,
  } = useSellerDashboard();
  const { toast } = useToast();

  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [cancelTarget, setCancelTarget] = useState<Order | null>(null);

  const runStatusChange = async (
    order: Order,
    status: 'processing' | 'shipped' | 'delivered' | 'cancelled',
    reason?: string,
  ) => {
    setUpdatingId(order.id);
    const result = await updateOrderStatus(order.id, status, reason);
    setUpdatingId(null);
    setCancelTarget(null);

    if (!result.success) {
      toast({
        title: 'Amal bajarilmadi',
        description: result.error || 'Kutilmagan xatolik',
        variant: 'destructive',
      });
      return;
    }

    toast({
      title: statusLabels[status],
      description: (result.refunded ?? 0) > 0
        ? `Xaridorga ${formatPrice(result.refunded!, order.currency)} qaytarildi`
        : undefined,
    });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!sellerId) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <div className="w-16 h-16 rounded-2xl bg-muted/50 flex items-center justify-center mb-4">
          <Package className="h-8 w-8 text-muted-foreground/30" />
        </div>
        <h3 className="font-semibold mb-1">Do'kon topilmadi</h3>
        <p className="text-sm text-muted-foreground max-w-xs">
          Sotishni boshlash uchun avval sotuvchi profilini yarating
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold">Sotuvchi paneli</h2>
          <p className="text-sm text-muted-foreground">Savdo va buyurtmalarni boshqaring</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" className="h-9 w-9 rounded-xl" onClick={refresh} aria-label="Yangilash">
            <RotateCcw className="h-4 w-4" />
          </Button>
          <Select value={dateRange.toString()} onValueChange={v => setDateRange(parseInt(v, 10))}>
            <SelectTrigger className="w-[140px] rounded-xl">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7">Oxirgi 7 kun</SelectItem>
              <SelectItem value="30">Oxirgi 30 kun</SelectItem>
              <SelectItem value="90">Oxirgi 90 kun</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 p-3 rounded-xl bg-destructive/10 text-destructive text-sm">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span className="flex-1">Ma'lumotlarni yuklashda xatolik</span>
          <Button size="sm" variant="ghost" className="h-7" onClick={refresh}>Qayta urinish</Button>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="bg-gradient-to-br from-foreground/5 to-foreground/10 border-foreground/20">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div className="h-10 w-10 rounded-xl bg-foreground/10 flex items-center justify-center">
                <DollarSign className="h-5 w-5 text-foreground" />
              </div>
              {stats.totalRevenue > 0 && (
                <div className="flex items-center gap-1 text-xs text-green-600">
                  <ArrowUpRight className="h-3 w-3" />
                </div>
              )}
            </div>
            <div className="mt-3">
              <p className="text-2xl font-bold tabular-nums">{formatPriceCompact(stats.totalRevenue)}</p>
              <p className="text-xs text-muted-foreground">Yetkazilgan tushum</p>
            </div>
          </CardContent>
        </Card>

        <StatCard icon={<ShoppingCart className="h-5 w-5 text-blue-500" />} tone="bg-blue-500/10"
          value={stats.totalOrders.toString()} label="Buyurtmalar" />
        <StatCard icon={<Package className="h-5 w-5 text-purple-500" />} tone="bg-purple-500/10"
          value={stats.totalProducts.toString()} label="Mahsulotlar" />
        <StatCard icon={<Eye className="h-5 w-5 text-orange-500" />} tone="bg-orange-500/10"
          value={stats.totalViews.toLocaleString()} label="Ko'rishlar" />
      </div>

      {/* Charts */}
      <div className="grid md:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-foreground" />
              Tushum dinamikasi
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ChartContainer config={chartConfig} className="h-[200px] w-full">
              <AreaChart data={revenueData}>
                <defs>
                  <linearGradient id="revenueGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="hsl(var(--foreground))" stopOpacity={0.3} />
                    <stop offset="100%" stopColor="hsl(var(--foreground))" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis dataKey="date" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
                <YAxis tick={{ fontSize: 10 }} tickLine={false} axisLine={false}
                  tickFormatter={value => formatPriceCompact(Number(value))} />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Area type="monotone" dataKey="revenue" stroke="hsl(var(--foreground))" strokeWidth={2} fill="url(#revenueGradient)" />
              </AreaChart>
            </ChartContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-chart-2" />
              Buyurtmalar soni
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ChartContainer config={chartConfig} className="h-[200px] w-full">
              <BarChart data={revenueData}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis dataKey="date" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
                <YAxis tick={{ fontSize: 10 }} tickLine={false} axisLine={false} allowDecimals={false} />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Bar dataKey="orders" fill="hsl(var(--chart-2))" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ChartContainer>
          </CardContent>
        </Card>
      </div>

      {/* Quick stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <MiniStat icon={<Clock className="h-5 w-5 text-yellow-600" />} tone="bg-yellow-500/10"
          wrapper="bg-yellow-500/5 border-yellow-500/20" value={stats.pendingOrders} label="Faol" />
        <MiniStat icon={<CheckCircle className="h-5 w-5 text-green-600" />} tone="bg-green-500/10"
          wrapper="bg-green-500/5 border-green-500/20" value={stats.completedOrders} label="Yakunlangan" />
        <MiniStat icon={<XCircle className="h-5 w-5 text-red-600" />} tone="bg-red-500/10"
          wrapper="bg-red-500/5 border-red-500/20" value={stats.cancelledOrders} label="Bekor qilingan" />
        <MiniStat icon={<DollarSign className="h-5 w-5 text-muted-foreground" />} tone="bg-muted"
          value={formatPriceCompact(stats.averageOrderValue)} label="O'rtacha buyurtma" />
      </div>

      {/* Orders */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            Kelgan buyurtmalar
            {stats.pendingOrders > 0 && <Badge className="text-[10px]">{stats.pendingOrders} faol</Badge>}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {orders.length === 0 ? (
            <div className="text-center py-12 px-4">
              <ShoppingCart className="h-12 w-12 mx-auto text-muted-foreground/30 mb-3" />
              <p className="text-muted-foreground">Hozircha buyurtma yo'q</p>
              <p className="text-sm text-muted-foreground/70">
                Mahsulotlaringiz sotilganda buyurtmalar shu yerda paydo bo'ladi
              </p>
            </div>
          ) : (
            <ScrollArea className="h-[420px]">
              <div className="divide-y">
                {orders.map(order => {
                  const isOpen = selectedOrder?.id === order.id;
                  const next = NEXT_ACTION[order.status];
                  const NextIcon = next?.icon;
                  const isBusy = updatingId === order.id;
                  const canCancel = ['pending', 'processing', 'shipped'].includes(order.status);

                  return (
                    <div
                      key={order.id}
                      className="p-4 hover:bg-muted/50 transition-colors cursor-pointer"
                      onClick={() => setSelectedOrder(isOpen ? null : order)}
                    >
                      <div className="flex items-center gap-4">
                        <Avatar className="h-10 w-10">
                          <AvatarImage src={order.buyer?.avatar_url || ''} />
                          <AvatarFallback>
                            {(order.buyer?.display_name || order.buyer?.username || 'X').charAt(0).toUpperCase()}
                          </AvatarFallback>
                        </Avatar>

                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="font-medium truncate">
                              {order.buyer?.display_name || order.buyer?.username || 'Xaridor'}
                            </p>
                            <Badge variant="outline" className={cn('text-[10px] px-1.5', statusColors[order.status || 'pending'])}>
                              {statusLabels[order.status || 'pending']}
                            </Badge>
                            {order.payment_status === 'paid' && (
                              <Badge variant="outline" className="text-[10px] px-1.5 bg-green-500/10 text-green-600 border-green-500/20">
                                To'landi
                              </Badge>
                            )}
                            {order.payment_status === 'pending' && (
                              <Badge variant="outline" className="text-[10px] px-1.5 bg-amber-500/10 text-amber-600 border-amber-500/20">
                                Yetkazganda
                              </Badge>
                            )}
                            {order.payment_status === 'refunded' && (
                              <Badge variant="outline" className="text-[10px] px-1.5 bg-sky-500/10 text-sky-600 border-sky-500/20">
                                Qaytarilgan
                              </Badge>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground truncate">
                            {order.order_number || order.id.slice(0, 8).toUpperCase()} •{' '}
                            {format(new Date(order.created_at), 'dd.MM.yyyy HH:mm')}
                          </p>
                        </div>

                        <div className="text-right shrink-0">
                          <p className="font-semibold tabular-nums">{formatPrice(order.total, order.currency)}</p>
                          <p className="text-xs text-muted-foreground">{order.items.length} ta mahsulot</p>
                        </div>

                        <ChevronRight className={cn(
                          'h-4 w-4 text-muted-foreground transition-transform shrink-0',
                          isOpen && 'rotate-90',
                        )} />
                      </div>

                      {isOpen && (
                        <div className="mt-4 pt-4 border-t space-y-4" onClick={e => e.stopPropagation()}>
                          <div className="space-y-2">
                            {order.items.map(item => (
                              <div key={item.id} className="flex items-center gap-3">
                                <div className="h-12 w-12 rounded-lg bg-muted overflow-hidden flex items-center justify-center">
                                  {item.product?.images?.[0]?.url ? (
                                    <img src={item.product.images[0].url} alt={item.title}
                                      loading="lazy" className="h-full w-full object-cover" />
                                  ) : (
                                    <Package className="h-4 w-4 text-muted-foreground/40" />
                                  )}
                                </div>
                                <div className="flex-1 min-w-0">
                                  <p className="text-sm font-medium truncate">{item.title}</p>
                                  <p className="text-xs text-muted-foreground tabular-nums">
                                    {formatPrice(item.price, order.currency)} × {item.quantity}
                                  </p>
                                </div>
                                <p className="font-medium tabular-nums">{formatPrice(item.total, order.currency)}</p>
                              </div>
                            ))}
                          </div>

                          {order.shipping_address && (
                            <div className="p-2.5 rounded-lg bg-muted/30 text-xs text-muted-foreground space-y-1">
                              <p className="flex items-center gap-1.5">
                                <MapPin className="h-3.5 w-3.5 text-foreground" />
                                {order.shipping_address.street}, {order.shipping_address.city}
                              </p>
                              <p className="flex items-center gap-1.5">
                                <Phone className="h-3.5 w-3.5 text-foreground" />
                                {order.shipping_address.full_name} • {order.shipping_address.phone}
                              </p>
                            </div>
                          )}

                          {order.cancel_reason && (
                            <p className="text-xs text-muted-foreground">Bekor qilish sababi: {order.cancel_reason}</p>
                          )}

                          {(next || canCancel) && (
                            <div className="flex flex-wrap gap-2">
                              {next && NextIcon && (
                                <Button
                                  size="sm"
                                  className="h-8 text-xs rounded-lg"
                                  disabled={isBusy}
                                  onClick={() => runStatusChange(order, next.to)}
                                >
                                  {isBusy ? (
                                    <Loader2 className="h-3 w-3 animate-spin" />
                                  ) : (
                                    <><NextIcon className="h-3.5 w-3.5 mr-1.5" /> {next.label}</>
                                  )}
                                </Button>
                              )}
                              {canCancel && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="h-8 text-xs rounded-lg text-destructive border-destructive/30 hover:bg-destructive/10"
                                  disabled={isBusy}
                                  onClick={() => setCancelTarget(order)}
                                >
                                  <XCircle className="h-3.5 w-3.5 mr-1.5" />
                                  Bekor qilish
                                </Button>
                              )}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </ScrollArea>
          )}
        </CardContent>
      </Card>

      <AlertDialog open={!!cancelTarget} onOpenChange={open => !open && setCancelTarget(null)}>
        <AlertDialogContent className="rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle>Buyurtmani bekor qilasizmi?</AlertDialogTitle>
            <AlertDialogDescription>
              Mahsulotlar omborga qaytariladi.
              {cancelTarget?.payment_status === 'paid'
                ? ` Xaridorga ${formatPrice(cancelTarget.total, cancelTarget.currency)} to'liq qaytariladi.`
                : " Xaridor hali to'lov qilmagan."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-xl">Yo'q</AlertDialogCancel>
            <AlertDialogAction
              className="rounded-xl bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => cancelTarget && runStatusChange(cancelTarget, 'cancelled', 'Sotuvchi bekor qildi')}
            >
              Ha, bekor qilish
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function StatCard({ icon, tone, value, label }: { icon: React.ReactNode; tone: string; value: string; label: string }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className={cn('h-10 w-10 rounded-xl flex items-center justify-center', tone)}>{icon}</div>
        <div className="mt-3">
          <p className="text-2xl font-bold tabular-nums">{value}</p>
          <p className="text-xs text-muted-foreground">{label}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function MiniStat({
  icon, tone, wrapper, value, label,
}: {
  icon: React.ReactNode; tone: string; wrapper?: string; value: string | number; label: string;
}) {
  return (
    <Card className={wrapper}>
      <CardContent className="p-4 flex items-center gap-3">
        <div className={cn('h-10 w-10 rounded-full flex items-center justify-center shrink-0', tone)}>{icon}</div>
        <div className="min-w-0">
          <p className="text-xl font-bold tabular-nums truncate">{value}</p>
          <p className="text-xs text-muted-foreground">{label}</p>
        </div>
      </CardContent>
    </Card>
  );
}

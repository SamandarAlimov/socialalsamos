import { useEffect, useMemo, useState } from 'react';
import {
  Package, Truck, CheckCircle, XCircle, Loader2, Inbox, AlertTriangle, RotateCcw,
  ChevronDown, ChevronUp, MapPin, Phone, UtensilsCrossed, Clock3, ChefHat,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { SellerShipmentManager } from '@/components/marketplace/SellerShipmentManager';
import { OrderHandoffScanner } from '@/components/marketplace/OrderHandoffScanner';
import { useSellerOrders, useOrderActions, Order, OrderStatus } from '@/hooks/useOrders';
import { statusConfig } from '@/components/marketplace/OrdersView';
import { formatPrice } from '@/lib/marketplace';
import { formatDistanceToNow } from 'date-fns';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { marketplaceUz } from '@/i18n/marketplace';
import { supabase } from '@/integrations/supabase/client';

const FILTER_IDS: Array<'active' | OrderStatus | 'all'> = [
  'active', 'pending', 'processing', 'shipped', 'delivered', 'cancelled', 'all',
];

const GENERIC_FILTER_LABELS: Record<(typeof FILTER_IDS)[number], string> = {
  active: marketplaceUz.sellerOrders.filters.active,
  pending: marketplaceUz.sellerOrders.filters.pending,
  processing: marketplaceUz.sellerOrders.filters.processing,
  shipped: marketplaceUz.sellerOrders.filters.shipped,
  delivered: marketplaceUz.sellerOrders.filters.delivered,
  cancelled: marketplaceUz.sellerOrders.filters.cancelled,
  all: marketplaceUz.sellerOrders.filters.all,
};

const RESTAURANT_FILTER_LABELS: Record<(typeof FILTER_IDS)[number], string> = {
  active: 'Faol',
  pending: 'Yangi',
  processing: 'Tayyorlanmoqda',
  shipped: 'Tayyor / yo‘lda',
  delivered: 'Yakunlangan',
  cancelled: 'Bekor qilingan',
  all: 'Barchasi',
};

function isRestaurantType(value: string | null | undefined) {
  const normalized = String(value || '').trim().toLocaleLowerCase();
  return ['restaurant', 'restoran', 'cafe', 'café', 'food', 'ovqat'].some(token => normalized.includes(token));
}

function restaurantStatusLabel(status: OrderStatus) {
  const labels: Record<OrderStatus, string> = {
    pending: 'Yangi buyurtma',
    processing: 'Tayyorlanmoqda',
    shipped: 'Tayyor / kuryerga berildi',
    delivered: 'Yakunlandi',
    cancelled: 'Bekor qilindi',
  };
  return labels[status];
}

function variantOptionsLabel(options?: Record<string, string> | null) {
  if (!options) return '';
  return Object.entries(options)
    .map(([name, value]) => `${name}: ${value}`)
    .join(' · ');
}

function hasHandoffCode(order: Order) {
  return Boolean(String((order as any).handoff_code || '').trim());
}

export function SellerOrdersView() {
  const { orders, sellerId, isLoading, error, refresh } = useSellerOrders();
  const { updateStatus, cancelOrder, updatingId } = useOrderActions();
  const [filter, setFilter] = useState<'active' | OrderStatus | 'all'>('active');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [cancelTarget, setCancelTarget] = useState<Order | null>(null);
  const [businessType, setBusinessType] = useState<string | null>(null);

  useEffect(() => {
    if (!sellerId) {
      setBusinessType(null);
      return;
    }
    let cancelled = false;
    void supabase
      .from('sellers')
      .select('business_type')
      .eq('id', sellerId)
      .maybeSingle()
      .then(({ data }) => {
        if (!cancelled) setBusinessType(data?.business_type ?? null);
      });
    return () => { cancelled = true; };
  }, [sellerId]);

  const restaurantMode = isRestaurantType(businessType);

  const filtered = useMemo(() => {
    if (filter === 'all') return orders;
    if (filter === 'active') return orders.filter(order => ['pending', 'processing', 'shipped'].includes(order.status));
    return orders.filter(order => order.status === filter);
  }, [orders, filter]);

  const pendingCount = orders.filter(order => order.status === 'pending').length;
  const preparingCount = orders.filter(order => order.status === 'processing').length;
  const readyCount = orders.filter(order => order.status === 'shipped').length;
  const readyHandoffCount = orders.filter(order => order.status === 'shipped' && hasHandoffCode(order)).length;

  const handleAdvance = async (order: Order, to: OrderStatus) => {
    const result = await updateStatus(order.id, to);
    if (result.success) await refresh();
  };

  const handleCancel = async () => {
    if (!cancelTarget) return;
    const result = await cancelOrder(cancelTarget.id, marketplaceUz.sellerOrders.sellerCancelled);
    setCancelTarget(null);
    if (result.success) await refresh();
  };

  const nextAction = (order: Order) => {
    if (restaurantMode) {
      if (order.status === 'pending') return { to: 'processing' as OrderStatus, label: 'Qabul qilish', icon: ChefHat };
      if (order.status === 'processing') return { to: 'shipped' as OrderStatus, label: 'Tayyor', icon: CheckCircle };
      if (order.status === 'shipped' && !hasHandoffCode(order)) {
        return { to: 'delivered' as OrderStatus, label: 'Topshirildi', icon: Truck };
      }
      return null;
    }
    if (order.status === 'pending') return { to: 'processing' as OrderStatus, label: marketplaceUz.sellerOrders.next.accept, icon: Package };
    if (order.status === 'processing') return { to: 'shipped' as OrderStatus, label: marketplaceUz.sellerOrders.next.shipped, icon: Truck };
    if (order.status === 'shipped' && !hasHandoffCode(order)) {
      return { to: 'delivered' as OrderStatus, label: marketplaceUz.sellerOrders.next.delivered, icon: CheckCircle };
    }
    return null;
  };

  if (isLoading) {
    return <div className="flex items-center justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>;
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <AlertTriangle className="mb-3 h-8 w-8 text-destructive" />
        <p className="mb-4 text-sm text-muted-foreground">{marketplaceUz.orders.loadFailed}</p>
        <Button variant="outline" className="rounded-xl" onClick={refresh}><RotateCcw className="mr-2 h-4 w-4" /> Qayta urinish</Button>
      </div>
    );
  }

  if (!sellerId) return null;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <h3 className="flex items-center gap-2 text-sm font-semibold">
            {restaurantMode && <UtensilsCrossed className="h-4 w-4 text-orange-500" />}
            {restaurantMode ? 'Restoran buyurtmalari' : 'Kelgan buyurtmalar'}
            {pendingCount > 0 && <Badge className="text-[10px]">{marketplaceUz.sellerOrders.newCount(pendingCount)}</Badge>}
          </h3>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            {restaurantMode
              ? 'Yangi buyurtmani qabul qiling → tayyorlang → kod/barcode bilan xaridorga topshiring.'
              : 'Buyurtmani qabul qiling, shipmentni yangilang va yakunda kod/barcode bilan topshiring.'}
          </p>
        </div>
        <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0 rounded-lg" onClick={refresh} aria-label={marketplaceUz.sellerOrders.refresh}><RotateCcw className="h-4 w-4" /></Button>
      </div>

      {restaurantMode && (
        <div className="grid grid-cols-3 gap-2">
          <button type="button" onClick={() => setFilter('pending')} className="rounded-2xl border border-border/40 bg-card p-3 text-left transition hover:bg-muted/30">
            <div className="flex items-center justify-between"><Inbox className="h-4 w-4 text-sky-500" /><span className="text-xl font-black tabular-nums">{pendingCount}</span></div>
            <p className="mt-1 text-[10px] font-semibold text-muted-foreground">Yangi</p>
          </button>
          <button type="button" onClick={() => setFilter('processing')} className="rounded-2xl border border-border/40 bg-card p-3 text-left transition hover:bg-muted/30">
            <div className="flex items-center justify-between"><ChefHat className="h-4 w-4 text-orange-500" /><span className="text-xl font-black tabular-nums">{preparingCount}</span></div>
            <p className="mt-1 text-[10px] font-semibold text-muted-foreground">Tayyorlanmoqda</p>
          </button>
          <button type="button" onClick={() => setFilter('shipped')} className="rounded-2xl border border-border/40 bg-card p-3 text-left transition hover:bg-muted/30">
            <div className="flex items-center justify-between"><Clock3 className="h-4 w-4 text-emerald-500" /><span className="text-xl font-black tabular-nums">{readyCount}</span></div>
            <p className="mt-1 text-[10px] font-semibold text-muted-foreground">Tayyor</p>
          </button>
        </div>
      )}

      {readyHandoffCount > 0 && <OrderHandoffScanner onVerified={refresh} />}

      <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 scrollbar-none" role="tablist">
        {FILTER_IDS.map(id => (
          <button
            key={id}
            role="tab"
            aria-selected={filter === id}
            onClick={() => setFilter(id)}
            className={cn(
              'shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors',
              filter === id ? 'border-primary bg-foreground text-background' : 'border-border/40 bg-muted/30 text-muted-foreground hover:text-foreground',
            )}
          >
            {restaurantMode ? RESTAURANT_FILTER_LABELS[id] : GENERIC_FILTER_LABELS[id]}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-14 text-center">
          <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-muted/50">
            {restaurantMode ? <UtensilsCrossed className="h-8 w-8 text-muted-foreground/30" /> : <Inbox className="h-8 w-8 text-muted-foreground/30" />}
          </div>
          <p className="text-sm text-muted-foreground">{restaurantMode ? 'Bu bosqichda buyurtma yo‘q.' : marketplaceUz.sellerOrders.empty}</p>
        </div>
      ) : (
        filtered.map((order, index) => {
          const status = statusConfig[order.status] || statusConfig.pending;
          const StatusIcon = status.icon;
          const handoffRequired = hasHandoffCode(order);
          const next = nextAction(order);
          const NextIcon = next?.icon;
          const isBusy = updatingId === order.id;
          const isOpen = expanded === order.id;
          const canCancel = ['pending', 'processing', 'shipped'].includes(order.status);

          return (
            <motion.div
              key={order.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: Math.min(index, 8) * 0.04 }}
              className={cn(
                'rounded-2xl border bg-card/50 p-4 backdrop-blur-sm',
                restaurantMode && order.status === 'pending' ? 'border-sky-500/30 shadow-sm shadow-sky-500/5' : 'border-border/30',
              )}
            >
              <div className="mb-3 flex items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <div className={cn('rounded-lg p-1.5', status.color.split(' ')[0])}><StatusIcon className={cn('h-3.5 w-3.5', status.color.split(' ')[1])} /></div>
                  <Badge variant="outline" className={cn('text-[10px]', status.color)}>{restaurantMode ? restaurantStatusLabel(order.status) : status.label}</Badge>
                  {order.payment_status === 'paid' && <Badge variant="outline" className="border-green-500/20 bg-green-500/10 text-[10px] text-green-600">To‘landi</Badge>}
                  {order.payment_status === 'pending' && <Badge variant="outline" className="border-amber-500/20 bg-amber-500/10 text-[10px] text-amber-600">Yetkazganda to‘lov</Badge>}
                  {order.payment_status === 'refunded' && <Badge variant="outline" className="border-sky-500/20 bg-sky-500/10 text-[10px] text-sky-600">Qaytarilgan</Badge>}
                </div>
                <span className="shrink-0 text-xs text-muted-foreground">{formatDistanceToNow(new Date(order.created_at))} oldin</span>
              </div>

              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{order.order_number || order.id.slice(0, 8).toUpperCase()}</p>
                  <p className="text-xs text-muted-foreground">{order.buyer?.display_name || order.buyer?.username || marketplaceUz.sellerOrders.buyer} • {order.items.length} ta {restaurantMode ? 'pozitsiya' : 'mahsulot'}</p>
                </div>
                <p className="shrink-0 font-bold tabular-nums text-foreground">{formatPrice(order.total, order.currency)}</p>
              </div>

              {order.status === 'shipped' && handoffRequired && (
                <div className="mt-3 rounded-xl border border-emerald-500/20 bg-emerald-500/5 px-3 py-2 text-[11px] text-emerald-700 dark:text-emerald-400">
                  Buyurtma tayyor. Yakunlash uchun yuqoridagi scanner maydonida mijoz kodi/barcode’ni tasdiqlang.
                </div>
              )}

              <button type="button" onClick={() => setExpanded(isOpen ? null : order.id)} className="mt-2 flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground" aria-expanded={isOpen}>
                {isOpen ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                {isOpen ? marketplaceUz.sellerOrders.close : marketplaceUz.sellerOrders.details}
              </button>

              {isOpen && (
                <div className="mt-3 space-y-3">
                  <div className="space-y-2">
                    {order.items.map(item => (
                      <div key={item.id} className="flex justify-between gap-3 rounded-lg bg-muted/20 p-2 text-xs">
                        <div className="min-w-0">
                          <p className="truncate">{item.title}</p>
                          {variantOptionsLabel(item.variant_options) && <p className="mt-0.5 truncate text-[10px] font-medium text-muted-foreground">{variantOptionsLabel(item.variant_options)}</p>}
                        </div>
                        <span className="shrink-0 tabular-nums">{item.quantity} × {formatPrice(item.price, order.currency)}</span>
                      </div>
                    ))}
                  </div>

                  {order.shipping_address && (
                    <div className="space-y-1 rounded-lg bg-muted/20 p-2.5 text-xs text-muted-foreground">
                      <p className="flex items-center gap-1.5"><MapPin className="h-3.5 w-3.5 text-foreground" />{order.shipping_address.street}, {order.shipping_address.city}{order.shipping_address.country ? `, ${order.shipping_address.country}` : ''}</p>
                      <p className="flex items-center gap-1.5"><Phone className="h-3.5 w-3.5 text-foreground" />{order.shipping_address.full_name} • {order.shipping_address.phone}</p>
                    </div>
                  )}

                  {order.notes && <p className="text-xs text-muted-foreground">{marketplaceUz.sellerOrders.note}: {order.notes}</p>}

                  <SellerShipmentManager
                    order={order}
                    restaurantMode={restaurantMode}
                    onOrderStatusChange={status => handleAdvance(order, status)}
                  />
                </div>
              )}

              {(next || canCancel) && (
                <div className="mt-3 flex gap-2">
                  {next && NextIcon && (
                    <Button className={cn('h-10 flex-1 rounded-xl text-xs font-semibold', restaurantMode && order.status === 'pending' && 'bg-sky-600 text-white hover:bg-sky-700')} disabled={isBusy} onClick={() => handleAdvance(order, next.to)}>
                      {isBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <><NextIcon className="mr-1.5 h-4 w-4" /> {next.label}</>}
                    </Button>
                  )}
                  {canCancel && (
                    <Button variant="outline" className="h-10 rounded-xl border-destructive/30 text-xs text-destructive hover:bg-destructive/10" disabled={isBusy} onClick={() => setCancelTarget(order)}>
                      <XCircle className="mr-1.5 h-4 w-4" /> Bekor qilish
                    </Button>
                  )}
                </div>
              )}
            </motion.div>
          );
        })
      )}

      <AlertDialog open={!!cancelTarget} onOpenChange={open => !open && setCancelTarget(null)}>
        <AlertDialogContent className="rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle>Buyurtmani bekor qilasizmi?</AlertDialogTitle>
            <AlertDialogDescription>
              Buyurtma bekor qilinadi va ajratilgan zaxira qayta tiklanadi.
              {cancelTarget?.payment_status === 'paid'
                ? ` Xaridorga ${formatPrice(cancelTarget.total, cancelTarget.currency)} to‘liq qaytariladi.`
                : ' Xaridor hali to‘lov qilmagan.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-xl">{marketplaceUz.sellerOrders.no}</AlertDialogCancel>
            <AlertDialogAction className="rounded-xl bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={handleCancel}>
              Ha, bekor qilish
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

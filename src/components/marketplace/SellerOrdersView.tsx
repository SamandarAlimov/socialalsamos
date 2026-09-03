import { useMemo, useState } from 'react';
import {
  Package, Truck, CheckCircle, XCircle, Loader2, Inbox, AlertTriangle, RotateCcw,
  ChevronDown, ChevronUp, MapPin, Phone,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useSellerOrders, useOrderActions, Order, OrderStatus } from '@/hooks/useOrders';
import { statusConfig } from '@/components/marketplace/OrdersView';
import { formatPrice } from '@/lib/marketplace';
import { formatDistanceToNow } from 'date-fns';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { marketplaceUz } from '@/i18n/marketplace';

/**
 * The seller side had no order queue at all: orders arrived in the database
 * and stayed `pending` forever because nothing could advance them.
 * Every action here goes through `marketplace_update_order_status`, which
 * re-checks ownership and legal transitions server-side.
 */

const FILTERS: Array<{ id: 'active' | OrderStatus | 'all'; label: string }> = [
  { id: 'active', label: marketplaceUz.sellerOrders.filters.active },
  { id: 'pending', label: marketplaceUz.sellerOrders.filters.pending },
  { id: 'processing', label: marketplaceUz.sellerOrders.filters.processing },
  { id: 'shipped', label: marketplaceUz.sellerOrders.filters.shipped },
  { id: 'delivered', label: marketplaceUz.sellerOrders.filters.delivered },
  { id: 'cancelled', label: marketplaceUz.sellerOrders.filters.cancelled },
  { id: 'all', label: marketplaceUz.sellerOrders.filters.all },
];

/** The single next step a seller can take from each state. */
const NEXT_ACTION: Partial<Record<OrderStatus, { to: OrderStatus; label: string; icon: any }>> = {
  pending: { to: 'processing', label: marketplaceUz.sellerOrders.next.accept, icon: Package },
  processing: { to: 'shipped', label: marketplaceUz.sellerOrders.next.shipped, icon: Truck },
  shipped: { to: 'delivered', label: marketplaceUz.sellerOrders.next.delivered, icon: CheckCircle },
};

function variantOptionsLabel(options?: Record<string, string> | null) {
  if (!options) return '';
  return Object.entries(options)
    .map(([name, value]) => `${name}: ${value}`)
    .join(' · ');
}

export function SellerOrdersView() {
  const { orders, sellerId, isLoading, error, refresh } = useSellerOrders();
  const { updateStatus, cancelOrder, updatingId } = useOrderActions();
  const [filter, setFilter] = useState<'active' | OrderStatus | 'all'>('active');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [cancelTarget, setCancelTarget] = useState<Order | null>(null);

  const filtered = useMemo(() => {
    if (filter === 'all') return orders;
    if (filter === 'active') {
      return orders.filter(o => ['pending', 'processing', 'shipped'].includes(o.status));
    }
    return orders.filter(o => o.status === filter);
  }, [orders, filter]);

  const pendingCount = orders.filter(o => o.status === 'pending').length;

  const handleAdvance = async (order: Order, to: OrderStatus) => {
    const result = await updateStatus(order.id, to);
    if (result.success) refresh();
  };

  const handleCancel = async () => {
    if (!cancelTarget) return;
    const result = await cancelOrder(cancelTarget.id, marketplaceUz.sellerOrders.sellerCancelled);
    setCancelTarget(null);
    if (result.success) refresh();
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <AlertTriangle className="h-8 w-8 text-destructive mb-3" />
        <p className="text-sm text-muted-foreground mb-4">{marketplaceUz.orders.loadFailed}</p>
        <Button variant="outline" className="rounded-xl" onClick={refresh}>
          <RotateCcw className="h-4 w-4 mr-2" />
          Qayta urinish
        </Button>
      </div>
    );
  }

  if (!sellerId) return null;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">
          Kelgan buyurtmalar
          {pendingCount > 0 && (
            <Badge className="ml-2 text-[10px]">{marketplaceUz.sellerOrders.newCount(pendingCount)}</Badge>
          )}
        </h3>
        <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg" onClick={refresh} aria-label={marketplaceUz.sellerOrders.refresh}>
          <RotateCcw className="h-4 w-4" />
        </Button>
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1 scrollbar-none" role="tablist">
        {FILTERS.map(f => (
          <button
            key={f.id}
            role="tab"
            aria-selected={filter === f.id}
            onClick={() => setFilter(f.id)}
            className={cn(
              'shrink-0 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors',
              filter === f.id
                ? 'bg-foreground text-background border-primary'
                : 'bg-muted/30 text-muted-foreground border-border/40 hover:text-foreground',
            )}
          >
            {f.label}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-14 text-center">
          <div className="w-16 h-16 rounded-2xl bg-muted/50 flex items-center justify-center mb-4">
            <Inbox className="h-8 w-8 text-muted-foreground/30" />
          </div>
          <p className="text-sm text-muted-foreground">{marketplaceUz.sellerOrders.empty}</p>
        </div>
      ) : (
        filtered.map((order, i) => {
          const status = statusConfig[order.status] || statusConfig.pending;
          const StatusIcon = status.icon;
          const next = NEXT_ACTION[order.status];
          const NextIcon = next?.icon;
          const isBusy = updatingId === order.id;
          const isOpen = expanded === order.id;
          const canCancel = ['pending', 'processing', 'shipped'].includes(order.status);

          return (
            <motion.div
              key={order.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: Math.min(i, 8) * 0.04 }}
              className="p-4 rounded-2xl bg-card/50 backdrop-blur-sm border border-border/30"
            >
              <div className="flex items-center justify-between gap-2 mb-3">
                <div className="flex items-center gap-2 flex-wrap">
                  <div className={cn('p-1.5 rounded-lg', status.color.split(' ')[0])}>
                    <StatusIcon className={cn('h-3.5 w-3.5', status.color.split(' ')[1])} />
                  </div>
                  <Badge variant="outline" className={cn('text-[10px]', status.color)}>
                    {status.label}
                  </Badge>
                  {order.payment_status === 'paid' && (
                    <Badge variant="outline" className="text-[10px] bg-green-500/10 text-green-600 border-green-500/20">
                      To'landi
                    </Badge>
                  )}
                  {order.payment_status === 'pending' && (
                    <Badge variant="outline" className="text-[10px] bg-amber-500/10 text-amber-600 border-amber-500/20">
                      Yetkazganda to'lov
                    </Badge>
                  )}
                  {order.payment_status === 'refunded' && (
                    <Badge variant="outline" className="text-[10px] bg-sky-500/10 text-sky-600 border-sky-500/20">
                      Qaytarilgan
                    </Badge>
                  )}
                </div>
                <span className="text-xs text-muted-foreground shrink-0">
                  {formatDistanceToNow(new Date(order.created_at))} oldin
                </span>
              </div>

              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">
                    {order.order_number || order.id.slice(0, 8).toUpperCase()}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {order.buyer?.display_name || order.buyer?.username || marketplaceUz.sellerOrders.buyer} • {order.items.length} ta mahsulot
                  </p>
                </div>
                <p className="font-bold text-foreground tabular-nums shrink-0">
                  {formatPrice(order.total, order.currency)}
                </p>
              </div>

              <button
                type="button"
                onClick={() => setExpanded(isOpen ? null : order.id)}
                className="mt-2 flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                aria-expanded={isOpen}
              >
                {isOpen ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                {isOpen ? marketplaceUz.sellerOrders.close : marketplaceUz.sellerOrders.details}
              </button>

              {isOpen && (
                <div className="mt-3 space-y-2">
                  {order.items.map(item => (
                    <div key={item.id} className="flex justify-between gap-3 text-xs p-2 rounded-lg bg-muted/20">
                      <div className="min-w-0">
                        <p className="truncate">{item.title}</p>
                        {variantOptionsLabel(item.variant_options) && (
                          <p className="mt-0.5 truncate text-[10px] font-medium text-muted-foreground">
                            {variantOptionsLabel(item.variant_options)}
                          </p>
                        )}
                      </div>
                      <span className="tabular-nums shrink-0">
                        {item.quantity} × {formatPrice(item.price, order.currency)}
                      </span>
                    </div>
                  ))}
                  {order.shipping_address && (
                    <div className="p-2.5 rounded-lg bg-muted/20 text-xs text-muted-foreground space-y-1">
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
                  {order.notes && (
                    <p className="text-xs text-muted-foreground">{marketplaceUz.sellerOrders.note}: {order.notes}</p>
                  )}
                </div>
              )}

              {(next || canCancel) && (
                <div className="flex gap-2 mt-3">
                  {next && NextIcon && (
                    <Button
                      className="flex-1 h-10 rounded-xl text-xs font-semibold"
                      disabled={isBusy}
                      onClick={() => handleAdvance(order, next.to)}
                    >
                      {isBusy ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <><NextIcon className="h-4 w-4 mr-1.5" /> {next.label}</>
                      )}
                    </Button>
                  )}
                  {canCancel && (
                    <Button
                      variant="outline"
                      className="h-10 rounded-xl text-xs text-destructive border-destructive/30 hover:bg-destructive/10"
                      disabled={isBusy}
                      onClick={() => setCancelTarget(order)}
                    >
                      <XCircle className="h-4 w-4 mr-1.5" />
                      Bekor qilish
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
              Mahsulotlar omborga qaytariladi.
              {cancelTarget?.payment_status === 'paid'
                ? ` Xaridorga ${formatPrice(cancelTarget.total, cancelTarget.currency)} to'liq qaytariladi.`
                : " Xaridor hali to'lov qilmagan."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-xl">{marketplaceUz.sellerOrders.no}</AlertDialogCancel>
            <AlertDialogAction
              className="rounded-xl bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={handleCancel}
            >
              Ha, bekor qilish
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

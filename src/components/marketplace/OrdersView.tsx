import { useState } from 'react';
import {
  Package, Clock, Truck, CheckCircle, XCircle, ChevronRight, Loader2, ShoppingBag,
  MapPin, Receipt, AlertTriangle, RotateCcw,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { ShipmentTimeline } from '@/components/marketplace/ShipmentTimeline';
import { useOrders, useOrderActions, Order } from '@/hooks/useOrders';
import { formatPrice } from '@/lib/marketplace';
import { formatDistanceToNow, format } from 'date-fns';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { marketplaceUz } from '@/i18n/marketplace';

export const statusConfig: Record<string, { label: string; color: string; icon: any }> = {
  pending: { label: marketplaceUz.orders.status.pending, color: 'bg-yellow-500/10 text-yellow-600 border-yellow-500/20', icon: Clock },
  processing: { label: marketplaceUz.orders.status.processing, color: 'bg-blue-500/10 text-blue-600 border-blue-500/20', icon: Package },
  shipped: { label: marketplaceUz.orders.status.shipped, color: 'bg-purple-500/10 text-purple-600 border-purple-500/20', icon: Truck },
  delivered: { label: marketplaceUz.orders.status.delivered, color: 'bg-green-500/10 text-green-600 border-green-500/20', icon: CheckCircle },
  cancelled: { label: marketplaceUz.orders.status.cancelled, color: 'bg-red-500/10 text-red-600 border-red-500/20', icon: XCircle },
};

const TIMELINE_STEPS = ['pending', 'processing', 'shipped', 'delivered'] as const;

function shortOrderNumber(order: Order) {
  return order.order_number ? order.order_number.slice(-8) : order.id.slice(0, 8).toUpperCase();
}

function variantOptionsLabel(options?: Record<string, string> | null) {
  if (!options) return '';
  return Object.entries(options)
    .map(([name, value]) => `${name}: ${value}`)
    .join(' · ');
}

function ThumbFallback() {
  return (
    <div className="flex h-full w-full items-center justify-center bg-muted text-muted-foreground/40">
      <ShoppingBag className="h-4 w-4" />
    </div>
  );
}

function Thumb({ url, alt, className }: { url?: string; alt?: string; className?: string }) {
  const [failed, setFailed] = useState(false);
  if (!url || failed) return <ThumbFallback />;
  return (
    <img
      src={url}
      alt={alt || ''}
      loading="lazy"
      onError={() => setFailed(true)}
      className={cn('h-full w-full object-cover', className)}
    />
  );
}

interface OrdersViewProps {
  onProductSelect?: (productId: string) => void;
}

export function OrdersView({ onProductSelect }: OrdersViewProps) {
  const { orders, isLoading, error, refresh } = useOrders();
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);

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
        <AlertTriangle className="mb-3 h-8 w-8 text-destructive" />
        <p className="mb-4 text-sm text-muted-foreground">{marketplaceUz.orders.loadFailed}</p>
        <Button variant="outline" className="rounded-xl" onClick={refresh}>
          <RotateCcw className="mr-2 h-4 w-4" /> Qayta urinish
        </Button>
      </div>
    );
  }

  if (orders.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <div className="mb-5 flex h-20 w-20 items-center justify-center rounded-2xl bg-muted/50">
          <ShoppingBag className="h-10 w-10 text-muted-foreground/30" />
        </div>
        <h3 className="mb-1 text-lg font-semibold">{marketplaceUz.orders.emptyTitle}</h3>
        <p className="max-w-xs text-sm text-muted-foreground">
          Birinchi buyurtmangizni bering va natijani shu yerda kuzating
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="space-y-3">
        {orders.map((order, i) => {
          const status = statusConfig[order.status || 'pending'] || statusConfig.pending;
          const StatusIcon = status.icon;
          return (
            <motion.div
              key={order.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: Math.min(i, 8) * 0.05 }}
              role="button"
              tabIndex={0}
              aria-label={`Buyurtma ${shortOrderNumber(order)}`}
              className="cursor-pointer rounded-2xl border border-border/30 bg-card/50 p-4 backdrop-blur-sm transition-all hover:border-foreground/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/40"
              onClick={() => setSelectedOrder(order)}
              onKeyDown={event => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  setSelectedOrder(order);
                }
              }}
            >
              <div className="mb-3 flex items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <div className={cn('rounded-lg p-1.5', status.color.split(' ')[0])}>
                    <StatusIcon className={cn('h-3.5 w-3.5', status.color.split(' ')[1])} />
                  </div>
                  <Badge variant="outline" className={cn('text-[10px]', status.color)}>{status.label}</Badge>
                  {order.payment_status === 'paid' && <Badge variant="outline" className="border-green-500/20 bg-green-500/10 text-[10px] text-green-600">To‘landi</Badge>}
                  {order.payment_status === 'pending' && <Badge variant="outline" className="border-amber-500/20 bg-amber-500/10 text-[10px] text-amber-600">Yetkazganda</Badge>}
                  {order.payment_status === 'failed' && <Badge variant="outline" className="border-destructive/20 bg-destructive/10 text-[10px] text-destructive">Muvaffaqiyatsiz</Badge>}
                  {order.payment_status === 'refunded' && <Badge variant="outline" className="border-sky-500/20 bg-sky-500/10 text-[10px] text-sky-600">Qaytarildi</Badge>}
                </div>
                <span className="shrink-0 text-xs text-muted-foreground">{formatDistanceToNow(new Date(order.created_at))} oldin</span>
              </div>

              <div className="flex items-center gap-3">
                <div className="flex -space-x-2">
                  {order.items.slice(0, 3).map(item => (
                    <div key={item.id} className="h-12 w-12 overflow-hidden rounded-xl bg-muted ring-2 ring-background">
                      <Thumb url={item.product?.images?.[0]?.url} alt={item.title} />
                    </div>
                  ))}
                  {order.items.length > 3 && (
                    <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-muted text-xs font-bold text-muted-foreground ring-2 ring-background">
                      +{order.items.length - 3}
                    </div>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{order.order_number || shortOrderNumber(order)}</p>
                  <p className="text-xs text-muted-foreground">{marketplaceUz.orders.itemCount(order.items.length)}</p>
                </div>
                <div className="text-right">
                  <p className="font-bold tabular-nums text-foreground">{formatPrice(order.total, order.currency)}</p>
                </div>
                <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
              </div>
            </motion.div>
          );
        })}
      </div>

      <OrderDetailSheet
        order={selectedOrder}
        onClose={() => setSelectedOrder(null)}
        onChanged={async () => {
          await refresh();
          setSelectedOrder(null);
        }}
        onProductSelect={onProductSelect}
      />
    </>
  );
}

function OrderDetailSheet({
  order,
  onClose,
  onChanged,
  onProductSelect,
}: {
  order: Order | null;
  onClose: () => void;
  onChanged: () => void;
  onProductSelect?: (productId: string) => void;
}) {
  const { cancelOrder, updatingId } = useOrderActions();
  const [confirmCancel, setConfirmCancel] = useState(false);

  if (!order) return null;

  const status = statusConfig[order.status || 'pending'] || statusConfig.pending;
  const StatusIcon = status.icon;
  const currentStepIndex = Math.max(TIMELINE_STEPS.indexOf((order.status || 'pending') as any), 0);
  const progress = (currentStepIndex / (TIMELINE_STEPS.length - 1)) * 100;
  const canCancel = order.status === 'pending' || order.status === 'processing';
  const isBusy = updatingId === order.id;

  const handleCancel = async () => {
    const result = await cancelOrder(order.id, marketplaceUz.orders.buyerCancelled);
    setConfirmCancel(false);
    if (result.success) onChanged();
  };

  return (
    <Sheet open={!!order} onOpenChange={() => onClose()}>
      <SheetContent side="bottom" className="h-[90vh] rounded-t-3xl border-t border-border/30 p-0 sm:mx-auto sm:max-w-2xl">
        <SheetHeader className="border-b border-border/30 p-4">
          <SheetTitle className="flex items-center gap-2 text-left">
            <StatusIcon className={cn('h-5 w-5', status.color.split(' ')[1])} />
            Buyurtma #{shortOrderNumber(order)}
          </SheetTitle>
        </SheetHeader>

        <ScrollArea className="h-[calc(90vh-80px)]">
          <div className="space-y-5 p-4">
            {order.status !== 'cancelled' ? (
              <div className="rounded-2xl border border-border/20 bg-muted/20 p-4">
                <div className="relative flex items-start justify-between">
                  <div className="absolute left-[18px] right-[18px] top-[18px] h-0.5 overflow-hidden rounded-full bg-muted">
                    <div className="h-full bg-foreground transition-all duration-500" style={{ width: `${progress}%` }} />
                  </div>
                  {TIMELINE_STEPS.map((stepId, index) => {
                    const stepStatus = statusConfig[stepId];
                    const StepIcon = stepStatus.icon;
                    const isActive = index <= currentStepIndex;
                    const isCurrent = index === currentStepIndex;
                    return (
                      <div key={stepId} className="relative z-10 flex flex-1 flex-col items-center gap-1.5">
                        <div className={cn(
                          'flex h-9 w-9 items-center justify-center rounded-full transition-all',
                          isCurrent
                            ? 'bg-foreground text-background shadow-lg shadow-black/15'
                            : isActive
                              ? 'bg-foreground/20 text-primary'
                              : 'bg-muted text-muted-foreground',
                        )}>
                          <StepIcon className="h-4 w-4" />
                        </div>
                        <span className={cn('text-center text-[10px] font-medium', isActive ? 'text-foreground' : 'text-muted-foreground')}>
                          {stepStatus.label}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : (
              <div className="rounded-2xl border border-destructive/20 bg-destructive/5 p-4">
                <div className="flex items-center gap-2 text-sm font-medium text-destructive"><XCircle className="h-4 w-4" /> Buyurtma bekor qilindi</div>
                {order.cancel_reason && <p className="mt-1 text-xs text-muted-foreground">Sabab: {order.cancel_reason}</p>}
                {order.payment_status === 'refunded' && <p className="mt-1 text-xs text-muted-foreground">{formatPrice(order.total, order.currency)} hamyoningizga qaytarildi</p>}
              </div>
            )}

            <ShipmentTimeline orderId={order.id} orderStatus={order.status} shippingAddress={order.shipping_address} />

            <div className="space-y-2">
              <h4 className="text-sm font-semibold">{marketplaceUz.orders.products}</h4>
              {order.items.map(item => (
                <div
                  key={item.id}
                  className={cn(
                    'flex gap-3 rounded-xl border border-border/20 bg-muted/20 p-3',
                    onProductSelect && 'cursor-pointer transition-colors hover:border-foreground/20',
                  )}
                  onClick={() => onProductSelect?.(item.product_id)}
                >
                  <div className="h-16 w-16 shrink-0 overflow-hidden rounded-xl bg-muted">
                    <Thumb url={item.product?.images?.[0]?.url} alt={item.title} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="line-clamp-1 text-sm font-medium">{item.title}</p>
                    {variantOptionsLabel(item.variant_options) && <p className="mt-0.5 line-clamp-1 text-[11px] font-medium text-foreground/70">{variantOptionsLabel(item.variant_options)}</p>}
                    <p className="text-xs tabular-nums text-muted-foreground">{item.quantity} × {formatPrice(item.price, order.currency)}</p>
                    <p className="mt-1 text-sm font-bold tabular-nums text-foreground">{formatPrice(item.total, order.currency)}</p>
                  </div>
                </div>
              ))}
            </div>

            {order.seller && (
              <div className="flex items-center gap-3 rounded-xl border border-border/20 bg-muted/20 p-3">
                <div className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-xl bg-foreground/10">
                  {order.seller.logo_url ? <Thumb url={order.seller.logo_url} alt={order.seller.business_name} /> : <Package className="h-5 w-5 text-foreground" />}
                </div>
                <div>
                  <p className="text-sm font-medium">{order.seller.business_name}</p>
                  <p className="text-xs text-muted-foreground">{marketplaceUz.orders.seller}</p>
                </div>
              </div>
            )}

            {order.shipping_address && (
              <div className="space-y-1 rounded-xl border border-border/20 bg-muted/20 p-3">
                <div className="flex items-center gap-2 text-sm font-medium"><MapPin className="h-4 w-4 text-foreground" /> {marketplaceUz.orders.deliveryAddress}</div>
                <p className="text-sm text-muted-foreground">{order.shipping_address.full_name} • {order.shipping_address.phone}</p>
                <p className="text-sm text-muted-foreground">
                  {order.shipping_address.street}, {order.shipping_address.city}
                  {order.shipping_address.region ? `, ${order.shipping_address.region}` : ''}
                  {order.shipping_address.country ? `, ${order.shipping_address.country}` : ''}
                </p>
              </div>
            )}

            <div className="space-y-2 rounded-xl border border-border/20 bg-muted/20 p-3">
              <div className="flex justify-between text-sm"><span className="text-muted-foreground">{marketplaceUz.orders.products}</span><span className="tabular-nums">{formatPrice(order.subtotal, order.currency)}</span></div>
              <div className="flex justify-between text-sm"><span className="text-muted-foreground">{marketplaceUz.orders.delivery}</span><span className="tabular-nums">{order.shipping_cost > 0 ? formatPrice(order.shipping_cost, order.currency) : 'Bepul'}</span></div>
              <div className="h-px bg-border/30" />
              <div className="flex justify-between font-bold"><span>{marketplaceUz.orders.total}</span><span className="tabular-nums text-foreground">{formatPrice(order.total, order.currency)}</span></div>
            </div>

            <div className="space-y-1 text-xs text-muted-foreground">
              <p>{marketplaceUz.orders.orderDate}: {format(new Date(order.created_at), 'dd.MM.yyyy HH:mm')}</p>
              {order.receipt_number && <p className="flex items-center gap-1.5"><Receipt className="h-3.5 w-3.5" /> {marketplaceUz.orders.receipt}: {order.receipt_number}</p>}
              {order.paid_at && <p>{marketplaceUz.orders.paidAt}: {format(new Date(order.paid_at), 'dd.MM.yyyy HH:mm')}</p>}
              {order.notes && <p>{marketplaceUz.orders.note}: {order.notes}</p>}
            </div>

            {canCancel && (
              <Button variant="outline" className="h-11 w-full rounded-xl border-destructive/30 text-destructive hover:bg-destructive/10" disabled={isBusy} onClick={() => setConfirmCancel(true)}>
                {isBusy ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> {marketplaceUz.orders.processing}</> : <><XCircle className="mr-2 h-4 w-4" /> {marketplaceUz.orders.cancelOrder}</>}
              </Button>
            )}
          </div>
        </ScrollArea>

        <AlertDialog open={confirmCancel} onOpenChange={setConfirmCancel}>
          <AlertDialogContent className="rounded-2xl">
            <AlertDialogHeader>
              <AlertDialogTitle>Buyurtmani bekor qilasizmi?</AlertDialogTitle>
              <AlertDialogDescription>
                Mahsulotlar omborga qaytariladi.
                {order.payment_status === 'paid'
                  ? ` To‘langan ${formatPrice(order.total, order.currency)} hamyoningizga qaytariladi.`
                  : ' To‘lov hali amalga oshirilmagan.'}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel className="rounded-xl">{marketplaceUz.orders.no}</AlertDialogCancel>
              <AlertDialogAction className="rounded-xl bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={handleCancel}>
                Ha, bekor qilish
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </SheetContent>
    </Sheet>
  );
}

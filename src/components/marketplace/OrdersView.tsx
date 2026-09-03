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

/** order_number can be null on legacy rows; slicing it directly used to throw. */
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
    <div className="w-full h-full flex items-center justify-center bg-muted text-muted-foreground/40">
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
      className={cn('w-full h-full object-cover', className)}
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
        <AlertTriangle className="h-8 w-8 text-destructive mb-3" />
        <p className="text-sm text-muted-foreground mb-4">{marketplaceUz.orders.loadFailed}</p>
        <Button variant="outline" className="rounded-xl" onClick={refresh}>
          <RotateCcw className="h-4 w-4 mr-2" />
          Qayta urinish
        </Button>
      </div>
    );
  }

  if (orders.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <div className="w-20 h-20 rounded-2xl bg-muted/50 flex items-center justify-center mb-5">
          <ShoppingBag className="h-10 w-10 text-muted-foreground/30" />
        </div>
        <h3 className="font-semibold text-lg mb-1">{marketplaceUz.orders.emptyTitle}</h3>
        <p className="text-sm text-muted-foreground max-w-xs">
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
              className="p-4 rounded-2xl bg-card/50 backdrop-blur-sm border border-border/30 cursor-pointer hover:border-foreground/20 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/40"
              onClick={() => setSelectedOrder(order)}
              onKeyDown={e => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  setSelectedOrder(order);
                }
              }}
            >
              <div className="flex items-center justify-between mb-3 gap-2">
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
                      Yetkazganda
                    </Badge>
                  )}
                  {order.payment_status === 'failed' && (
                    <Badge variant="outline" className="text-[10px] bg-destructive/10 text-destructive border-destructive/20">
                      Muvaffaqiyatsiz
                    </Badge>
                  )}
                  {order.payment_status === 'refunded' && (
                    <Badge variant="outline" className="text-[10px] bg-sky-500/10 text-sky-600 border-sky-500/20">
                      Qaytarildi
                    </Badge>
                  )}
                </div>
                <span className="text-xs text-muted-foreground shrink-0">
                  {formatDistanceToNow(new Date(order.created_at))} oldin
                </span>
              </div>

              <div className="flex items-center gap-3">
                <div className="flex -space-x-2">
                  {order.items.slice(0, 3).map(item => (
                    <div key={item.id} className="w-12 h-12 rounded-xl overflow-hidden bg-muted ring-2 ring-background">
                      <Thumb url={item.product?.images?.[0]?.url} alt={item.title} />
                    </div>
                  ))}
                  {order.items.length > 3 && (
                    <div className="w-12 h-12 rounded-xl bg-muted flex items-center justify-center ring-2 ring-background text-xs font-bold text-muted-foreground">
                      +{order.items.length - 3}
                    </div>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{order.order_number || shortOrderNumber(order)}</p>
                  <p className="text-xs text-muted-foreground">{marketplaceUz.orders.itemCount(order.items.length)}</p>
                </div>
                <div className="text-right">
                  <p className="font-bold text-foreground tabular-nums">
                    {formatPrice(order.total, order.currency)}
                  </p>
                </div>
                <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
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
  order, onClose, onChanged, onProductSelect,
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

  // The buyer may only pull out before the parcel is handed to a courier.
  const canCancel = order.status === 'pending' || order.status === 'processing';
  const isBusy = updatingId === order.id;

  const handleCancel = async () => {
    const result = await cancelOrder(order.id, marketplaceUz.orders.buyerCancelled);
    setConfirmCancel(false);
    if (result.success) onChanged();
  };

  return (
    <Sheet open={!!order} onOpenChange={() => onClose()}>
      <SheetContent side="bottom" className="h-[90vh] p-0 rounded-t-3xl border-t border-border/30 sm:max-w-2xl sm:mx-auto">
        <SheetHeader className="p-4 border-b border-border/30">
          <SheetTitle className="flex items-center gap-2 text-left">
            <StatusIcon className={cn('h-5 w-5', status.color.split(' ')[1])} />
            Buyurtma #{shortOrderNumber(order)}
          </SheetTitle>
        </SheetHeader>

        <ScrollArea className="h-[calc(90vh-80px)]">
          <div className="p-4 space-y-5">
            {/* Status timeline. The connector line now lives in a relative
                container — previously it was `absolute` with no positioned
                parent, so it floated across the whole sheet. */}
            {order.status !== 'cancelled' ? (
              <div className="p-4 rounded-2xl bg-muted/20 border border-border/20">
                <div className="relative flex items-start justify-between">
                  <div className="absolute left-[18px] right-[18px] top-[18px] h-0.5 bg-muted rounded-full overflow-hidden">
                    <div
                      className="h-full bg-foreground transition-all duration-500"
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                  {TIMELINE_STEPS.map((s, i) => {
                    const stepStatus = statusConfig[s];
                    const StepIcon = stepStatus.icon;
                    const isActive = i <= currentStepIndex;
                    const isCurrent = i === currentStepIndex;
                    return (
                      <div key={s} className="relative z-10 flex flex-col items-center gap-1.5 flex-1">
                        <div className={cn(
                          'w-9 h-9 rounded-full flex items-center justify-center transition-all',
                          isCurrent
                            ? 'bg-foreground text-background shadow-lg shadow-black/15'
                            : isActive
                              ? 'bg-foreground/20 text-primary'
                              : 'bg-muted text-muted-foreground',
                        )}>
                          <StepIcon className="h-4 w-4" />
                        </div>
                        <span className={cn(
                          'text-[10px] font-medium text-center',
                          isActive ? 'text-foreground' : 'text-muted-foreground',
                        )}>
                          {stepStatus.label}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : (
              <div className="p-4 rounded-2xl bg-destructive/5 border border-destructive/20">
                <div className="flex items-center gap-2 text-sm font-medium text-destructive">
                  <XCircle className="h-4 w-4" />
                  Buyurtma bekor qilindi
                </div>
                {order.cancel_reason && (
                  <p className="text-xs text-muted-foreground mt-1">Sabab: {order.cancel_reason}</p>
                )}
                {order.payment_status === 'refunded' && (
                  <p className="text-xs text-muted-foreground mt-1">
                    {formatPrice(order.total, order.currency)} hamyoningizga qaytarildi
                  </p>
                )}
              </div>
            )}

            {/* Items */}
            <div className="space-y-2">
              <h4 className="text-sm font-semibold">{marketplaceUz.orders.products}</h4>
              {order.items.map(item => (
                <div
                  key={item.id}
                  className={cn(
                    'flex gap-3 p-3 rounded-xl bg-muted/20 border border-border/20',
                    onProductSelect && 'cursor-pointer hover:border-foreground/20 transition-colors',
                  )}
                  onClick={() => onProductSelect?.(item.product_id)}
                >
                  <div className="w-16 h-16 rounded-xl overflow-hidden bg-muted shrink-0">
                    <Thumb url={item.product?.images?.[0]?.url} alt={item.title} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium line-clamp-1">{item.title}</p>
                    {variantOptionsLabel(item.variant_options) && (
                      <p className="mt-0.5 line-clamp-1 text-[11px] font-medium text-foreground/70">
                        {variantOptionsLabel(item.variant_options)}
                      </p>
                    )}
                    <p className="text-xs text-muted-foreground tabular-nums">
                      {item.quantity} × {formatPrice(item.price, order.currency)}
                    </p>
                    <p className="text-sm font-bold text-foreground mt-1 tabular-nums">
                      {formatPrice(item.total, order.currency)}
                    </p>
                  </div>
                </div>
              ))}
            </div>

            {/* Seller */}
            {order.seller && (
              <div className="p-3 rounded-xl bg-muted/20 border border-border/20 flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-foreground/10 flex items-center justify-center overflow-hidden">
                  {order.seller.logo_url
                    ? <Thumb url={order.seller.logo_url} alt={order.seller.business_name} />
                    : <Package className="h-5 w-5 text-foreground" />}
                </div>
                <div>
                  <p className="text-sm font-medium">{order.seller.business_name}</p>
                  <p className="text-xs text-muted-foreground">{marketplaceUz.orders.seller}</p>
                </div>
              </div>
            )}

            {/* Shipping address */}
            {order.shipping_address && (
              <div className="p-3 rounded-xl bg-muted/20 border border-border/20 space-y-1">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <MapPin className="h-4 w-4 text-foreground" />
                  {marketplaceUz.orders.deliveryAddress}
                </div>
                <p className="text-sm text-muted-foreground">
                  {order.shipping_address.full_name} • {order.shipping_address.phone}
                </p>
                <p className="text-sm text-muted-foreground">
                  {order.shipping_address.street}, {order.shipping_address.city}
                  {order.shipping_address.region ? `, ${order.shipping_address.region}` : ''}
                </p>
              </div>
            )}

            {/* Price summary */}
            <div className="p-3 rounded-xl bg-muted/20 border border-border/20 space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">{marketplaceUz.orders.products}</span>
                <span className="tabular-nums">{formatPrice(order.subtotal, order.currency)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">{marketplaceUz.orders.delivery}</span>
                <span className="tabular-nums">
                  {order.shipping_cost > 0 ? formatPrice(order.shipping_cost, order.currency) : 'Bepul'}
                </span>
              </div>
              <div className="h-px bg-border/30" />
              <div className="flex justify-between font-bold">
                <span>{marketplaceUz.orders.total}</span>
                <span className="text-foreground tabular-nums">{formatPrice(order.total, order.currency)}</span>
              </div>
            </div>

            {/* Receipt / meta */}
            <div className="text-xs text-muted-foreground space-y-1">
              <p>{marketplaceUz.orders.orderDate}: {format(new Date(order.created_at), 'dd.MM.yyyy HH:mm')}</p>
              {order.receipt_number && (
                <p className="flex items-center gap-1.5">
                  <Receipt className="h-3.5 w-3.5" />
                  {marketplaceUz.orders.receipt}: {order.receipt_number}
                </p>
              )}
              {order.paid_at && <p>{marketplaceUz.orders.paidAt}: {format(new Date(order.paid_at), 'dd.MM.yyyy HH:mm')}</p>}
              {order.notes && <p>{marketplaceUz.orders.note}: {order.notes}</p>}
            </div>

            {canCancel && (
              <Button
                variant="outline"
                className="w-full h-11 rounded-xl text-destructive border-destructive/30 hover:bg-destructive/10"
                disabled={isBusy}
                onClick={() => setConfirmCancel(true)}
              >
                {isBusy ? (
                  <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> {marketplaceUz.orders.processing}</>
                ) : (
                  <><XCircle className="h-4 w-4 mr-2" /> {marketplaceUz.orders.cancelOrder}</>
                )}
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
                  ? ` To'langan ${formatPrice(order.total, order.currency)} hamyoningizga qaytariladi.`
                  : ' To\u2018lov hali amalga oshirilmagan.'}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel className="rounded-xl">{marketplaceUz.orders.no}</AlertDialogCancel>
              <AlertDialogAction
                className="rounded-xl bg-destructive text-destructive-foreground hover:bg-destructive/90"
                onClick={handleCancel}
              >
                Ha, bekor qilish
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </SheetContent>
    </Sheet>
  );
}

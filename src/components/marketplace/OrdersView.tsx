import { useState } from 'react';
import { 
  Package, Clock, Truck, CheckCircle, XCircle, ChevronRight,
  Loader2, ShoppingBag, MapPin, RotateCcw
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { useOrders, Order } from '@/hooks/useOrders';
import { formatDistanceToNow, format } from 'date-fns';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';

const statusConfig: Record<string, { label: string; color: string; icon: any }> = {
  pending: { label: 'Kutilmoqda', color: 'bg-yellow-500/10 text-yellow-600 border-yellow-500/20', icon: Clock },
  processing: { label: 'Tayyorlanmoqda', color: 'bg-blue-500/10 text-blue-600 border-blue-500/20', icon: Package },
  shipped: { label: 'Jo\'natildi', color: 'bg-purple-500/10 text-purple-600 border-purple-500/20', icon: Truck },
  delivered: { label: 'Yetkazildi', color: 'bg-green-500/10 text-green-600 border-green-500/20', icon: CheckCircle },
  cancelled: { label: 'Bekor qilindi', color: 'bg-red-500/10 text-red-600 border-red-500/20', icon: XCircle },
};

interface OrdersViewProps {
  onProductSelect?: (productId: string) => void;
}

export function OrdersView({ onProductSelect }: OrdersViewProps) {
  const { orders, isLoading } = useOrders();
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (orders.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <div className="w-20 h-20 rounded-2xl bg-muted/50 flex items-center justify-center mb-5">
          <ShoppingBag className="h-10 w-10 text-muted-foreground/30" />
        </div>
        <h3 className="font-semibold text-lg mb-1">Buyurtmalar yo'q</h3>
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
              transition={{ delay: i * 0.05 }}
              className="p-4 rounded-2xl bg-card/50 backdrop-blur-sm border border-border/30 cursor-pointer hover:border-primary/20 transition-all"
              onClick={() => setSelectedOrder(order)}
            >
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <div className={cn("p-1.5 rounded-lg", status.color.split(' ')[0])}>
                    <StatusIcon className={cn("h-3.5 w-3.5", status.color.split(' ')[1])} />
                  </div>
                  <Badge variant="outline" className={cn("text-[10px]", status.color)}>
                    {status.label}
                  </Badge>
                </div>
                <span className="text-xs text-muted-foreground">
                  {formatDistanceToNow(new Date(order.created_at))} oldin
                </span>
              </div>

              <div className="flex items-center gap-3">
                <div className="flex -space-x-2">
                  {order.items.slice(0, 3).map((item, idx) => (
                    <div key={item.id} className="w-12 h-12 rounded-xl overflow-hidden bg-muted ring-2 ring-background">
                      <img
                        src={item.product?.images?.[0]?.url || 'https://placehold.co/48x48?text=P'}
                        alt=""
                        className="w-full h-full object-cover"
                      />
                    </div>
                  ))}
                  {order.items.length > 3 && (
                    <div className="w-12 h-12 rounded-xl bg-muted flex items-center justify-center ring-2 ring-background text-xs font-bold text-muted-foreground">
                      +{order.items.length - 3}
                    </div>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">{order.order_number}</p>
                  <p className="text-xs text-muted-foreground">{order.items.length} ta mahsulot</p>
                </div>
                <div className="text-right">
                  <p className="font-bold text-primary">${order.total.toLocaleString()}</p>
                </div>
                <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
              </div>
            </motion.div>
          );
        })}
      </div>

      {/* Order Detail Sheet */}
      <OrderDetailSheet order={selectedOrder} onClose={() => setSelectedOrder(null)} />
    </>
  );
}

function OrderDetailSheet({ order, onClose }: { order: Order | null; onClose: () => void }) {
  if (!order) return null;
  
  const status = statusConfig[order.status || 'pending'] || statusConfig.pending;
  const StatusIcon = status.icon;

  const steps = ['pending', 'processing', 'shipped', 'delivered'];
  const currentStepIndex = steps.indexOf(order.status || 'pending');

  return (
    <Sheet open={!!order} onOpenChange={() => onClose()}>
      <SheetContent side="bottom" className="h-[90vh] p-0 rounded-t-3xl border-t border-border/30">
        <SheetHeader className="p-4 border-b border-border/30">
          <SheetTitle className="flex items-center gap-2">
            <StatusIcon className={cn("h-5 w-5", status.color.split(' ')[1])} />
            Buyurtma #{order.order_number.slice(-8)}
          </SheetTitle>
        </SheetHeader>

        <ScrollArea className="flex-1 h-[calc(90vh-80px)]">
          <div className="p-4 space-y-5">
            {/* Status Timeline */}
            {order.status !== 'cancelled' && (
              <div className="p-4 rounded-2xl bg-muted/20 border border-border/20">
                <div className="flex items-center justify-between">
                  {steps.map((s, i) => {
                    const stepStatus = statusConfig[s];
                    const StepIcon = stepStatus.icon;
                    const isActive = i <= currentStepIndex;
                    const isCurrent = i === currentStepIndex;
                    return (
                      <div key={s} className="flex flex-col items-center gap-1.5 flex-1">
                        <div className={cn(
                          "w-9 h-9 rounded-full flex items-center justify-center transition-all",
                          isCurrent ? "bg-primary text-primary-foreground shadow-lg shadow-primary/30" :
                          isActive ? "bg-primary/20 text-primary" :
                          "bg-muted text-muted-foreground"
                        )}>
                          <StepIcon className="h-4 w-4" />
                        </div>
                        <span className={cn(
                          "text-[10px] font-medium",
                          isActive ? "text-foreground" : "text-muted-foreground"
                        )}>
                          {stepStatus.label}
                        </span>
                        {i < steps.length - 1 && (
                          <div className={cn(
                            "absolute h-0.5 w-full",
                            isActive ? "bg-primary" : "bg-muted"
                          )} />
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Items */}
            <div className="space-y-2">
              <h4 className="text-sm font-semibold">Mahsulotlar</h4>
              {order.items.map(item => (
                <div key={item.id} className="flex gap-3 p-3 rounded-xl bg-muted/20 border border-border/20">
                  <div className="w-16 h-16 rounded-xl overflow-hidden bg-muted shrink-0">
                    <img
                      src={item.product?.images?.[0]?.url || 'https://placehold.co/64x64?text=P'}
                      alt={item.title}
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium line-clamp-1">{item.title}</p>
                    <p className="text-xs text-muted-foreground">{item.quantity} × ${item.price.toLocaleString()}</p>
                    <p className="text-sm font-bold text-primary mt-1">${item.total.toLocaleString()}</p>
                  </div>
                </div>
              ))}
            </div>

            {/* Seller */}
            {order.seller && (
              <div className="p-3 rounded-xl bg-muted/20 border border-border/20 flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                  <Package className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="text-sm font-medium">{order.seller.business_name}</p>
                  <p className="text-xs text-muted-foreground">Sotuvchi</p>
                </div>
              </div>
            )}

            {/* Shipping address */}
            {order.shipping_address && (
              <div className="p-3 rounded-xl bg-muted/20 border border-border/20 space-y-1">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <MapPin className="h-4 w-4 text-primary" />
                  Yetkazib berish manzili
                </div>
                <p className="text-sm text-muted-foreground">
                  {order.shipping_address.full_name} • {order.shipping_address.phone}
                </p>
                <p className="text-sm text-muted-foreground">
                  {order.shipping_address.street}, {order.shipping_address.city}
                </p>
              </div>
            )}

            {/* Price Summary */}
            <div className="p-3 rounded-xl bg-muted/20 border border-border/20 space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Mahsulotlar</span>
                <span>${order.subtotal.toLocaleString()}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Yetkazish</span>
                <span>{order.shipping_cost > 0 ? `$${order.shipping_cost.toLocaleString()}` : 'Bepul'}</span>
              </div>
              <div className="h-px bg-border/30" />
              <div className="flex justify-between font-bold">
                <span>Jami</span>
                <span className="text-primary">${order.total.toLocaleString()}</span>
              </div>
            </div>

            {/* Meta */}
            <div className="text-xs text-muted-foreground space-y-1">
              <p>Buyurtma sanasi: {format(new Date(order.created_at), 'dd.MM.yyyy HH:mm')}</p>
              {order.notes && <p>Izoh: {order.notes}</p>}
            </div>
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}

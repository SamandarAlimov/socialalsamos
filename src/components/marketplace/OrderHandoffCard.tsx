import { CheckCircle2, KeyRound, ScanLine } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Code128Barcode } from '@/components/marketplace/Code128Barcode';

interface HandoffOrderLike {
  status?: string | null;
  handoff_code?: string | null;
  handoff_verified_at?: string | null;
  shipping_address?: Record<string, unknown> | null;
}

export function OrderHandoffCard({ order }: { order: HandoffOrderLike }) {
  const code = String(order.handoff_code || '').trim().toUpperCase();
  if (!code || order.status === 'cancelled') return null;

  const verified = Boolean(order.handoff_verified_at) || order.status === 'delivered';
  const fulfillmentType = String(order.shipping_address?.fulfillment_type || 'delivery');
  const pickup = fulfillmentType === 'pickup';

  if (verified) {
    return (
      <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-4">
        <div className="flex items-center gap-2 text-sm font-semibold text-emerald-700 dark:text-emerald-400">
          <CheckCircle2 className="h-4 w-4" />
          Topshirish kodi tasdiqlandi
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          Buyurtma {pickup ? 'olib ketish punktida' : 'kuryer orqali'} muvaffaqiyatli topshirildi.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3 rounded-2xl border border-foreground/15 bg-card p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-sm font-semibold">
            <KeyRound className="h-4 w-4" />
            {pickup ? 'Olib ketish kodi' : 'Qabul qilish kodi'}
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {pickup
              ? 'Buyurtmani olayotganda punkt xodimiga shu kod yoki barcode’ni ko‘rsating.'
              : 'Buyurtma kelganda kuryerga shu kod yoki barcode’ni ko‘rsating.'}
          </p>
        </div>
        <Badge variant="outline" className="shrink-0 text-[10px]">Bir martalik</Badge>
      </div>

      <div className="rounded-xl bg-white p-3">
        <Code128Barcode value={code} />
      </div>

      <div className="flex items-center justify-between gap-3 rounded-xl bg-muted/40 px-3 py-2.5">
        <span className="font-mono text-xl font-black tracking-[0.18em] text-foreground">{code}</span>
        <ScanLine className="h-5 w-5 shrink-0 text-muted-foreground" />
      </div>

      <p className="text-[11px] leading-relaxed text-muted-foreground">
        Handheld Barcode Scanner barcode’ni skaner qilishi mumkin. Zarur bo‘lsa kodni qo‘lda ham kiritish mumkin.
      </p>
    </div>
  );
}

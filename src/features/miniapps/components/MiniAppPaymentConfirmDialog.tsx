import { useMemo, useState } from 'react';
import { CheckCircle2, Loader2, ShieldCheck, WalletCards, XCircle } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useWallet, formatWalletMoney } from '@/hooks/useWallet';
import { db } from '@/lib/db';

export type MiniAppPaymentResolution = {
  paymentId: string;
  status: 'paid' | 'cancelled' | 'expired' | 'failed';
  transferId?: string | null;
  amount: number;
  currency: string;
  error?: string;
};

export interface PendingMiniAppPayment {
  paymentId: string;
  appId: string;
  appName: string;
  amount: number;
  currency: string;
  description?: string | null;
}

interface MiniAppPaymentConfirmDialogProps {
  payment: PendingMiniAppPayment | null;
  onResolved: (resolution: MiniAppPaymentResolution) => void;
}

function newIdempotencyKey() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `00000000-0000-4000-8000-${Date.now().toString().padStart(12, '0').slice(-12)}`;
}

function friendlyPaymentError(error: string) {
  const value = error.toLowerCase();
  if (value.includes('insufficient_balance')) return 'Hisobda mablag‘ yetarli emas.';
  if (value.includes('currency_mismatch')) return 'Mini app valyutasi Wallet valyutasi bilan mos emas.';
  if (value.includes('wallet_restricted')) return 'Wallet vaqtincha cheklangan.';
  if (value.includes('payment_expired')) return 'To‘lov so‘rovining vaqti tugagan.';
  if (value.includes('merchant_wallet')) return 'Mini app qabul qiluvchi hisobi sozlanmagan.';
  return 'To‘lovni hozir bajarib bo‘lmadi.';
}

export function MiniAppPaymentConfirmDialog({
  payment,
  onResolved,
}: MiniAppPaymentConfirmDialogProps) {
  const walletApi = useWallet();
  const [submitting, setSubmitting] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [idempotencyKey, setIdempotencyKey] = useState(newIdempotencyKey);

  const enoughBalance = useMemo(() => {
    if (!payment || !walletApi.wallet) return false;
    return (
      walletApi.wallet.currency.toUpperCase() === payment.currency.toUpperCase() &&
      walletApi.wallet.balance >= payment.amount
    );
  }, [payment, walletApi.wallet]);

  const resetTransient = () => {
    setSubmitting(false);
    setCancelling(false);
    setError(null);
    setIdempotencyKey(newIdempotencyKey());
  };

  const resolve = (resolution: MiniAppPaymentResolution) => {
    resetTransient();
    onResolved(resolution);
  };

  const cancel = async () => {
    if (!payment || cancelling || submitting) return;
    setCancelling(true);
    setError(null);

    try {
      const { data, error: rpcError } = await db.rpc('mini_app_payment_cancel', {
        p_payment_id: payment.paymentId,
      });
      if (rpcError) throw rpcError;

      const status = String((data as any)?.status || 'cancelled');
      resolve({
        paymentId: payment.paymentId,
        status: status === 'expired' ? 'expired' : 'cancelled',
        amount: payment.amount,
        currency: payment.currency,
      });
    } catch (cancelError) {
      setCancelling(false);
      setError(
        friendlyPaymentError(
          String((cancelError as any)?.message || cancelError || 'cancel_failed'),
        ),
      );
    }
  };

  const confirm = async () => {
    if (!payment || submitting || cancelling || !enoughBalance) return;
    setSubmitting(true);
    setError(null);

    try {
      const { data, error: rpcError } = await db.rpc('mini_app_payment_confirm', {
        p_payment_id: payment.paymentId,
        p_idempotency_key: idempotencyKey,
      });
      if (rpcError) throw rpcError;

      const result = (data || {}) as Record<string, unknown>;
      const success = result.success === true;
      const status = String(result.status || (success ? 'paid' : 'failed'));
      if (!success || status !== 'paid') {
        const rawError = String(result.error || status || 'payment_failed');
        if (status === 'expired') {
          resolve({
            paymentId: payment.paymentId,
            status: 'expired',
            amount: payment.amount,
            currency: payment.currency,
            error: rawError,
          });
          return;
        }
        setSubmitting(false);
        setError(friendlyPaymentError(rawError));
        return;
      }

      await walletApi.refresh(true);
      resolve({
        paymentId: payment.paymentId,
        status: 'paid',
        transferId: typeof result.transfer_id === 'string' ? result.transfer_id : null,
        amount: payment.amount,
        currency: payment.currency,
      });
    } catch (confirmError) {
      setSubmitting(false);
      setError(
        friendlyPaymentError(
          String((confirmError as any)?.message || confirmError || 'payment_failed'),
        ),
      );
    }
  };

  return (
    <Dialog
      open={Boolean(payment)}
      onOpenChange={(open) => {
        if (!open && payment && !submitting) void cancel();
      }}
    >
      <DialogContent
        className="max-w-md overflow-hidden rounded-[26px] p-0"
        onEscapeKeyDown={(event) => {
          if (submitting) event.preventDefault();
        }}
        onPointerDownOutside={(event) => {
          if (submitting) event.preventDefault();
        }}
      >
        {payment && (
          <>
            <DialogHeader className="border-b border-border/60 px-5 py-4 text-left">
              <DialogTitle className="flex items-center gap-3 text-base">
                <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-foreground text-background">
                  <WalletCards className="h-4 w-4" />
                </span>
                Mini app to‘lovi
              </DialogTitle>
            </DialogHeader>

            <div className="space-y-4 px-5 py-5">
              <div className="rounded-2xl border border-border/60 bg-muted/25 p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-muted-foreground">Qabul qiluvchi ilova</p>
                    <p className="mt-1 truncate text-base font-semibold">{payment.appName}</p>
                    {payment.description && (
                      <p className="mt-1.5 line-clamp-3 text-xs leading-relaxed text-muted-foreground">
                        {payment.description}
                      </p>
                    )}
                  </div>
                  <ShieldCheck className="h-5 w-5 shrink-0 text-foreground" />
                </div>
              </div>

              <div className="rounded-2xl border border-border/60 p-4">
                <div className="flex items-end justify-between gap-4">
                  <div>
                    <p className="text-xs text-muted-foreground">To‘lanadi</p>
                    <p className="mt-1 text-2xl font-bold tabular-nums">
                      {formatWalletMoney(payment.amount, payment.currency)}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-[11px] text-muted-foreground">Wallet balansi</p>
                    <p className="mt-1 text-sm font-semibold tabular-nums">
                      {walletApi.wallet
                        ? formatWalletMoney(walletApi.wallet.balance, walletApi.wallet.currency)
                        : '—'}
                    </p>
                  </div>
                </div>
              </div>

              {!enoughBalance && walletApi.wallet && (
                <div className="flex items-start gap-2 rounded-xl border border-destructive/20 bg-destructive/5 px-3 py-2.5 text-xs text-destructive">
                  <XCircle className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>
                    {walletApi.wallet.currency.toUpperCase() !== payment.currency.toUpperCase()
                      ? 'Wallet valyutasi bu to‘lov valyutasi bilan mos emas.'
                      : 'Wallet balansida yetarli mablag‘ yo‘q.'}
                  </span>
                </div>
              )}

              {error && (
                <div className="rounded-xl border border-destructive/20 bg-destructive/5 px-3 py-2.5 text-xs text-destructive">
                  {error}
                </div>
              )}

              <div className="grid grid-cols-2 gap-2 pt-1">
                <Button
                  type="button"
                  variant="outline"
                  className="h-11 rounded-xl"
                  disabled={submitting || cancelling}
                  onClick={() => void cancel()}
                >
                  {cancelling && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Bekor qilish
                </Button>
                <Button
                  type="button"
                  className="h-11 rounded-xl bg-foreground text-background hover:bg-foreground/90"
                  disabled={submitting || cancelling || !enoughBalance}
                  onClick={() => void confirm()}
                >
                  {submitting ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <CheckCircle2 className="mr-2 h-4 w-4" />
                  )}
                  Tasdiqlash
                </Button>
              </div>

              <p className="text-center text-[11px] leading-relaxed text-muted-foreground">
                Pul faqat siz tasdiqlaganingizdan keyin Alsamos Wallet ledgerida atomik o‘tkaziladi.
                Mini app karta ma’lumotlaringiz yoki Wallet credentiallaringizni olmaydi.
              </p>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

export default MiniAppPaymentConfirmDialog;

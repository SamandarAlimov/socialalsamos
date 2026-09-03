import { useEffect, useState } from 'react';
import { Check, ExternalLink, Loader2, Plus, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { formatWalletMoney, useWallet, type WalletInfo, type WalletTopUpRequest } from '@/hooks/useWallet';
import { cn } from '@/lib/utils';

interface WalletTopUpDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  wallet?: WalletInfo | null;
}

type TopUpMethod = 'payme' | WalletTopUpRequest['method'];

const METHODS: Array<{
  id: TopUpMethod;
  label: string;
  hint: string;
}> = [
  { id: 'payme', label: 'Payme', hint: 'Uzcard/HUMO orqali provayder tasdiqlagan real-time to‘lov.' },
  { id: 'bank_transfer', label: 'Bank o‘tkazmasi', hint: 'Bank orqali yuborilgan to‘lov reference bilan tekshiriladi.' },
  { id: 'p2p_card', label: 'Kartadan o‘tkazma', hint: 'Karta orqali tashqi P2P o‘tkazmasi reference bilan tasdiqlanadi.' },
  { id: 'cash_office', label: 'Kassa', hint: 'Operator yoki kassada qabul qilingan to‘lov.' },
];

export function WalletTopUpDialog({ open, onOpenChange, wallet: providedWallet }: WalletTopUpDialogProps) {
  const walletApi = useWallet();
  const wallet = providedWallet || walletApi.wallet;
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState<TopUpMethod>('payme');
  const [reference, setReference] = useState('');
  const [note, setNote] = useState('');
  const [sending, setSending] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setAmount('');
    setMethod('payme');
    setReference('');
    setNote('');
    setSending(false);
    setSubmitted(false);
    setError(null);
  }, [open]);

  const numericAmount = Number(amount.replace(/\s/g, '').replace(',', '.'));
  const validAmount = Number.isFinite(numericAmount) && numericAmount > 0;

  const submit = async () => {
    if (!validAmount) return;
    setSending(true);
    setError(null);
    try {
      if (method === 'payme') {
        const checkout = await walletApi.createPaymeTopUp(numericAmount);
        window.location.assign(checkout.paymentUrl);
        return;
      }

      await walletApi.requestTopUp({
        amount: numericAmount,
        method,
        reference,
        note,
      });
      setSubmitted(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'So‘rov yuborilmadi.');
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md overflow-hidden rounded-[24px] p-0">
        <DialogHeader className="border-b border-border/70 px-5 py-4 text-left">
          <DialogTitle className="flex items-center gap-2.5 text-base">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-foreground text-background">
              <Plus className="h-4 w-4" />
            </span>
            Hisobni to‘ldirish
          </DialogTitle>
        </DialogHeader>

        {submitted ? (
          <div className="px-5 py-8 text-center">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-foreground text-background">
              <Check className="h-7 w-7" />
            </div>
            <h3 className="mt-4 text-lg font-semibold">So‘rov qabul qilindi</h3>
            <p className="mt-1 text-2xl font-bold tabular-nums">
              {formatWalletMoney(numericAmount, wallet?.currency || 'USD')}
            </p>
            <p className="mx-auto mt-3 max-w-sm text-xs leading-relaxed text-muted-foreground">
              Tashqi to‘lov operator tomonidan tekshirilgach balans avtomatik yangilanadi.
              Tasdiqlanmagan tashqi to‘lov balansga yozilmaydi.
            </p>
            <Button
              className="mt-6 w-full rounded-xl bg-foreground text-background hover:bg-foreground/90"
              onClick={() => onOpenChange(false)}
            >
              Tayyor
            </Button>
          </div>
        ) : (
          <div className="space-y-5 px-5 py-5">
            <div className="rounded-2xl border border-border/70 bg-muted/35 p-4">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <ShieldCheck className="h-4 w-4" />
                Xavfsiz to‘ldirish oqimi
              </div>
              <p className="mt-2 text-sm leading-relaxed">
                Payme tanlansa, to‘lov provayder sahifasida bajariladi va muvaffaqiyatli Merchant API tasdig‘idan keyin balans atomik tarzda yangilanadi. Qo‘lda usullar esa operator tekshiruvini talab qiladi.
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="topup-amount">Summa</Label>
              <div className="relative">
                <Input
                  id="topup-amount"
                  value={amount}
                  onChange={(event) => setAmount(event.target.value.replace(/[^0-9.,]/g, ''))}
                  inputMode="decimal"
                  placeholder="0"
                  className="h-14 rounded-xl pr-16 text-xl font-semibold tabular-nums"
                />
                <span className="absolute right-4 top-1/2 -translate-y-1/2 text-xs font-semibold text-muted-foreground">
                  {wallet?.currency || ''}
                </span>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Usul</Label>
              <div className="space-y-2">
                {METHODS.map((item) => {
                  const active = method === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setMethod(item.id)}
                      className={cn(
                        'w-full rounded-xl border p-3 text-left transition-colors',
                        active
                          ? 'border-foreground bg-foreground text-background'
                          : 'border-border/70 bg-card hover:bg-muted/50'
                      )}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-sm font-medium">{item.label}</p>
                        {item.id === 'payme' && <ExternalLink className="h-3.5 w-3.5 shrink-0 opacity-60" />}
                      </div>
                      <p className={cn('mt-0.5 text-xs', active ? 'text-background/70' : 'text-muted-foreground')}>
                        {item.hint}
                      </p>
                    </button>
                  );
                })}
              </div>
            </div>

            {method !== 'payme' && (
              <>
                <div className="space-y-2">
                  <Label htmlFor="topup-reference">To‘lov reference</Label>
                  <Input
                    id="topup-reference"
                    value={reference}
                    onChange={(event) => setReference(event.target.value)}
                    maxLength={80}
                    placeholder="Tranzaksiya ID yoki izoh"
                    className="h-11 rounded-xl"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="topup-note">Izoh <span className="text-muted-foreground">(ixtiyoriy)</span></Label>
                  <Textarea
                    id="topup-note"
                    value={note}
                    onChange={(event) => setNote(event.target.value)}
                    maxLength={200}
                    rows={2}
                    className="resize-none rounded-xl"
                  />
                </div>
              </>
            )}

            {error && (
              <div className="rounded-xl border border-destructive/20 bg-destructive/5 px-3 py-2.5 text-xs text-destructive">
                {error}
              </div>
            )}

            <Button
              className="h-12 w-full rounded-xl bg-foreground text-background hover:bg-foreground/90"
              disabled={!validAmount || sending}
              onClick={submit}
            >
              {sending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {method === 'payme' ? 'Payme orqali davom etish' : 'So‘rov yuborish'}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

export default WalletTopUpDialog;

import { useEffect, useMemo, useState } from 'react';
import { ArrowRight, Check, Loader2, Search, ShieldCheck, WalletCards } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  formatWalletAccount,
  formatWalletMoney,
  useWallet,
  type WalletInfo,
  type WalletRecipient,
  type WalletTransferResult,
} from '@/hooks/useWallet';
import { cn } from '@/lib/utils';

interface WalletTransferDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  wallet?: WalletInfo | null;
  conversationId?: string | null;
  onSuccess?: (result: WalletTransferResult) => void | Promise<void>;
}

function newIdempotencyKey() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return '00000000-0000-4000-8000-' + Date.now().toString().padStart(12, '0').slice(-12);
}

export function WalletTransferDialog({
  open,
  onOpenChange,
  wallet: providedWallet,
  conversationId,
  onSuccess,
}: WalletTransferDialogProps) {
  const walletApi = useWallet();
  const wallet = providedWallet || walletApi.wallet;
  const [identifier, setIdentifier] = useState('');
  const [recipient, setRecipient] = useState<WalletRecipient | null>(null);
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [checking, setChecking] = useState(false);
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState<WalletTransferResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [idempotencyKey, setIdempotencyKey] = useState(newIdempotencyKey);

  useEffect(() => {
    if (!open) return;
    setIdentifier('');
    setRecipient(null);
    setAmount('');
    setNote('');
    setChecking(false);
    setSending(false);
    setDone(null);
    setError(null);
    setIdempotencyKey(newIdempotencyKey());
  }, [open]);

  const numericAmount = Number(amount.replace(/\s/g, '').replace(',', '.'));
  const validAmount = Number.isFinite(numericAmount) && numericAmount > 0;
  const enough = Boolean(wallet && validAmount && numericAmount <= wallet.balance);
  const conversationMode = Boolean(conversationId);

  const recipientLabel = useMemo(() => {
    if (!recipient?.found) return null;
    return recipient.display_name || recipient.username || formatWalletAccount(recipient.account_number);
  }, [recipient]);

  const lookup = async () => {
    if (!identifier.trim()) return;
    setChecking(true);
    setError(null);
    try {
      const result = await walletApi.lookupRecipient(identifier);
      setRecipient(result);
      if (!result.found) setError('Qabul qiluvchi topilmadi.');
    } catch (err) {
      setRecipient(null);
      setError(err instanceof Error ? err.message : 'Qabul qiluvchi topilmadi.');
    } finally {
      setChecking(false);
    }
  };

  const submit = async () => {
    if (!wallet || !validAmount || !enough) return;
    if (!conversationMode && !recipient?.found) return;

    setSending(true);
    setError(null);
    try {
      const result = conversationMode
        ? await walletApi.transferToConversation({
            conversationId: conversationId!,
            amount: numericAmount,
            note,
            idempotencyKey,
          })
        : await walletApi.transfer({
            recipient: recipient!.account_number || identifier,
            amount: numericAmount,
            note,
            idempotencyKey,
          });

      setDone(result);
      await onSuccess?.(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'O‘tkazma bajarilmadi.');
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
              <WalletCards className="h-4 w-4" />
            </span>
            Pul o‘tkazish
          </DialogTitle>
        </DialogHeader>

        {done ? (
          <div className="px-5 py-8 text-center">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-foreground text-background">
              <Check className="h-7 w-7" />
            </div>
            <h3 className="mt-4 text-lg font-semibold">O‘tkazma bajarildi</h3>
            <p className="mt-1 text-2xl font-bold tabular-nums">
              {formatWalletMoney(done.amount, done.currency)}
            </p>
            <p className="mt-2 text-xs text-muted-foreground">
              Tranzaksiya: {done.transfer_id.slice(0, 8).toUpperCase()}
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
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>Mavjud balans</span>
                <ShieldCheck className="h-4 w-4" />
              </div>
              <p className="mt-1 text-xl font-semibold tabular-nums">
                {wallet ? formatWalletMoney(wallet.balance, wallet.currency) : '—'}
              </p>
              {wallet?.account_number && (
                <p className="mt-1 font-mono text-[11px] tracking-wide text-muted-foreground">
                  {formatWalletAccount(wallet.account_number)}
                </p>
              )}
            </div>

            {!conversationMode && (
              <div className="space-y-2">
                <Label htmlFor="wallet-recipient">Qabul qiluvchi</Label>
                <div className="flex gap-2">
                  <Input
                    id="wallet-recipient"
                    value={identifier}
                    onChange={(event) => {
                      setIdentifier(event.target.value);
                      setRecipient(null);
                      setError(null);
                    }}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') void lookup();
                    }}
                    placeholder="@username yoki ALS hisob raqami"
                    className="h-11 rounded-xl"
                  />
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-11 w-11 rounded-xl"
                    disabled={checking || !identifier.trim()}
                    onClick={lookup}
                    aria-label="Qabul qiluvchini tekshirish"
                  >
                    {checking ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                  </Button>
                </div>

                {recipient?.found && (
                  <div className="flex items-center gap-3 rounded-xl border border-border/70 bg-card p-3">
                    <Avatar className="h-10 w-10">
                      <AvatarImage src={recipient.avatar_url || ''} />
                      <AvatarFallback>
                        {(recipientLabel || 'A')[0]?.toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{recipientLabel}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {recipient.username ? '@' + recipient.username + ' · ' : ''}
                        {formatWalletAccount(recipient.account_number)}
                      </p>
                    </div>
                    <Check className="h-4 w-4 text-foreground" />
                  </div>
                )}
              </div>
            )}

            {conversationMode && (
              <div className="rounded-xl border border-border/70 bg-muted/30 px-3 py-2.5">
                <p className="text-sm font-medium">Shaxsiy chatdagi foydalanuvchiga</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Qabul qiluvchi server tomonidan shu private chat ishtirokchisidan aniqlanadi.
                </p>
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="wallet-amount">Summa</Label>
              <div className="relative">
                <Input
                  id="wallet-amount"
                  value={amount}
                  onChange={(event) => setAmount(event.target.value.replace(/[^0-9.,]/g, ''))}
                  inputMode="decimal"
                  placeholder="0"
                  className={cn(
                    'h-14 rounded-xl pr-16 text-xl font-semibold tabular-nums',
                    validAmount && !enough && 'border-destructive focus-visible:ring-destructive'
                  )}
                />
                <span className="absolute right-4 top-1/2 -translate-y-1/2 text-xs font-semibold text-muted-foreground">
                  {wallet?.currency || ''}
                </span>
              </div>
              {validAmount && !enough && (
                <p className="text-xs text-destructive">Balans yetarli emas.</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="wallet-note">Izoh <span className="text-muted-foreground">(ixtiyoriy)</span></Label>
              <Textarea
                id="wallet-note"
                value={note}
                onChange={(event) => setNote(event.target.value)}
                maxLength={140}
                rows={2}
                className="resize-none rounded-xl"
                placeholder="Masalan: tushlik uchun"
              />
            </div>

            {error && (
              <div className="rounded-xl border border-destructive/20 bg-destructive/5 px-3 py-2.5 text-xs text-destructive">
                {error}
              </div>
            )}

            <Button
              className="h-12 w-full rounded-xl bg-foreground text-background hover:bg-foreground/90"
              disabled={
                sending ||
                !wallet ||
                !validAmount ||
                !enough ||
                (!conversationMode && !recipient?.found)
              }
              onClick={submit}
            >
              {sending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <ArrowRight className="mr-2 h-4 w-4" />
              )}
              Tasdiqlash
            </Button>

            <p className="text-center text-[11px] leading-relaxed text-muted-foreground">
              O‘tkazma tasdiqlangach Alsamos ichki ledgerida darhol va atomik tarzda bajariladi.
            </p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

export default WalletTransferDialog;

import { ArrowUpRight, Copy, Eye, EyeOff, Plus, Wallet } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useState } from 'react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { formatWalletAccount, formatWalletMoney } from '@/hooks/useWallet';

interface WalletCardProps {
  balance: number;
  currency: string;
  accountNumber?: string | null;
  status?: string;
  onAddMoney?: () => void;
  onSend?: () => void;
}

export function WalletCard({
  balance,
  currency,
  accountNumber,
  status = 'active',
  onAddMoney,
  onSend,
}: WalletCardProps) {
  const [isHidden, setIsHidden] = useState(false);

  const copyAccount = async () => {
    if (!accountNumber) return;
    try {
      await navigator.clipboard.writeText(accountNumber);
      toast.success('Hisob raqami nusxalandi');
    } catch {
      toast.error('Nusxa olib bo‘lmadi');
    }
  };

  return (
    <div className="relative overflow-hidden rounded-[26px] border border-border/70 bg-card p-5 shadow-[0_12px_40px_rgba(15,23,42,0.06)] sm:p-6">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-muted/70 to-transparent" />
      <div className="pointer-events-none absolute -right-16 -top-16 h-44 w-44 rounded-full border border-border/50" />

      <div className="relative">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-muted-foreground">
              <p className="text-xs font-medium">Balans</p>
              <button
                type="button"
                onClick={() => setIsHidden((value) => !value)}
                className="rounded-full p-1 transition hover:bg-muted hover:text-foreground"
                aria-label={isHidden ? 'Balansni ko‘rsatish' : 'Balansni yashirish'}
              >
                {isHidden ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
              </button>
            </div>

            <p
              className={cn(
                'mt-1 text-3xl font-semibold tracking-tight tabular-nums text-foreground sm:text-4xl',
                isHidden && 'select-none blur-md'
              )}
            >
              {formatWalletMoney(balance, currency)}
            </p>

            <button
              type="button"
              onClick={copyAccount}
              disabled={!accountNumber}
              className={cn(
                'mt-4 inline-flex max-w-full items-center gap-2 rounded-full border px-3 py-1.5 font-mono text-[11px] tracking-wide transition',
                accountNumber
                  ? 'border-border/70 bg-background text-foreground hover:bg-muted'
                  : 'cursor-default border-border/50 bg-muted/50 text-muted-foreground'
              )}
            >
              <span className="truncate">
                {accountNumber ? formatWalletAccount(accountNumber) : 'Hisob raqami tayyorlanmoqda'}
              </span>
              {accountNumber && <Copy className="h-3.5 w-3.5 shrink-0" />}
            </button>
          </div>

          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-border/70 bg-background shadow-sm">
            <Wallet className="h-5 w-5 text-foreground" />
          </div>
        </div>

        <div className="mt-6 flex items-center justify-between gap-3 border-t border-border/60 pt-4 text-[11px] text-muted-foreground">
          <span>{status === 'active' ? 'Faol' : status}</span>
          <span>{currency}</span>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2">
          <Button
            onClick={onAddMoney}
            className="h-11 rounded-xl bg-foreground text-background shadow-sm hover:bg-foreground/90"
          >
            <Plus className="mr-2 h-4 w-4" />
            Pul qo‘shish
          </Button>
          <Button
            variant="outline"
            onClick={onSend}
            className="h-11 rounded-xl border-border/80 bg-background hover:bg-muted"
          >
            <ArrowUpRight className="mr-2 h-4 w-4" />
            O‘tkazish
          </Button>
        </div>
      </div>
    </div>
  );
}

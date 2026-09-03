import { ArrowUpRight, Copy, Eye, EyeOff, Plus, ShieldCheck, Wallet } from 'lucide-react';
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
    <div className="relative overflow-hidden rounded-[28px] border border-border/70 bg-foreground p-5 text-background shadow-sm sm:p-6">
      <div className="pointer-events-none absolute -right-12 -top-12 h-40 w-40 rounded-full border border-background/10" />
      <div className="pointer-events-none absolute -bottom-16 -left-12 h-36 w-36 rounded-full border border-background/10" />

      <div className="relative">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-background/65">
              <p className="text-xs font-medium">Alsamos hisobi</p>
              <button
                type="button"
                onClick={() => setIsHidden((value) => !value)}
                className="rounded-full p-1 transition hover:bg-background/10 hover:text-background"
                aria-label={isHidden ? 'Balansni ko‘rsatish' : 'Balansni yashirish'}
              >
                {isHidden ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
              </button>
            </div>

            <p
              className={cn(
                'mt-1 text-3xl font-semibold tracking-tight tabular-nums sm:text-4xl',
                isHidden && 'select-none blur-md'
              )}
            >
              {formatWalletMoney(balance, currency)}
            </p>

            {accountNumber && (
              <button
                type="button"
                onClick={copyAccount}
                className="mt-3 inline-flex max-w-full items-center gap-2 rounded-full bg-background/10 px-3 py-1.5 font-mono text-[11px] tracking-wide text-background/80 transition hover:bg-background/15 hover:text-background"
              >
                <span className="truncate">{formatWalletAccount(accountNumber)}</span>
                <Copy className="h-3.5 w-3.5 shrink-0" />
              </button>
            )}
          </div>

          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-background/15 bg-background/10">
            <Wallet className="h-5 w-5" />
          </div>
        </div>

        <div className="mt-5 flex items-center gap-2 text-[11px] text-background/60">
          <ShieldCheck className="h-3.5 w-3.5" />
          <span>{status === 'active' ? 'Hisob faol' : 'Hisob holati: ' + status}</span>
          <span>·</span>
          <span>{currency}</span>
        </div>

        <div className="mt-6 grid grid-cols-2 gap-2">
          <Button
            onClick={onAddMoney}
            className="h-11 rounded-xl border border-background/15 bg-background text-foreground hover:bg-background/90"
          >
            <Plus className="mr-2 h-4 w-4" />
            Pul qo‘shish
          </Button>
          <Button
            onClick={onSend}
            className="h-11 rounded-xl border border-background/20 bg-background/10 text-background hover:bg-background/15"
          >
            <ArrowUpRight className="mr-2 h-4 w-4" />
            O‘tkazish
          </Button>
        </div>
      </div>
    </div>
  );
}

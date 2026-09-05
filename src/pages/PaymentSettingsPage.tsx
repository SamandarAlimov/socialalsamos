import { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  ArrowDownLeft,
  ArrowLeft,
  ArrowUpRight,
  Clock3,
  Copy,
  History,
  Loader2,
  Megaphone,
  RefreshCw,
  ShieldCheck,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { WalletCard } from '@/components/payment/WalletCard';
import { WalletTransferDialog } from '@/components/payment/WalletTransferDialog';
import { WalletTopUpDialog } from '@/components/payment/WalletTopUpDialog';
import {
  formatWalletAccount,
  formatWalletMoney,
  useWallet,
  type WalletLedgerEntry,
} from '@/hooks/useWallet';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

function transactionLabel(item: WalletLedgerEntry) {
  switch (item.kind) {
    case 'p2p_transfer':
      return item.direction === 'credit' ? 'Pul qabul qilindi' : 'Pul yuborildi';
    case 'message_transfer':
      return item.direction === 'credit' ? 'Chat orqali pul qabul qilindi' : 'Chat orqali pul yuborildi';
    case 'marketplace_purchase':
      return 'Marketplace xaridi';
    case 'marketplace_settlement':
      return 'Marketplace savdosi';
    case 'refund':
      return 'Pul qaytarildi';
    case 'topup':
    case 'provider_topup':
      return 'Hisob to‘ldirildi';
    default:
      return item.description || 'To‘lov';
  }
}

function shortDate(value: string) {
  const date = new Date(value);
  return new Intl.DateTimeFormat('uz-UZ', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

function ActivityRow({ item }: { item: WalletLedgerEntry }) {
  const incoming = item.direction === 'credit';
  const person =
    item.counterparty?.display_name ||
    (item.counterparty?.username ? '@' + item.counterparty.username : null);

  return (
    <div className="flex items-center gap-3 border-b border-border/60 px-3 py-3 last:border-b-0 sm:px-4">
      <div
        className={cn(
          'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border',
          incoming
            ? 'border-border/70 bg-background text-foreground'
            : 'border-foreground bg-foreground text-background'
        )}
      >
        {incoming ? <ArrowDownLeft className="h-4 w-4" /> : <ArrowUpRight className="h-4 w-4" />}
      </div>

      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{transactionLabel(item)}</p>
        <p className="mt-0.5 truncate text-xs text-muted-foreground">
          {person || item.description || shortDate(item.created_at)}
        </p>
      </div>

      <div className="text-right">
        <p className="text-sm font-semibold tabular-nums">
          {incoming ? '+' : '−'}{formatWalletMoney(item.amount, item.currency)}
        </p>
        <p className="mt-0.5 text-[11px] text-muted-foreground">{shortDate(item.created_at)}</p>
      </div>
    </div>
  );
}

export default function PaymentSettingsPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const {
    wallet,
    ledger,
    pendingTopUps,
    isLoading,
    isRefreshing,
    refresh,
    cancelTopUp,
  } = useWallet();

  const [activeTab, setActiveTab] = useState('main');
  const [showTransfer, setShowTransfer] = useState(false);
  const [showTopUp, setShowTopUp] = useState(false);

  const recent = ledger.slice(0, 6);
  const incoming = useMemo(() => ledger.filter((item) => item.direction === 'credit'), [ledger]);
  const outgoing = useMemo(() => ledger.filter((item) => item.direction === 'debit'), [ledger]);
  const fromAds = searchParams.get('source') === 'ads';
  const rawReturnTo = searchParams.get('returnTo');
  const returnTo = rawReturnTo && rawReturnTo.startsWith('/') && !rawReturnTo.startsWith('//')
    ? rawReturnTo
    : '/ads/billing';

  if (isLoading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-7 w-7 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="mx-auto min-h-full max-w-3xl bg-background pb-24 md:pb-8">
      <div className="sticky top-0 z-20 border-b border-border/60 bg-background/95 backdrop-blur-xl">
        <div className="flex items-center justify-between px-4 py-3 sm:px-5">
          <h1 className="text-xl font-bold tracking-tight">To‘lov</h1>
          <Button
            variant="ghost"
            size="icon"
            className="h-9 w-9 rounded-xl"
            onClick={() => void refresh(true)}
            disabled={isRefreshing}
            aria-label="Yangilash"
          >
            <RefreshCw className={cn('h-4 w-4', isRefreshing && 'animate-spin')} />
          </Button>
        </div>

        <div className="px-4 pb-3 sm:px-5">
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="grid h-11 w-full grid-cols-3 rounded-2xl bg-muted/50 p-1">
              <TabsTrigger
                value="main"
                className="rounded-xl text-xs data-[state=active]:bg-foreground data-[state=active]:text-background data-[state=active]:shadow-sm"
              >
                Asosiy
              </TabsTrigger>
              <TabsTrigger
                value="history"
                className="rounded-xl text-xs data-[state=active]:bg-foreground data-[state=active]:text-background data-[state=active]:shadow-sm"
              >
                Tarix
              </TabsTrigger>
              <TabsTrigger
                value="account"
                className="rounded-xl text-xs data-[state=active]:bg-foreground data-[state=active]:text-background data-[state=active]:shadow-sm"
              >
                Hisob
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsContent value="main" className="mt-0 space-y-5 px-4 py-5 sm:px-5">
          {fromAds && (
            <section className="rounded-2xl border border-border/70 bg-card p-4 shadow-sm sm:p-5">
              <div className="flex items-start gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-border bg-muted/35">
                  <Megaphone className="h-4 w-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <h2 className="text-sm font-semibold">Reklama hisobini to‘ldirish</h2>
                  <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                    Ads Manager sizni shu umumiy To‘lov markaziga yubordi. Balansni to‘ldirgach kampaniya byudjetini Reklama markazida boshqarasiz.
                  </p>
                </div>
              </div>
              <div className="mt-4 flex flex-wrap gap-2 border-t border-border/60 pt-4">
                <Button variant="outline" className="rounded-xl" onClick={() => navigate(returnTo)}>
                  <ArrowLeft className="mr-2 h-4 w-4" /> Ads Manager
                </Button>
                <Button className="rounded-xl bg-foreground text-background hover:bg-foreground/90" onClick={() => setShowTopUp(true)}>
                  <ArrowDownLeft className="mr-2 h-4 w-4" /> Hisobni to‘ldirish
                </Button>
              </div>
            </section>
          )}

          <WalletCard
            balance={wallet?.balance || 0}
            currency={wallet?.currency || 'UZS'}
            accountNumber={wallet?.account_number}
            status={wallet?.status}
            onAddMoney={() => setShowTopUp(true)}
            onSend={() => setShowTransfer(true)}
          />

          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => setShowTransfer(true)}
              className="rounded-2xl border border-border/70 bg-card p-4 text-left shadow-sm transition hover:bg-muted/35"
            >
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-foreground text-background">
                <ArrowUpRight className="h-4 w-4" />
              </span>
              <p className="mt-3 text-sm font-semibold">Pul yuborish</p>
              <p className="mt-1 text-xs text-muted-foreground">@username yoki ALS hisob raqamiga</p>
            </button>

            <button
              type="button"
              onClick={() => setShowTopUp(true)}
              className="rounded-2xl border border-border/70 bg-card p-4 text-left shadow-sm transition hover:bg-muted/35"
            >
              <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-border/70 bg-background">
                <ArrowDownLeft className="h-4 w-4" />
              </span>
              <p className="mt-3 text-sm font-semibold">Hisobni to‘ldirish</p>
              <p className="mt-1 text-xs text-muted-foreground">Payme, bank yoki P2P orqali</p>
            </button>
          </div>

          {pendingTopUps.length > 0 && (
            <section className="overflow-hidden rounded-2xl border border-border/70 bg-card shadow-sm">
              <div className="border-b border-border/60 px-4 py-3">
                <h2 className="text-sm font-semibold">Kutilayotgan to‘ldirishlar</h2>
              </div>
              {pendingTopUps.map((request) => (
                <div key={request.id} className="flex items-center gap-3 border-b border-border/60 px-4 py-3 last:border-b-0">
                  <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-muted">
                    <Clock3 className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium tabular-nums">
                      {formatWalletMoney(request.amount, request.currency)}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {request.method === 'bank_transfer'
                        ? 'Bank o‘tkazmasi'
                        : request.method === 'p2p_card'
                          ? 'Kartadan o‘tkazma'
                          : 'Kassa'}
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 rounded-lg text-xs"
                    onClick={async () => {
                      try {
                        await cancelTopUp(request.id);
                        toast.success('So‘rov bekor qilindi');
                      } catch (err) {
                        toast.error(err instanceof Error ? err.message : 'Bekor qilib bo‘lmadi');
                      }
                    }}
                  >
                    Bekor qilish
                  </Button>
                </div>
              ))}
            </section>
          )}

          <section className="overflow-hidden rounded-2xl border border-border/70 bg-card shadow-sm">
            <div className="flex items-center justify-between border-b border-border/60 px-4 py-3">
              <h2 className="text-sm font-semibold">So‘nggi operatsiyalar</h2>
              {ledger.length > 6 && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 rounded-lg text-xs"
                  onClick={() => setActiveTab('history')}
                >
                  Barchasi
                </Button>
              )}
            </div>
            {recent.length > 0 ? (
              recent.map((item) => <ActivityRow key={item.id} item={item} />)
            ) : (
              <div className="px-4 py-10 text-center text-sm text-muted-foreground">
                Hali tranzaksiya yo‘q
              </div>
            )}
          </section>
        </TabsContent>

        <TabsContent value="history" className="mt-0 px-4 py-5 sm:px-5">
          <Tabs defaultValue="all">
            <TabsList className="grid h-10 w-full grid-cols-3 rounded-xl bg-muted/50 p-1">
              <TabsTrigger value="all" className="rounded-lg text-xs">Barchasi</TabsTrigger>
              <TabsTrigger value="incoming" className="rounded-lg text-xs">Kirim</TabsTrigger>
              <TabsTrigger value="outgoing" className="rounded-lg text-xs">Chiqim</TabsTrigger>
            </TabsList>

            {[
              ['all', ledger],
              ['incoming', incoming],
              ['outgoing', outgoing],
            ].map(([key, items]) => (
              <TabsContent key={key as string} value={key as string} className="mt-4">
                <div className="overflow-hidden rounded-2xl border border-border/70 bg-card shadow-sm">
                  {(items as WalletLedgerEntry[]).length > 0 ? (
                    (items as WalletLedgerEntry[]).map((item) => <ActivityRow key={item.id} item={item} />)
                  ) : (
                    <div className="px-4 py-12 text-center">
                      <History className="mx-auto h-8 w-8 text-muted-foreground/40" />
                      <p className="mt-3 text-sm text-muted-foreground">Operatsiyalar yo‘q</p>
                    </div>
                  )}
                </div>
              </TabsContent>
            ))}
          </Tabs>
        </TabsContent>

        <TabsContent value="account" className="mt-0 px-4 py-5 sm:px-5">
          <section className="overflow-hidden rounded-2xl border border-border/70 bg-card shadow-sm">
            <div className="border-b border-border/60 px-4 py-3">
              <h2 className="text-sm font-semibold">Alsamos hisob raqami</h2>
            </div>

            <div className="p-4">
              <button
                type="button"
                disabled={!wallet?.account_number}
                onClick={async () => {
                  if (!wallet?.account_number) return;
                  try {
                    await navigator.clipboard.writeText(wallet.account_number);
                    toast.success('Hisob raqami nusxalandi');
                  } catch {
                    toast.error('Nusxa olib bo‘lmadi');
                  }
                }}
                className={cn(
                  'flex w-full items-center justify-between gap-3 rounded-xl border px-4 py-3 text-left transition',
                  wallet?.account_number
                    ? 'border-border/70 bg-background hover:bg-muted/40'
                    : 'cursor-default border-border/50 bg-muted/40'
                )}
              >
                <span className="min-w-0">
                  <span className="block text-xs text-muted-foreground">Hisob</span>
                  <span className="mt-0.5 block truncate font-mono text-sm font-semibold tracking-wide">
                    {wallet?.account_number ? formatWalletAccount(wallet.account_number) : 'Yaratilmoqda...'}
                  </span>
                </span>
                {wallet?.account_number && <Copy className="h-4 w-4 shrink-0 text-muted-foreground" />}
              </button>

              <div className="mt-3 grid grid-cols-2 gap-2">
                <div className="rounded-xl border border-border/60 bg-background p-3">
                  <p className="text-xs text-muted-foreground">Valyuta</p>
                  <p className="mt-1 text-sm font-semibold">{wallet?.currency || '—'}</p>
                </div>
                <div className="rounded-xl border border-border/60 bg-background p-3">
                  <p className="text-xs text-muted-foreground">Holat</p>
                  <p className="mt-1 inline-flex items-center gap-1.5 text-sm font-semibold">
                    <ShieldCheck className="h-3.5 w-3.5" />
                    {wallet?.status === 'active' ? 'Faol' : wallet?.status || '—'}
                  </p>
                </div>
              </div>
            </div>
          </section>
        </TabsContent>
      </Tabs>

      <WalletTransferDialog
        open={showTransfer}
        onOpenChange={setShowTransfer}
        wallet={wallet}
      />
      <WalletTopUpDialog
        open={showTopUp}
        onOpenChange={setShowTopUp}
        wallet={wallet}
      />
    </div>
  );
}

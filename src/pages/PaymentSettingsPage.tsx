import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { 
  ArrowUpRight, 
  ArrowDownLeft, 
  History,
  ChevronRight,
  Loader2,
  RefreshCw
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

// Payment components
import { WalletCard } from '@/components/payment/WalletCard';
import { PaymentQuickActions } from '@/components/payment/PaymentQuickActions';
import { PaymentServicesGrid } from '@/components/payment/PaymentServicesGrid';
import { PaymentFinanceSection } from '@/components/payment/PaymentFinanceSection';
import { CurrencyRatesCard } from '@/components/payment/CurrencyRatesCard';
import { LinkedCardsSection } from '@/components/payment/LinkedCardsSection';

interface WalletData {
  id: string;
  balance: number;
  currency: string;
}

interface Transaction {
  id: string;
  amount: number;
  type: 'deposit' | 'withdrawal' | 'transfer_in' | 'transfer_out' | 'purchase' | 'refund';
  status: 'pending' | 'completed' | 'failed' | 'cancelled';
  description: string | null;
  created_at: string;
}

export default function PaymentSettingsPage() {
  const { user } = useAuth();
  const [wallet, setWallet] = useState<WalletData | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState('main');

  const fetchWalletData = async () => {
    if (!user) return;

    try {
      let { data: walletData, error } = await supabase
        .from('wallets')
        .select('*')
        .eq('user_id', user.id)
        .single();

      if (error && error.code === 'PGRST116') {
        const { data: newWallet, error: createError } = await supabase
          .from('wallets')
          .insert({ user_id: user.id })
          .select()
          .single();

        if (!createError) {
          walletData = newWallet;
        }
      }

      if (walletData) {
        setWallet({
          id: walletData.id,
          balance: parseFloat(String(walletData.balance)),
          currency: walletData.currency,
        });

        const { data: txData } = await supabase
          .from('transactions')
          .select('*')
          .eq('wallet_id', walletData.id)
          .order('created_at', { ascending: false })
          .limit(50);

        if (txData) {
          setTransactions(txData as Transaction[]);
        }
      }
    } catch (error) {
      console.error('Error fetching wallet:', error);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    fetchWalletData();
  }, [user]);

  const handleRefresh = () => {
    setIsRefreshing(true);
    fetchWalletData();
  };

  const handleServiceClick = (serviceKey: string) => {
    toast.info(`${serviceKey} xizmati tez orada ishga tushadi`);
  };

  const handleFinanceItemClick = (key: string) => {
    toast.info(`${key} bo'limi tez orada ishga tushadi`);
  };

  const formatCurrency = (amount: number, currency: string) => {
    return new Intl.NumberFormat('uz-UZ', {
      style: 'currency',
      currency: currency,
    }).format(amount);
  };

  const getTransactionIcon = (type: string) => {
    switch (type) {
      case 'deposit':
      case 'transfer_in':
      case 'refund':
        return <ArrowDownLeft className="h-4 w-4 text-green-500" />;
      case 'withdrawal':
      case 'transfer_out':
      case 'purchase':
        return <ArrowUpRight className="h-4 w-4 text-red-500" />;
      default:
        return <History className="h-4 w-4 text-muted-foreground" />;
    }
  };

  const getTransactionColor = (type: string) => {
    switch (type) {
      case 'deposit':
      case 'transfer_in':
      case 'refund':
        return 'text-green-500';
      case 'withdrawal':
      case 'transfer_out':
      case 'purchase':
        return 'text-red-500';
      default:
        return 'text-foreground';
    }
  };

  const getTransactionLabel = (type: string) => {
    switch (type) {
      case 'deposit': return 'Kirim';
      case 'withdrawal': return 'Chiqim';
      case 'transfer_in': return 'Qabul qilindi';
      case 'transfer_out': return "O'tkazildi";
      case 'purchase': return 'Xarid';
      case 'refund': return 'Qaytarildi';
      default: return type;
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-8rem)]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto pb-24 md:pb-6">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-background/95 backdrop-blur-lg border-b border-border px-4 py-3">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold">To'lov</h1>
          <Button variant="ghost" size="icon" onClick={handleRefresh} disabled={isRefreshing}>
            <RefreshCw className={cn("h-5 w-5", isRefreshing && "animate-spin")} />
          </Button>
        </div>
      </div>

      {/* Main Content */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <div className="sticky top-14 z-10 bg-background/95 backdrop-blur-lg px-4 py-2">
          <TabsList className="w-full grid grid-cols-3 h-10">
            <TabsTrigger value="main" className="text-xs">Asosiy</TabsTrigger>
            <TabsTrigger value="services" className="text-xs">Xizmatlar</TabsTrigger>
            <TabsTrigger value="history" className="text-xs">Tarix</TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="main" className="mt-0 px-4 space-y-6 py-4">
          {/* Wallet Card */}
          <WalletCard
            balance={wallet?.balance || 0}
            currency={wallet?.currency || 'UZS'}
            onAddMoney={() => toast.info("Pul qo'shish tez orada ishga tushadi")}
            onSend={() => toast.info("O'tkazish tez orada ishga tushadi")}
          />

          {/* Quick Actions */}
          <PaymentQuickActions
            onQrPayment={() => toast.info("QR to'lov tez orada ishga tushadi")}
            onCashback={() => toast.info("Keshbek tez orada ishga tushadi")}
            onReferral={() => toast.info("Taklif bonus tez orada ishga tushadi")}
            onMyCards={() => toast.info("Kartalarim tez orada ishga tushadi")}
          />

          {/* Linked Cards */}
          <LinkedCardsSection
            cards={[]}
            onAddCard={() => toast.info("Karta qo'shish tez orada ishga tushadi")}
          />

          {/* Currency Rates */}
          <CurrencyRatesCard />

          {/* Finance Section */}
          <PaymentFinanceSection onItemClick={handleFinanceItemClick} />
        </TabsContent>

        <TabsContent value="services" className="mt-0 px-4 py-4">
          <PaymentServicesGrid onServiceClick={handleServiceClick} />
        </TabsContent>

        <TabsContent value="history" className="mt-0 px-4 py-4">
          <Tabs defaultValue="all" className="w-full">
            <TabsList className="w-full grid grid-cols-3 mb-4">
              <TabsTrigger value="all">Barchasi</TabsTrigger>
              <TabsTrigger value="incoming">Kirimlar</TabsTrigger>
              <TabsTrigger value="outgoing">Chiqimlar</TabsTrigger>
            </TabsList>

            <TabsContent value="all">
              <TransactionList 
                transactions={transactions} 
                formatCurrency={formatCurrency}
                currency={wallet?.currency || 'UZS'}
                getTransactionIcon={getTransactionIcon}
                getTransactionColor={getTransactionColor}
                getTransactionLabel={getTransactionLabel}
              />
            </TabsContent>

            <TabsContent value="incoming">
              <TransactionList 
                transactions={transactions.filter(t => ['deposit', 'transfer_in', 'refund'].includes(t.type))} 
                formatCurrency={formatCurrency}
                currency={wallet?.currency || 'UZS'}
                getTransactionIcon={getTransactionIcon}
                getTransactionColor={getTransactionColor}
                getTransactionLabel={getTransactionLabel}
              />
            </TabsContent>

            <TabsContent value="outgoing">
              <TransactionList 
                transactions={transactions.filter(t => ['withdrawal', 'transfer_out', 'purchase'].includes(t.type))} 
                formatCurrency={formatCurrency}
                currency={wallet?.currency || 'UZS'}
                getTransactionIcon={getTransactionIcon}
                getTransactionColor={getTransactionColor}
                getTransactionLabel={getTransactionLabel}
              />
            </TabsContent>
          </Tabs>
        </TabsContent>
      </Tabs>
    </div>
  );
}

interface TransactionListProps {
  transactions: Transaction[];
  formatCurrency: (amount: number, currency: string) => string;
  currency: string;
  getTransactionIcon: (type: string) => JSX.Element;
  getTransactionColor: (type: string) => string;
  getTransactionLabel: (type: string) => string;
}

function TransactionList({ 
  transactions, 
  formatCurrency, 
  currency,
  getTransactionIcon,
  getTransactionColor,
  getTransactionLabel,
}: TransactionListProps) {
  if (transactions.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <History className="h-12 w-12 mx-auto mb-4 opacity-50" />
        <p>Tranzaksiyalar yo'q</p>
      </div>
    );
  }

  return (
    <ScrollArea className="h-[400px]">
      <div className="space-y-2">
        {transactions.map((tx) => (
          <div
            key={tx.id}
            className="flex items-center gap-3 p-3 rounded-xl bg-card border border-border hover:bg-accent/50 transition-colors cursor-pointer"
          >
            <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center">
              {getTransactionIcon(tx.type)}
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-medium text-sm">{getTransactionLabel(tx.type)}</p>
              <p className="text-xs text-muted-foreground truncate">
                {tx.description || format(new Date(tx.created_at), 'dd MMM, yyyy • HH:mm')}
              </p>
            </div>
            <div className="text-right">
              <p className={cn("font-semibold text-sm", getTransactionColor(tx.type))}>
                {tx.type.includes('in') || tx.type === 'deposit' || tx.type === 'refund' ? '+' : '-'}
                {formatCurrency(Math.abs(tx.amount), currency)}
              </p>
              <p className={cn(
                "text-xs capitalize",
                tx.status === 'completed' ? 'text-green-500' :
                tx.status === 'pending' ? 'text-yellow-500' :
                tx.status === 'failed' ? 'text-red-500' : 'text-muted-foreground'
              )}>
                {tx.status === 'completed' ? 'Bajarildi' :
                 tx.status === 'pending' ? 'Kutilmoqda' :
                 tx.status === 'failed' ? 'Xatolik' : tx.status}
              </p>
            </div>
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          </div>
        ))}
      </div>
    </ScrollArea>
  );
}

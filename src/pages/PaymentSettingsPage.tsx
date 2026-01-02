import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { 
  Wallet, 
  ArrowUpRight, 
  ArrowDownLeft, 
  Plus,
  CreditCard,
  History,
  ChevronRight,
  Loader2,
  RefreshCw
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';

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

  const fetchWalletData = async () => {
    if (!user) return;

    try {
      // Fetch or create wallet
      let { data: walletData, error } = await supabase
        .from('wallets')
        .select('*')
        .eq('user_id', user.id)
        .single();

      if (error && error.code === 'PGRST116') {
        // No wallet exists, create one
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

        // Fetch transactions
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

  const formatCurrency = (amount: number, currency: string) => {
    return new Intl.NumberFormat('en-US', {
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
      case 'deposit': return 'Deposit';
      case 'withdrawal': return 'Withdrawal';
      case 'transfer_in': return 'Received';
      case 'transfer_out': return 'Sent';
      case 'purchase': return 'Purchase';
      case 'refund': return 'Refund';
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
    <div className="max-w-2xl mx-auto py-6 px-4 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Payment</h1>
        <Button variant="ghost" size="icon" onClick={handleRefresh} disabled={isRefreshing}>
          <RefreshCw className={cn("h-5 w-5", isRefreshing && "animate-spin")} />
        </Button>
      </div>

      {/* Wallet Card */}
      <Card className="bg-gradient-to-br from-primary to-primary/80 text-primary-foreground border-0 overflow-hidden">
        <CardContent className="pt-6">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm opacity-80">Total Balance</p>
              <p className="text-3xl font-bold mt-1">
                {wallet ? formatCurrency(wallet.balance, wallet.currency) : '$0.00'}
              </p>
            </div>
            <div className="h-12 w-12 rounded-full bg-primary-foreground/20 flex items-center justify-center">
              <Wallet className="h-6 w-6" />
            </div>
          </div>

          <div className="flex gap-3 mt-6">
            <Button variant="secondary" className="flex-1 bg-primary-foreground/20 hover:bg-primary-foreground/30 text-primary-foreground border-0">
              <Plus className="h-4 w-4 mr-2" />
              Add Money
            </Button>
            <Button variant="secondary" className="flex-1 bg-primary-foreground/20 hover:bg-primary-foreground/30 text-primary-foreground border-0">
              <ArrowUpRight className="h-4 w-4 mr-2" />
              Send
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Quick Actions */}
      <div className="grid grid-cols-3 gap-3">
        <Button variant="outline" className="flex-col h-auto py-4 gap-2">
          <CreditCard className="h-5 w-5 text-primary" />
          <span className="text-xs">Cards</span>
        </Button>
        <Button variant="outline" className="flex-col h-auto py-4 gap-2">
          <History className="h-5 w-5 text-primary" />
          <span className="text-xs">History</span>
        </Button>
        <Button variant="outline" className="flex-col h-auto py-4 gap-2">
          <ArrowDownLeft className="h-5 w-5 text-primary" />
          <span className="text-xs">Request</span>
        </Button>
      </div>

      {/* Transactions */}
      <Tabs defaultValue="all" className="w-full">
        <TabsList className="w-full grid grid-cols-3">
          <TabsTrigger value="all">All</TabsTrigger>
          <TabsTrigger value="incoming">Incoming</TabsTrigger>
          <TabsTrigger value="outgoing">Outgoing</TabsTrigger>
        </TabsList>

        <TabsContent value="all" className="mt-4">
          <TransactionList 
            transactions={transactions} 
            formatCurrency={formatCurrency}
            currency={wallet?.currency || 'USD'}
            getTransactionIcon={getTransactionIcon}
            getTransactionColor={getTransactionColor}
            getTransactionLabel={getTransactionLabel}
          />
        </TabsContent>

        <TabsContent value="incoming" className="mt-4">
          <TransactionList 
            transactions={transactions.filter(t => ['deposit', 'transfer_in', 'refund'].includes(t.type))} 
            formatCurrency={formatCurrency}
            currency={wallet?.currency || 'USD'}
            getTransactionIcon={getTransactionIcon}
            getTransactionColor={getTransactionColor}
            getTransactionLabel={getTransactionLabel}
          />
        </TabsContent>

        <TabsContent value="outgoing" className="mt-4">
          <TransactionList 
            transactions={transactions.filter(t => ['withdrawal', 'transfer_out', 'purchase'].includes(t.type))} 
            formatCurrency={formatCurrency}
            currency={wallet?.currency || 'USD'}
            getTransactionIcon={getTransactionIcon}
            getTransactionColor={getTransactionColor}
            getTransactionLabel={getTransactionLabel}
          />
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
        <p>No transactions yet</p>
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
                {tx.description || format(new Date(tx.created_at), 'MMM dd, yyyy • HH:mm')}
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
                {tx.status}
              </p>
            </div>
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          </div>
        ))}
      </div>
    </ScrollArea>
  );
}

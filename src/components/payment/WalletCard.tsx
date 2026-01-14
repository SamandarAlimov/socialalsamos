import { Wallet, Plus, ArrowUpRight, Eye, EyeOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useState } from 'react';
import { cn } from '@/lib/utils';

interface WalletCardProps {
  balance: number;
  currency: string;
  onAddMoney?: () => void;
  onSend?: () => void;
}

export function WalletCard({ balance, currency, onAddMoney, onSend }: WalletCardProps) {
  const [isHidden, setIsHidden] = useState(false);

  const formatCurrency = (amount: number, curr: string) => {
    return new Intl.NumberFormat('uz-UZ', {
      style: 'currency',
      currency: curr,
    }).format(amount);
  };

  return (
    <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-primary via-primary to-primary/80 text-primary-foreground p-6">
      {/* Background pattern */}
      <div className="absolute inset-0 opacity-10">
        <div className="absolute top-0 right-0 w-40 h-40 bg-white rounded-full -translate-y-1/2 translate-x-1/2" />
        <div className="absolute bottom-0 left-0 w-32 h-32 bg-white rounded-full translate-y-1/2 -translate-x-1/2" />
      </div>

      <div className="relative">
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2">
              <p className="text-sm opacity-80">Umumiy balans</p>
              <button 
                onClick={() => setIsHidden(!isHidden)}
                className="opacity-80 hover:opacity-100 transition-opacity"
              >
                {isHidden ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            <p className={cn(
              "text-3xl font-bold mt-1 transition-all duration-300",
              isHidden && "blur-md select-none"
            )}>
              {formatCurrency(balance, currency)}
            </p>
          </div>
          <div className="h-12 w-12 rounded-2xl bg-white/20 backdrop-blur-sm flex items-center justify-center">
            <Wallet className="h-6 w-6" />
          </div>
        </div>

        <div className="flex gap-3 mt-6">
          <Button 
            onClick={onAddMoney}
            className="flex-1 bg-white/20 hover:bg-white/30 text-primary-foreground border-0 backdrop-blur-sm rounded-xl"
          >
            <Plus className="h-4 w-4 mr-2" />
            Pul qo'shish
          </Button>
          <Button 
            onClick={onSend}
            className="flex-1 bg-white/20 hover:bg-white/30 text-primary-foreground border-0 backdrop-blur-sm rounded-xl"
          >
            <ArrowUpRight className="h-4 w-4 mr-2" />
            O'tkazish
          </Button>
        </div>
      </div>
    </div>
  );
}

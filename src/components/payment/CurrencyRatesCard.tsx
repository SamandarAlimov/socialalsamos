import { ArrowUpRight, ArrowDownRight, TrendingUp } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';

const currencies = [
  { code: 'USD', name: 'Dollar', rate: 12750, change: 0.15, flag: '🇺🇸' },
  { code: 'EUR', name: 'Euro', rate: 13850, change: -0.08, flag: '🇪🇺' },
  { code: 'RUB', name: 'Rubl', rate: 127, change: 0.32, flag: '🇷🇺' },
];

export function CurrencyRatesCard() {
  return (
    <Card className="border-border/50 overflow-hidden">
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-primary" />
            <span className="text-sm font-medium">Valyuta kurslari</span>
          </div>
          <span className="text-xs text-muted-foreground">MB kursi</span>
        </div>
        
        <div className="space-y-2">
          {currencies.map((currency) => (
            <div 
              key={currency.code}
              className="flex items-center justify-between p-2 rounded-xl bg-muted/50"
            >
              <div className="flex items-center gap-2">
                <span className="text-lg">{currency.flag}</span>
                <div>
                  <p className="text-sm font-medium">{currency.code}</p>
                  <p className="text-xs text-muted-foreground">{currency.name}</p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-sm font-semibold">
                  {currency.rate.toLocaleString()} so'm
                </p>
                <div className={`flex items-center justify-end text-xs ${
                  currency.change >= 0 ? 'text-green-500' : 'text-red-500'
                }`}>
                  {currency.change >= 0 ? (
                    <ArrowUpRight className="h-3 w-3" />
                  ) : (
                    <ArrowDownRight className="h-3 w-3" />
                  )}
                  <span>{Math.abs(currency.change)}%</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

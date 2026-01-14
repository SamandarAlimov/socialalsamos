import { 
  TrendingUp, 
  PiggyBank, 
  BarChart3, 
  Hash,
  Sparkles,
  Home,
  Receipt,
  Wallet,
  Building,
  Clock,
  FileText,
  Car,
  User,
  ArrowLeftRight,
  CreditCard,
  LineChart
} from 'lucide-react';
import { PaymentServiceCard } from './PaymentServiceCard';
import { PaymentSectionHeader } from './PaymentSectionHeader';

interface PaymentFinanceSectionProps {
  onItemClick?: (key: string) => void;
}

export function PaymentFinanceSection({ onItemClick }: PaymentFinanceSectionProps) {
  const financeItems = [
    { icon: TrendingUp, label: "Kreditlar", key: "credits" },
    { icon: PiggyBank, label: "Omonatlar", key: "deposits" },
    { icon: BarChart3, label: "Monitoring", key: "monitoring" },
    { icon: Hash, label: "Hisob raqamlar", key: "accounts" },
    { icon: Sparkles, label: "Oltin hisob", key: "golden_account", badge: "VIP" },
    { icon: LineChart, label: "Investitsiyalar", key: "investments" },
  ];

  const personalItems = [
    { icon: Home, label: "Mening uyim", key: "my_home" },
    { icon: Receipt, label: "Mening kreditlarim", key: "my_credits" },
    { icon: Wallet, label: "Mening omonatlarim", key: "my_deposits" },
    { icon: Building, label: "Davlat xizmatlari", key: "gov_services" },
    { icon: Clock, label: "Muddatli to'lov", key: "scheduled_payments" },
    { icon: FileText, label: "Hujjatlarim", key: "my_documents" },
    { icon: Car, label: "Mashinam", key: "my_car" },
    { icon: User, label: "Ma'lumotlarim", key: "my_info" },
  ];

  const toolsItems = [
    { icon: ArrowLeftRight, label: "Valyuta kursi", key: "currency_rates" },
    { icon: CreditCard, label: "Karta ulash", key: "link_cards" },
  ];

  return (
    <div className="space-y-6">
      <div>
        <PaymentSectionHeader title="Moliyaviy xizmatlar" />
        <div className="grid grid-cols-3 gap-2">
          {financeItems.map((item) => (
            <PaymentServiceCard
              key={item.key}
              icon={item.icon}
              label={item.label}
              badge={item.badge}
              onClick={() => onItemClick?.(item.key)}
            />
          ))}
        </div>
      </div>

      <div>
        <PaymentSectionHeader title="Shaxsiy bo'lim" />
        <div className="grid grid-cols-4 gap-2">
          {personalItems.map((item) => (
            <PaymentServiceCard
              key={item.key}
              icon={item.icon}
              label={item.label}
              onClick={() => onItemClick?.(item.key)}
            />
          ))}
        </div>
      </div>

      <div>
        <PaymentSectionHeader title="Asboblar" />
        <div className="grid grid-cols-2 gap-2">
          {toolsItems.map((item) => (
            <PaymentServiceCard
              key={item.key}
              icon={item.icon}
              label={item.label}
              onClick={() => onItemClick?.(item.key)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

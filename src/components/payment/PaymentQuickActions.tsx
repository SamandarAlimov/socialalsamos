import { 
  QrCode, 
  Gift, 
  Users, 
  CreditCard,
  Percent,
  Link as LinkIcon
} from 'lucide-react';
import { PaymentServiceCard } from './PaymentServiceCard';

interface PaymentQuickActionsProps {
  onQrPayment?: () => void;
  onCashback?: () => void;
  onReferral?: () => void;
  onMyCards?: () => void;
}

export function PaymentQuickActions({
  onQrPayment,
  onCashback,
  onReferral,
  onMyCards
}: PaymentQuickActionsProps) {
  return (
    <div className="grid grid-cols-4 gap-2">
      <PaymentServiceCard 
        icon={QrCode} 
        label="QR to'lov"
        onClick={onQrPayment}
      />
      <PaymentServiceCard 
        icon={Percent} 
        label="Keshbek"
        badge="5%"
        onClick={onCashback}
      />
      <PaymentServiceCard 
        icon={LinkIcon} 
        label="Taklif bonus"
        onClick={onReferral}
      />
      <PaymentServiceCard 
        icon={CreditCard} 
        label="Kartalarim"
        onClick={onMyCards}
      />
    </div>
  );
}

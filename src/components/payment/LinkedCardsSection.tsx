import { CreditCard, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { PaymentSectionHeader } from './PaymentSectionHeader';

interface Card {
  id: string;
  last4: string;
  brand: 'visa' | 'mastercard' | 'uzcard' | 'humo';
  expiryMonth: number;
  expiryYear: number;
}

interface LinkedCardsSectionProps {
  cards?: Card[];
  onAddCard?: () => void;
  onCardClick?: (cardId: string) => void;
}

const brandLogos: Record<string, { name: string; bg: string; text: string }> = {
  visa: { name: 'VISA', bg: 'bg-blue-600', text: 'text-white' },
  mastercard: { name: 'MC', bg: 'bg-orange-500', text: 'text-white' },
  uzcard: { name: 'UZCARD', bg: 'bg-green-600', text: 'text-white' },
  humo: { name: 'HUMO', bg: 'bg-blue-500', text: 'text-white' },
};

export function LinkedCardsSection({ cards = [], onAddCard, onCardClick }: LinkedCardsSectionProps) {
  return (
    <div>
      <PaymentSectionHeader title="Ulangan kartalar" />
      
      <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-hide">
        {cards.map((card) => (
          <button
            key={card.id}
            onClick={() => onCardClick?.(card.id)}
            className="flex-shrink-0 w-48 h-28 rounded-2xl p-4 bg-gradient-to-br from-card to-muted border border-border hover:border-primary/50 transition-all duration-200 flex flex-col justify-between"
          >
            <div className="flex justify-between items-start">
              <CreditCard className="h-6 w-6 text-muted-foreground" />
              <span className={`text-xs font-bold px-2 py-0.5 rounded ${brandLogos[card.brand].bg} ${brandLogos[card.brand].text}`}>
                {brandLogos[card.brand].name}
              </span>
            </div>
            <div>
              <p className="text-lg font-mono tracking-wider">•••• {card.last4}</p>
              <p className="text-xs text-muted-foreground mt-1">
                {card.expiryMonth.toString().padStart(2, '0')}/{card.expiryYear.toString().slice(-2)}
              </p>
            </div>
          </button>
        ))}
        
        <button
          onClick={onAddCard}
          className="flex-shrink-0 w-48 h-28 rounded-2xl border-2 border-dashed border-border hover:border-primary/50 hover:bg-muted/50 transition-all duration-200 flex flex-col items-center justify-center gap-2"
        >
          <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center">
            <Plus className="h-5 w-5 text-muted-foreground" />
          </div>
          <span className="text-xs text-muted-foreground">Karta qo'shish</span>
        </button>
      </div>
    </div>
  );
}

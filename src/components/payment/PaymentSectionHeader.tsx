import { ChevronRight } from 'lucide-react';

interface PaymentSectionHeaderProps {
  title: string;
  onViewAll?: () => void;
}

export function PaymentSectionHeader({ title, onViewAll }: PaymentSectionHeaderProps) {
  return (
    <div className="flex items-center justify-between mb-3">
      <h2 className="text-lg font-semibold text-foreground">{title}</h2>
      {onViewAll && (
        <button 
          onClick={onViewAll}
          className="flex items-center gap-1 text-sm text-primary hover:text-primary/80 transition-colors"
        >
          Barchasi
          <ChevronRight className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}

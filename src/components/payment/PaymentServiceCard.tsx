import { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

interface PaymentServiceCardProps {
  icon: LucideIcon;
  label: string;
  description?: string;
  onClick?: () => void;
  iconColor?: string;
  badge?: string;
}

export function PaymentServiceCard({ 
  icon: Icon, 
  label, 
  description,
  onClick,
  iconColor = 'text-primary',
  badge
}: PaymentServiceCardProps) {
  return (
    <button
      onClick={onClick}
      className="flex flex-col items-center gap-2 p-4 rounded-2xl bg-card border border-border hover:bg-accent/50 hover:border-primary/30 transition-all duration-200 hover-lift group relative"
    >
      {badge && (
        <span className="absolute -top-1.5 -right-1.5 px-2 py-0.5 text-[10px] font-medium bg-primary text-primary-foreground rounded-full">
          {badge}
        </span>
      )}
      <div className={cn(
        "h-12 w-12 rounded-2xl flex items-center justify-center transition-colors",
        "bg-primary/10 group-hover:bg-primary/20"
      )}>
        <Icon className={cn("h-6 w-6", iconColor)} />
      </div>
      <div className="text-center">
        <p className="text-xs font-medium text-foreground leading-tight">{label}</p>
        {description && (
          <p className="text-[10px] text-muted-foreground mt-0.5">{description}</p>
        )}
      </div>
    </button>
  );
}

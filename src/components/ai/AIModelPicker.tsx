import { Check, ChevronDown, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { MODEL_OPTIONS, type ModelId } from '@/lib/ai/capabilities';
import { cn } from '@/lib/utils';

interface AIModelPickerProps {
  value: ModelId;
  onChange: (model: ModelId) => void;
  activeModel?: string | null;
  disabled?: boolean;
  className?: string;
}

export function AIModelPicker({
  value,
  onChange,
  activeModel,
  disabled,
  className,
}: AIModelPickerProps) {
  const current = MODEL_OPTIONS.find((m) => m.id === value) ?? MODEL_OPTIONS[0];

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild disabled={disabled}>
        <Button
          variant="ghost"
          size="sm"
          className={cn(
            'h-8 gap-1.5 rounded-full border border-border/60 px-3 text-xs font-medium',
            className,
          )}
          aria-label="AI modelini tanlash"
        >
          <Sparkles className="h-3.5 w-3.5 text-alsamos-orange" />
          <span>{current.label}</span>
          <ChevronDown className="h-3.5 w-3.5 opacity-60" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-72">
        <DropdownMenuLabel className="text-xs text-muted-foreground">
          Model tanlovi
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {MODEL_OPTIONS.map((option) => (
          <DropdownMenuItem
            key={option.id}
            onSelect={() => onChange(option.id)}
            className="flex items-start gap-2 py-2"
          >
            <Check
              className={cn(
                'mt-0.5 h-4 w-4 shrink-0',
                option.id === value ? 'opacity-100 text-alsamos-orange' : 'opacity-0',
              )}
            />
            <span className="flex-1">
              <span className="flex items-center gap-2 text-sm font-medium">
                {option.label}
                {option.badge && (
                  <span className="rounded-full bg-alsamos-orange/10 px-1.5 py-0.5 text-[10px] font-semibold text-alsamos-orange">
                    {option.badge}
                  </span>
                )}
              </span>
              <span className="block text-xs text-muted-foreground">{option.hint}</span>
            </span>
          </DropdownMenuItem>
        ))}
        {activeModel && (
          <>
            <DropdownMenuSeparator />
            <div className="px-2 py-1.5 text-[11px] text-muted-foreground">
              Oxirgi javob: <span className="font-mono">{activeModel}</span>
            </div>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export default AIModelPicker;

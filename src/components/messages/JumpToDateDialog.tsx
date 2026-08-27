import { useMemo, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { CalendarDays } from 'lucide-react';

interface JumpToDateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Chatdagi xabarlar sanalari (ISO string) - kalendarda faqat shu kunlar faol bo'ladi */
  availableDates?: string[];
  /** Tanlangan kunga o'tish */
  onSelectDate: (date: Date) => void;
  /** Dastlab tanlangan kun */
  initialDate?: Date;
}

function toKey(date: Date) {
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

/**
 * Telegramdek: chatdagi sana yorlig'i bosilganda ochiladi va ixtiyoriy kunni
 * tanlab o'sha kundagi xabarlarga o'tish imkonini beradi.
 */
export function JumpToDateDialog({
  open,
  onOpenChange,
  availableDates = [],
  onSelectDate,
  initialDate,
}: JumpToDateDialogProps) {
  const [selected, setSelected] = useState<Date | undefined>(initialDate);

  const availableKeys = useMemo(
    () => new Set(availableDates.map((d) => toKey(new Date(d)))),
    [availableDates]
  );

  const firstDate = useMemo(() => {
    if (availableDates.length === 0) return undefined;
    return new Date(
      availableDates.reduce((min, d) => (new Date(d) < new Date(min) ? d : min), availableDates[0])
    );
  }, [availableDates]);

  const handleSelect = (date?: Date) => {
    setSelected(date);
    if (date) {
      onSelectDate(date);
      onOpenChange(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-auto rounded-2xl p-4 sm:max-w-fit">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <CalendarDays className="h-4 w-4" />
            Kunni tanlang
          </DialogTitle>
          <DialogDescription className="text-xs">
            Tanlangan kundagi xabarlarga o'tiladi.
          </DialogDescription>
        </DialogHeader>

        <Calendar
          mode="single"
          selected={selected}
          onSelect={handleSelect}
          defaultMonth={initialDate || selected || new Date()}
          fromDate={firstDate}
          toDate={new Date()}
          disabled={(date) =>
            date > new Date() ||
            (availableKeys.size > 0 && !availableKeys.has(toKey(date)))
          }
          className="rounded-xl"
        />

        <div className="flex justify-between gap-2">
          <Button
            variant="outline"
            size="sm"
            className="rounded-xl"
            onClick={() => handleSelect(new Date())}
          >
            Bugun
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="rounded-xl"
            onClick={() => onOpenChange(false)}
          >
            Bekor qilish
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

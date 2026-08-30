import { useEffect, useMemo, useState } from 'react';
import {
  addDays,
  addHours,
  format,
  isBefore,
  setHours,
  setMinutes,
  startOfDay,
} from 'date-fns';
import { CalendarClock, Check, Clock3, X } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface SchedulePostDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSchedule: (scheduledDate: Date) => void;
  currentDate?: Date | null;
}

const QUICK_OPTIONS = [
  { label: '1 soatdan keyin', getValue: () => addHours(new Date(), 1) },
  { label: '3 soatdan keyin', getValue: () => addHours(new Date(), 3) },
  { label: '6 soatdan keyin', getValue: () => addHours(new Date(), 6) },
  {
    label: 'Ertaga 09:00',
    getValue: () => setMinutes(setHours(addDays(new Date(), 1), 9), 0),
  },
  {
    label: 'Ertaga 12:00',
    getValue: () => setMinutes(setHours(addDays(new Date(), 1), 12), 0),
  },
  {
    label: 'Ertaga 18:00',
    getValue: () => setMinutes(setHours(addDays(new Date(), 1), 18), 0),
  },
];

const HOURS = Array.from({ length: 24 }, (_, index) => ({
  value: String(index),
  label: String(index).padStart(2, '0'),
}));

const MINUTES = Array.from({ length: 60 }, (_, index) => ({
  value: String(index),
  label: String(index).padStart(2, '0'),
}));

function dateParts(date: Date) {
  return {
    day: startOfDay(date),
    hour: String(date.getHours()),
    minute: String(date.getMinutes()),
  };
}

export function SchedulePostDialog({
  open,
  onOpenChange,
  onSchedule,
  currentDate,
}: SchedulePostDialogProps) {
  const defaultDate = useMemo(
    () => currentDate ?? setMinutes(setHours(addDays(new Date(), 1), 12), 0),
    [currentDate],
  );
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(
    () => dateParts(defaultDate).day,
  );
  const [selectedHour, setSelectedHour] = useState(
    () => dateParts(defaultDate).hour,
  );
  const [selectedMinute, setSelectedMinute] = useState(
    () => dateParts(defaultDate).minute,
  );
  const [showCalendar, setShowCalendar] = useState(false);

  useEffect(() => {
    if (!open) return;
    const next = currentDate ?? setMinutes(setHours(addDays(new Date(), 1), 12), 0);
    const parts = dateParts(next);
    setSelectedDate(parts.day);
    setSelectedHour(parts.hour);
    setSelectedMinute(parts.minute);
    setShowCalendar(false);
  }, [currentDate, open]);

  const scheduledDateTime = useMemo(() => {
    if (!selectedDate) return null;
    return setMinutes(
      setHours(selectedDate, Number(selectedHour)),
      Number(selectedMinute),
    );
  }, [selectedDate, selectedHour, selectedMinute]);

  const handleQuickOption = (option: (typeof QUICK_OPTIONS)[number]) => {
    const value = option.getValue();
    const parts = dateParts(value);
    setSelectedDate(parts.day);
    setSelectedHour(parts.hour);
    setSelectedMinute(parts.minute);
    setShowCalendar(false);
  };

  const handleSchedule = () => {
    if (!scheduledDateTime) {
      toast.error('Sana va vaqtni tanlang');
      return;
    }

    if (isBefore(scheduledDateTime, new Date())) {
      toast.error('Joylash vaqti kelajakda bo‘lishi kerak');
      return;
    }

    onSchedule(scheduledDateTime);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[92dvh] max-w-md flex-col overflow-hidden p-0">
        <DialogHeader className="shrink-0 border-b border-border/60 px-5 pb-4 pt-5">
          <DialogTitle className="flex items-center gap-2">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <CalendarClock className="h-4 w-4" />
            </span>
            Postni rejalashtirish
          </DialogTitle>
          <DialogDescription>
            Post qachon avtomatik e’lon qilinishini belgilang.
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto overscroll-contain px-5 py-4">
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">Tez tanlash</Label>
            <div className="grid grid-cols-2 gap-2">
              {QUICK_OPTIONS.map((option) => (
                <Button
                  key={option.label}
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-9 justify-start rounded-xl text-xs"
                  onClick={() => handleQuickOption(option)}
                >
                  <Clock3 className="mr-1.5 h-3.5 w-3.5 text-muted-foreground" />
                  {option.label}
                </Button>
              ))}
            </div>
          </div>

          <div className="space-y-3">
            <Label className="text-xs text-muted-foreground">Aniq sana va vaqt</Label>

            <Button
              type="button"
              variant="outline"
              className="h-11 w-full justify-start rounded-xl"
              onClick={() => setShowCalendar((current) => !current)}
            >
              <CalendarClock className="mr-2 h-4 w-4 text-primary" />
              {selectedDate
                ? format(selectedDate, 'dd.MM.yyyy')
                : 'Sanani tanlang'}
            </Button>

            {showCalendar && (
              <div className="rounded-2xl border border-border/60 p-2">
                <Calendar
                  mode="single"
                  selected={selectedDate}
                  onSelect={(date) => {
                    setSelectedDate(date);
                    if (date) setShowCalendar(false);
                  }}
                  disabled={(date) => isBefore(date, startOfDay(new Date()))}
                  className="pointer-events-auto"
                />
              </div>
            )}

            <div className="flex items-center gap-2">
              <Clock3 className="h-4 w-4 shrink-0 text-muted-foreground" />
              <Select value={selectedHour} onValueChange={setSelectedHour}>
                <SelectTrigger className="w-24 rounded-xl">
                  <SelectValue placeholder="Soat" />
                </SelectTrigger>
                <SelectContent>
                  {HOURS.map((hour) => (
                    <SelectItem key={hour.value} value={hour.value}>
                      {hour.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <span className="font-semibold text-muted-foreground">:</span>
              <Select value={selectedMinute} onValueChange={setSelectedMinute}>
                <SelectTrigger className="w-24 rounded-xl">
                  <SelectValue placeholder="Daqiqa" />
                </SelectTrigger>
                <SelectContent>
                  {MINUTES.map((minute) => (
                    <SelectItem key={minute.value} value={minute.value}>
                      {minute.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {scheduledDateTime && (
            <div className="rounded-2xl border border-primary/20 bg-primary/[0.06] p-4">
              <p className="text-xs text-muted-foreground">E’lon qilinadi</p>
              <p className="mt-1 text-sm font-semibold text-primary">
                {format(scheduledDateTime, 'dd.MM.yyyy · HH:mm')}
              </p>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                Shu vaqtgacha post scheduled holatda qoladi va global lentaga chiqmaydi.
              </p>
            </div>
          )}
        </div>

        <div className="flex shrink-0 gap-2 border-t border-border/60 px-5 py-4">
          <Button
            type="button"
            variant="outline"
            className="flex-1 rounded-xl"
            onClick={() => onOpenChange(false)}
          >
            <X className="mr-2 h-4 w-4" />
            Bekor qilish
          </Button>
          <Button
            type="button"
            className="flex-1 rounded-xl"
            onClick={handleSchedule}
          >
            <Check className="mr-2 h-4 w-4" />
            Saqlash
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

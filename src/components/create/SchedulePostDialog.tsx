import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Calendar } from '@/components/ui/calendar';
import { CalendarClock, Clock, Check, X } from 'lucide-react';
import { format, addDays, addHours, setHours, setMinutes, isBefore, startOfDay } from 'date-fns';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

interface SchedulePostDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSchedule: (scheduledDate: Date) => void;
}

const QUICK_OPTIONS = [
  { label: 'In 1 hour', getValue: () => addHours(new Date(), 1) },
  { label: 'In 3 hours', getValue: () => addHours(new Date(), 3) },
  { label: 'In 6 hours', getValue: () => addHours(new Date(), 6) },
  { label: 'Tomorrow 9 AM', getValue: () => setMinutes(setHours(addDays(new Date(), 1), 9), 0) },
  { label: 'Tomorrow 12 PM', getValue: () => setMinutes(setHours(addDays(new Date(), 1), 12), 0) },
  { label: 'Tomorrow 6 PM', getValue: () => setMinutes(setHours(addDays(new Date(), 1), 18), 0) },
];

const HOURS = Array.from({ length: 24 }, (_, i) => ({
  value: i.toString(),
  label: i.toString().padStart(2, '0')
}));

const MINUTES = Array.from({ length: 60 }, (_, i) => ({
  value: i.toString(),
  label: i.toString().padStart(2, '0')
}));

export function SchedulePostDialog({ open, onOpenChange, onSchedule }: SchedulePostDialogProps) {
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(addDays(new Date(), 1));
  const [selectedHour, setSelectedHour] = useState('12');
  const [selectedMinute, setSelectedMinute] = useState('00');
  const [showCalendar, setShowCalendar] = useState(false);

  const getScheduledDateTime = () => {
    if (!selectedDate) return null;
    return setMinutes(setHours(selectedDate, parseInt(selectedHour)), parseInt(selectedMinute));
  };

  const handleQuickOption = (option: typeof QUICK_OPTIONS[0]) => {
    const date = option.getValue();
    setSelectedDate(startOfDay(date));
    setSelectedHour(date.getHours().toString());
    setSelectedMinute(date.getMinutes().toString());
    setShowCalendar(false);
  };

  const handleSchedule = () => {
    const scheduledDate = getScheduledDateTime();
    
    if (!scheduledDate) {
      toast.error('Please select a date and time');
      return;
    }
    
    if (isBefore(scheduledDate, new Date())) {
      toast.error('Scheduled time must be in the future');
      return;
    }
    
    onSchedule(scheduledDate);
    onOpenChange(false);
  };

  const scheduledDateTime = getScheduledDateTime();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CalendarClock className="h-5 w-5" />
            Schedule Post
          </DialogTitle>
          <DialogDescription>
            Choose when you want your post to be published
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {/* Quick Options */}
          <div className="space-y-2">
            <Label className="text-muted-foreground text-xs">Quick Options</Label>
            <div className="grid grid-cols-2 gap-2">
              {QUICK_OPTIONS.map((option) => (
                <Button
                  key={option.label}
                  variant="outline"
                  size="sm"
                  onClick={() => handleQuickOption(option)}
                  className="text-xs"
                >
                  {option.label}
                </Button>
              ))}
            </div>
          </div>

          {/* Custom Date/Time */}
          <div className="space-y-4">
            <Label className="text-muted-foreground text-xs">Or choose custom date & time</Label>
            
            {/* Date Picker */}
            <div>
              <Button
                variant="outline"
                className="w-full justify-start"
                onClick={() => setShowCalendar(!showCalendar)}
              >
                <CalendarClock className="h-4 w-4 mr-2" />
                {selectedDate ? format(selectedDate, 'EEEE, MMMM d, yyyy') : 'Select date'}
              </Button>
              
              {showCalendar && (
                <div className="mt-2 border rounded-lg p-2">
                  <Calendar
                    mode="single"
                    selected={selectedDate}
                    onSelect={(date) => {
                      setSelectedDate(date);
                      setShowCalendar(false);
                    }}
                    disabled={(date) => isBefore(date, startOfDay(new Date()))}
                    className="pointer-events-auto"
                  />
                </div>
              )}
            </div>

            {/* Time Picker */}
            <div className="flex gap-2 items-center">
              <Clock className="h-4 w-4 text-muted-foreground" />
              <Select value={selectedHour} onValueChange={setSelectedHour}>
                <SelectTrigger className="w-24">
                  <SelectValue placeholder="Hour" />
                </SelectTrigger>
                <SelectContent>
                  {HOURS.map((hour) => (
                    <SelectItem key={hour.value} value={hour.value}>
                      {hour.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <span className="text-xl font-semibold">:</span>
              <Select value={selectedMinute} onValueChange={setSelectedMinute}>
                <SelectTrigger className="w-24">
                  <SelectValue placeholder="Min" />
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

          {/* Preview */}
          {scheduledDateTime && (
            <div className="p-4 rounded-xl bg-primary/10 border border-primary/20">
              <p className="text-sm text-muted-foreground mb-1">Your post will be published:</p>
              <p className="font-semibold text-primary">
                {format(scheduledDateTime, "EEEE, MMMM d, yyyy 'at' h:mm a")}
              </p>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)} className="flex-1">
              <X className="h-4 w-4 mr-2" />
              Cancel
            </Button>
            <Button onClick={handleSchedule} className="flex-1">
              <Check className="h-4 w-4 mr-2" />
              Schedule
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

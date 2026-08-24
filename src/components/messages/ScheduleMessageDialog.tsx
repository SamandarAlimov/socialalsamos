import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Calendar } from '@/components/ui/calendar';
import { Clock, CalendarIcon, Send } from 'lucide-react';
import { format, addMinutes, addHours, addDays, setHours, setMinutes, startOfToday, isBefore } from 'date-fns';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { cn } from '@/lib/utils';

interface ScheduleMessageDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSchedule: (scheduledFor: Date) => void;
  messagePreview?: string;
}

const quickOptions = [
  { label: 'In 1 hour', getValue: () => addHours(new Date(), 1) },
  { label: 'In 3 hours', getValue: () => addHours(new Date(), 3) },
  { label: 'Tonight at 9 PM', getValue: () => setHours(setMinutes(startOfToday(), 0), 21) },
  { label: 'Tomorrow at 9 AM', getValue: () => setHours(setMinutes(addDays(startOfToday(), 1), 0), 9) },
  { label: 'Tomorrow at 6 PM', getValue: () => setHours(setMinutes(addDays(startOfToday(), 1), 0), 18) },
];

export function ScheduleMessageDialog({
  open,
  onOpenChange,
  onSchedule,
  messagePreview
}: ScheduleMessageDialogProps) {
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(addHours(new Date(), 1));
  const [timeValue, setTimeValue] = useState(format(addHours(new Date(), 1), 'HH:mm'));
  const [showCalendar, setShowCalendar] = useState(false);

  const handleTimeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setTimeValue(e.target.value);
    if (selectedDate) {
      const [hours, minutes] = e.target.value.split(':').map(Number);
      const newDate = new Date(selectedDate);
      newDate.setHours(hours, minutes, 0, 0);
      setSelectedDate(newDate);
    }
  };

  const handleDateSelect = (date: Date | undefined) => {
    if (date) {
      const [hours, minutes] = timeValue.split(':').map(Number);
      date.setHours(hours, minutes, 0, 0);
      setSelectedDate(date);
    }
  };

  const handleQuickOption = (getValue: () => Date) => {
    const date = getValue();
    if (isBefore(date, new Date())) {
      // If the time is past for today, set it for tomorrow
      const adjustedDate = addDays(date, 1);
      setSelectedDate(adjustedDate);
      setTimeValue(format(adjustedDate, 'HH:mm'));
    } else {
      setSelectedDate(date);
      setTimeValue(format(date, 'HH:mm'));
    }
  };

  const handleSchedule = () => {
    if (selectedDate && !isBefore(selectedDate, new Date())) {
      onSchedule(selectedDate);
      onOpenChange(false);
    }
  };

  const isValidTime = selectedDate && !isBefore(selectedDate, new Date());

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5" />
            Schedule Message
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Message Preview */}
          {messagePreview && (
            <div className="p-3 bg-muted rounded-lg">
              <p className="text-sm text-muted-foreground line-clamp-2">{messagePreview}</p>
            </div>
          )}

          {/* Quick Options */}
          <div className="space-y-2">
            <Label className="text-sm font-medium">Quick Select</Label>
            <div className="flex flex-wrap gap-2">
              {quickOptions.map((option) => (
                <Button
                  key={option.label}
                  variant="outline"
                  size="sm"
                  onClick={() => handleQuickOption(option.getValue)}
                  className="text-xs"
                >
                  {option.label}
                </Button>
              ))}
            </div>
          </div>

          {/* Custom Date/Time */}
          <div className="space-y-3">
            <Label className="text-sm font-medium">Or choose date and time</Label>
            
            {/* Date Picker */}
            <Popover open={showCalendar} onOpenChange={setShowCalendar}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn(
                    "w-full justify-start text-left font-normal",
                    !selectedDate && "text-muted-foreground"
                  )}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {selectedDate ? format(selectedDate, 'PPP') : 'Pick a date'}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={selectedDate}
                  onSelect={(date) => {
                    handleDateSelect(date);
                    setShowCalendar(false);
                  }}
                  disabled={(date) => isBefore(date, startOfToday())}
                  initialFocus
                />
              </PopoverContent>
            </Popover>

            {/* Time Picker */}
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-muted-foreground" />
              <Input
                type="time"
                value={timeValue}
                onChange={handleTimeChange}
                className="flex-1"
              />
            </div>

            {/* Selected Time Display */}
            {selectedDate && (
              <p className={cn(
                "text-sm text-center",
                isValidTime ? "text-primary" : "text-destructive"
              )}>
                {isValidTime 
                  ? `Will be sent on ${format(selectedDate, 'PPP')} at ${format(selectedDate, 'p')}`
                  : 'Please select a future time'
                }
              </p>
            )}
          </div>

          {/* Actions */}
          <div className="flex gap-2 pt-2">
            <Button
              variant="outline"
              onClick={() => onOpenChange(false)}
              className="flex-1"
            >
              Cancel
            </Button>
            <Button
              onClick={handleSchedule}
              disabled={!isValidTime}
              className="flex-1"
            >
              <Send className="h-4 w-4 mr-2" />
              Schedule
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

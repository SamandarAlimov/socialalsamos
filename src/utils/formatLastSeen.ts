import { format, isToday, isYesterday, differenceInMinutes, differenceInHours, differenceInDays } from 'date-fns';

export function formatLastSeen(lastSeenDate: string | null | undefined, isOnline?: boolean): string {
  if (isOnline) {
    return 'online';
  }
  
  if (!lastSeenDate) {
    return 'last seen recently';
  }
  
  const date = new Date(lastSeenDate);
  const now = new Date();
  
  const minutesAgo = differenceInMinutes(now, date);
  const hoursAgo = differenceInHours(now, date);
  const daysAgo = differenceInDays(now, date);
  
  // Within last minute
  if (minutesAgo < 1) {
    return 'last seen just now';
  }
  
  // Within last hour
  if (minutesAgo < 60) {
    return `last seen ${minutesAgo}m ago`;
  }
  
  // Within last few hours today
  if (hoursAgo < 4 && isToday(date)) {
    return `last seen ${hoursAgo}h ago`;
  }
  
  // Today - show time only
  if (isToday(date)) {
    return `last seen at ${format(date, 'HH:mm')}`;
  }
  
  // Yesterday
  if (isYesterday(date)) {
    return `last seen yesterday at ${format(date, 'HH:mm')}`;
  }
  
  // Within last week
  if (daysAgo < 7) {
    return `last seen ${daysAgo}d ago at ${format(date, 'HH:mm')}`;
  }
  
  // Older - show time and full date (HH:mm dd/MM/yyyy format)
  return `last seen ${format(date, 'HH:mm dd/MM/yyyy')}`;
}

export function formatMessageTime(dateString: string): string {
  const date = new Date(dateString);
  
  if (isToday(date)) {
    return format(date, 'HH:mm');
  }
  
  if (isYesterday(date)) {
    return `Yesterday ${format(date, 'HH:mm')}`;
  }
  
  return `${format(date, 'HH:mm')} · ${format(date, 'dd.MM.yyyy')}`;
}

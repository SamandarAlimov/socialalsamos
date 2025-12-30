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
  
  // Within last 5 minutes
  if (minutesAgo < 5) {
    return `last seen ${minutesAgo}m ago`;
  }
  
  // Today - show time only (e.g., "last seen at 18:30")
  if (isToday(date)) {
    return `last seen at ${format(date, 'HH:mm')}`;
  }
  
  // Yesterday
  if (isYesterday(date)) {
    return `last seen yesterday at ${format(date, 'HH:mm')}`;
  }
  
  // Older - show time and full date (e.g., "last seen 18:30 15/11/2025")
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

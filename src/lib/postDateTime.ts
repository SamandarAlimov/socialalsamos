const POST_MONTHS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
] as const;

function twoDigits(value: number): string {
  return String(value).padStart(2, '0');
}

/** Canonical post timestamp. Example: `13 Sep 2026, 16:57`. */
export function formatPostDateTime(value: string | Date | null | undefined): string {
  if (!value) return '—';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return `${date.getDate()} ${POST_MONTHS[date.getMonth()]} ${date.getFullYear()}, ${twoDigits(date.getHours())}:${twoDigits(date.getMinutes())}`;
}

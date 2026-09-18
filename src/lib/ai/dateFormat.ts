const UZ_MONTHS = [
  'yan',
  'fev',
  'mar',
  'apr',
  'may',
  'iyun',
  'iyul',
  'avg',
  'sen',
  'okt',
  'noy',
  'dek',
] as const;

function startOfLocalDay(value: Date): number {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate()).getTime();
}

/**
 * Stable Uzbek date labels for AI lists.
 * Avoids browser/OS locale quirks such as "M09 16".
 */
export function formatAIListDate(value: Date, now = new Date()): string {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) return '';

  const today = startOfLocalDay(now);
  const target = startOfLocalDay(value);
  const dayMs = 86_400_000;

  if (target === today) return 'Bugun';
  if (target === today - dayMs) return 'Kecha';

  const label = `${value.getDate()} ${UZ_MONTHS[value.getMonth()]}`;
  return value.getFullYear() === now.getFullYear()
    ? label
    : `${label} ${value.getFullYear()}`;
}

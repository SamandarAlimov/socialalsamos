/**
 * Password policy for Alsamos accounts.
 *
 * The old rule was a bare `min(8)`, which accepted "12345678". The policy
 * below is enforced in the UI and mirrored by the signup/reset schemas.
 */

export const PASSWORD_MIN_LENGTH = 10;
export const PASSWORD_MAX_LENGTH = 128;

/** Small blocklist of patterns that must never be accepted. */
const BLOCKED_PATTERNS = [
  'password',
  'parol',
  'alsamos',
  'qwerty',
  '123456',
  '111111',
  'iloveyou',
  'admin',
];

export type PasswordCheck = {
  score: 0 | 1 | 2 | 3 | 4;
  label: 'juda kuchsiz' | 'kuchsiz' | 'o\u2018rtacha' | 'kuchli' | 'juda kuchli';
  valid: boolean;
  problems: string[];
};

export function checkPassword(password: string, context: string[] = []): PasswordCheck {
  const value = password ?? '';
  const problems: string[] = [];

  if (value.length < PASSWORD_MIN_LENGTH) {
    problems.push(`Kamida ${PASSWORD_MIN_LENGTH} belgi bo\u2018lishi kerak`);
  }
  if (value.length > PASSWORD_MAX_LENGTH) {
    problems.push(`Ko\u2018pi bilan ${PASSWORD_MAX_LENGTH} belgi`);
  }

  const hasLower = /[a-z]/.test(value);
  const hasUpper = /[A-Z]/.test(value);
  const hasDigit = /\d/.test(value);
  const hasSymbol = /[^A-Za-z0-9]/.test(value);

  const classes = [hasLower, hasUpper, hasDigit, hasSymbol].filter(Boolean).length;
  if (classes < 3) {
    problems.push('Kichik harf, katta harf, raqam va belgidan kamida 3 turini ishlating');
  }

  const lowered = value.toLowerCase();
  if (BLOCKED_PATTERNS.some((pattern) => lowered.includes(pattern))) {
    problems.push('Juda oson topiladigan so\u2018z ishlatilgan');
  }

  for (const item of context) {
    const clean = (item ?? '').trim().toLowerCase();
    if (clean.length >= 4 && lowered.includes(clean)) {
      problems.push('Parol email yoki username bilan bir xil bo\u2018lmasligi kerak');
      break;
    }
  }

  if (/^(.)\1+$/.test(value)) {
    problems.push('Bir xil belgilar ketma-ketligi ishlatilmaydi');
  }

  let score = 0;
  if (value.length >= 8) score += 1;
  if (value.length >= 12) score += 1;
  if (classes >= 3) score += 1;
  if (value.length >= 16 && classes >= 3) score += 1;
  if (problems.length > 0) score = Math.min(score, 1);

  const labels: PasswordCheck['label'][] = [
    'juda kuchsiz',
    'kuchsiz',
    'o\u2018rtacha',
    'kuchli',
    'juda kuchli',
  ];

  return {
    score: score as PasswordCheck['score'],
    label: labels[score],
    valid: problems.length === 0,
    problems,
  };
}

export function passwordStrengthColor(score: number): string {
  if (score <= 1) return 'bg-destructive';
  if (score === 2) return 'bg-yellow-500';
  if (score === 3) return 'bg-emerald-500';
  return 'bg-emerald-600';
}

// Pure intent helpers shared by the server-side AI tool runtime.
// Keep this module dependency-free so it can also be regression-tested by Vitest.

const REPOSITORY_WORD = String.raw`(?:repo(?:zitoriy|zitoriya)?|repository|репозиторий|репо)`;
const REPOSITORY_NAME = String.raw`[A-Za-z0-9][A-Za-z0-9._-]{0,99}`;
const CREATE_VERB = String.raw`(?:yarat|yaratib(?:\s+ber)?|yarating|och|ochib(?:\s+ber)?|qur|tuz|create|make|set\s+up|создай|создать)`;

const RESERVED_GENERATED_NAMES = new Set([
  'repo', 'repository', 'repozitoriy', 'repozitoriya', 'nomlangan', 'nomli', 'nomida',
  'named', 'called', 'new', 'yangi', 'create', 'yarat', 'github', 'githubda',
]);

const clean = (value: string | undefined, allowReserved = false): string | null => {
  const candidate = String(value ?? '').trim();
  if (!candidate || candidate.includes('/') || candidate.length > 100) return null;
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/.test(candidate)) return null;
  if (!allowReserved && RESERVED_GENERATED_NAMES.has(candidate.toLowerCase())) return null;
  return candidate;
};

/** True only when the CURRENT user message explicitly asks to create a repository. */
export function isRepositoryCreationRequest(text: string): boolean {
  const value = String(text ?? '').trim();
  if (!value) return false;

  const whyQuestion = /^(?:nega\b|nima\s+uchun\b|nimaga\b|why\b|почему\b)/i.test(value);
  const strongImperative = /(?:iltimos|please|yaratib\s+ber|yarating|создай)/i.test(value);
  if (whyQuestion && !strongImperative) return false;

  const afterRepo = new RegExp(`\\b${REPOSITORY_WORD}\\b[^.!?\\n]{0,100}\\b${CREATE_VERB}\\b`, 'i');
  const beforeRepo = new RegExp(`\\b${CREATE_VERB}\\b[^.!?\\n]{0,100}\\b${REPOSITORY_WORD}\\b`, 'i');
  return afterRepo.test(value) || beforeRepo.test(value);
}

/** Extract a repository name only from high-confidence grammatical forms. */
export function extractExplicitRepositoryName(text: string): string | null {
  const value = String(text ?? '');
  if (!value.trim()) return null;

  const quotedBeforeRepo = new RegExp(
    `[«“"'\\x60](${REPOSITORY_NAME})[»”"'\\x60]\\s*(?:(?:deb\\s+nomlangan|nomli|nomida|named|called)\\s*)?(?:yangi\\s+|new\\s+)?${REPOSITORY_WORD}\\b`,
    'i',
  ).exec(value);
  if (quotedBeforeRepo) return clean(quotedBeforeRepo[1], true);

  const repoBeforeQuoted = new RegExp(
    `\\b${REPOSITORY_WORD}\\b[^.!?\\n]{0,40}[«“"'\\x60](${REPOSITORY_NAME})[»”"'\\x60]`,
    'i',
  ).exec(value);
  if (repoBeforeQuoted) return clean(repoBeforeQuoted[1], true);

  const patterns = [
    new RegExp(`\\b(${REPOSITORY_NAME})\\s+deb\\s+nomlangan\\s+(?:yangi\\s+)?${REPOSITORY_WORD}\\b`, 'i'),
    new RegExp(`\\b(${REPOSITORY_NAME})\\s+(?:nomli|nomida)\\s+(?:yangi\\s+)?${REPOSITORY_WORD}\\b`, 'i'),
    new RegExp(`\\b${REPOSITORY_WORD}\\s+(?:nomi|nomli|nomida|named|called)\\s+(${REPOSITORY_NAME})\\b`, 'i'),
    new RegExp(`\\b(?:create|make|set\\s+up)\\s+(?:a\\s+)?(?:new\\s+)?${REPOSITORY_WORD}\\s+(?:(?:named|called)\\s+)?(${REPOSITORY_NAME})\\b`, 'i'),
    new RegExp(`\\b${REPOSITORY_WORD}\\s+(${REPOSITORY_NAME})\\s+(?:yarat|yaratib|yarating|och|qur|create)\\b`, 'i'),
  ];

  for (const pattern of patterns) {
    const match = pattern.exec(value);
    const candidate = clean(match?.[1]);
    if (candidate) return candidate;
  }
  return null;
}

export function isSuspiciousGeneratedRepositoryName(name: string): boolean {
  return RESERVED_GENERATED_NAMES.has(String(name ?? '').trim().toLowerCase());
}

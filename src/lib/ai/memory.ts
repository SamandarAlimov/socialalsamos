// Long-term AI memory.
//
// Production must keep working even when optional Supabase AI migrations are
// not deployed. Memory therefore uses durable browser storage as the primary
// store and never probes a table that may not exist. This removes repeated
// PostgREST 404s while preserving cross-chat memory on the current device.

const KEY = 'alsamos.ai.memory';
const MAX_ITEMS = 200;

export type MemoryKind = 'fact' | 'preference' | 'project' | 'person' | 'task';

export type MemoryItem = {
  id: string;
  text: string;
  kind: MemoryKind;
  createdAt: string;
  source?: string;
};

const read = (): MemoryItem[] => {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || '[]');
    return Array.isArray(raw) ? (raw as MemoryItem[]) : [];
  } catch {
    return [];
  }
};

const write = (items: MemoryItem[]) => {
  try {
    localStorage.setItem(KEY, JSON.stringify(items.slice(-MAX_ITEMS)));
  } catch {
    // Storage can be unavailable in restricted/private browser contexts.
  }
};

export const listMemories = (): MemoryItem[] => read();

const normalize = (value: string) => value.trim().toLowerCase().replace(/\s+/g, ' ');

export function addMemory(
  text: string,
  kind: MemoryKind = 'fact',
  source?: string,
): MemoryItem | null {
  const clean = text.trim();
  if (clean.length < 3) return null;

  const items = read();
  if (items.some((memory) => normalize(memory.text) === normalize(clean))) return null;

  const item: MemoryItem = {
    id: crypto.randomUUID(),
    text: clean.slice(0, 400),
    kind,
    createdAt: new Date().toISOString(),
    source,
  };
  write([...items, item]);
  return item;
}

export function removeMemory(id: string) {
  write(read().filter((memory) => memory.id !== id));
}

export function clearMemories() {
  write([]);
}

/** Kept async for API compatibility with the AI page. */
export async function syncMemories(): Promise<MemoryItem[]> {
  return read();
}

const EXPLICIT_RE =
  /(eslab qol|esingda tut|yodda tut|remember this|remember that|запомни|不要忘记)/i;

const SELF_FACT_RE = [
  /\bmening ismim\s+([^.,\n]{2,60})/i,
  /\bmen\s+([^.,\n]{0,40}(dasturchi|developer|tadbirkor|talaba|o\u2018qituvchi|designer)[^.,\n]{0,40})/i,
  /\bloyiham(?:iz)?\s+([^.,\n]{2,80})/i,
  /\bkompaniyam(?:iz)?\s+([^.,\n]{2,80})/i,
  /\bmy name is\s+([^.,\n]{2,60})/i,
];

const PREFERENCE_RE = [
  /\b(doim|har doim|always)\b[^.\n]{5,120}/i,
  /\b(menga\s+[^.\n]{0,30}yoqadi|men\s+[^.\n]{0,30}ni afzal ko\u2018raman|prefer)\b[^.\n]{0,120}/i,
  /\b(javoblarni|kodni|matnni)\s+[^.\n]{5,120}(yoz|ber|qil)\w*/i,
];

export function captureMemories(userText: string, conversationTitle?: string): MemoryItem[] {
  const saved: MemoryItem[] = [];
  if (!userText) return saved;

  const add = (text: string, kind: MemoryKind) => {
    const item = addMemory(text, kind, conversationTitle);
    if (item) saved.push(item);
  };

  if (EXPLICIT_RE.test(userText)) {
    const sentence =
      userText
        .split(/[.\n]/)
        .find((part) => EXPLICIT_RE.test(part))
        ?.replace(EXPLICIT_RE, '')
        .replace(/^[\s:,—-]+/, '')
        .trim() || userText.trim();
    if (sentence.length > 2) add(sentence, 'fact');
  }

  for (const expression of SELF_FACT_RE) {
    const match = expression.exec(userText);
    if (match) add(match[0].trim(), 'person');
  }

  for (const expression of PREFERENCE_RE) {
    const match = expression.exec(userText);
    if (match) add(match[0].trim(), 'preference');
  }

  return saved;
}

export function memoryBlock(items: MemoryItem[] = listMemories()): string {
  if (items.length === 0) return '';
  const lines = items.slice(-60).map((memory) => `- (${memory.kind}) ${memory.text}`);
  return [
    'UZOQ MUDDATLI XOTIRA (foydalanuvchi haqida oldingi suhbatlardan bilganlaring):',
    ...lines,
    'Bu ma’lumotlarni tabiiy ishlat; yangi muhim faktni faqat foydalanuvchi aniq aytsa eslab qol.',
  ].join('\n');
}

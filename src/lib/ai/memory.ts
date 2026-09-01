// Uzoq muddatli xotira (Claude/ChatGPT'dagi "Memory" kabi).
//
// MAQSAD: bitta suhbatda aytilgan muhim ma'lumot boshqa suhbatlarda ham eslansin.
// Saqlash: birinchi navbatda brauzerda (localStorage) — deploy talab qilmaydi.
// Imkon bo'lsa `ai_memories` jadvaliga ham yoziladi (RLS: auth.uid() = user_id),
// shunda xotira boshqa qurilmalarda ham ishlaydi.

import { supabase } from '@/integrations/supabase/client';

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
    /* e'tiborsiz */
  }
};

export const listMemories = (): MemoryItem[] => read();

/** Bir xil ma'noli yozuvlarni takrorlamaslik uchun oddiy solishtirish. */
const normalize = (value: string) => value.trim().toLowerCase().replace(/\s+/g, ' ');

export function addMemory(
  text: string,
  kind: MemoryKind = 'fact',
  source?: string,
): MemoryItem | null {
  const clean = text.trim();
  if (clean.length < 3) return null;

  const items = read();
  if (items.some((m) => normalize(m.text) === normalize(clean))) return null;

  const item: MemoryItem = {
    id: crypto.randomUUID(),
    text: clean.slice(0, 400),
    kind,
    createdAt: new Date().toISOString(),
    source,
  };
  write([...items, item]);
  void persistRemote(item);
  return item;
}

export function removeMemory(id: string) {
  write(read().filter((m) => m.id !== id));
  void (async () => {
    try {
      await supabase.from('ai_memories').delete().eq('id', id);
    } catch {
      /* jadval bo'lmasligi mumkin */
    }
  })();
}

export function clearMemories() {
  write([]);
}

async function persistRemote(item: MemoryItem) {
  try {
    const { data } = await supabase.auth.getUser();
    const userId = data.user?.id;
    if (!userId) return;
    await supabase.from('ai_memories').insert({
      id: item.id,
      user_id: userId,
      content: item.text,
      kind: item.kind,
    } as any);
  } catch {
    // Jadval hali migratsiya qilinmagan bo'lishi mumkin — mahalliy xotira yetarli.
  }
}

/** Serverdagi xotirani mahalliy ro'yxat bilan birlashtiradi (kirishda chaqiriladi). */
export async function syncMemories(): Promise<MemoryItem[]> {
  try {
    const { data: auth } = await supabase.auth.getUser();
    const userId = auth.user?.id;
    if (!userId) return read();

    const { data, error } = await supabase
      .from('ai_memories')
      .select('id, content, kind, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: true })
      .limit(MAX_ITEMS);
    if (error || !data) return read();

    const remote: MemoryItem[] = (data as any[]).map((row) => ({
      id: String(row.id),
      text: String(row.content ?? ''),
      kind: (row.kind as MemoryKind) ?? 'fact',
      createdAt: String(row.created_at ?? new Date().toISOString()),
    }));

    const merged = [...remote];
    for (const local of read()) {
      if (!merged.some((m) => normalize(m.text) === normalize(local.text))) merged.push(local);
    }
    write(merged);
    return merged;
  } catch {
    return read();
  }
}

/* ------------------------------------------------------------------ *
 * Avtomatik eslab qolish
 * ------------------------------------------------------------------ */

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

/**
 * Foydalanuvchi xabaridan eslab qolishga arziydigan ma'lumotni ajratadi.
 * Ehtiyotkor: faqat aniq signal bo'lgandagina yozadi (shovqin bo'lmasligi uchun).
 */
export function captureMemories(userText: string, conversationTitle?: string): MemoryItem[] {
  const saved: MemoryItem[] = [];
  if (!userText) return saved;

  const add = (text: string, kind: MemoryKind) => {
    const item = addMemory(text, kind, conversationTitle);
    if (item) saved.push(item);
  };

  // 1) Foydalanuvchi ochiq "eslab qol" desa — butun jumlani saqlaymiz.
  if (EXPLICIT_RE.test(userText)) {
    const sentence =
      userText
        .split(/[.\n]/)
        .find((s) => EXPLICIT_RE.test(s))
        ?.replace(EXPLICIT_RE, '')
        .replace(/^[\s:,—-]+/, '')
        .trim() || userText.trim();
    if (sentence.length > 2) add(sentence, 'fact');
  }

  // 2) O'zi haqidagi barqaror faktlar.
  for (const re of SELF_FACT_RE) {
    const match = re.exec(userText);
    if (match) add(match[0].trim(), 'person');
  }

  // 3) Uslub/afzallik ko'rsatmalari.
  for (const re of PREFERENCE_RE) {
    const match = re.exec(userText);
    if (match) add(match[0].trim(), 'preference');
  }

  return saved;
}

/** Xotirani model uchun matn blokiga aylantiradi. */
export function memoryBlock(items: MemoryItem[] = listMemories()): string {
  if (items.length === 0) return '';
  const lines = items.slice(-60).map((m) => `- (${m.kind}) ${m.text}`);
  return [
    'UZOQ MUDDATLI XOTIRA (foydalanuvchi haqida oldingi suhbatlardan bilganlaring):',
    ...lines,
    'Bu ma\u02bclumotlarni tabiiy ishlat; "xotiram yo\u02bbq" dema. Yangi muhim fakt bilsang, javob oxirida qisqa eslatib qo\u02bby.',
  ].join('\n');
}

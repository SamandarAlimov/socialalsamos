import { supabase } from '@/integrations/supabase/client';

export type StickerKind = 'sticker' | 'gif';

export interface RecentSticker {
  fileUrl: string;
  kind: StickerKind;
  stickerId?: string | null;
  useCount: number;
  lastUsedAt: string;
}

const LOCAL_KEY = 'tg_recent_stickers_v1';
const LOCAL_LIMIT = 32;

/**
 * Telegramdagi "tez-tez ishlatiladigan stikerlar" ro'yxati.
 *
 * Ikki qatlamda ishlaydi:
 * 1) Supabase `sticker_usage` jadvali - qurilmalar orasida sinxron,
 * 2) localStorage - internet yoki sessiya bo'lmasa ham panel darhol to'ladi.
 */
function readLocal(): RecentSticker[] {
  try {
    const raw = localStorage.getItem(LOCAL_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as RecentSticker[]) : [];
  } catch {
    return [];
  }
}

function writeLocal(items: RecentSticker[]) {
  try {
    localStorage.setItem(LOCAL_KEY, JSON.stringify(items.slice(0, LOCAL_LIMIT)));
  } catch {
    // xotira to'lgan bo'lsa jim o'tamiz
  }
}

export function getLocalRecentStickers(kind?: StickerKind): RecentSticker[] {
  const items = readLocal();
  const filtered = kind ? items.filter((item) => item.kind === kind) : items;
  return filtered.sort(
    (a, b) =>
      b.useCount - a.useCount ||
      new Date(b.lastUsedAt).getTime() - new Date(a.lastUsedAt).getTime()
  );
}

/** Stiker/GIF yuborilganda chaqiriladi: mahalliy va serverdagi hisobni oshiradi */
export async function trackStickerUse(
  fileUrl: string,
  kind: StickerKind = 'sticker',
  stickerId?: string | null
): Promise<void> {
  const items = readLocal();
  const existing = items.find((item) => item.fileUrl === fileUrl);
  if (existing) {
    existing.useCount += 1;
    existing.lastUsedAt = new Date().toISOString();
    existing.kind = kind;
  } else {
    items.unshift({
      fileUrl,
      kind,
      stickerId: stickerId ?? null,
      useCount: 1,
      lastUsedAt: new Date().toISOString(),
    });
  }
  writeLocal(items);

  try {
    await supabase.rpc('touch_sticker_usage', {
      p_file_url: fileUrl,
      p_kind: kind,
      p_sticker_id: stickerId ?? null,
    });
  } catch {
    // Migratsiya hali qo'llanmagan bo'lsa panel mahalliy ro'yxat bilan ishlaydi
  }
}

/** Serverdan tez-tez ishlatiladigan stikerlarni olish (mahalliy ro'yxat zaxira) */
export async function fetchRecentStickers(
  kind?: StickerKind,
  limit = 24
): Promise<RecentSticker[]> {
  try {
    let query = supabase
      .from('sticker_usage')
      .select('file_url, kind, sticker_id, use_count, last_used_at')
      .order('use_count', { ascending: false })
      .order('last_used_at', { ascending: false })
      .limit(limit);

    if (kind) query = query.eq('kind', kind);

    const { data, error } = await query;
    if (error || !data) return getLocalRecentStickers(kind).slice(0, limit);

    return data.map((row: Record<string, unknown>) => ({
      fileUrl: String(row.file_url),
      kind: (row.kind as StickerKind) || 'sticker',
      stickerId: (row.sticker_id as string | null) ?? null,
      useCount: Number(row.use_count ?? 1),
      lastUsedAt: String(row.last_used_at ?? new Date().toISOString()),
    }));
  } catch {
    return getLocalRecentStickers(kind).slice(0, limit);
  }
}

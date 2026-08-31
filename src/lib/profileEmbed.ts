import { supabase } from '@/integrations/supabase/client';

/**
 * PostgREST embed (`profile:profiles!posts_user_id_fkey(...)`) faqat shu nomdagi
 * FK constraint bazada mavjud bo'lsa ishlaydi. Nom yo'q bo'lsa so'rov butunlay
 * PGRST200 bilan qaytadi: faqat avatar uchun kerak bo'lgan join butun ro'yxatni
 * o'chirib qo'yadi va sahifa "yuklab bo'lmadi" holatiga tushadi.
 *
 * Bu yerdagi yordamchilar kontentni kosmetik joinga bog'liq bo'lishidan
 * qutqaradi: embed ishlamasa profillar alohida so'rov bilan to'ldiriladi.
 */

export const PROFILE_EMBED_COLUMNS =
  'id, username, display_name, avatar_url, is_verified';

export interface EmbeddedProfile {
  id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
  is_verified: boolean | null;
}

export interface EmbedQueryResult<T> {
  data: T[] | null;
  error: unknown;
}

/** "Bu ikki jadvalni join qila olmayman" xatosi (yo'q qator emas). */
export function isEmbedRelationshipError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;

  const value = error as {
    code?: string;
    message?: string;
    details?: string;
    hint?: string;
  };

  const code = String(value.code ?? '');
  if (code === 'PGRST200' || code === 'PGRST201') return true;

  const text = `${value.message ?? ''} ${value.details ?? ''} ${value.hint ?? ''}`
    .toLowerCase();

  return text.includes('could not embed') || text.includes('relationship');
}

/**
 * Sessiya davomida "embed yo'q" holatini eslab qoladi, shunda har bir so'rovda
 * bekorga bitta qo'shimcha round trip ketmaydi.
 */
export function createProfileEmbedGuard() {
  let unavailable = false;

  return {
    get isUnavailable() {
      return unavailable;
    },
    markUnavailable() {
      unavailable = true;
    },
  };
}

export type ProfileEmbedGuard = ReturnType<typeof createProfileEmbedGuard>;

/** Profillarni alohida so'rov bilan olib, qatorlarga `profile` sifatida qo'shadi. */
export async function attachProfiles<T extends Record<string, unknown>>(
  rows: T[],
  userIdKey = 'user_id',
): Promise<T[]> {
  const ids = Array.from(
    new Set(
      rows
        .map((row) => row[userIdKey])
        .filter((value): value is string => typeof value === 'string' && value.length > 0),
    ),
  );

  if (ids.length === 0) return rows;

  const { data, error } = await supabase
    .from('profiles')
    .select(PROFILE_EMBED_COLUMNS)
    .in('id', ids);

  if (error) {
    // Profil - kosmetik ma'lumot: kontent baribir ko'rsatiladi.
    console.warn('Profile hydration failed; content is still rendered:', error);
    return rows;
  }

  const byId = new Map(
    ((data ?? []) as unknown as EmbeddedProfile[]).map((profile) => [profile.id, profile]),
  );

  return rows.map((row) => {
    const id = row[userIdKey];
    const profile = typeof id === 'string' ? byId.get(id) : undefined;
    return profile ? ({ ...row, profile } as T) : row;
  });
}

/**
 * So'rovni embed bilan bajaradi; embed mavjud bo'lmasa bir marta embedsiz
 * qayta bajarib, profillarni qo'lda to'ldiradi. Boshqa xatolar o'zgarishsiz
 * qaytariladi, shunda chaqiruvchi ularni ko'rsatishi mumkin.
 */
export async function runWithProfileEmbedFallback<T extends Record<string, unknown>>(
  guard: ProfileEmbedGuard,
  build: (select: string) => PromiseLike<EmbedQueryResult<T>>,
  options: { embedSelect: string; plainSelect: string; userIdKey?: string },
): Promise<{ data: T[]; error: unknown }> {
  const userIdKey = options.userIdKey ?? 'user_id';

  if (!guard.isUnavailable) {
    const first = await build(options.embedSelect);

    if (!first.error) {
      return { data: first.data ?? [], error: null };
    }

    if (!isEmbedRelationshipError(first.error)) {
      return { data: [], error: first.error };
    }

    console.warn(
      'Profile embed unavailable, retrying without it (profiles are fetched separately):',
      first.error,
    );
    guard.markUnavailable();
  }

  const retry = await build(options.plainSelect);

  if (retry.error) {
    return { data: [], error: retry.error };
  }

  const rows = await attachProfiles(retry.data ?? [], userIdKey);
  return { data: rows, error: null };
}

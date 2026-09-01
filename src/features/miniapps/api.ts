// Mini Apps API qatlami.
// Barcha filtr/sort/ranking serverda (`mini_apps_feed` RPC) bajariladi — klientda takrorlanmaydi.

import { supabase } from '@/integrations/supabase/client';

import type {
  MiniApp,
  MiniAppCategory,
  MiniAppDraft,
  MiniAppErrorCode,
  MiniAppEventName,
  MiniAppFeedPage,
  MiniAppFeedParams,
  MiniAppPermission,
} from './types';

// Supabase generated tiplari yangi RPC'larni hali bilmaydi.
const rpc = (name: string, args: Record<string, unknown>) =>
  (supabase as unknown as {
    rpc: (fn: string, params: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>;
  }).rpc(name, args);

const DEFAULT_PAGE_SIZE = 24;

export function getApiBase(): string | null {
  const env = (import.meta as unknown as { env?: Record<string, string | undefined> }).env ?? {};
  const url = env.VITE_SUPABASE_URL;
  if (url) return url.replace(/\/+$/, '');
  const projectId = env.VITE_SUPABASE_PROJECT_ID;
  return projectId ? 'https://' + projectId + '.supabase.co' : null;
}

function toStringArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter((item): item is string => typeof item === 'string');
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed.filter((item) => typeof item === 'string') : [];
    } catch {
      return [];
    }
  }
  return [];
}

type FeedRow = Record<string, unknown>;

export function mapFeedRow(row: FeedRow): MiniApp {
  const num = (key: string) => Number(row[key] ?? 0) || 0;
  const str = (key: string) => (typeof row[key] === 'string' ? (row[key] as string) : null);

  return {
    id: String(row.app_id ?? row.id ?? ''),
    handle: str('handle'),
    name: str('name') ?? 'Nomsiz ilova',
    shortDescription: str('short_description'),
    description: str('description'),
    url: str('url'),
    iconUrl: str('icon_url'),
    category: str('category') ?? 'other',
    appType: (str('app_type') ?? 'link') as MiniApp['appType'],
    displayMode: (str('display_mode') ?? 'iframe') as MiniApp['displayMode'],
    priceModel: (str('price_model') ?? 'free') as MiniApp['priceModel'],
    permissions: toStringArray(row.permissions) as MiniAppPermission[],
    screenshots: toStringArray(row.screenshots),
    privacyUrl: str('privacy_url'),
    supportUrl: str('support_url'),
    deepLink: str('deep_link'),
    isPinned: row.is_pinned === true,
    frameBlocked: row.frame_blocked === true,
    ownerId: str('owner_id'),
    publisher: {
      id: str('publisher_id'),
      handle: str('publisher_handle'),
      name: str('publisher_name'),
      type: str('publisher_type') as MiniApp['publisher']['type'],
      verification: (str('publisher_verification') ?? 'unverified') as MiniApp['publisher']['verification'],
    },
    author: {
      username: str('author_username'),
      displayName: str('author_display_name'),
      avatarUrl: str('author_avatar_url'),
    },
    rating: num('rating'),
    ratingCount: num('rating_count'),
    usersCount: num('users_count'),
    opens30d: num('opens_30d'),
    isInstalled: row.is_installed === true,
    createdAt: str('created_at'),
    updatedAt: str('updated_at'),
    score: num('score'),
  };
}

export async function fetchMiniAppFeed(params: MiniAppFeedParams = {}): Promise<MiniAppFeedPage> {
  const limit = params.limit ?? DEFAULT_PAGE_SIZE;
  const offset = params.offset ?? 0;

  const { data, error } = await rpc('mini_apps_feed', {
    p_section: params.section ?? 'all',
    p_category: params.category && params.category !== 'all' ? params.category : null,
    p_app_type: params.appType && params.appType !== 'all' ? params.appType : null,
    p_sort: params.sort ?? 'recommended',
    p_verified_only: params.verifiedOnly ?? false,
    p_price_model: params.priceModel ?? null,
    p_locale: params.locale ?? null,
    p_query: params.query?.trim() ? params.query.trim() : null,
    p_limit: limit,
    p_offset: offset,
  });

  if (error) throw new Error(error.message);

  const rows = Array.isArray(data) ? (data as FeedRow[]) : [];
  const total = rows.length > 0 ? Number(rows[0].total_count ?? rows.length) : 0;
  const apps = rows.map(mapFeedRow);

  return { apps, total, hasMore: offset + apps.length < total };
}

export async function fetchMiniAppCategories(locale = 'uz'): Promise<MiniAppCategory[]> {
  const { data, error } = await (supabase as unknown as {
    from: (table: string) => {
      select: (columns: string) => {
        eq: (column: string, value: unknown) => {
          order: (column: string) => Promise<{ data: unknown; error: { message: string } | null }>;
        };
      };
    };
  })
    .from('mini_app_categories')
    .select('id, sort_order, icon, labels')
    .eq('is_active', true)
    .order('sort_order');

  if (error) throw new Error(error.message);

  const rows = Array.isArray(data) ? (data as FeedRow[]) : [];
  return rows.map((row) => {
    const labels = (row.labels ?? {}) as Record<string, string>;
    const id = String(row.id);
    return {
      id,
      sortOrder: Number(row.sort_order ?? 100),
      icon: typeof row.icon === 'string' ? row.icon : null,
      label: labels[locale] ?? labels.uz ?? labels.en ?? id,
    };
  });
}

export async function trackMiniAppEvent(
  appId: string,
  event: MiniAppEventName,
  options: { durationMs?: number; errorCode?: MiniAppErrorCode; sessionId?: string } = {},
): Promise<void> {
  // Telemetriya UX ni bloklamasligi kerak.
  const { error } = await rpc('mini_app_track_event', {
    p_app_id: appId,
    p_event: event,
    p_platform: 'web',
    p_duration_ms: options.durationMs ?? null,
    p_error_code: options.errorCode ?? null,
    p_session_id: options.sessionId ?? null,
  });
  if (error) console.warn('mini_app_track_event:', error.message);
}

export async function rateMiniApp(appId: string, rating: number, comment?: string): Promise<void> {
  const { error } = await rpc('mini_app_rate', {
    p_app_id: appId,
    p_rating: rating,
    p_comment: comment ?? null,
  });
  if (error) throw new Error(error.message);
}

export async function setMiniAppInstalled(
  appId: string,
  installed: boolean,
  pinned = false,
): Promise<void> {
  const { error } = await rpc('mini_app_set_install', {
    p_app_id: appId,
    p_installed: installed,
    p_pinned: pinned,
  });
  if (error) throw new Error(error.message);
}

export async function reportMiniApp(appId: string, reason: string, details?: string): Promise<void> {
  const { error } = await rpc('mini_app_report', {
    p_app_id: appId,
    p_reason: reason,
    p_details: details ?? null,
  });
  if (error) throw new Error(error.message);
}

type MiniAppsTable = {
  from: (table: string) => {
    insert: (values: Record<string, unknown>) => {
      select: (columns: string) => {
        single: () => Promise<{ data: unknown; error: { message: string } | null }>;
      };
    };
    update: (values: Record<string, unknown>) => {
      eq: (column: string, value: unknown) => Promise<{ error: { message: string } | null }>;
    };
    delete: () => {
      eq: (column: string, value: unknown) => Promise<{ error: { message: string } | null }>;
    };
  };
};

function slugifyHandle(name: string): string {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 24);
  const suffix = Math.random().toString(36).slice(2, 8);
  return (base || 'app') + '_' + suffix;
}

/** Yangi ilova yaratadi. Status serverda majburiy `pending_review` bo'ladi. */
export async function createMiniApp(userId: string, draft: MiniAppDraft): Promise<string> {
  const { data, error } = await (supabase as unknown as MiniAppsTable)
    .from('mini_apps')
    .insert({
      user_id: userId,
      publisher_id: draft.publisherId ?? null,
      handle: draft.handle?.trim() || slugifyHandle(draft.name),
      name: draft.name.trim(),
      short_description: draft.shortDescription ?? null,
      description: draft.description ?? null,
      url: draft.url,
      icon_url: draft.iconUrl ?? null,
      category: draft.category,
      app_type: draft.appType,
      display_mode: draft.displayMode ?? 'iframe',
      price_model: draft.priceModel ?? 'free',
      permissions: draft.permissions ?? [],
      screenshots: draft.screenshots ?? [],
      privacy_url: draft.privacyUrl ?? null,
      support_url: draft.supportUrl ?? null,
    })
    .select('id')
    .single();

  if (error) throw new Error(error.message);
  return String((data as { id: string }).id);
}

export async function updateMiniApp(appId: string, draft: Partial<MiniAppDraft>): Promise<void> {
  const patch: Record<string, unknown> = {};
  if (draft.name !== undefined) patch.name = draft.name.trim();
  if (draft.handle !== undefined) patch.handle = draft.handle?.trim() || null;
  if (draft.url !== undefined) patch.url = draft.url;
  if (draft.shortDescription !== undefined) patch.short_description = draft.shortDescription;
  if (draft.description !== undefined) patch.description = draft.description;
  if (draft.category !== undefined) patch.category = draft.category;
  if (draft.appType !== undefined) patch.app_type = draft.appType;
  if (draft.displayMode !== undefined) patch.display_mode = draft.displayMode;
  if (draft.priceModel !== undefined) patch.price_model = draft.priceModel;
  if (draft.iconUrl !== undefined) patch.icon_url = draft.iconUrl;
  if (draft.permissions !== undefined) patch.permissions = draft.permissions;
  if (draft.screenshots !== undefined) patch.screenshots = draft.screenshots;
  if (draft.publisherId !== undefined) patch.publisher_id = draft.publisherId;
  if (draft.privacyUrl !== undefined) patch.privacy_url = draft.privacyUrl;
  if (draft.supportUrl !== undefined) patch.support_url = draft.supportUrl;

  const { error } = await (supabase as unknown as MiniAppsTable)
    .from('mini_apps')
    .update(patch)
    .eq('id', appId);

  if (error) throw new Error(error.message);
}

export async function deleteMiniApp(appId: string): Promise<void> {
  const { error } = await (supabase as unknown as MiniAppsTable)
    .from('mini_apps')
    .delete()
    .eq('id', appId);

  if (error) throw new Error(error.message);
}

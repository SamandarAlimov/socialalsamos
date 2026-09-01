// Ilova qo'shish/tahrirlash sahifasi uchun bitta ilovani o'qish va @nom tekshiruvi.
// Feed RPC faqat tasdiqlangan ilovalarni qaytaradi, shuning uchun egasi uchun
// to'g'ridan-to'g'ri jadvaldan o'qiymiz (RLS egasiga ruxsat beradi).

import { supabase } from '@/integrations/supabase/client';

import type {
  HandleAvailability,
  MiniAppDisplayMode,
  MiniAppPermission,
  MiniAppPriceModel,
  MiniAppType,
} from '../types';

type SingleRowClient = {
  from: (table: string) => {
    select: (columns: string) => {
      eq: (
        column: string,
        value: string,
      ) => {
        maybeSingle: () => Promise<{ data: unknown; error: { message: string } | null }>;
      };
    };
  };
  rpc: (
    fn: string,
    params: Record<string, unknown>,
  ) => Promise<{ data: unknown; error: { message: string } | null }>;
};

const client = supabase as unknown as SingleRowClient;

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

export type ManageableMiniApp = {
  id: string;
  handle: string | null;
  name: string;
  url: string;
  shortDescription: string | null;
  description: string | null;
  category: string;
  appType: MiniAppType;
  displayMode: MiniAppDisplayMode;
  priceModel: MiniAppPriceModel;
  permissions: MiniAppPermission[];
  screenshots: string[];
  iconUrl: string | null;
  privacyUrl: string | null;
  supportUrl: string | null;
  publisherId: string | null;
  status: string | null;
  ownerId: string | null;
};

export async function fetchMiniAppForEdit(appId: string): Promise<ManageableMiniApp | null> {
  const { data, error } = await client
    .from('mini_apps')
    .select(
      'id, handle, name, url, short_description, description, category, app_type, display_mode, price_model, permissions, screenshots, icon_url, privacy_url, support_url, publisher_id, status, user_id',
    )
    .eq('id', appId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) return null;

  const row = data as Record<string, unknown>;
  return {
    id: String(row.id ?? ''),
    handle: (row.handle as string | null) ?? null,
    name: String(row.name ?? ''),
    url: String(row.url ?? ''),
    shortDescription: (row.short_description as string | null) ?? null,
    description: (row.description as string | null) ?? null,
    category: String(row.category ?? 'other'),
    appType: (String(row.app_type ?? 'link') as MiniAppType) ?? 'link',
    displayMode: (String(row.display_mode ?? 'iframe') as MiniAppDisplayMode) ?? 'iframe',
    priceModel: (String(row.price_model ?? 'free') as MiniAppPriceModel) ?? 'free',
    permissions: toStringArray(row.permissions) as MiniAppPermission[],
    screenshots: toStringArray(row.screenshots),
    iconUrl: (row.icon_url as string | null) ?? null,
    privacyUrl: (row.privacy_url as string | null) ?? null,
    supportUrl: (row.support_url as string | null) ?? null,
    publisherId: (row.publisher_id as string | null) ?? null,
    status: (row.status as string | null) ?? null,
    ownerId: (row.user_id as string | null) ?? null,
  };
}

/** @nom bandligini serverda tekshiradi (ilova va publisher nomlari bitta bo'shliqda). */
export async function checkHandleAvailability(handle: string): Promise<HandleAvailability> {
  const { data, error } = await client.rpc('mini_app_handle_available', { p_handle: handle });
  if (error) throw new Error(error.message);

  const row = (data ?? {}) as Record<string, unknown>;
  return {
    available: row.available === true,
    handle: String(row.handle ?? ''),
    reason: (row.reason as HandleAvailability['reason']) ?? null,
  };
}

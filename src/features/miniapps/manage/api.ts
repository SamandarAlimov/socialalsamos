// Ilova qo'shish/tahrirlash sahifasi uchun bitta ilovani o'qish.
// Feed RPC faqat tasdiqlangan ilovalarni qaytaradi, shuning uchun egasi uchun
// to'g'ridan-to'g'ri jadvaldan o'qiymiz (RLS egasiga ruxsat beradi).

import { supabase } from '@/integrations/supabase/client';

import type { MiniAppType } from '../types';

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
};

const client = supabase as unknown as SingleRowClient;

export type ManageableMiniApp = {
  id: string;
  handle: string | null;
  name: string;
  url: string;
  shortDescription: string | null;
  description: string | null;
  category: string;
  appType: MiniAppType;
  iconUrl: string | null;
  status: string | null;
  ownerId: string | null;
};

export async function fetchMiniAppForEdit(appId: string): Promise<ManageableMiniApp | null> {
  const { data, error } = await client
    .from('mini_apps')
    .select(
      'id, handle, name, url, short_description, description, category, app_type, icon_url, status, user_id',
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
    iconUrl: (row.icon_url as string | null) ?? null,
    status: (row.status as string | null) ?? null,
    ownerId: (row.user_id as string | null) ?? null,
  };
}

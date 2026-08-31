// Publisher onboarding va domen tasdiqlash uchun klient.

import { supabase } from '@/integrations/supabase/client';

import { getApiBase } from '../api';

type RpcClient = {
  rpc: (
    name: string,
    params: Record<string, unknown>,
  ) => Promise<{ data: unknown; error: { message: string } | null }>;
};

export type PublisherType = 'individual' | 'company' | 'government' | 'non_profit';

export type PublisherDomain = {
  id: string;
  domain: string;
  verification_token: string | null;
  verified_at: string | null;
  last_checked_at: string | null;
  check_error: string | null;
};

export type Publisher = {
  id: string;
  handle: string;
  name: string;
  type: PublisherType;
  verification: string;
  logo_url: string | null;
};

const client = supabase as unknown as RpcClient;

/** Handle qoidasi: 3-32 belgi, kichik harf, raqam va pastki chiziq. */
export function isValidHandle(handle: string): boolean {
  return /^[a-z0-9_]{3,32}$/.test(handle);
}

/** Domen qoidasi: faqat host, protokolsiz va yo'lsiz. */
export function normalizeDomain(input: string): string | null {
  const trimmed = input.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
  if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(trimmed)) return null;
  return trimmed.replace(/^www\./, '');
}

export async function createPublisher(
  handle: string,
  name: string,
  type: PublisherType,
): Promise<string> {
  const { data, error } = await client.rpc('mini_app_publisher_create', {
    p_handle: handle,
    p_name: name,
    p_type: type,
  });
  if (error) throw new Error(error.message);
  return String(data);
}

export async function addPublisherDomain(
  publisherId: string,
  domain: string,
): Promise<{ domainId: string; token: string }> {
  const { data, error } = await client.rpc('mini_app_publisher_add_domain', {
    p_publisher_id: publisherId,
    p_domain: domain,
  });
  if (error) throw new Error(error.message);
  const row = (Array.isArray(data) ? data[0] : data) as {
    domain_id?: string;
    verification_token?: string;
  };
  return {
    domainId: String(row?.domain_id ?? ''),
    token: String(row?.verification_token ?? ''),
  };
}

export async function verifyPublisherDomain(
  domainId: string,
): Promise<{ verified: boolean; hint?: string | null }> {
  const apiBase = getApiBase();
  if (!apiBase) throw new Error('API_BASE_MISSING');

  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData.session?.access_token;
  if (!token) throw new Error('AUTH_REQUIRED');

  const response = await fetch(apiBase + '/functions/v1/mini-app-verify-domain', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer ' + token,
    },
    body: JSON.stringify({ domainId }),
  });

  const result = (await response.json()) as {
    verified?: boolean;
    hint?: string | null;
    error?: string;
  };
  if (!response.ok && !result?.verified) {
    throw new Error(result?.error ?? 'VERIFY_FAILED');
  }
  return { verified: Boolean(result.verified), hint: result.hint ?? null };
}

export async function listMyPublishers(): Promise<Publisher[]> {
  const { data: userData } = await supabase.auth.getUser();
  const userId = userData.user?.id;
  if (!userId) return [];

  const query = supabase as unknown as {
    from: (table: string) => {
      select: (columns: string) => {
        eq: (column: string, value: string) => Promise<{ data: unknown; error: unknown }>;
      };
    };
  };

  const { data } = await query
    .from('publisher_members')
    .select('publisher:mini_app_publishers(id, handle, name, type, verification, logo_url)')
    .eq('user_id', userId);

  const rows = (data ?? []) as Array<{ publisher: Publisher | null }>;
  return rows.map((row) => row.publisher).filter((item): item is Publisher => Boolean(item));
}

export async function listPublisherDomains(publisherId: string): Promise<PublisherDomain[]> {
  const query = supabase as unknown as {
    from: (table: string) => {
      select: (columns: string) => {
        eq: (column: string, value: string) => Promise<{ data: unknown; error: unknown }>;
      };
    };
  };

  const { data } = await query
    .from('publisher_domains')
    .select('id, domain, verification_token, verified_at, last_checked_at, check_error')
    .eq('publisher_id', publisherId);

  return (data ?? []) as PublisherDomain[];
}

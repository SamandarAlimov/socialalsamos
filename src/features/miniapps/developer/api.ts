// Mini App Developer API klienti.
//
// Alsamos'da mini apps mustaqil bo'lim: har bir ilova o'zining `client_id` +
// `secret` juftini oladi va bevosita `mini-app-api` bilan ishlaydi. Bot — faqat
// ixtiyoriy qo'shimcha kanal.
//
// Hujjat: docs/contracts/mini-apps/developer-api.md

import { supabase } from '@/integrations/supabase/client';

import { getApiBase } from '../api';

type RpcClient = {
  rpc: (
    name: string,
    params: Record<string, unknown>,
  ) => Promise<{ data: unknown; error: { message: string } | null }>;
};

const rpcClient = supabase as unknown as RpcClient;

export type MiniAppEnvironment = 'live' | 'test';

export type MiniAppCredential = {
  credentialId: string;
  clientId: string;
  secretPrefix: string | null;
  label: string | null;
  environment: MiniAppEnvironment;
  scopes: string[];
  webhookUrl: string | null;
  isActive: boolean;
  requestsTotal: number;
  lastUsedAt: string | null;
  createdAt: string | null;
};

export type IssuedCredential = {
  credentialId: string;
  clientId: string;
  secret: string;
  environment: MiniAppEnvironment;
};

export type MiniAppUpdateType =
  | 'app_open'
  | 'app_close'
  | 'web_app_data'
  | 'install'
  | 'uninstall'
  | 'payment'
  | 'notification_reply'
  | 'custom';

/** Mini app serveri murojaat qiladigan API manzili. */
export function miniAppApiEndpoint(): string | null {
  const base = getApiBase();
  return base ? base + '/functions/v1/mini-app-api' : null;
}

/** Nusxalash uchun tayyor namuna. */
export function miniAppApiCurlExample(clientId: string, secret: string): string {
  const endpoint = miniAppApiEndpoint() ?? 'https://<project>.supabase.co/functions/v1/mini-app-api';
  return (
    'curl -X POST "' +
    endpoint +
    '/app.get" \\\n  -H "Authorization: Bearer ' +
    clientId +
    ':' +
    secret +
    '"'
  );
}

function unwrap(data: unknown): unknown {
  return Array.isArray(data) ? data[0] : data;
}

function mapCredential(row: Record<string, unknown>): MiniAppCredential {
  const scopes = Array.isArray(row.scopes) ? row.scopes.map((item) => String(item)) : [];
  return {
    credentialId: String(row.credential_id ?? row.id ?? ''),
    clientId: String(row.client_id ?? ''),
    secretPrefix: (row.secret_prefix as string | null) ?? null,
    label: (row.label as string | null) ?? null,
    environment: row.environment === 'test' ? 'test' : 'live',
    scopes,
    webhookUrl: (row.webhook_url as string | null) ?? null,
    isActive: row.is_active !== false,
    requestsTotal: Number(row.requests_total ?? 0) || 0,
    lastUsedAt: (row.last_used_at as string | null) ?? null,
    createdAt: (row.created_at as string | null) ?? null,
  };
}

export async function listCredentials(appId: string): Promise<MiniAppCredential[]> {
  const { data, error } = await rpcClient.rpc('mini_app_credentials_list', { p_app_id: appId });
  if (error) throw new Error(error.message);
  const rows = (Array.isArray(data) ? data : []) as Array<Record<string, unknown>>;
  return rows.map(mapCredential);
}

/** Kalit yaratadi. `secret` FAQAT bir marta qaytariladi. */
export async function createCredential(
  appId: string,
  label?: string | null,
  environment: MiniAppEnvironment = 'live',
): Promise<IssuedCredential> {
  const { data, error } = await rpcClient.rpc('mini_app_credential_create', {
    p_app_id: appId,
    p_label: label?.trim() || null,
    p_environment: environment,
  });
  if (error) throw new Error(error.message);

  const row = unwrap(data) as Record<string, unknown> | null;
  if (!row?.secret) throw new Error('SECRET_NOT_ISSUED');
  return {
    credentialId: String(row.credential_id ?? ''),
    clientId: String(row.client_id ?? ''),
    secret: String(row.secret),
    environment: row.environment === 'test' ? 'test' : 'live',
  };
}

/** Secretni almashtiradi (eski secret darhol ishlamaydi). */
export async function rotateCredential(credentialId: string): Promise<IssuedCredential> {
  const { data, error } = await rpcClient.rpc('mini_app_credential_rotate', {
    p_credential_id: credentialId,
  });
  if (error) throw new Error(error.message);

  const row = unwrap(data) as Record<string, unknown> | null;
  if (!row?.secret) throw new Error('SECRET_NOT_ISSUED');
  return {
    credentialId: String(row.credential_id ?? credentialId),
    clientId: String(row.client_id ?? ''),
    secret: String(row.secret),
    environment: 'live',
  };
}

export async function revokeCredential(credentialId: string): Promise<void> {
  const { error } = await rpcClient.rpc('mini_app_credential_revoke', {
    p_credential_id: credentialId,
  });
  if (error) throw new Error(error.message);
}

export async function setCredentialWebhook(
  credentialId: string,
  url: string | null,
  secret?: string | null,
): Promise<void> {
  if (url && !/^https:\/\//i.test(url)) throw new Error('HTTPS_REQUIRED');
  const { error } = await rpcClient.rpc('mini_app_credential_set_webhook', {
    p_credential_id: credentialId,
    p_url: url,
    p_secret: secret ?? null,
  });
  if (error) throw new Error(error.message);
}

/**
 * Superapp -> mini app serveri: update yuborish (ilova ochilganda va h.k.).
 * Webhook sozlangan bo'lsa server darhol yetkazadi.
 */
export async function pushAppUpdate(
  appId: string,
  type: MiniAppUpdateType,
  payload: Record<string, unknown> = {},
): Promise<{ updateId: number | null }> {
  const endpoint = miniAppApiEndpoint();
  if (!endpoint) throw new Error('API_BASE_MISSING');

  const { data: sessionData } = await supabase.auth.getSession();
  const jwt = sessionData.session?.access_token;
  if (!jwt) throw new Error('AUTH_REQUIRED');

  const response = await fetch(endpoint + '/updates.push', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer ' + jwt,
    },
    body: JSON.stringify({ app_id: appId, type, payload }),
  });

  const result = (await response.json().catch(() => null)) as {
    ok?: boolean;
    result?: { update_id?: number | null };
    description?: string;
  } | null;

  if (!response.ok || !result?.ok) {
    throw new Error(result?.description ?? 'UPDATE_PUSH_FAILED');
  }
  return { updateId: result.result?.update_id ?? null };
}

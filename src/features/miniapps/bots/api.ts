// Alsamos Bot API klienti.
//
// Model (Telegram bilan bir xil): bot yaratiladi -> token beriladi -> bot egasi
// o'z serveridan `bot-api` orqali update oladi va xabar yuboradi. Mini app shu
// botga bog'lanadi (`bots.mini_app_id`).
//
// Hujjat: docs/contracts/mini-apps/bot-api.md

import { supabase } from '@/integrations/supabase/client';

import { getApiBase } from '../api';

type RpcClient = {
  rpc: (
    name: string,
    params: Record<string, unknown>,
  ) => Promise<{ data: unknown; error: { message: string } | null }>;
};

type QueryClient = {
  from: (table: string) => {
    select: (columns: string) => {
      order: (
        column: string,
        options?: { ascending?: boolean },
      ) => Promise<{ data: unknown; error: { message: string } | null }>;
    };
  };
};

const rpcClient = supabase as unknown as RpcClient;
const queryClient = supabase as unknown as QueryClient;

export type AlsamosBot = {
  id: string;
  username: string;
  displayName: string;
  description: string | null;
  tokenPrefix: string | null;
  webhookUrl: string | null;
  miniAppId: string | null;
  isActive: boolean;
  requestsTotal: number;
  createdAt: string | null;
};

export type BotUpdateType =
  | 'message'
  | 'mini_app_open'
  | 'web_app_data'
  | 'callback_query'
  | 'payment';

/** Bot username qoidasi: kichik harf/raqam/pastki chiziq va `bot` bilan tugaydi. */
export function isValidBotUsername(username: string): boolean {
  return /^[a-z][a-z0-9_]{3,28}bot$/.test(username);
}

/** Kiritilgan nomni bot username shakliga keltiradi (kerak bo'lsa `_bot` qo'shadi). */
export function normalizeBotUsername(input: string): string | null {
  let value = (input ?? '').toLowerCase().replace(/[^a-z0-9_]/g, '');
  if (!value) return null;
  if (!value.endsWith('bot')) value = value + '_bot';
  return isValidBotUsername(value) ? value : null;
}

/** Bot API manzili (bot egasi shu manzilga so'rov yuboradi). */
export function botApiEndpoint(): string | null {
  const base = getApiBase();
  return base ? base + '/functions/v1/bot-api' : null;
}

/** Nusxalash uchun tayyor namuna. */
export function botApiCurlExample(token: string): string {
  const endpoint = botApiEndpoint() ?? 'https://<project>.supabase.co/functions/v1/bot-api';
  return 'curl -X POST "' + endpoint + '/bot' + token + '/getMe"';
}

export async function listMyBots(): Promise<AlsamosBot[]> {
  const { data, error } = await queryClient
    .from('bots')
    .select(
      'id, username, display_name, description, token_prefix, webhook_url, mini_app_id, is_active, requests_total, created_at',
    )
    .order('created_at', { ascending: false });

  if (error) throw new Error(error.message);

  const rows = (data ?? []) as Array<Record<string, unknown>>;
  return rows.map((row) => ({
    id: String(row.id ?? ''),
    username: String(row.username ?? ''),
    displayName: String(row.display_name ?? row.username ?? ''),
    description: (row.description as string | null) ?? null,
    tokenPrefix: (row.token_prefix as string | null) ?? null,
    webhookUrl: (row.webhook_url as string | null) ?? null,
    miniAppId: (row.mini_app_id as string | null) ?? null,
    isActive: row.is_active !== false,
    requestsTotal: Number(row.requests_total ?? 0) || 0,
    createdAt: (row.created_at as string | null) ?? null,
  }));
}

/** Bot yaratadi. Token FAQAT bir marta qaytariladi — darhol saqlash kerak. */
export async function createBot(
  username: string,
  displayName: string,
  description?: string | null,
  publisherId?: string | null,
): Promise<{ botId: string; username: string; token: string }> {
  const normalized = normalizeBotUsername(username);
  if (!normalized) throw new Error('INVALID_USERNAME');

  const { data, error } = await rpcClient.rpc('bot_create', {
    p_username: normalized,
    p_display_name: displayName?.trim() || normalized,
    p_description: description?.trim() || null,
    p_publisher_id: publisherId ?? null,
  });
  if (error) throw new Error(error.message);

  const row = (Array.isArray(data) ? data[0] : data) as {
    bot_id?: string;
    username?: string;
    token?: string;
  } | null;

  if (!row?.token) throw new Error('TOKEN_NOT_ISSUED');
  return {
    botId: String(row.bot_id ?? ''),
    username: String(row.username ?? normalized),
    token: String(row.token),
  };
}

/** Tokenni almashtiradi (eski token darhol ishlamay qoladi). */
export async function revokeBotToken(botId: string): Promise<string> {
  const { data, error } = await rpcClient.rpc('bot_revoke_token', { p_bot_id: botId });
  if (error) throw new Error(error.message);
  const row = (Array.isArray(data) ? data[0] : data) as { token?: string } | null;
  if (!row?.token) throw new Error('TOKEN_NOT_ISSUED');
  return String(row.token);
}

export async function setBotWebhook(
  botId: string,
  url: string | null,
  secret?: string | null,
): Promise<void> {
  if (url && !/^https:\/\//i.test(url)) throw new Error('HTTPS_REQUIRED');
  const { error } = await rpcClient.rpc('bot_set_webhook', {
    p_bot_id: botId,
    p_url: url,
    p_secret: secret ?? null,
  });
  if (error) throw new Error(error.message);
}

/** Botni mini app bilan bog'laydi. */
export async function linkBotToMiniApp(
  botId: string,
  miniAppId: string | null,
  url?: string | null,
): Promise<void> {
  const { error } = await rpcClient.rpc('bot_set_mini_app', {
    p_bot_id: botId,
    p_app_id: miniAppId,
    p_url: url ?? null,
  });
  if (error) throw new Error(error.message);
}

/**
 * Superapp -> bot: update yuborish (mini app ochilganda, xabar yozilganda).
 * Webhook sozlangan bo'lsa server darhol yetkazadi.
 */
export async function pushBotUpdate(
  botUsername: string,
  type: BotUpdateType,
  payload: Record<string, unknown> = {},
): Promise<{ updateId: number | null }> {
  const endpoint = botApiEndpoint();
  if (!endpoint) throw new Error('API_BASE_MISSING');

  const { data: sessionData } = await supabase.auth.getSession();
  const jwt = sessionData.session?.access_token;
  if (!jwt) throw new Error('AUTH_REQUIRED');

  const response = await fetch(endpoint + '/pushUpdate', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer ' + jwt,
    },
    body: JSON.stringify({ bot_username: botUsername, type, payload }),
  });

  const result = (await response.json().catch(() => null)) as {
    ok?: boolean;
    result?: { update_id?: number | null };
    description?: string;
  } | null;

  if (!response.ok || !result?.ok) {
    throw new Error(result?.description ?? 'BOT_UPDATE_FAILED');
  }
  return { updateId: result.result?.update_id ?? null };
}

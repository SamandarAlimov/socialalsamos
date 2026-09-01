// GitHub konnektori uchun frontend klienti.
//
// IKKI REJIM:
//  1) SERVER REJIMI — supabase/functions/github-connector (afzal ko'rilgan; token faqat serverda).
//  2) TO'G'RIDAN-TO'G'RI REJIM — funksiya deploy qilinmagan/javob bermasa, brauzer o'zi
//     api.github.com bilan ishlaydi. Shu sababli konnektor HECH QANDAY deploy'siz ham ishlaydi.
//
// To'g'ridan-to'g'ri rejimda token brauzerda (localStorage) saqlanadi va imkon bo'lsa
// foydalanuvchining o'z qatoriga (ai_github_connections, RLS: auth.uid() = user_id) yoziladi.

import { supabase } from '@/integrations/supabase/client';
import { db } from '@/lib/db';

const FUNCTIONS_BASE = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`;

// MUHIM: to'liq URL literalini bitta template ichida yozmaymiz — sxema va host alohida.
const API_SCHEME = 'https://';
const API_HOST = 'api.github.com';
const GH_API = API_SCHEME + API_HOST;

const TOKEN_KEY = 'alsamos.github.pat';
const LOGIN_KEY = 'alsamos.github.login';

/** Server funksiyasi mavjud emas/javob bermaydi — to'g'ridan-to'g'ri rejimga o'tamiz. */
export class GithubConnectorUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GithubConnectorUnavailableError';
  }
}

const NOT_DEPLOYED_MESSAGE =
  "GitHub konnektori serveri javob bermayapti \u2014 to'g'ridan-to'g'ri rejimga o'tildi.";

/* ------------------------------------------------------------------ *
 * Mahalliy token xotirasi
 * ------------------------------------------------------------------ */

function readLocalToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

function readLocalLogin(): string | null {
  try {
    return localStorage.getItem(LOGIN_KEY);
  } catch {
    return null;
  }
}

function writeLocal(token: string, login: string | null) {
  try {
    localStorage.setItem(TOKEN_KEY, token);
    if (login) localStorage.setItem(LOGIN_KEY, login);
  } catch {
    /* private mode — e'tiborsiz qoldiramiz */
  }
}

function clearLocal() {
  try {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(LOGIN_KEY);
  } catch {
    /* e'tiborsiz */
  }
}

/** Tokenni foydalanuvchining o'z qatoriga yozib qo'yishga harakat qilamiz (majburiy emas). */
async function persistRemote(token: string, login: string | null) {
  try {
    const { data } = await supabase.auth.getUser();
    const userId = data.user?.id;
    if (!userId) return;
    await db
      .from('ai_github_connections')
      .upsert(
        { user_id: userId, token, login, updated_at: new Date().toISOString() },
        { onConflict: 'user_id' },
      );
  } catch {
    // Jadval hali migratsiya qilinmagan bo'lishi mumkin — mahalliy saqlash yetarli.
  }
}

async function forgetRemote() {
  try {
    const { data } = await supabase.auth.getUser();
    const userId = data.user?.id;
    if (!userId) return;
    await db.from('ai_github_connections').delete().eq('user_id', userId);
  } catch {
    /* e'tiborsiz */
  }
}

/* ------------------------------------------------------------------ *
 * 1) Server rejimi
 * ------------------------------------------------------------------ */

async function call<T>(payload: Record<string, unknown>): Promise<T> {
  const { data } = await supabase.auth.getSession();
  const session = data.session;
  if (!session?.access_token) {
    throw new Error('Avval Alsamos hisobingizga kiring.');
  }

  let res: Response;
  try {
    res = await fetch(`${FUNCTIONS_BASE}/github-connector`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
        apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string,
      },
      body: JSON.stringify(payload),
    });
  } catch {
    // "Failed to fetch" — tarmoq darajasidagi xato: funksiya yo'q yoki CORS yopiq.
    throw new GithubConnectorUnavailableError(NOT_DEPLOYED_MESSAGE);
  }

  if (res.status === 404 || res.status === 501 || res.status === 502 || res.status === 503) {
    throw new GithubConnectorUnavailableError(NOT_DEPLOYED_MESSAGE);
  }

  const json = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(json?.error ?? json?.message ?? `GitHub konnektori xatosi (HTTP ${res.status}).`);
  }
  return json as T;
}

/** Server rejimini sinaymiz; mavjud bo'lmasa to'g'ridan-to'g'ri rejimga o'tamiz. */
async function withFallback<T>(
  serverCall: () => Promise<T>,
  directCall: () => Promise<T>,
): Promise<T> {
  try {
    return await serverCall();
  } catch (err) {
    if (err instanceof GithubConnectorUnavailableError) {
      return await directCall();
    }
    throw err;
  }
}

/* ------------------------------------------------------------------ *
 * 2) To'g'ridan-to'g'ri rejim (api.github.com)
 * ------------------------------------------------------------------ */

function requireLocalToken(): string {
  const token = readLocalToken();
  if (!token) {
    throw new Error('GitHub ulanmagan. Avval access token kiritib "Ulash"ni bosing.');
  }
  return token;
}

async function gh<T>(path: string, token: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(GH_API + path, {
      ...init,
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${token}`,
        'X-GitHub-Api-Version': '2022-11-28',
        ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
      },
    });
  } catch {
    throw new Error("GitHub'ga ulanib bo'lmadi. Internet aloqasini tekshirib qayta urinib ko'ring.");
  }

  if (res.status === 401) {
    throw new Error("Token yaroqsiz yoki muddati o'tgan. Yangi fine-grained PAT yarating.");
  }
  if (res.status === 403) {
    throw new Error("Ruxsat yetarli emas yoki so'rov limiti tugagan. Token ruxsatlarini tekshiring.");
  }
  if (res.status === 404) {
    throw new Error('Topilmadi. Repo nomi, yo\u2019l yoki token ruxsatlarini tekshiring.');
  }

  const json = await res.json().catch(() => null);
  if (!res.ok) {
    const message =
      (json && typeof json === 'object' && 'message' in json
        ? String((json as { message?: unknown }).message)
        : null) ?? `GitHub xatosi (HTTP ${res.status}).`;
    throw new Error(message);
  }
  return json as T;
}

/** Base64 → UTF-8 matn (GitHub contents API base64 qaytaradi). */
function decodeBase64Utf8(value: string): string {
  const clean = value.replace(/\s/g, '');
  const binary = atob(clean);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return new TextDecoder('utf-8').decode(bytes);
}

/* ------------------------------------------------------------------ *
 * Ommaviy API
 * ------------------------------------------------------------------ */

export type GithubStatus = { connected: boolean; login: string | null; updatedAt?: string | null };

export type GithubRepo = {
  fullName: string;
  private: boolean;
  description: string | null;
  defaultBranch: string;
  updatedAt: string;
  htmlUrl: string;
};

type GhRepo = {
  full_name: string;
  private: boolean;
  description: string | null;
  default_branch: string;
  updated_at: string;
  html_url: string;
};

const mapRepo = (r: GhRepo): GithubRepo => ({
  fullName: r.full_name,
  private: r.private,
  description: r.description,
  defaultBranch: r.default_branch,
  updatedAt: r.updated_at,
  htmlUrl: r.html_url,
});

/** Shaxsiy access token (PAT) bilan ulash. */
export const connectGithub = (token: string) =>
  withFallback<{ connected: boolean; login: string | null }>(
    () => call({ action: 'connect', token }),
    async () => {
      // Tokenni GitHub'da tekshiramiz, so'ng saqlaymiz.
      const me = await gh<{ login: string }>('/user', token);
      writeLocal(token, me.login);
      void persistRemote(token, me.login);
      return { connected: true, login: me.login };
    },
  );

export const githubStatus = () =>
  withFallback<GithubStatus>(
    () => call({ action: 'status' }),
    async () => {
      const token = readLocalToken();
      if (!token) return { connected: false, login: null };
      try {
        const me = await gh<{ login: string }>('/user', token);
        writeLocal(token, me.login);
        return { connected: true, login: me.login };
      } catch {
        return { connected: false, login: readLocalLogin() };
      }
    },
  );

export const disconnectGithub = () =>
  withFallback<{ connected: boolean }>(
    () => call({ action: 'disconnect' }),
    async () => {
      clearLocal();
      await forgetRemote();
      return { connected: false };
    },
  );

export const listGithubRepos = (page = 1) =>
  withFallback<{ repos: GithubRepo[] }>(
    () => call({ action: 'repos', page }),
    async () => {
      const token = requireLocalToken();
      const repos = await gh<GhRepo[]>(
        `/user/repos?per_page=50&sort=updated&affiliation=owner,collaborator,organization_member&page=${page}`,
        token,
      );
      return { repos: repos.map(mapRepo) };
    },
  );

export const readGithubFile = (owner: string, repo: string, path: string, ref?: string) =>
  withFallback<{ name: string; size: number; content: string }>(
    () => call({ action: 'file', owner, repo, path, ref }),
    async () => {
      const token = requireLocalToken();
      const query = ref ? `?ref=${encodeURIComponent(ref)}` : '';
      const file = await gh<{ name: string; size: number; content?: string; encoding?: string }>(
        `/repos/${owner}/${repo}/contents/${path
          .split('/')
          .map(encodeURIComponent)
          .join('/')}${query}`,
        token,
      );
      return {
        name: file.name,
        size: file.size,
        content:
          file.encoding === 'base64' && file.content ? decodeBase64Utf8(file.content) : (file.content ?? ''),
      };
    },
  );

export const searchGithubCode = (q: string) =>
  withFallback<{ items: Array<{ path: string; repo: string; htmlUrl: string }> }>(
    () => call({ action: 'search_code', q }),
    async () => {
      const token = requireLocalToken();
      const res = await gh<{
        items: Array<{ path: string; html_url: string; repository: { full_name: string } }>;
      }>(`/search/code?per_page=20&q=${encodeURIComponent(q)}`, token);
      return {
        items: (res.items ?? []).map((i) => ({
          path: i.path,
          repo: i.repository.full_name,
          htmlUrl: i.html_url,
        })),
      };
    },
  );

export const createGithubIssue = (owner: string, repo: string, title: string, body?: string) =>
  withFallback<{ number: number; url: string }>(
    () => call({ action: 'create_issue', owner, repo, title, body }),
    async () => {
      const token = requireLocalToken();
      const issue = await gh<{ number: number; html_url: string }>(
        `/repos/${owner}/${repo}/issues`,
        token,
        { method: 'POST', body: JSON.stringify({ title, body }) },
      );
      return { number: issue.number, url: issue.html_url };
    },
  );

export type GithubRepoMeta = {
  fullName: string;
  description: string | null;
  defaultBranch: string;
  language: string | null;
  private: boolean;
  updatedAt: string;
};

/** Repo haqida qisqa ma'lumot (chat konteksti uchun). */
export const getGithubRepoMeta = async (owner: string, repo: string): Promise<GithubRepoMeta> => {
  const token = requireLocalToken();
  const info = await gh<{
    full_name: string;
    description: string | null;
    default_branch: string;
    language: string | null;
    private: boolean;
    updated_at: string;
  }>(`/repos/${owner}/${repo}`, token);
  return {
    fullName: info.full_name,
    description: info.description,
    defaultBranch: info.default_branch,
    language: info.language,
    private: info.private,
    updatedAt: info.updated_at,
  };
};

/**
 * Repodagi barcha fayl yo'llari (rekursiv).
 * Chat AI uchun eng muhim funksiya: loyiha tuzilishini bir so'rovda beradi.
 */
export const listGithubTree = async (
  owner: string,
  repo: string,
  ref?: string,
): Promise<{ paths: string[]; truncated: boolean; branch: string }> => {
  const token = requireLocalToken();
  let branch = ref;
  if (!branch) {
    const info = await gh<{ default_branch: string }>(`/repos/${owner}/${repo}`, token);
    branch = info.default_branch;
  }
  const tree = await gh<{
    tree: Array<{ path: string; type: string }>;
    truncated?: boolean;
  }>(`/repos/${owner}/${repo}/git/trees/${encodeURIComponent(branch)}?recursive=1`, token);

  return {
    paths: (tree.tree ?? []).filter((t) => t.type === 'blob').map((t) => t.path),
    truncated: Boolean(tree.truncated),
    branch,
  };
};

/** UI uchun: hozir to'g'ridan-to'g'ri rejimdami? */
export const isDirectGithubMode = () => Boolean(readLocalToken());

/** GitHub ulanganmi (mahalliy token bor-yo'qligi bo'yicha tezkor tekshiruv). */
export const hasGithubToken = () => Boolean(readLocalToken());

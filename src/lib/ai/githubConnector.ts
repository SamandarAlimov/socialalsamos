// GitHub connector used by Alsamos AI.
//
// Browser calls only the authenticated Supabase Edge connector. The GitHub PAT
// is validated by that function and stored in the user's server-side GitHub
// connection, which is the same connection used by the native coding-agent tools.

import { supabase } from '@/integrations/supabase/client';

const FUNCTIONS_BASE = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`;
let cachedConnected = false;

async function authHeaders(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token ?? import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
    apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string,
  };
}

async function connectorCall<T>(body: Record<string, unknown>): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${FUNCTIONS_BASE}/github-connector`, {
      method: 'POST',
      headers: await authHeaders(),
      body: JSON.stringify(body),
    });
  } catch {
    throw new Error("GitHub connector'ga ulanib bo'lmadi. Internet aloqasini tekshiring.");
  }

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const message =
      payload && typeof payload === 'object'
        ? String(
            (payload as { error?: unknown; message?: unknown }).error ||
              (payload as { error?: unknown; message?: unknown }).message ||
              '',
          )
        : '';
    throw new Error(message || `GitHub connector xatosi (HTTP ${response.status}).`);
  }
  return payload as T;
}

export type GithubStatus = {
  connected: boolean;
  login: string | null;
  updatedAt?: string | null;
};

export type GithubRepo = {
  fullName: string;
  private: boolean;
  description: string | null;
  defaultBranch: string;
  updatedAt: string;
  htmlUrl: string;
};

/** Validate a fine-grained PAT and save one authoritative server-side connection. */
export async function connectGithub(token: string): Promise<{ connected: boolean; login: string | null }> {
  const clean = token.trim();
  if (!clean) throw new Error('Access token kiriting.');
  const result = await connectorCall<{ connected: boolean; login: string | null }>({
    action: 'connect',
    token: clean,
  });
  cachedConnected = result.connected;
  return result;
}

/** Check the same server-side connection used by the AI coding agent. */
export async function githubStatus(): Promise<GithubStatus> {
  const result = await connectorCall<GithubStatus>({ action: 'status' });
  cachedConnected = result.connected;
  return result;
}

export async function disconnectGithub(): Promise<{ connected: boolean }> {
  const result = await connectorCall<{ connected: boolean }>({ action: 'disconnect' });
  cachedConnected = false;
  return result;
}

export async function listGithubRepos(page = 1): Promise<{ repos: GithubRepo[] }> {
  return connectorCall<{ repos: GithubRepo[] }>({ action: 'repos', page: Math.max(1, page) });
}

export async function readGithubFile(
  owner: string,
  repo: string,
  path: string,
  ref?: string,
): Promise<{ name: string; size: number; content: string }> {
  return connectorCall<{ name: string; size: number; content: string }>({
    action: 'file',
    owner,
    repo,
    path,
    ref,
  });
}

export async function searchGithubCode(
  q: string,
): Promise<{ items: Array<{ path: string; repo: string; htmlUrl: string }> }> {
  return connectorCall<{ items: Array<{ path: string; repo: string; htmlUrl: string }> }>({
    action: 'search_code',
    q,
  });
}

export async function createGithubIssue(
  owner: string,
  repo: string,
  title: string,
  body?: string,
): Promise<{ number: number; url: string }> {
  return connectorCall<{ number: number; url: string }>({
    action: 'create_issue',
    owner,
    repo,
    title,
    body,
  });
}

export type GithubRepoMeta = {
  fullName: string;
  description: string | null;
  defaultBranch: string;
  language: string | null;
  private: boolean;
  updatedAt: string;
};

export async function getGithubRepoMeta(owner: string, repo: string): Promise<GithubRepoMeta> {
  return connectorCall<GithubRepoMeta>({ action: 'repo', owner, repo });
}

export async function listGithubTree(
  owner: string,
  repo: string,
  ref?: string,
): Promise<{ paths: string[]; truncated: boolean; branch: string }> {
  return connectorCall<{ paths: string[]; truncated: boolean; branch: string }>({
    action: 'tree',
    owner,
    repo,
    ref,
  });
}

/** Legacy compatibility: GitHub is no longer a browser-direct token mode. */
export const isDirectGithubMode = () => false;
export const hasGithubToken = () => cachedConnected;

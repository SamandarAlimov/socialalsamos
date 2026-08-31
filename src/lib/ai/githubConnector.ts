// GitHub konnektori uchun frontend klienti (bearer token bilan ulash).
// Server: supabase/functions/github-connector/index.ts

import { supabase } from '@/integrations/supabase/client';

const FUNCTIONS_BASE = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`;

async function call<T>(payload: Record<string, unknown>): Promise<T> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token ?? import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

  const res = await fetch(`${FUNCTIONS_BASE}/github-connector`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string,
    },
    body: JSON.stringify(payload),
  });

  const json = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(json?.error ?? json?.message ?? `GitHub konnektori xatosi (HTTP ${res.status}).`);
  }
  return json as T;
}

export type GithubStatus = { connected: boolean; login: string | null; updatedAt?: string | null };

export type GithubRepo = {
  fullName: string;
  private: boolean;
  description: string | null;
  defaultBranch: string;
  updatedAt: string;
  htmlUrl: string;
};

/** Shaxsiy access token (PAT) bilan ulash. Token faqat serverda saqlanadi. */
export const connectGithub = (token: string) =>
  call<{ connected: boolean; login: string | null }>({ action: 'connect', token });

export const githubStatus = () => call<GithubStatus>({ action: 'status' });

export const disconnectGithub = () => call<{ connected: boolean }>({ action: 'disconnect' });

export const listGithubRepos = (page = 1) =>
  call<{ repos: GithubRepo[] }>({ action: 'repos', page });

export const readGithubFile = (owner: string, repo: string, path: string, ref?: string) =>
  call<{ name: string; size: number; content: string }>({
    action: 'file',
    owner,
    repo,
    path,
    ref,
  });

export const searchGithubCode = (q: string) =>
  call<{ items: Array<{ path: string; repo: string; htmlUrl: string }> }>({
    action: 'search_code',
    q,
  });

export const createGithubIssue = (owner: string, repo: string, title: string, body?: string) =>
  call<{ number: number; url: string }>({ action: 'create_issue', owner, repo, title, body });

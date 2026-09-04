// GitHub connector used by Alsamos AI.
//
// The production Supabase `github-connector` function may be unavailable when
// its optional migration has not been deployed. GitHub access must not stop in
// that situation, so the browser talks to GitHub's official REST API directly
// with the user's fine-grained PAT. The token is never sent to Alsamos APIs.

const API_SCHEME = 'https://';
const API_HOST = 'api.github.com';
const GH_API = API_SCHEME + API_HOST;

const TOKEN_KEY = 'alsamos.github.pat';
const LOGIN_KEY = 'alsamos.github.login';

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
    throw new Error('Brauzer tokenni saqlay olmadi. Site storage ruxsatini tekshiring.');
  }
}

function clearLocal() {
  try {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(LOGIN_KEY);
  } catch {
    // Storage cleanup is best-effort.
  }
}

function requireLocalToken(): string {
  const token = readLocalToken()?.trim();
  if (!token) {
    throw new Error('GitHub ulanmagan. Avval access token kiritib “Ulash”ni bosing.');
  }
  return token;
}

async function gh<T>(path: string, token: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(GH_API + path, {
      ...init,
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${token}`,
        'X-GitHub-Api-Version': '2022-11-28',
        ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
        ...(init?.headers || {}),
      },
    });
  } catch {
    throw new Error("GitHub'ga ulanib bo'lmadi. Internet aloqasini tekshirib qayta urinib ko'ring.");
  }

  if (response.status === 401) {
    throw new Error("Token yaroqsiz yoki muddati o'tgan. Yangi fine-grained PAT yarating.");
  }
  if (response.status === 403) {
    throw new Error("Ruxsat yetarli emas yoki GitHub API limiti tugagan. Token ruxsatlarini tekshiring.");
  }
  if (response.status === 404) {
    throw new Error('Topilmadi. Repo nomi, fayl yo‘li yoki token ruxsatlarini tekshiring.');
  }

  const json = await response.json().catch(() => null);
  if (!response.ok) {
    const message =
      json && typeof json === 'object' && 'message' in json
        ? String((json as { message?: unknown }).message || '')
        : '';
    throw new Error(message || `GitHub xatosi (HTTP ${response.status}).`);
  }

  return json as T;
}

function decodeBase64Utf8(value: string): string {
  const clean = value.replace(/\s/g, '');
  const binary = atob(clean);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return new TextDecoder('utf-8').decode(bytes);
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

type GhRepo = {
  full_name: string;
  private: boolean;
  description: string | null;
  default_branch: string;
  updated_at: string;
  html_url: string;
};

const mapRepo = (repo: GhRepo): GithubRepo => ({
  fullName: repo.full_name,
  private: repo.private,
  description: repo.description,
  defaultBranch: repo.default_branch,
  updatedAt: repo.updated_at,
  htmlUrl: repo.html_url,
});

/** Validate and save a fine-grained PAT locally. */
export async function connectGithub(token: string): Promise<{ connected: boolean; login: string | null }> {
  const clean = token.trim();
  if (!clean) throw new Error('Access token kiriting.');
  const me = await gh<{ login: string }>('/user', clean);
  writeLocal(clean, me.login);
  return { connected: true, login: me.login };
}

/** Check the locally connected GitHub account without calling Alsamos backend. */
export async function githubStatus(): Promise<GithubStatus> {
  const token = readLocalToken()?.trim();
  if (!token) return { connected: false, login: null };

  try {
    const me = await gh<{ login: string }>('/user', token);
    writeLocal(token, me.login);
    return { connected: true, login: me.login };
  } catch (error) {
    // Keep a previously validated token on transient network/API errors. An
    // actual operation will surface the precise GitHub error to the user.
    return { connected: true, login: readLocalLogin(), updatedAt: null };
  }
}

export async function disconnectGithub(): Promise<{ connected: boolean }> {
  clearLocal();
  return { connected: false };
}

export async function listGithubRepos(page = 1): Promise<{ repos: GithubRepo[] }> {
  const token = requireLocalToken();
  const repos = await gh<GhRepo[]>(
    `/user/repos?per_page=50&sort=updated&affiliation=owner,collaborator,organization_member&page=${Math.max(1, page)}`,
    token,
  );
  return { repos: repos.map(mapRepo) };
}

export async function readGithubFile(
  owner: string,
  repo: string,
  path: string,
  ref?: string,
): Promise<{ name: string; size: number; content: string }> {
  const token = requireLocalToken();
  const query = ref ? `?ref=${encodeURIComponent(ref)}` : '';
  const encodedPath = path.split('/').map(encodeURIComponent).join('/');
  const file = await gh<{ name: string; size: number; content?: string; encoding?: string }>(
    `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${encodedPath}${query}`,
    token,
  );

  return {
    name: file.name,
    size: file.size,
    content:
      file.encoding === 'base64' && file.content
        ? decodeBase64Utf8(file.content)
        : file.content || '',
  };
}

export async function searchGithubCode(
  q: string,
): Promise<{ items: Array<{ path: string; repo: string; htmlUrl: string }> }> {
  const token = requireLocalToken();
  const response = await gh<{
    items: Array<{ path: string; html_url: string; repository: { full_name: string } }>;
  }>(`/search/code?per_page=20&q=${encodeURIComponent(q)}`, token);

  return {
    items: (response.items || []).map((item) => ({
      path: item.path,
      repo: item.repository.full_name,
      htmlUrl: item.html_url,
    })),
  };
}

export async function createGithubIssue(
  owner: string,
  repo: string,
  title: string,
  body?: string,
): Promise<{ number: number; url: string }> {
  const token = requireLocalToken();
  const issue = await gh<{ number: number; html_url: string }>(
    `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/issues`,
    token,
    { method: 'POST', body: JSON.stringify({ title, body }) },
  );
  return { number: issue.number, url: issue.html_url };
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
  const token = requireLocalToken();
  const info = await gh<{
    full_name: string;
    description: string | null;
    default_branch: string;
    language: string | null;
    private: boolean;
    updated_at: string;
  }>(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`, token);

  return {
    fullName: info.full_name,
    description: info.description,
    defaultBranch: info.default_branch,
    language: info.language,
    private: info.private,
    updatedAt: info.updated_at,
  };
}

export async function listGithubTree(
  owner: string,
  repo: string,
  ref?: string,
): Promise<{ paths: string[]; truncated: boolean; branch: string }> {
  const token = requireLocalToken();
  let branch = ref;
  if (!branch) {
    const info = await gh<{ default_branch: string }>(
      `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`,
      token,
    );
    branch = info.default_branch;
  }

  const tree = await gh<{
    tree: Array<{ path: string; type: string }>;
    truncated?: boolean;
  }>(
    `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/git/trees/${encodeURIComponent(branch)}?recursive=1`,
    token,
  );

  return {
    paths: (tree.tree || []).filter((item) => item.type === 'blob').map((item) => item.path),
    truncated: Boolean(tree.truncated),
    branch,
  };
}

export const isDirectGithubMode = () => Boolean(readLocalToken());
export const hasGithubToken = () => Boolean(readLocalToken());

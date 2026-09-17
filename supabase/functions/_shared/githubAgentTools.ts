// Native GitHub tools for Alsamos AI.
//
// These tools deliberately do NOT depend on the code sandbox. Repository
// inspection and edits happen through GitHub's server-side REST API using the
// signed-in user's protected GitHub connection. The agent is only allowed to
// commit to non-default branches; opening a PR and checking CI are separate
// steps. This gives the model a Codex/Claude-Code style workflow even when the
// arbitrary-code sandbox is unavailable.

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

export type GithubAgentContext = {
  userId: string | null;
  admin: SupabaseClient;
  enabled: Set<string>;
};

export type GithubToolSpec = {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
};

export type GithubToolOutcome = {
  ok: boolean;
  text: string;
  data?: Record<string, unknown>;
};

type GhInit = {
  method?: string;
  body?: unknown;
  accept?: string;
};

type GithubConnection = {
  token?: string | null;
  login?: string | null;
};

const API_BASE = "https://api.github.com";
const UA = "Alsamos-AI-Agent";
const MAX_FILE_COUNT = 25;
const MAX_COMMIT_CHARS = 750_000;

const str = (description: string) => ({ type: "string", description });
const bool = (description: string) => ({ type: "boolean", description });
const num = (description: string) => ({ type: "number", description });

export const GITHUB_TOOL_NAMES = [
  "github_list_repositories",
  "github_read_repository_tree",
  "github_read_file",
  "github_search_code",
  "github_create_branch",
  "github_commit_files",
  "github_create_pull_request",
  "github_get_commit_checks",
] as const;

export const GITHUB_TOOL_SPECS: Record<string, GithubToolSpec> = {
  github_list_repositories: {
    type: "function",
    function: {
      name: "github_list_repositories",
      description:
        "List repositories available through the signed-in user's native GitHub connection. Use this when the user refers to a repository but its exact owner/name is unclear.",
      parameters: {
        type: "object",
        properties: {
          query: str("Optional case-insensitive owner/name filter."),
          limit: num("Maximum repositories to return, 1-100 (default 30)."),
        },
        additionalProperties: false,
      },
    },
  },
  github_read_repository_tree: {
    type: "function",
    function: {
      name: "github_read_repository_tree",
      description:
        "Read the file tree of a GitHub repository at a branch/ref. Use before coding to understand structure instead of guessing paths.",
      parameters: {
        type: "object",
        properties: {
          repository: str("Repository in owner/name form."),
          ref: str("Optional branch, tag or commit. Defaults to the repository default branch."),
          max_paths: num("Maximum paths returned, 50-1500 (default 700)."),
        },
        required: ["repository"],
        additionalProperties: false,
      },
    },
  },
  github_read_file: {
    type: "function",
    function: {
      name: "github_read_file",
      description:
        "Read a UTF-8 text file from a GitHub repository. Use repeatedly for the exact implementation files you need before editing them.",
      parameters: {
        type: "object",
        properties: {
          repository: str("Repository in owner/name form."),
          path: str("Repository-relative file path."),
          ref: str("Optional branch, tag or commit. Defaults to the repository default branch."),
        },
        required: ["repository", "path"],
        additionalProperties: false,
      },
    },
  },
  github_search_code: {
    type: "function",
    function: {
      name: "github_search_code",
      description:
        "Search code paths inside one GitHub repository. Search returns matching file paths; follow with github_read_file for source text.",
      parameters: {
        type: "object",
        properties: {
          repository: str("Repository in owner/name form."),
          query: str("GitHub code search text, function/class name, error string, or filename."),
          limit: num("Maximum matches, 1-30 (default 12)."),
        },
        required: ["repository", "query"],
        additionalProperties: false,
      },
    },
  },
  github_create_branch: {
    type: "function",
    function: {
      name: "github_create_branch",
      description:
        "Create a new GitHub branch for a requested code change. Prefer a descriptive feat/fix/chore branch. Never use this to rewrite an existing branch.",
      parameters: {
        type: "object",
        properties: {
          repository: str("Repository in owner/name form."),
          branch: str("New branch name, e.g. fix/mobile-header."),
          base: str("Optional source branch. Defaults to the repository default branch."),
        },
        required: ["repository", "branch"],
        additionalProperties: false,
      },
    },
  },
  github_commit_files: {
    type: "function",
    function: {
      name: "github_commit_files",
      description:
        "Atomically create/update/delete multiple text files in one commit on an EXISTING NON-DEFAULT branch. This is the primary tool for actually implementing a coding task. Read relevant files first, create a feature branch, then call this tool. It refuses writes to the default branch.",
      parameters: {
        type: "object",
        properties: {
          repository: str("Repository in owner/name form."),
          branch: str("Existing feature/fix branch. The default branch is rejected."),
          message: str("Concise commit message."),
          files: {
            type: "array",
            minItems: 1,
            maxItems: MAX_FILE_COUNT,
            description: "Files to create/update/delete in this atomic commit.",
            items: {
              type: "object",
              properties: {
                path: str("Repository-relative path."),
                content: str("Complete UTF-8 file content for create/update."),
                delete: bool("Set true to delete this file. content is ignored when true."),
              },
              required: ["path"],
              additionalProperties: false,
            },
          },
        },
        required: ["repository", "branch", "message", "files"],
        additionalProperties: false,
      },
    },
  },
  github_create_pull_request: {
    type: "function",
    function: {
      name: "github_create_pull_request",
      description:
        "Open a pull request after committing the requested implementation to a feature branch. Include a useful summary and testing notes. This does not merge the PR.",
      parameters: {
        type: "object",
        properties: {
          repository: str("Repository in owner/name form."),
          head: str("Feature branch containing the changes."),
          base: str("Optional target branch. Defaults to the repository default branch."),
          title: str("Pull request title."),
          body: str("Markdown pull request description."),
          draft: bool("Whether to open as draft. Defaults to false."),
        },
        required: ["repository", "head", "title"],
        additionalProperties: false,
      },
    },
  },
  github_get_commit_checks: {
    type: "function",
    function: {
      name: "github_get_commit_checks",
      description:
        "Check GitHub commit status and check-runs for a branch/commit after opening a PR. This includes providers such as GitHub Actions and Vercel when they report status to GitHub. Use it to verify the implementation instead of claiming tests passed without evidence.",
      parameters: {
        type: "object",
        properties: {
          repository: str("Repository in owner/name form."),
          ref: str("Branch name or commit SHA to check."),
        },
        required: ["repository", "ref"],
        additionalProperties: false,
      },
    },
  },
};

function fail(text: string): GithubToolOutcome {
  return { ok: false, text };
}

function clamp(value: unknown, min: number, max: number, fallback: number): number {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.min(max, Math.max(min, Math.round(numeric)));
}

function splitRepository(value: unknown): { owner: string; repo: string; full: string } | null {
  const raw = String(value ?? "").trim().replace(/^https?:\/\/github\.com\//i, "").replace(/\.git$/i, "");
  const parts = raw.split("/").filter(Boolean);
  if (parts.length !== 2) return null;
  const [owner, repo] = parts;
  if (!/^[A-Za-z0-9_.-]+$/.test(owner) || !/^[A-Za-z0-9_.-]+$/.test(repo)) return null;
  return { owner, repo, full: `${owner}/${repo}` };
}

function encodePath(value: string): string {
  return value.split("/").map(encodeURIComponent).join("/");
}

function safeFilePath(value: unknown): string | null {
  const path = String(value ?? "").trim().replace(/^\/+/, "");
  if (!path || path.includes("\0")) return null;
  const parts = path.split("/");
  if (parts.some((part) => !part || part === "." || part === "..")) return null;
  return path;
}

function decodeBase64Utf8(value: string): string {
  const binary = atob(value.replace(/\s/g, ""));
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return new TextDecoder().decode(bytes);
}

async function connection(ctx: GithubAgentContext): Promise<GithubConnection> {
  if (!ctx.userId) throw new Error("GitHub vositalari uchun tizimga kirish kerak.");
  const { data, error } = await ctx.admin
    .from("ai_github_connections")
    .select("token, login")
    .eq("user_id", ctx.userId)
    .maybeSingle();
  if (error) throw new Error(`GitHub ulanishini o'qib bo'lmadi: ${error.message}`);
  if (!data?.token) {
    throw new Error("GitHub ulanmagan. AI sahifasidagi GitHub oynasidan fine-grained token bilan ulang.");
  }
  return data as GithubConnection;
}

async function gh<T>(token: string, path: string, init: GhInit = {}): Promise<T> {
  const response = await fetch(API_BASE + path, {
    method: init.method ?? "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: init.accept ?? "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": UA,
      ...(init.body === undefined ? {} : { "Content-Type": "application/json" }),
    },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
  const raw = await response.text();
  let parsed: unknown = null;
  try {
    parsed = raw ? JSON.parse(raw) : null;
  } catch {
    parsed = raw;
  }
  if (!response.ok) {
    const message =
      parsed && typeof parsed === "object" && "message" in parsed
        ? String((parsed as { message?: unknown }).message ?? "")
        : String(parsed ?? "");
    throw new Error(`GitHub HTTP ${response.status}${message ? `: ${message}` : ""}`);
  }
  return parsed as T;
}

async function repoInfo(token: string, repo: { owner: string; repo: string }) {
  return await gh<{
    full_name: string;
    default_branch: string;
    private: boolean;
    html_url: string;
    description?: string | null;
  }>(token, `/repos/${encodeURIComponent(repo.owner)}/${encodeURIComponent(repo.repo)}`);
}

async function audit(
  ctx: GithubAgentContext,
  tool: string,
  resource: string,
  request: Record<string, unknown>,
  outcome: "success" | "error",
  summary: string,
) {
  if (!ctx.userId) return;
  const safeRequest = { ...request };
  if ("files" in safeRequest && Array.isArray(safeRequest.files)) {
    safeRequest.files = (safeRequest.files as Array<Record<string, unknown>>).map((item) => ({
      path: item.path,
      delete: Boolean(item.delete),
      contentChars: typeof item.content === "string" ? item.content.length : 0,
    }));
  }
  try {
    await ctx.admin.from("ai_agent_actions").insert({
      user_id: ctx.userId,
      provider: "github",
      tool,
      resource,
      request: safeRequest,
      outcome,
      summary: summary.slice(0, 2000),
    });
  } catch {
    // Audit logging must never make a successfully completed GitHub operation fail.
  }
}

async function listRepositories(args: Record<string, unknown>, ctx: GithubAgentContext): Promise<GithubToolOutcome> {
  const conn = await connection(ctx);
  const limit = clamp(args.limit, 1, 100, 30);
  const query = String(args.query ?? "").trim().toLowerCase();
  const repos = await gh<Array<{
    full_name: string;
    private: boolean;
    description: string | null;
    default_branch: string;
    html_url: string;
    updated_at: string;
  }>>(
    conn.token!,
    `/user/repos?per_page=100&sort=updated&affiliation=owner,collaborator,organization_member`,
  );
  const filtered = repos
    .filter((repo) => !query || repo.full_name.toLowerCase().includes(query))
    .slice(0, limit)
    .map((repo) => ({
      fullName: repo.full_name,
      private: repo.private,
      description: repo.description,
      defaultBranch: repo.default_branch,
      url: repo.html_url,
      updatedAt: repo.updated_at,
    }));
  return {
    ok: true,
    text: filtered.length
      ? filtered.map((repo) => `${repo.fullName} [${repo.private ? "private" : "public"}] default=${repo.defaultBranch}`).join("\n")
      : "Mos GitHub repozitoriysi topilmadi.",
    data: { repositories: filtered, login: conn.login ?? null },
  };
}

async function readTree(args: Record<string, unknown>, ctx: GithubAgentContext): Promise<GithubToolOutcome> {
  const repository = splitRepository(args.repository);
  if (!repository) return fail("repository owner/name ko'rinishida bo'lishi kerak.");
  const conn = await connection(ctx);
  const info = await repoInfo(conn.token!, repository);
  const ref = String(args.ref ?? info.default_branch).trim() || info.default_branch;
  const max = clamp(args.max_paths, 50, 1500, 700);
  const tree = await gh<{
    tree?: Array<{ path: string; type: string; size?: number }>;
    truncated?: boolean;
  }>(conn.token!, `/repos/${encodeURIComponent(repository.owner)}/${encodeURIComponent(repository.repo)}/git/trees/${encodeURIComponent(ref)}?recursive=1`);
  const files = (tree.tree ?? [])
    .filter((item) => item.type === "blob")
    .slice(0, max)
    .map((item) => ({ path: item.path, size: item.size ?? null }));
  return {
    ok: true,
    text: `Repo: ${repository.full}\nRef: ${ref}\nFiles shown: ${files.length}${tree.truncated ? "+" : ""}\n` +
      files.map((file) => `- ${file.path}${file.size == null ? "" : ` (${file.size} B)`}`).join("\n"),
    data: { repository: repository.full, ref, files, truncated: Boolean(tree.truncated), defaultBranch: info.default_branch },
  };
}

async function readFile(args: Record<string, unknown>, ctx: GithubAgentContext): Promise<GithubToolOutcome> {
  const repository = splitRepository(args.repository);
  const path = safeFilePath(args.path);
  if (!repository || !path) return fail("repository va to'g'ri path talab qilinadi.");
  const conn = await connection(ctx);
  const query = args.ref ? `?ref=${encodeURIComponent(String(args.ref))}` : "";
  const file = await gh<{
    type?: string;
    name?: string;
    size?: number;
    sha?: string;
    encoding?: string;
    content?: string;
    html_url?: string;
  }>(conn.token!, `/repos/${encodeURIComponent(repository.owner)}/${encodeURIComponent(repository.repo)}/contents/${encodePath(path)}${query}`);
  if (file.type !== "file") return fail(`${path} oddiy fayl emas.`);
  const content = file.encoding === "base64" && file.content ? decodeBase64Utf8(file.content) : String(file.content ?? "");
  const capped = content.length > 80_000 ? `${content.slice(0, 80_000)}\n\n[...truncated by Alsamos AI]` : content;
  return {
    ok: true,
    text: `FILE ${path}\nSHA ${file.sha ?? "?"}\n\n${capped}`,
    data: { repository: repository.full, path, ref: args.ref ?? null, size: file.size ?? content.length, sha: file.sha ?? null, url: file.html_url ?? null },
  };
}

async function searchCode(args: Record<string, unknown>, ctx: GithubAgentContext): Promise<GithubToolOutcome> {
  const repository = splitRepository(args.repository);
  const query = String(args.query ?? "").trim();
  if (!repository || !query) return fail("repository va query talab qilinadi.");
  const conn = await connection(ctx);
  const limit = clamp(args.limit, 1, 30, 12);
  const search = `${query} repo:${repository.full}`;
  const result = await gh<{
    items?: Array<{ path: string; name: string; sha: string; html_url: string }>;
  }>(conn.token!, `/search/code?per_page=${limit}&q=${encodeURIComponent(search)}`);
  const items = (result.items ?? []).slice(0, limit).map((item) => ({
    path: item.path,
    name: item.name,
    sha: item.sha,
    url: item.html_url,
  }));
  return {
    ok: true,
    text: items.length ? items.map((item) => `- ${item.path}`).join("\n") : "Kod qidiruvida mos fayl topilmadi.",
    data: { repository: repository.full, query, items },
  };
}

async function createBranch(args: Record<string, unknown>, ctx: GithubAgentContext): Promise<GithubToolOutcome> {
  const repository = splitRepository(args.repository);
  const branch = String(args.branch ?? "").trim().replace(/^refs\/heads\//, "");
  if (!repository || !branch || branch.length > 180 || /[~^:?*\\[\]\s]/.test(branch) || branch.includes("..")) {
    return fail("repository va GitHub uchun yaroqli yangi branch nomi talab qilinadi.");
  }
  const conn = await connection(ctx);
  const info = await repoInfo(conn.token!, repository);
  const base = String(args.base ?? info.default_branch).trim() || info.default_branch;
  const baseRef = await gh<{ object: { sha: string } }>(
    conn.token!,
    `/repos/${encodeURIComponent(repository.owner)}/${encodeURIComponent(repository.repo)}/git/ref/heads/${encodePath(base)}`,
  );
  const created = await gh<{ ref: string; object: { sha: string }; url?: string }>(
    conn.token!,
    `/repos/${encodeURIComponent(repository.owner)}/${encodeURIComponent(repository.repo)}/git/refs`,
    { method: "POST", body: { ref: `refs/heads/${branch}`, sha: baseRef.object.sha } },
  );
  const url = `https://github.com/${repository.full}/tree/${encodeURIComponent(branch)}`;
  const summary = `${repository.full}: ${branch} branchi ${base} (${baseRef.object.sha.slice(0, 7)}) dan yaratildi.`;
  await audit(ctx, "github_create_branch", repository.full, { branch, base }, "success", summary);
  return { ok: true, text: summary, data: { repository: repository.full, branch, base, sha: created.object.sha, url } };
}

async function commitFiles(args: Record<string, unknown>, ctx: GithubAgentContext): Promise<GithubToolOutcome> {
  const repository = splitRepository(args.repository);
  const branch = String(args.branch ?? "").trim().replace(/^refs\/heads\//, "");
  const message = String(args.message ?? "").trim().slice(0, 240);
  const rawFiles = Array.isArray(args.files) ? (args.files as Array<Record<string, unknown>>) : [];
  if (!repository || !branch || !message || rawFiles.length === 0) {
    return fail("repository, branch, message va kamida bitta files elementi talab qilinadi.");
  }
  if (rawFiles.length > MAX_FILE_COUNT) return fail(`Bitta commitda ko'pi bilan ${MAX_FILE_COUNT} ta fayl o'zgartiriladi.`);

  const files: Array<{ path: string; content?: string; delete: boolean }> = [];
  let totalChars = 0;
  for (const item of rawFiles) {
    const path = safeFilePath(item.path);
    if (!path) return fail(`Noto'g'ri fayl yo'li: ${String(item.path ?? "")}`);
    const isDelete = Boolean(item.delete);
    const content = isDelete ? undefined : String(item.content ?? "");
    totalChars += content?.length ?? 0;
    files.push({ path, content, delete: isDelete });
  }
  if (totalChars > MAX_COMMIT_CHARS) {
    return fail(`Commit matni juda katta (${totalChars} belgi). Vazifani kichikroq commitlarga bo'ling.`);
  }

  const conn = await connection(ctx);
  const info = await repoInfo(conn.token!, repository);
  if (branch === info.default_branch) {
    return fail(`Xavfsizlik: ${info.default_branch} default branchiga AI to'g'ridan-to'g'ri commit qilmaydi. Avval github_create_branch bilan feature/fix branch oching.`);
  }

  const branchRef = await gh<{ object: { sha: string } }>(
    conn.token!,
    `/repos/${encodeURIComponent(repository.owner)}/${encodeURIComponent(repository.repo)}/git/ref/heads/${encodePath(branch)}`,
  );
  const parentSha = branchRef.object.sha;
  const parentCommit = await gh<{ tree: { sha: string } }>(
    conn.token!,
    `/repos/${encodeURIComponent(repository.owner)}/${encodeURIComponent(repository.repo)}/git/commits/${encodeURIComponent(parentSha)}`,
  );

  const treeEntries: Array<Record<string, unknown>> = [];
  for (const file of files) {
    if (file.delete) {
      treeEntries.push({ path: file.path, mode: "100644", type: "blob", sha: null });
      continue;
    }
    const blob = await gh<{ sha: string }>(
      conn.token!,
      `/repos/${encodeURIComponent(repository.owner)}/${encodeURIComponent(repository.repo)}/git/blobs`,
      { method: "POST", body: { content: file.content ?? "", encoding: "utf-8" } },
    );
    treeEntries.push({ path: file.path, mode: "100644", type: "blob", sha: blob.sha });
  }

  const tree = await gh<{ sha: string }>(
    conn.token!,
    `/repos/${encodeURIComponent(repository.owner)}/${encodeURIComponent(repository.repo)}/git/trees`,
    { method: "POST", body: { base_tree: parentCommit.tree.sha, tree: treeEntries } },
  );
  const commit = await gh<{ sha: string; html_url: string }>(
    conn.token!,
    `/repos/${encodeURIComponent(repository.owner)}/${encodeURIComponent(repository.repo)}/git/commits`,
    { method: "POST", body: { message, tree: tree.sha, parents: [parentSha] } },
  );
  await gh(
    conn.token!,
    `/repos/${encodeURIComponent(repository.owner)}/${encodeURIComponent(repository.repo)}/git/refs/heads/${encodePath(branch)}`,
    { method: "PATCH", body: { sha: commit.sha, force: false } },
  );

  const summary = `${repository.full}: ${files.length} ta fayl ${branch} branchiga commit qilindi (${commit.sha.slice(0, 7)}).`;
  await audit(ctx, "github_commit_files", repository.full, { branch, message, files }, "success", summary);
  return {
    ok: true,
    text: `${summary}\n${commit.html_url}`,
    data: {
      repository: repository.full,
      branch,
      commitSha: commit.sha,
      url: commit.html_url,
      files: files.map((file) => ({ path: file.path, delete: file.delete })),
    },
  };
}

async function createPullRequest(args: Record<string, unknown>, ctx: GithubAgentContext): Promise<GithubToolOutcome> {
  const repository = splitRepository(args.repository);
  const head = String(args.head ?? "").trim();
  const title = String(args.title ?? "").trim().slice(0, 240);
  const body = String(args.body ?? "").slice(0, 30_000);
  if (!repository || !head || !title) return fail("repository, head va title talab qilinadi.");
  const conn = await connection(ctx);
  const info = await repoInfo(conn.token!, repository);
  const base = String(args.base ?? info.default_branch).trim() || info.default_branch;
  if (head === base) return fail("PR head va base bir xil bo'lishi mumkin emas.");
  const created = await gh<{
    number: number;
    html_url: string;
    state: string;
    draft?: boolean;
    head?: { sha?: string; ref?: string };
    base?: { ref?: string };
  }>(conn.token!, `/repos/${encodeURIComponent(repository.owner)}/${encodeURIComponent(repository.repo)}/pulls`, {
    method: "POST",
    body: { title, head, base, body, draft: Boolean(args.draft) },
  });
  const summary = `${repository.full}: PR #${created.number} ochildi — ${title}`;
  await audit(ctx, "github_create_pull_request", repository.full, { head, base, title, draft: Boolean(args.draft) }, "success", summary);
  return {
    ok: true,
    text: `${summary}\n${created.html_url}`,
    data: {
      repository: repository.full,
      number: created.number,
      url: created.html_url,
      state: created.state,
      draft: Boolean(created.draft),
      head: created.head?.ref ?? head,
      headSha: created.head?.sha ?? null,
      base: created.base?.ref ?? base,
    },
  };
}

async function resolveRefSha(token: string, repository: { owner: string; repo: string }, ref: string): Promise<string> {
  if (/^[a-f0-9]{40}$/i.test(ref)) return ref;
  try {
    const branch = await gh<{ object: { sha: string } }>(
      token,
      `/repos/${encodeURIComponent(repository.owner)}/${encodeURIComponent(repository.repo)}/git/ref/heads/${encodePath(ref)}`,
    );
    return branch.object.sha;
  } catch {
    const commit = await gh<{ sha: string }>(
      token,
      `/repos/${encodeURIComponent(repository.owner)}/${encodeURIComponent(repository.repo)}/commits/${encodeURIComponent(ref)}`,
    );
    return commit.sha;
  }
}

async function getCommitChecks(args: Record<string, unknown>, ctx: GithubAgentContext): Promise<GithubToolOutcome> {
  const repository = splitRepository(args.repository);
  const ref = String(args.ref ?? "").trim();
  if (!repository || !ref) return fail("repository va ref talab qilinadi.");
  const conn = await connection(ctx);
  const sha = await resolveRefSha(conn.token!, repository, ref);
  const [status, checks] = await Promise.all([
    gh<{
      state: string;
      statuses?: Array<{ context: string; state: string; description?: string | null; target_url?: string | null }>;
    }>(conn.token!, `/repos/${encodeURIComponent(repository.owner)}/${encodeURIComponent(repository.repo)}/commits/${sha}/status`),
    gh<{
      check_runs?: Array<{
        name: string;
        status: string;
        conclusion?: string | null;
        html_url?: string | null;
        app?: { name?: string | null } | null;
      }>;
    }>(
      conn.token!,
      `/repos/${encodeURIComponent(repository.owner)}/${encodeURIComponent(repository.repo)}/commits/${sha}/check-runs?per_page=50`,
      { accept: "application/vnd.github+json" },
    ),
  ]);

  const statuses = (status.statuses ?? []).map((item) => ({
    name: item.context,
    status: item.state,
    description: item.description ?? null,
    url: item.target_url ?? null,
  }));
  const checkRuns = (checks.check_runs ?? []).map((item) => ({
    name: item.name,
    provider: item.app?.name ?? null,
    status: item.status,
    conclusion: item.conclusion ?? null,
    url: item.html_url ?? null,
  }));
  const lines = [
    `Commit: ${sha}`,
    `Combined status: ${status.state}`,
    ...statuses.map((item) => `status ${item.name}: ${item.status}${item.description ? ` — ${item.description}` : ""}`),
    ...checkRuns.map((item) => `check ${item.name}: ${item.status}${item.conclusion ? `/${item.conclusion}` : ""}${item.provider ? ` (${item.provider})` : ""}`),
  ];
  return {
    ok: true,
    text: lines.join("\n"),
    data: { repository: repository.full, ref, sha, combinedState: status.state, statuses, checkRuns },
  };
}

const EXECUTORS: Record<string, (args: Record<string, unknown>, ctx: GithubAgentContext) => Promise<GithubToolOutcome>> = {
  github_list_repositories: listRepositories,
  github_read_repository_tree: readTree,
  github_read_file: readFile,
  github_search_code: searchCode,
  github_create_branch: createBranch,
  github_commit_files: commitFiles,
  github_create_pull_request: createPullRequest,
  github_get_commit_checks: getCommitChecks,
};

export function enableGithubTools(enabled: Set<string>, requestedGroups: string[]) {
  if (!requestedGroups.includes("code") && !requestedGroups.includes("connectors")) return;
  for (const name of GITHUB_TOOL_NAMES) enabled.add(name);
}

export function githubSpecsFor(enabled: Set<string>): GithubToolSpec[] {
  return GITHUB_TOOL_NAMES.filter((name) => enabled.has(name)).map((name) => GITHUB_TOOL_SPECS[name]);
}

export async function executeGithubTool(
  name: string,
  args: Record<string, unknown>,
  ctx: GithubAgentContext,
): Promise<GithubToolOutcome | null> {
  const executor = EXECUTORS[name];
  if (!executor) return null;
  if (!ctx.enabled.has(name)) return fail(`"${name}" GitHub vositasi bu suhbatda o'chirilgan.`);
  try {
    return await executor(args, ctx);
  } catch (error) {
    const text = error instanceof Error ? error.message : String(error);
    const repository = splitRepository(args.repository)?.full ?? "github";
    if (name === "github_create_branch" || name === "github_commit_files" || name === "github_create_pull_request") {
      await audit(ctx, name, repository, args, "error", text);
    }
    return fail(text);
  }
}

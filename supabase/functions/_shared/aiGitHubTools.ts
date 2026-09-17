// Alsamos AI — native GitHub coding-agent tools.
//
// This module intentionally keeps repository contents on GitHub. Supabase only
// stores the user's GitHub bearer token and orchestrates API calls, so coding
// tasks do not require a local checkout or a large Edge Function filesystem.

import type { ToolContext, ToolOutcome, ToolSpec } from "./aiTools.ts";

const API_BASE = "https://api.github.com";
const USER_AGENT = "Alsamos-AI-Coding-Agent";
const MAX_WRITE_BYTES = 768 * 1024;
const MAX_READ_CHARS = 20_000;

const str = (description: string) => ({ type: "string", description });
const num = (description: string) => ({ type: "number", description });

export const GITHUB_TOOL_NAMES = [
  "github_list_repositories",
  "github_read_file",
  "github_list_directory",
  "github_search_code",
  "github_create_branch",
  "github_write_file",
  "github_apply_patch",
  "github_delete_file",
  "github_open_pull_request",
  "github_get_pull_request",
  "github_compare",
  "github_ci_status",
] as const;

export const GITHUB_TOOL_SPECS: Record<string, ToolSpec> = {
  github_list_repositories: {
    type: "function",
    function: {
      name: "github_list_repositories",
      description:
        "List repositories available through the signed-in user's native GitHub connection. Use this before guessing a repository name.",
      parameters: {
        type: "object",
        properties: { limit: num("Maximum repositories to return (1-50, default 20).") },
        additionalProperties: false,
      },
    },
  },
  github_read_file: {
    type: "function",
    function: {
      name: "github_read_file",
      description:
        "Read a UTF-8 text file from a GitHub repository. Supports line ranges so large files can be inspected without loading the whole file into the model context.",
      parameters: {
        type: "object",
        properties: {
          repository: str("Repository in owner/name form."),
          path: str("Repository-relative file path."),
          ref: str("Optional branch, tag or commit. Defaults to the repository default branch."),
          start_line: num("Optional 1-based first line."),
          end_line: num("Optional 1-based last line."),
        },
        required: ["repository", "path"],
        additionalProperties: false,
      },
    },
  },
  github_list_directory: {
    type: "function",
    function: {
      name: "github_list_directory",
      description:
        "List files and directories at a GitHub repository path. Use it to inspect project structure before editing.",
      parameters: {
        type: "object",
        properties: {
          repository: str("Repository in owner/name form."),
          path: str("Directory path. Empty string means repository root."),
          ref: str("Optional branch, tag or commit."),
        },
        required: ["repository"],
        additionalProperties: false,
      },
    },
  },
  github_search_code: {
    type: "function",
    function: {
      name: "github_search_code",
      description:
        "Search code paths inside one GitHub repository. Read matching files afterwards for exact context.",
      parameters: {
        type: "object",
        properties: {
          repository: str("Repository in owner/name form."),
          query: str("Code search terms, function names, strings or filenames."),
          limit: num("Maximum matches (1-30, default 10)."),
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
        "Create a working branch for an authorized coding task. Never edit the default branch directly; create a branch first and open a pull request when finished.",
      parameters: {
        type: "object",
        properties: {
          repository: str("Repository in owner/name form."),
          branch: str("New working branch name, e.g. ai/fix-login."),
          from_ref: str("Optional source branch/tag/commit. Defaults to the repository default branch."),
        },
        required: ["repository", "branch"],
        additionalProperties: false,
      },
    },
  },
  github_write_file: {
    type: "function",
    function: {
      name: "github_write_file",
      description:
        "Create or fully replace a UTF-8 text file on a NON-DEFAULT branch. Use for new files or when a complete rewrite is intentional. For small edits to an existing file prefer github_apply_patch.",
      parameters: {
        type: "object",
        properties: {
          repository: str("Repository in owner/name form."),
          path: str("Repository-relative file path."),
          branch: str("Existing non-default working branch."),
          content: str("Complete new UTF-8 file contents."),
          message: str("Commit message."),
        },
        required: ["repository", "path", "branch", "content", "message"],
        additionalProperties: false,
      },
    },
  },
  github_apply_patch: {
    type: "function",
    function: {
      name: "github_apply_patch",
      description:
        "Safely edit an existing UTF-8 file on a NON-DEFAULT branch using exact text replacements. The full file stays server-side, so this is preferred for large files and low-memory agent operation.",
      parameters: {
        type: "object",
        properties: {
          repository: str("Repository in owner/name form."),
          path: str("Repository-relative file path."),
          branch: str("Existing non-default working branch."),
          message: str("Commit message."),
          replacements: {
            type: "array",
            minItems: 1,
            maxItems: 20,
            items: {
              type: "object",
              properties: {
                old_text: str("Exact existing text to replace."),
                new_text: str("Replacement text."),
                replace_all: {
                  type: "boolean",
                  description:
                    "Replace every occurrence. Default false; when false the old text must occur exactly once.",
                },
              },
              required: ["old_text", "new_text"],
              additionalProperties: false,
            },
          },
        },
        required: ["repository", "path", "branch", "message", "replacements"],
        additionalProperties: false,
      },
    },
  },
  github_delete_file: {
    type: "function",
    function: {
      name: "github_delete_file",
      description:
        "Delete a file on a NON-DEFAULT working branch. Use only when the user's requested code change actually requires deleting that file.",
      parameters: {
        type: "object",
        properties: {
          repository: str("Repository in owner/name form."),
          path: str("Repository-relative file path."),
          branch: str("Existing non-default working branch."),
          message: str("Commit message."),
        },
        required: ["repository", "path", "branch", "message"],
        additionalProperties: false,
      },
    },
  },
  github_open_pull_request: {
    type: "function",
    function: {
      name: "github_open_pull_request",
      description:
        "Open a pull request from the AI working branch after repository edits. Existing GitHub Actions can then validate the code without a Supabase sandbox.",
      parameters: {
        type: "object",
        properties: {
          repository: str("Repository in owner/name form."),
          head: str("Working branch containing the changes."),
          base: str("Optional target branch. Defaults to the repository default branch."),
          title: str("Pull request title."),
          body: str("Pull request summary, tests and important notes."),
          draft: { type: "boolean", description: "Create as draft, default false." },
        },
        required: ["repository", "head", "title"],
        additionalProperties: false,
      },
    },
  },
  github_get_pull_request: {
    type: "function",
    function: {
      name: "github_get_pull_request",
      description: "Read pull-request metadata and current mergeability/status.",
      parameters: {
        type: "object",
        properties: {
          repository: str("Repository in owner/name form."),
          number: num("Pull request number."),
        },
        required: ["repository", "number"],
        additionalProperties: false,
      },
    },
  },
  github_compare: {
    type: "function",
    function: {
      name: "github_compare",
      description:
        "Inspect the diff summary between two refs before opening or finalizing a pull request.",
      parameters: {
        type: "object",
        properties: {
          repository: str("Repository in owner/name form."),
          base: str("Base branch/tag/commit."),
          head: str("Head branch/tag/commit."),
        },
        required: ["repository", "base", "head"],
        additionalProperties: false,
      },
    },
  },
  github_ci_status: {
    type: "function",
    function: {
      name: "github_ci_status",
      description:
        "Check GitHub Actions/check-run status for a branch or commit. Use after opening a PR when no external sandbox is configured.",
      parameters: {
        type: "object",
        properties: {
          repository: str("Repository in owner/name form."),
          ref: str("Branch, tag or commit SHA to inspect."),
        },
        required: ["repository", "ref"],
        additionalProperties: false,
      },
    },
  },
};

type GitHubConnection = { token: string; login: string | null };
type GhResponse = { ok: boolean; status: number; data: any };

const connectionCache = new WeakMap<object, Promise<GitHubConnection | null>>();
const repoMetaCache = new WeakMap<object, Map<string, Promise<any>>>();

function fail(text: string): ToolOutcome {
  return { ok: false, text };
}

function clamp(value: unknown, min: number, max: number, fallback: number): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n)));
}

function encodePath(path: string): string {
  return path
    .split("/")
    .filter((part) => part.length > 0)
    .map(encodeURIComponent)
    .join("/");
}

function repoApiPath(repository: string): string {
  const parts = repository.trim().split("/");
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    throw new Error("repository owner/name formatida bo'lishi kerak.");
  }
  return `/repos/${encodeURIComponent(parts[0])}/${encodeURIComponent(parts[1])}`;
}

function utf8ToBase64(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

function base64ToUtf8(value: string): string {
  const binary = atob(value.replace(/\s/g, ""));
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

async function gh(token: string, path: string, init: { method?: string; body?: unknown } = {}): Promise<GhResponse> {
  const response = await fetch(API_BASE + path, {
    method: init.method ?? "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": USER_AGENT,
      "Content-Type": "application/json",
    },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
  const raw = await response.text();
  let data: any = null;
  try {
    data = raw ? JSON.parse(raw) : null;
  } catch (_) {
    data = raw;
  }
  return { ok: response.ok, status: response.status, data };
}

function githubError(response: GhResponse, fallback: string): ToolOutcome {
  const message =
    typeof response.data?.message === "string"
      ? response.data.message
      : typeof response.data === "string"
        ? response.data.slice(0, 500)
        : fallback;
  return fail(`${fallback} (GitHub HTTP ${response.status}): ${message}`);
}

async function getConnection(ctx: ToolContext): Promise<GitHubConnection | null> {
  if (!ctx.userId) return null;
  let cached = connectionCache.get(ctx as object);
  if (!cached) {
    cached = (async () => {
      const { data, error } = await ctx.admin
        .from("ai_github_connections")
        .select("token, login")
        .eq("user_id", ctx.userId!)
        .maybeSingle();
      if (error) throw error;
      const token = typeof data?.token === "string" ? data.token.trim() : "";
      return token ? { token, login: data?.login ?? null } : null;
    })();
    connectionCache.set(ctx as object, cached);
  }
  return await cached;
}

async function getRepoMeta(ctx: ToolContext, token: string, repository: string): Promise<any> {
  let map = repoMetaCache.get(ctx as object);
  if (!map) {
    map = new Map();
    repoMetaCache.set(ctx as object, map);
  }
  let cached = map.get(repository);
  if (!cached) {
    cached = (async () => {
      const response = await gh(token, repoApiPath(repository));
      if (!response.ok) throw new Error(`Repository ochilmadi (GitHub HTTP ${response.status}).`);
      return response.data;
    })();
    map.set(repository, cached);
  }
  return await cached;
}

async function requireConnection(ctx: ToolContext): Promise<GitHubConnection | ToolOutcome> {
  if (!ctx.userId) return fail("GitHub bilan ishlash uchun tizimga kirish kerak.");
  try {
    const connection = await getConnection(ctx);
    if (!connection) {
      return fail(
        "GitHub ulanmagan. AI sahifasidagi GitHub ulanishidan repository Contents va Pull requests write huquqiga ega tokenni ulang.",
      );
    }
    return connection;
  } catch (error) {
    return fail(error instanceof Error ? error.message : String(error));
  }
}

function isOutcome(value: GitHubConnection | ToolOutcome): value is ToolOutcome {
  return "ok" in value;
}

async function assertWorkingBranch(
  ctx: ToolContext,
  token: string,
  repository: string,
  branch: string,
): Promise<string> {
  const normalized = branch.trim();
  if (!normalized) throw new Error("branch talab qilinadi.");
  const repo = await getRepoMeta(ctx, token, repository);
  const defaultBranch = String(repo.default_branch ?? "main");
  if (normalized === defaultBranch) {
    throw new Error(
      `Xavfsizlik sabab default branch (${defaultBranch}) ga to'g'ridan-to'g'ri yozilmaydi. Avval github_create_branch ishlating.`,
    );
  }
  return defaultBranch;
}

async function listRepositories(args: Record<string, unknown>, ctx: ToolContext): Promise<ToolOutcome> {
  const connection = await requireConnection(ctx);
  if (isOutcome(connection)) return connection;
  const limit = clamp(args.limit, 1, 50, 20);
  const response = await gh(
    connection.token,
    `/user/repos?per_page=${limit}&sort=updated&affiliation=owner,collaborator,organization_member`,
  );
  if (!response.ok) return githubError(response, "Repositorylar olinmadi");
  const repos = (Array.isArray(response.data) ? response.data : []).map((repo: any) => ({
    full_name: repo.full_name,
    private: repo.private,
    default_branch: repo.default_branch,
    permissions: repo.permissions,
    updated_at: repo.updated_at,
    html_url: repo.html_url,
  }));
  return { ok: true, text: JSON.stringify(repos), data: { repositories: repos } };
}

async function readFile(args: Record<string, unknown>, ctx: ToolContext): Promise<ToolOutcome> {
  const connection = await requireConnection(ctx);
  if (isOutcome(connection)) return connection;
  const repository = String(args.repository ?? "").trim();
  const path = String(args.path ?? "").trim().replace(/^\/+/, "");
  if (!repository || !path) return fail("repository va path talab qilinadi.");

  const repo = await getRepoMeta(ctx, connection.token, repository);
  const ref = String(args.ref ?? repo.default_branch ?? "main").trim();
  const response = await gh(
    connection.token,
    `${repoApiPath(repository)}/contents/${encodePath(path)}?ref=${encodeURIComponent(ref)}`,
  );
  if (!response.ok) return githubError(response, "Fayl ochilmadi");
  if (Array.isArray(response.data)) return fail("Bu path papka. github_list_directory ishlating.");
  if (response.data?.encoding !== "base64" || typeof response.data?.content !== "string") {
    return fail("Fayl UTF-8/base64 matn sifatida o'qilmadi.");
  }

  const content = base64ToUtf8(response.data.content);
  const lines = content.split("\n");
  const requestedStart = clamp(args.start_line, 1, Math.max(lines.length, 1), 1);
  const defaultEnd = args.start_line || args.end_line ? requestedStart + 399 : lines.length;
  const requestedEnd = clamp(args.end_line, requestedStart, Math.max(lines.length, requestedStart), defaultEnd);
  let selected = lines.slice(requestedStart - 1, requestedEnd).join("\n");
  let truncated = false;
  if (selected.length > MAX_READ_CHARS) {
    selected = selected.slice(0, MAX_READ_CHARS);
    truncated = true;
  }

  const header = [
    `repository: ${repository}`,
    `ref: ${ref}`,
    `path: ${path}`,
    `sha: ${response.data.sha ?? ""}`,
    `lines: ${requestedStart}-${requestedEnd}/${lines.length}`,
    truncated ? `truncated: true (max ${MAX_READ_CHARS} chars)` : "truncated: false",
  ].join("\n");
  return {
    ok: true,
    text: `${header}\n\n${selected}`,
    data: {
      repository,
      ref,
      path,
      sha: response.data.sha,
      size: response.data.size,
      startLine: requestedStart,
      endLine: requestedEnd,
      totalLines: lines.length,
      truncated,
    },
  };
}

async function listDirectory(args: Record<string, unknown>, ctx: ToolContext): Promise<ToolOutcome> {
  const connection = await requireConnection(ctx);
  if (isOutcome(connection)) return connection;
  const repository = String(args.repository ?? "").trim();
  const path = String(args.path ?? "").trim().replace(/^\/+|\/+$/g, "");
  if (!repository) return fail("repository talab qilinadi.");
  const repo = await getRepoMeta(ctx, connection.token, repository);
  const ref = String(args.ref ?? repo.default_branch ?? "main").trim();
  const suffix = path ? `/contents/${encodePath(path)}` : "/contents";
  const response = await gh(
    connection.token,
    `${repoApiPath(repository)}${suffix}?ref=${encodeURIComponent(ref)}`,
  );
  if (!response.ok) return githubError(response, "Papka ochilmadi");
  if (!Array.isArray(response.data)) return fail("Bu path papka emas. github_read_file ishlating.");
  const entries = response.data.slice(0, 200).map((item: any) => ({
    name: item.name,
    path: item.path,
    type: item.type,
    size: item.size,
    sha: item.sha,
  }));
  return { ok: true, text: JSON.stringify(entries), data: { repository, ref, path, entries } };
}

async function searchCode(args: Record<string, unknown>, ctx: ToolContext): Promise<ToolOutcome> {
  const connection = await requireConnection(ctx);
  if (isOutcome(connection)) return connection;
  const repository = String(args.repository ?? "").trim();
  const query = String(args.query ?? "").trim();
  const limit = clamp(args.limit, 1, 30, 10);
  if (!repository || !query) return fail("repository va query talab qilinadi.");
  repoApiPath(repository); // format validation
  const q = `${query} repo:${repository}`;
  const response = await gh(connection.token, `/search/code?per_page=${limit}&q=${encodeURIComponent(q)}`);
  if (!response.ok) return githubError(response, "Kod qidiruvi ishlamadi");
  const items = (response.data?.items ?? []).map((item: any) => ({
    name: item.name,
    path: item.path,
    sha: item.sha,
    html_url: item.html_url,
  }));
  return { ok: true, text: JSON.stringify(items), data: { matches: items } };
}

async function createBranch(args: Record<string, unknown>, ctx: ToolContext): Promise<ToolOutcome> {
  const connection = await requireConnection(ctx);
  if (isOutcome(connection)) return connection;
  const repository = String(args.repository ?? "").trim();
  const branch = String(args.branch ?? "").trim().replace(/^refs\/heads\//, "");
  if (!repository || !branch) return fail("repository va branch talab qilinadi.");
  const repo = await getRepoMeta(ctx, connection.token, repository);
  const defaultBranch = String(repo.default_branch ?? "main");
  if (branch === defaultBranch) return fail("Default branch yangi working branch sifatida ishlatilmaydi.");
  const fromRef = String(args.from_ref ?? defaultBranch).trim();
  const baseCommit = await gh(
    connection.token,
    `${repoApiPath(repository)}/commits/${encodeURIComponent(fromRef)}`,
  );
  if (!baseCommit.ok) return githubError(baseCommit, "Boshlang'ich ref topilmadi");
  const response = await gh(connection.token, `${repoApiPath(repository)}/git/refs`, {
    method: "POST",
    body: { ref: `refs/heads/${branch}`, sha: baseCommit.data.sha },
  });
  if (!response.ok) {
    if (response.status === 422) {
      const existing = await gh(
        connection.token,
        `${repoApiPath(repository)}/branches/${encodePath(branch)}`,
      );
      if (existing.ok) {
        return {
          ok: true,
          text: `Branch allaqachon mavjud: ${branch} (${existing.data?.commit?.sha ?? ""})`,
          data: { branch, sha: existing.data?.commit?.sha, existed: true },
        };
      }
    }
    return githubError(response, "Branch yaratilmadi");
  }
  return {
    ok: true,
    text: `Branch yaratildi: ${branch} from ${fromRef} (${baseCommit.data.sha})`,
    data: { branch, sha: baseCommit.data.sha, fromRef, existed: false },
  };
}

async function writeFile(args: Record<string, unknown>, ctx: ToolContext): Promise<ToolOutcome> {
  const connection = await requireConnection(ctx);
  if (isOutcome(connection)) return connection;
  const repository = String(args.repository ?? "").trim();
  const path = String(args.path ?? "").trim().replace(/^\/+/, "");
  const branch = String(args.branch ?? "").trim();
  const content = String(args.content ?? "");
  const message = String(args.message ?? "").trim();
  if (!repository || !path || !branch || !message) {
    return fail("repository, path, branch va message talab qilinadi.");
  }
  const bytes = new TextEncoder().encode(content).length;
  if (bytes > MAX_WRITE_BYTES) return fail(`Fayl juda katta (${bytes} bytes). Limit ${MAX_WRITE_BYTES}.`);
  try {
    await assertWorkingBranch(ctx, connection.token, repository, branch);
  } catch (error) {
    return fail(error instanceof Error ? error.message : String(error));
  }

  const filePath = `${repoApiPath(repository)}/contents/${encodePath(path)}`;
  const current = await gh(connection.token, `${filePath}?ref=${encodeURIComponent(branch)}`);
  if (!current.ok && current.status !== 404) return githubError(current, "Joriy fayl holati olinmadi");
  if (Array.isArray(current.data)) return fail("path fayl emas.");

  const body: Record<string, unknown> = {
    message,
    content: utf8ToBase64(content),
    branch,
  };
  if (current.ok && current.data?.sha) body.sha = current.data.sha;
  const response = await gh(connection.token, filePath, { method: "PUT", body });
  if (!response.ok) return githubError(response, "Fayl yozilmadi");
  return {
    ok: true,
    text: `${current.ok ? "Fayl yangilandi" : "Fayl yaratildi"}: ${path}\ncommit: ${response.data?.commit?.sha ?? ""}`,
    data: {
      repository,
      branch,
      path,
      created: !current.ok,
      commitSha: response.data?.commit?.sha,
      contentSha: response.data?.content?.sha,
    },
  };
}

function occurrenceCount(source: string, needle: string): number {
  if (!needle) return 0;
  let count = 0;
  let offset = 0;
  while (true) {
    const index = source.indexOf(needle, offset);
    if (index === -1) break;
    count += 1;
    offset = index + needle.length;
  }
  return count;
}

async function applyPatch(args: Record<string, unknown>, ctx: ToolContext): Promise<ToolOutcome> {
  const connection = await requireConnection(ctx);
  if (isOutcome(connection)) return connection;
  const repository = String(args.repository ?? "").trim();
  const path = String(args.path ?? "").trim().replace(/^\/+/, "");
  const branch = String(args.branch ?? "").trim();
  const message = String(args.message ?? "").trim();
  const replacements = Array.isArray(args.replacements) ? args.replacements : [];
  if (!repository || !path || !branch || !message || replacements.length === 0) {
    return fail("repository, path, branch, message va replacements talab qilinadi.");
  }
  if (replacements.length > 20) return fail("Bir chaqiruvda ko'pi bilan 20 replacement mumkin.");
  try {
    await assertWorkingBranch(ctx, connection.token, repository, branch);
  } catch (error) {
    return fail(error instanceof Error ? error.message : String(error));
  }

  const filePath = `${repoApiPath(repository)}/contents/${encodePath(path)}`;
  const current = await gh(connection.token, `${filePath}?ref=${encodeURIComponent(branch)}`);
  if (!current.ok) return githubError(current, "Patch uchun fayl ochilmadi");
  if (current.data?.encoding !== "base64" || typeof current.data?.content !== "string") {
    return fail("Patch faqat UTF-8 matn faylida ishlaydi.");
  }
  let content = base64ToUtf8(current.data.content);
  const applied: Array<{ index: number; occurrences: number; replaceAll: boolean }> = [];

  for (let i = 0; i < replacements.length; i += 1) {
    const replacement = (replacements[i] ?? {}) as Record<string, unknown>;
    const oldText = String(replacement.old_text ?? "");
    const newText = String(replacement.new_text ?? "");
    const replaceAll = replacement.replace_all === true;
    if (!oldText) return fail(`Replacement ${i + 1}: old_text bo'sh bo'lmasligi kerak.`);
    const occurrences = occurrenceCount(content, oldText);
    if (occurrences === 0) {
      return fail(`Replacement ${i + 1}: old_text topilmadi. Faylni qayta o'qing va exact text ishlating.`);
    }
    if (!replaceAll && occurrences !== 1) {
      return fail(
        `Replacement ${i + 1}: old_text ${occurrences} marta uchradi. Unikalroq matn bering yoki replace_all=true ishlating.`,
      );
    }
    content = replaceAll ? content.split(oldText).join(newText) : content.replace(oldText, newText);
    applied.push({ index: i + 1, occurrences, replaceAll });
  }

  const bytes = new TextEncoder().encode(content).length;
  if (bytes > MAX_WRITE_BYTES) return fail(`Patchdan keyin fayl ${bytes} bytes bo'ldi; limit ${MAX_WRITE_BYTES}.`);
  const response = await gh(connection.token, filePath, {
    method: "PUT",
    body: {
      message,
      content: utf8ToBase64(content),
      branch,
      sha: current.data.sha,
    },
  });
  if (!response.ok) return githubError(response, "Patch commit qilinmadi");
  return {
    ok: true,
    text: `Patch qo'llandi: ${path}\ncommit: ${response.data?.commit?.sha ?? ""}\n${JSON.stringify(applied)}`,
    data: {
      repository,
      branch,
      path,
      commitSha: response.data?.commit?.sha,
      contentSha: response.data?.content?.sha,
      applied,
    },
  };
}

async function deleteFile(args: Record<string, unknown>, ctx: ToolContext): Promise<ToolOutcome> {
  const connection = await requireConnection(ctx);
  if (isOutcome(connection)) return connection;
  const repository = String(args.repository ?? "").trim();
  const path = String(args.path ?? "").trim().replace(/^\/+/, "");
  const branch = String(args.branch ?? "").trim();
  const message = String(args.message ?? "").trim();
  if (!repository || !path || !branch || !message) {
    return fail("repository, path, branch va message talab qilinadi.");
  }
  try {
    await assertWorkingBranch(ctx, connection.token, repository, branch);
  } catch (error) {
    return fail(error instanceof Error ? error.message : String(error));
  }
  const filePath = `${repoApiPath(repository)}/contents/${encodePath(path)}`;
  const current = await gh(connection.token, `${filePath}?ref=${encodeURIComponent(branch)}`);
  if (!current.ok) return githubError(current, "O'chiriladigan fayl topilmadi");
  const response = await gh(connection.token, filePath, {
    method: "DELETE",
    body: { message, sha: current.data?.sha, branch },
  });
  if (!response.ok) return githubError(response, "Fayl o'chirilmadi");
  return {
    ok: true,
    text: `Fayl o'chirildi: ${path}\ncommit: ${response.data?.commit?.sha ?? ""}`,
    data: { repository, branch, path, commitSha: response.data?.commit?.sha },
  };
}

async function openPullRequest(args: Record<string, unknown>, ctx: ToolContext): Promise<ToolOutcome> {
  const connection = await requireConnection(ctx);
  if (isOutcome(connection)) return connection;
  const repository = String(args.repository ?? "").trim();
  const head = String(args.head ?? "").trim();
  const title = String(args.title ?? "").trim();
  if (!repository || !head || !title) return fail("repository, head va title talab qilinadi.");
  const repo = await getRepoMeta(ctx, connection.token, repository);
  const base = String(args.base ?? repo.default_branch ?? "main").trim();
  if (head === base) return fail("PR head va base bir xil bo'la olmaydi.");
  const response = await gh(connection.token, `${repoApiPath(repository)}/pulls`, {
    method: "POST",
    body: {
      title,
      head,
      base,
      body: String(args.body ?? ""),
      draft: args.draft === true,
    },
  });
  if (!response.ok) return githubError(response, "Pull request ochilmadi");
  return {
    ok: true,
    text: `PR #${response.data?.number} ochildi: ${response.data?.html_url}`,
    data: {
      number: response.data?.number,
      url: response.data?.html_url,
      head: response.data?.head?.ref,
      base: response.data?.base?.ref,
      state: response.data?.state,
      draft: response.data?.draft,
    },
  };
}

async function getPullRequest(args: Record<string, unknown>, ctx: ToolContext): Promise<ToolOutcome> {
  const connection = await requireConnection(ctx);
  if (isOutcome(connection)) return connection;
  const repository = String(args.repository ?? "").trim();
  const number = clamp(args.number, 1, Number.MAX_SAFE_INTEGER, 0);
  if (!repository || !number) return fail("repository va number talab qilinadi.");
  const response = await gh(connection.token, `${repoApiPath(repository)}/pulls/${number}`);
  if (!response.ok) return githubError(response, "Pull request olinmadi");
  const pr = {
    number: response.data?.number,
    title: response.data?.title,
    state: response.data?.state,
    draft: response.data?.draft,
    mergeable: response.data?.mergeable,
    mergeable_state: response.data?.mergeable_state,
    head: response.data?.head?.ref,
    head_sha: response.data?.head?.sha,
    base: response.data?.base?.ref,
    changed_files: response.data?.changed_files,
    additions: response.data?.additions,
    deletions: response.data?.deletions,
    html_url: response.data?.html_url,
  };
  return { ok: true, text: JSON.stringify(pr), data: { pullRequest: pr } };
}

async function compare(args: Record<string, unknown>, ctx: ToolContext): Promise<ToolOutcome> {
  const connection = await requireConnection(ctx);
  if (isOutcome(connection)) return connection;
  const repository = String(args.repository ?? "").trim();
  const base = String(args.base ?? "").trim();
  const head = String(args.head ?? "").trim();
  if (!repository || !base || !head) return fail("repository, base va head talab qilinadi.");
  const response = await gh(
    connection.token,
    `${repoApiPath(repository)}/compare/${encodeURIComponent(base)}...${encodeURIComponent(head)}`,
  );
  if (!response.ok) return githubError(response, "Compare ishlamadi");
  const files = (response.data?.files ?? []).slice(0, 100).map((file: any) => ({
    filename: file.filename,
    status: file.status,
    additions: file.additions,
    deletions: file.deletions,
    changes: file.changes,
    patch: typeof file.patch === "string" ? file.patch.slice(0, 2500) : undefined,
  }));
  const summary = {
    status: response.data?.status,
    ahead_by: response.data?.ahead_by,
    behind_by: response.data?.behind_by,
    total_commits: response.data?.total_commits,
    files,
  };
  return { ok: true, text: JSON.stringify(summary).slice(0, 20_000), data: { compare: summary } };
}

async function ciStatus(args: Record<string, unknown>, ctx: ToolContext): Promise<ToolOutcome> {
  const connection = await requireConnection(ctx);
  if (isOutcome(connection)) return connection;
  const repository = String(args.repository ?? "").trim();
  const ref = String(args.ref ?? "").trim();
  if (!repository || !ref) return fail("repository va ref talab qilinadi.");

  const commit = await gh(
    connection.token,
    `${repoApiPath(repository)}/commits/${encodeURIComponent(ref)}`,
  );
  if (!commit.ok) return githubError(commit, "CI uchun commit topilmadi");
  const sha = String(commit.data?.sha ?? "");

  const [checks, statuses, runs] = await Promise.all([
    gh(connection.token, `${repoApiPath(repository)}/commits/${sha}/check-runs?per_page=50`),
    gh(connection.token, `${repoApiPath(repository)}/commits/${sha}/status`),
    gh(connection.token, `${repoApiPath(repository)}/actions/runs?head_sha=${encodeURIComponent(sha)}&per_page=20`),
  ]);

  const checkRuns = checks.ok
    ? (checks.data?.check_runs ?? []).map((run: any) => ({
        name: run.name,
        status: run.status,
        conclusion: run.conclusion,
        url: run.html_url,
      }))
    : [];
  const workflowRuns = runs.ok
    ? (runs.data?.workflow_runs ?? []).map((run: any) => ({
        name: run.name,
        event: run.event,
        status: run.status,
        conclusion: run.conclusion,
        url: run.html_url,
      }))
    : [];
  const combinedState = statuses.ok ? statuses.data?.state ?? "unknown" : "unknown";
  const all = [...checkRuns, ...workflowRuns];
  const pending = all.filter((run: any) => !run.conclusion && run.status !== "completed").length;
  const failed = all.filter((run: any) =>
    ["failure", "cancelled", "timed_out", "action_required", "startup_failure"].includes(String(run.conclusion)),
  ).length;
  const passed = all.filter((run: any) => run.conclusion === "success").length;

  const summary = {
    ref,
    sha,
    combined_state: combinedState,
    checks: checkRuns,
    workflow_runs: workflowRuns,
    counts: { passed, failed, pending, total: all.length },
  };
  const text = all.length
    ? JSON.stringify(summary).slice(0, 20_000)
    : `Commit ${sha} topildi, lekin hali CI/check run ko'rinmadi. PR workflow ishga tushishi uchun biroz vaqt kerak bo'lishi mumkin.`;
  return { ok: failed === 0, text, data: { ci: summary } };
}

const EXECUTORS: Record<
  string,
  (args: Record<string, unknown>, ctx: ToolContext) => Promise<ToolOutcome>
> = {
  github_list_repositories: listRepositories,
  github_read_file: readFile,
  github_list_directory: listDirectory,
  github_search_code: searchCode,
  github_create_branch: createBranch,
  github_write_file: writeFile,
  github_apply_patch: applyPatch,
  github_delete_file: deleteFile,
  github_open_pull_request: openPullRequest,
  github_get_pull_request: getPullRequest,
  github_compare: compare,
  github_ci_status: ciStatus,
};

export function githubSpecsFor(enabled: Set<string>): ToolSpec[] {
  return Object.entries(GITHUB_TOOL_SPECS)
    .filter(([name]) => enabled.has(name))
    .map(([, spec]) => spec);
}

export async function executeGitHubTool(
  name: string,
  args: Record<string, unknown>,
  ctx: ToolContext,
): Promise<ToolOutcome | null> {
  const executor = EXECUTORS[name];
  if (!executor) return null;
  if (!ctx.enabled.has(name)) return fail(`"${name}" vositasi bu suhbatda o'chirilgan.`);
  try {
    return await executor(args, ctx);
  } catch (error) {
    return fail(error instanceof Error ? error.message : String(error));
  }
}

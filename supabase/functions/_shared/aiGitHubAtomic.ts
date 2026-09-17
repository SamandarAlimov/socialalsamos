// Atomic multi-file GitHub commits for Alsamos AI.
//
// Unlike the Contents API (one commit per file), this uses Git Data:
//   blobs -> tree -> commit -> fast-forward ref update
// so a refactor touching many files lands as one commit or not at all.

import type { ToolContext, ToolOutcome, ToolSpec } from "./aiTools.ts";

const API_BASE = "https://api.github.com";
const USER_AGENT = "Alsamos-AI-Coding-Agent";
const MAX_FILES = 60;
const MAX_TOTAL_BYTES = 4 * 1024 * 1024;

const str = (description: string) => ({ type: "string", description });

export const GITHUB_ATOMIC_TOOL_NAME = "github_atomic_commit" as const;

export const GITHUB_ATOMIC_TOOL_SPEC: ToolSpec = {
  type: "function",
  function: {
    name: GITHUB_ATOMIC_TOOL_NAME,
    description:
      "Create one atomic GitHub commit containing multiple file creates/updates/deletes. Prefer this for multi-file refactors so the branch never contains a half-applied change.",
    parameters: {
      type: "object",
      properties: {
        repository: str("Repository in owner/name form."),
        branch: str("Target branch. Omit to use the repository default branch."),
        message: str("Commit message for the whole multi-file change."),
        files: {
          type: "array",
          minItems: 1,
          maxItems: MAX_FILES,
          items: {
            type: "object",
            properties: {
              path: str("Repository-relative file path."),
              content: str("Complete UTF-8 content. Omit only when delete=true."),
              delete: { type: "boolean", description: "Delete this path from the tree." },
            },
            required: ["path"],
            additionalProperties: false,
          },
        },
      },
      required: ["repository", "message", "files"],
      additionalProperties: false,
    },
  },
};

type GhResponse = { ok: boolean; status: number; data: any };
type Connection = { token: string; login: string | null };

function fail(text: string): ToolOutcome {
  return { ok: false, text };
}

function repoApiPath(repository: string): string {
  const [owner, repo, extra] = repository.trim().split("/");
  if (!owner || !repo || extra) throw new Error("repository owner/name formatida bo'lishi kerak.");
  return `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`;
}

function encodeRef(branch: string): string {
  return branch
    .replace(/^refs\/heads\//, "")
    .split("/")
    .map(encodeURIComponent)
    .join("/");
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

function ghError(response: GhResponse, fallback: string): ToolOutcome {
  const detail = typeof response.data?.message === "string"
    ? response.data.message
    : typeof response.data === "string"
      ? response.data.slice(0, 500)
      : fallback;
  return fail(`${fallback} (GitHub HTTP ${response.status}): ${detail}`);
}

async function connection(ctx: ToolContext): Promise<Connection | ToolOutcome> {
  if (!ctx.userId) return fail("GitHub bilan ishlash uchun tizimga kirish kerak.");
  const { data, error } = await ctx.admin
    .from("ai_github_connections")
    .select("token, login")
    .eq("user_id", ctx.userId)
    .maybeSingle();
  if (error) return fail(error.message);
  const token = typeof data?.token === "string" ? data.token.trim() : "";
  if (!token) return fail("GitHub ulanmagan. Contents write huquqiga ega tokenni ulang.");
  return { token, login: data?.login ?? null };
}

function isOutcome(value: Connection | ToolOutcome): value is ToolOutcome {
  return "ok" in value;
}

function validPath(path: string): boolean {
  if (!path || path.startsWith("/") || path.endsWith("/")) return false;
  if (path.includes("\0") || path.split("/").some((part) => !part || part === "." || part === "..")) return false;
  return true;
}

export async function executeGitHubAtomicTool(
  name: string,
  args: Record<string, unknown>,
  ctx: ToolContext,
): Promise<ToolOutcome | null> {
  if (name !== GITHUB_ATOMIC_TOOL_NAME) return null;
  const conn = await connection(ctx);
  if (isOutcome(conn)) return conn;

  const repository = String(args.repository ?? "").trim();
  const message = String(args.message ?? "").trim();
  const rawFiles = Array.isArray(args.files) ? args.files : [];
  if (!repository || !message || rawFiles.length === 0) return fail("repository, message va files talab qilinadi.");
  if (rawFiles.length > MAX_FILES) return fail(`Bitta atomic commit ko'pi bilan ${MAX_FILES} fayl qabul qiladi.`);

  const files: Array<{ path: string; content?: string; delete: boolean }> = [];
  let totalBytes = 0;
  const seen = new Set<string>();
  for (const raw of rawFiles) {
    const row = (raw ?? {}) as Record<string, unknown>;
    const path = String(row.path ?? "").trim();
    const deleting = Boolean(row.delete);
    if (!validPath(path)) return fail(`Noto'g'ri path: ${path || "(bo'sh)"}`);
    if (seen.has(path)) return fail(`Bir path ikki marta berilgan: ${path}`);
    seen.add(path);
    if (deleting) {
      files.push({ path, delete: true });
      continue;
    }
    if (typeof row.content !== "string") return fail(`${path}: content talab qilinadi.`);
    totalBytes += new TextEncoder().encode(row.content).byteLength;
    files.push({ path, content: row.content, delete: false });
  }
  if (totalBytes > MAX_TOTAL_BYTES) {
    return fail(`Atomic commit matni ${(MAX_TOTAL_BYTES / 1024 / 1024).toFixed(0)}MB limitdan oshdi.`);
  }

  const repoPath = repoApiPath(repository);
  const repoRes = await gh(conn.token, repoPath);
  if (!repoRes.ok) return ghError(repoRes, "Repository ochilmadi");
  const branch = String(args.branch ?? repoRes.data?.default_branch ?? "main").trim().replace(/^refs\/heads\//, "");
  if (!branch) return fail("Target branch aniqlanmadi.");

  const refRes = await gh(conn.token, `${repoPath}/git/ref/heads/${encodeRef(branch)}`);
  if (!refRes.ok) return ghError(refRes, `Branch topilmadi: ${branch}`);
  const parentSha = String(refRes.data?.object?.sha ?? "");
  if (!parentSha) return fail("Branch head SHA olinmadi.");

  const commitRes = await gh(conn.token, `${repoPath}/git/commits/${encodeURIComponent(parentSha)}`);
  if (!commitRes.ok) return ghError(commitRes, "Parent commit olinmadi");
  const baseTree = String(commitRes.data?.tree?.sha ?? "");
  if (!baseTree) return fail("Base tree SHA olinmadi.");

  const tree: Array<Record<string, unknown>> = [];
  for (const file of files) {
    if (file.delete) {
      tree.push({ path: file.path, mode: "100644", type: "blob", sha: null });
      continue;
    }
    const blobRes = await gh(conn.token, `${repoPath}/git/blobs`, {
      method: "POST",
      body: { content: file.content ?? "", encoding: "utf-8" },
    });
    if (!blobRes.ok) return ghError(blobRes, `Blob yaratilmadi: ${file.path}`);
    tree.push({ path: file.path, mode: "100644", type: "blob", sha: blobRes.data?.sha });
  }

  const treeRes = await gh(conn.token, `${repoPath}/git/trees`, {
    method: "POST",
    body: { base_tree: baseTree, tree },
  });
  if (!treeRes.ok) return ghError(treeRes, "Atomic tree yaratilmadi");

  const newCommitRes = await gh(conn.token, `${repoPath}/git/commits`, {
    method: "POST",
    body: { message, tree: treeRes.data?.sha, parents: [parentSha] },
  });
  if (!newCommitRes.ok) return ghError(newCommitRes, "Atomic commit yaratilmadi");
  const newSha = String(newCommitRes.data?.sha ?? "");
  if (!newSha) return fail("Yangi commit SHA olinmadi.");

  // The ref update is the only visible mutation. force=false protects against
  // another writer moving the branch while blobs/tree were being prepared.
  const updateRes = await gh(conn.token, `${repoPath}/git/refs/heads/${encodeRef(branch)}`, {
    method: "PATCH",
    body: { sha: newSha, force: false },
  });
  if (!updateRes.ok) {
    return ghError(
      updateRes,
      "Branch atomic yangilanmadi; branch boshqa writer tomonidan siljigan bo'lishi mumkin. Hech qanday yarim commit branchga qo'llanmadi",
    );
  }

  return {
    ok: true,
    text: `${repository}@${branch}: ${files.length} fayl bitta atomic commitda yozildi (${newSha.slice(0, 12)}).`,
    data: {
      repository,
      branch,
      commitSha: newSha,
      parentSha,
      fileCount: files.length,
      files: files.map((file) => ({ path: file.path, delete: file.delete })),
      htmlUrl: `https://github.com/${repository}/commit/${newSha}`,
    },
  };
}

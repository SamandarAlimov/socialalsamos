from pathlib import Path


def replace_once(path: str, old: str, new: str) -> None:
    file = Path(path)
    text = file.read_text(encoding="utf-8")
    if old not in text:
        raise SystemExit(f"anchor not found in {path}: {old[:140]!r}")
    file.write_text(text.replace(old, new, 1), encoding="utf-8")


Path("supabase/functions/_shared/aiIntent.ts").write_text(r'''// Pure intent helpers shared by the server-side AI tool runtime.
// Keep this module dependency-free so it can also be regression-tested by Vitest.

const REPOSITORY_WORD = String.raw`(?:repo(?:zitoriy|zitoriya)?|repository|репозиторий|репо)`;
const REPOSITORY_NAME = String.raw`[A-Za-z0-9][A-Za-z0-9._-]{0,99}`;
const CREATE_VERB = String.raw`(?:yarat|yaratib(?:\s+ber)?|yarating|och|ochib(?:\s+ber)?|qur|tuz|create|make|set\s+up|создай|создать)`;

const RESERVED_GENERATED_NAMES = new Set([
  'repo', 'repository', 'repozitoriy', 'repozitoriya', 'nomlangan', 'nomli', 'nomida',
  'named', 'called', 'new', 'yangi', 'create', 'yarat', 'github', 'githubda',
]);

const clean = (value: string | undefined, allowReserved = false): string | null => {
  const candidate = String(value ?? '').trim();
  if (!candidate || candidate.includes('/') || candidate.length > 100) return null;
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/.test(candidate)) return null;
  if (!allowReserved && RESERVED_GENERATED_NAMES.has(candidate.toLowerCase())) return null;
  return candidate;
};

/** True only when the CURRENT user message explicitly asks to create a repository. */
export function isRepositoryCreationRequest(text: string): boolean {
  const value = String(text ?? '').trim();
  if (!value) return false;

  const whyQuestion = /^(?:nega\b|nima\s+uchun\b|nimaga\b|why\b|почему\b)/i.test(value);
  const strongImperative = /(?:iltimos|please|yaratib\s+ber|yarating|создай)/i.test(value);
  if (whyQuestion && !strongImperative) return false;

  const afterRepo = new RegExp(`\\b${REPOSITORY_WORD}\\b[^.!?\\n]{0,100}\\b${CREATE_VERB}\\b`, 'i');
  const beforeRepo = new RegExp(`\\b${CREATE_VERB}\\b[^.!?\\n]{0,100}\\b${REPOSITORY_WORD}\\b`, 'i');
  return afterRepo.test(value) || beforeRepo.test(value);
}

/** Extract a repository name only from high-confidence grammatical forms. */
export function extractExplicitRepositoryName(text: string): string | null {
  const value = String(text ?? '');
  if (!value.trim()) return null;

  const quotedBeforeRepo = new RegExp(
    `[«“"'\\x60](${REPOSITORY_NAME})[»”"'\\x60]\\s*(?:(?:deb\\s+nomlangan|nomli|nomida|named|called)\\s*)?(?:yangi\\s+|new\\s+)?${REPOSITORY_WORD}\\b`,
    'i',
  ).exec(value);
  if (quotedBeforeRepo) return clean(quotedBeforeRepo[1], true);

  const repoBeforeQuoted = new RegExp(
    `\\b${REPOSITORY_WORD}\\b[^.!?\\n]{0,40}[«“"'\\x60](${REPOSITORY_NAME})[»”"'\\x60]`,
    'i',
  ).exec(value);
  if (repoBeforeQuoted) return clean(repoBeforeQuoted[1], true);

  const patterns = [
    new RegExp(`\\b(${REPOSITORY_NAME})\\s+deb\\s+nomlangan\\s+(?:yangi\\s+)?${REPOSITORY_WORD}\\b`, 'i'),
    new RegExp(`\\b(${REPOSITORY_NAME})\\s+(?:nomli|nomida)\\s+(?:yangi\\s+)?${REPOSITORY_WORD}\\b`, 'i'),
    new RegExp(`\\b${REPOSITORY_WORD}\\s+(?:nomi|nomli|nomida|named|called)\\s+(${REPOSITORY_NAME})\\b`, 'i'),
    new RegExp(`\\b(?:create|make|set\\s+up)\\s+(?:a\\s+)?(?:new\\s+)?${REPOSITORY_WORD}\\s+(?:(?:named|called)\\s+)?(${REPOSITORY_NAME})\\b`, 'i'),
    new RegExp(`\\b${REPOSITORY_WORD}\\s+(${REPOSITORY_NAME})\\s+(?:yarat|yaratib|yarating|och|qur|create)\\b`, 'i'),
  ];

  for (const pattern of patterns) {
    const match = pattern.exec(value);
    const candidate = clean(match?.[1]);
    if (candidate) return candidate;
  }
  return null;
}

export function isSuspiciousGeneratedRepositoryName(name: string): boolean {
  return RESERVED_GENERATED_NAMES.has(String(name ?? '').trim().toLowerCase());
}
''', encoding="utf-8")

Path("src/lib/ai/githubIntent.test.ts").write_text(r'''import { describe, expect, it } from 'vitest';

import {
  extractExplicitRepositoryName,
  isRepositoryCreationRequest,
  isSuspiciousGeneratedRepositoryName,
} from '../../../supabase/functions/_shared/aiIntent';

describe('AI GitHub repository intent fidelity', () => {
  it('preserves the exact Uzbek repository name before "deb nomlangan"', () => {
    const text = 'githubda yangi testalsamosai deb nomlangan repo yarat';
    expect(isRepositoryCreationRequest(text)).toBe(true);
    expect(extractExplicitRepositoryName(text)).toBe('testalsamosai');
  });

  it('does not mistake grammar words for repository names', () => {
    expect(isSuspiciousGeneratedRepositoryName('nomlangan')).toBe(true);
    expect(isSuspiciousGeneratedRepositoryName('repo')).toBe(true);
    expect(extractExplicitRepositoryName('testalsamosai nomli repo yaratib ber')).toBe('testalsamosai');
  });

  it('does not execute repository creation for a follow-up question about a past action', () => {
    const text = 'nima uchun hozir "nomlangan" nomli repo yaratdingku';
    expect(isRepositoryCreationRequest(text)).toBe(false);
  });

  it('handles common English create-repository forms', () => {
    expect(isRepositoryCreationRequest('Please create a new repository named testalsamosai')).toBe(true);
    expect(extractExplicitRepositoryName('Please create a new repository named testalsamosai')).toBe('testalsamosai');
    expect(isRepositoryCreationRequest('Why did you create repository testalsamosai?')).toBe(false);
  });

  it('allows an explicitly quoted reserved word when that is really the requested name', () => {
    expect(extractExplicitRepositoryName('"nomlangan" nomli repo yarat')).toBe('nomlangan');
  });
});
''', encoding="utf-8")

replace_once(
    "supabase/functions/_shared/aiTools.ts",
    '''export type ToolContext = {\n  userId: string | null;\n  admin: SupabaseClient;\n  lovableKey: string;\n  connectors: ConnectorRow[];\n  /** Foydalanuvchi UI da yoqqan vositalar. */\n  enabled: Set<string>;\n};''',
    '''export type ToolContext = {\n  userId: string | null;\n  admin: SupabaseClient;\n  lovableKey: string;\n  connectors: ConnectorRow[];\n  /** Foydalanuvchi UI da yoqqan vositalar. */\n  enabled: Set<string>;\n  /** Current user turn. Mutating tools use it to validate exact intent/literals. */\n  userRequest?: string;\n  /** Successful high-impact mutations are deduplicated within one runtime chunk. */\n  mutationCache?: Map<string, ToolOutcome>;\n};''',
)

replace_once(
    "supabase/functions/_shared/aiGitHubTools.ts",
    'import type { ToolContext, ToolOutcome, ToolSpec } from "./aiTools.ts";\n',
    'import type { ToolContext, ToolOutcome, ToolSpec } from "./aiTools.ts";\nimport { extractExplicitRepositoryName, isRepositoryCreationRequest, isSuspiciousGeneratedRepositoryName } from "./aiIntent.ts";\n',
)

replace_once(
    "supabase/functions/_shared/aiGitHubTools.ts",
    '''      description:\n        "Create a GitHub repository for the signed-in user or an organization they can create repositories in. Use only when the user asks to create a repository.",''',
    '''      description:\n        "Create a GitHub repository only when the current user explicitly asks for it. Copy the repository name exactly as the user wrote it; grammar words like named/nomlangan/repo are not names unless explicitly quoted as the desired name. The server validates this before executing.",''',
)

replace_once(
    "supabase/functions/_shared/aiGitHubTools.ts",
    '''function githubError(response: GhResponse, fallback: string): ToolOutcome {\n  const message =\n    typeof response.data?.message === "string"\n      ? response.data.message\n      : typeof response.data === "string"\n        ? response.data.slice(0, 500)\n        : fallback;\n  return fail(`${fallback} (GitHub HTTP ${response.status}): ${message}`);\n}''',
    '''function githubError(response: GhResponse, fallback: string): ToolOutcome {\n  const message =\n    typeof response.data?.message === "string"\n      ? response.data.message\n      : typeof response.data === "string"\n        ? response.data.slice(0, 500)\n        : fallback;\n  const details = Array.isArray(response.data?.errors)\n    ? response.data.errors\n        .slice(0, 3)\n        .map((item: any) => item?.message || item?.code || item?.field)\n        .filter(Boolean)\n        .join(", ")\n    : "";\n  return fail(`${fallback} (GitHub HTTP ${response.status}): ${message}${details ? `: ${details}` : ""}`);\n}''',
)

replace_once(
    "supabase/functions/_shared/aiGitHubTools.ts",
    '''async function createRepository(args: Record<string, unknown>, ctx: ToolContext): Promise<ToolOutcome> {\n  const connection = await requireConnection(ctx);\n  if (isOutcome(connection)) return connection;\n  const name = String(args.name ?? "").trim();\n  if (!name || name.includes("/")) return fail("Repo name kerak; owner/name emas, faqat name yuboring.");\n  const owner = String(args.owner ?? "").trim();\n  const isOwn = !owner || (connection.login && owner.toLowerCase() === connection.login.toLowerCase());\n  const endpoint = isOwn ? "/user/repos" : `/orgs/${encodeURIComponent(owner)}/repos`;\n  const response = await gh(connection.token, endpoint, {\n    method: "POST",\n    body: {\n      name,\n      description: String(args.description ?? ""),\n      private: args.private !== false,\n      auto_init: args.auto_init !== false,\n    },\n  });\n  if (!response.ok) return githubError(response, "Repository yaratilmadi");\n  const repo = {\n    full_name: response.data?.full_name,\n    private: response.data?.private,\n    default_branch: response.data?.default_branch,\n    html_url: response.data?.html_url,\n  };\n  return { ok: true, text: `Repository yaratildi: ${repo.full_name}`, data: { repository: repo } };\n}''',
    '''async function createRepository(args: Record<string, unknown>, ctx: ToolContext): Promise<ToolOutcome> {\n  const userRequest = String(ctx.userRequest ?? "").trim();\n  if (userRequest && !isRepositoryCreationRequest(userRequest)) {\n    return fail("Joriy foydalanuvchi xabari yangi repository yaratishni aniq so'ramaydi. Xavfsizlik uchun hech qanday repo yaratilmadi.");\n  }\n\n  const modelName = String(args.name ?? "").trim();\n  const explicitName = extractExplicitRepositoryName(userRequest);\n  if (!explicitName && isSuspiciousGeneratedRepositoryName(modelName)) {\n    return fail(`Repository nomi noaniq (\"${modelName || "bo'sh"}\"). Foydalanuvchining aniq repo nomini tool argumentiga ko'chiring; hech qanday repo yaratilmadi.`);\n  }\n  const name = explicitName || modelName;\n  if (!name || name.includes("/")) return fail("Repo name kerak; owner/name emas, faqat name yuboring.");\n\n  const connection = await requireConnection(ctx);\n  if (isOutcome(connection)) return connection;\n  const owner = String(args.owner ?? "").trim();\n  const isOwn = !owner || (connection.login && owner.toLowerCase() === connection.login.toLowerCase());\n  const endpoint = isOwn ? "/user/repos" : `/orgs/${encodeURIComponent(owner)}/repos`;\n  const response = await gh(connection.token, endpoint, {\n    method: "POST",\n    body: {\n      name,\n      description: String(args.description ?? ""),\n      private: args.private !== false,\n      auto_init: args.auto_init !== false,\n    },\n  });\n  if (!response.ok) return githubError(response, "Repository yaratilmadi");\n  const repo = {\n    full_name: response.data?.full_name,\n    private: response.data?.private,\n    default_branch: response.data?.default_branch,\n    html_url: response.data?.html_url,\n  };\n  const correctedFrom = explicitName && modelName && explicitName !== modelName ? modelName : null;\n  return {\n    ok: true,\n    text: `Repository yaratildi: ${repo.full_name}`,\n    data: { repository: repo, requested_name: explicitName ?? null, resolved_name: name, corrected_from: correctedFrom },\n  };\n}''',
)

replace_once(
    "supabase/functions/_shared/aiAgentRuntime.ts",
    '''- Prefer native github_* tools for coding.\\n- Follow the user's target branch exactly. If no branch is specified, use the repository default branch.\\n- Use github_atomic_commit for multi-file changes/refactors so all files land in one commit.\\n- Use github_apply_patch or github_write_file for focused single-file work.\\n- Never claim a write/merge/test succeeded until its tool result succeeded.\\n- When no external sandbox exists, use GitHub Actions/CI for repository-wide verification rather than pretending local tests ran.''',
    '''- Prefer native github_* tools for coding.\\n- Preserve user literals exactly: repository names, branch names, paths, issue/PR numbers, and quoted identifiers must be copied verbatim into tool arguments. Grammar words such as \"nomlangan\", \"named\", \"repo\" or \"branch\" are not identifiers unless the user explicitly chose them as the identifier.\\n- Follow the user's target branch exactly. If no branch is specified, use the repository default branch.\\n- Use github_atomic_commit for multi-file changes/refactors so all files land in one commit.\\n- Use github_apply_patch or github_write_file for focused single-file work.\\n- A side effect is real ONLY when the corresponding current tool_result has ok=true. Prior assistant claims, user-pasted logs, generated URLs, or web-search snippets are not execution proof.\\n- If a mutating tool returns ok=false, state that exact failure and do not claim success or invent a repository/URL/commit. Do not repeat an already successful mutation.\\n- Use native github_* read tools—not web_search—to verify GitHub repository/action state when possible.\\n- When no external sandbox exists, use GitHub Actions/CI for repository-wide verification rather than pretending local tests ran.''',
)

replace_once(
    "supabase/functions/_shared/aiAgentRuntime.ts",
    '''    ctx: { userId, admin, lovableKey, connectors, enabled },''',
    '''    ctx: { userId, admin, lovableKey, connectors, enabled, mutationCache: new Map() },''',
)

replace_once(
    "supabase/functions/_shared/aiAgentRuntime.ts",
    '''function isReadOnlyTool(name: string): boolean {\n  if ([\n    "web_search", "web_fetch", "search_posts", "search_marketplace", "media_job_status",\n    "list_connector_tools", "computer_task_result", "github_list_repositories", "github_read_file",\n    "github_list_directory", "github_search_code", "github_get_pull_request", "github_compare",\n    "github_ci_status",\n  ].includes(name)) return true;\n  return name.startsWith("my_") || name.startsWith("get_") || name.startsWith("list_") || name.startsWith("search_");\n}\n\nasync function dispatchTool(''',
    '''function isReadOnlyTool(name: string): boolean {\n  if ([\n    "web_search", "web_fetch", "search_posts", "search_marketplace", "media_job_status",\n    "list_connector_tools", "computer_task_result", "github_list_repositories", "github_read_file",\n    "github_list_directory", "github_search_code", "github_get_pull_request", "github_compare",\n    "github_ci_status",\n  ].includes(name)) return true;\n  return name.startsWith("my_") || name.startsWith("get_") || name.startsWith("list_") || name.startsWith("search_");\n}\n\nconst DEDUPED_MUTATION_TOOLS = new Set([\n  "github_create_repository", "github_create_branch", "github_write_file", "github_apply_patch",\n  "github_delete_file", "github_open_pull_request", "github_merge_pull_request",\n  "github_merge_branch", GITHUB_ATOMIC_TOOL_NAME,\n]);\n\nfunction stableJson(value: unknown): string {\n  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;\n  if (value && typeof value === "object") {\n    const record = value as Record<string, unknown>;\n    return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`).join(",")}}`;\n  }\n  return JSON.stringify(value);\n}\n\nasync function dispatchTool(''',
)

replace_once(
    "supabase/functions/_shared/aiAgentRuntime.ts",
    '''  const args = parseArgs(call.args);\n  const atomic = await executeGitHubAtomicTool(call.name, args, ctx);\n  const github = atomic ?? await executeGitHubTool(call.name, args, ctx);\n  const platform = github ?? await executePlatformTool(call.name, args, ctx);\n  const outcome = platform ?? await executeTool(call.name, args, ctx);\n  return { call, args, outcome };''',
    '''  const args = parseArgs(call.args);\n  const mutationKey = DEDUPED_MUTATION_TOOLS.has(call.name)\n    ? `${call.name}:${stableJson(args)}`\n    : null;\n  if (mutationKey) {\n    const cached = ctx.mutationCache?.get(mutationKey);\n    if (cached?.ok) {\n      return { call, args, outcome: { ...cached, data: { ...(cached.data ?? {}), deduplicated: true } } };\n    }\n  }\n\n  const atomic = await executeGitHubAtomicTool(call.name, args, ctx);\n  const github = atomic ?? await executeGitHubTool(call.name, args, ctx);\n  const platform = github ?? await executePlatformTool(call.name, args, ctx);\n  const outcome = platform ?? await executeTool(call.name, args, ctx);\n  if (mutationKey && outcome.ok) ctx.mutationCache?.set(mutationKey, outcome);\n  return { call, args, outcome };''',
)

replace_once(
    "supabase/functions/_shared/aiAgentRuntime.ts",
    '''  const groups = requestedGroups(body);\n  const enabled = enabledTools(groups);\n  const specs = toolSpecs(enabled);\n  const runtime = await runtimeContext(admin, userId, enabled, lovableKey);\n  const userText = lastUserText(inputMessages);''',
    '''  const groups = requestedGroups(body);\n  const enabled = enabledTools(groups);\n  const specs = toolSpecs(enabled);\n  const userText = lastUserText(inputMessages);\n  const runtime = await runtimeContext(admin, userId, enabled, lovableKey);\n  runtime.ctx.userRequest = userText;''',
)

replace_once(
    "supabase/functions/_shared/aiAgentRuntime.ts",
    '''  const runtime = await runtimeContext(admin, run.user_id, enabled, lovableKey);\n  const specs = toolSpecs(enabled);''',
    '''  const runtime = await runtimeContext(admin, run.user_id, enabled, lovableKey);\n  runtime.ctx.userRequest = userText;\n  const specs = toolSpecs(enabled);''',
)

replace_once(
    "supabase/functions/_shared/aiAgentRuntime.ts",
    '''    runtime = await runtimeContext(admin, run.user_id, enabled, lovableKey);\n    specs = toolSpecs(enabled);''',
    '''    runtime = await runtimeContext(admin, run.user_id, enabled, lovableKey);\n    runtime.ctx.userRequest = lastUserText(normalizeInputMessages(run.input?.messages));\n    specs = toolSpecs(enabled);''',
)

Path("src/lib/supabaseJwtRecovery.ts").write_text(r'''const RECOVERABLE_JWT_PATTERN = /(?:JWT\s+expired|invalid\s+JWT|\bPGRST301\b|\bPGRST303\b)/i;

let refreshInFlight: Promise<string | null> | null = null;

/** Recover only authentication-level JWT failures, never ordinary RLS failures. */
export function isExpiredSupabaseJwtResponse(status: number, bodyText: string) {
  return status === 401 && RECOVERABLE_JWT_PATTERN.test(bodyText || '');
}

export function coordinateSupabaseJwtRefresh(
  refresh: () => Promise<string | null>,
): Promise<string | null> {
  if (!refreshInFlight) {
    refreshInFlight = Promise.resolve()
      .then(refresh)
      .finally(() => {
        refreshInFlight = null;
      });
  }
  return refreshInFlight;
}

export function isTerminalRefreshTokenError(message: string | null | undefined) {
  const value = String(message ?? '');
  return /refresh[_ -]?token/i.test(value) && /(?:invalid|expired|not found|already used|reuse)/i.test(value);
}
''', encoding="utf-8")

Path("src/lib/supabaseJwtRecovery.test.ts").write_text(r'''import { describe, expect, it } from 'vitest';

import {
  coordinateSupabaseJwtRefresh,
  isExpiredSupabaseJwtResponse,
  isTerminalRefreshTokenError,
} from './supabaseJwtRecovery';

describe('Supabase expired JWT recovery', () => {
  it('recognizes recoverable PostgREST JWT authentication failures', () => {
    expect(isExpiredSupabaseJwtResponse(401, '{"code":"PGRST303","message":"JWT expired"}')).toBe(true);
    expect(isExpiredSupabaseJwtResponse(401, 'JWT expired')).toBe(true);
    expect(isExpiredSupabaseJwtResponse(401, '{"code":"PGRST301","message":"Invalid JWT"}')).toBe(true);
  });

  it('does not retry unrelated authorization failures or missing-auth requests', () => {
    expect(isExpiredSupabaseJwtResponse(403, 'JWT expired')).toBe(false);
    expect(isExpiredSupabaseJwtResponse(401, '{"code":"42501","message":"permission denied"}')).toBe(false);
    expect(isExpiredSupabaseJwtResponse(401, '{"code":"PGRST302","message":"missing authorization"}')).toBe(false);
  });

  it('deduplicates simultaneous refreshes so one rotated token serves every waiter', async () => {
    let refreshCalls = 0;
    const refresh = async () => {
      refreshCalls += 1;
      await Promise.resolve();
      return 'fresh-access-token';
    };
    const [first, second, third] = await Promise.all([
      coordinateSupabaseJwtRefresh(refresh),
      coordinateSupabaseJwtRefresh(refresh),
      coordinateSupabaseJwtRefresh(refresh),
    ]);
    expect(refreshCalls).toBe(1);
    expect([first, second, third]).toEqual(['fresh-access-token', 'fresh-access-token', 'fresh-access-token']);
    await coordinateSupabaseJwtRefresh(refresh);
    expect(refreshCalls).toBe(2);
  });

  it('only treats invalid refresh tokens as terminal session failures', () => {
    expect(isTerminalRefreshTokenError('Invalid Refresh Token: Already Used')).toBe(true);
    expect(isTerminalRefreshTokenError('Refresh Token Not Found')).toBe(true);
    expect(isTerminalRefreshTokenError('Failed to fetch')).toBe(false);
  });
});
''', encoding="utf-8")

replace_once(
    "src/lib/ai/githubConnector.ts",
    '''const FUNCTIONS_BASE = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`;\nlet cachedConnected = false;''',
    '''const FUNCTIONS_BASE = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`;\nconst LEGACY_TOKEN_KEY = 'alsamos.github.pat';\nlet cachedConnected = false;\nlet legacyMigrationAttempted = false;\n\nconst readLegacyToken = (): string => {\n  if (typeof window === 'undefined') return '';\n  try {\n    return localStorage.getItem(LEGACY_TOKEN_KEY)?.trim() ?? '';\n  } catch {\n    return '';\n  }\n};\n\nconst clearLegacyToken = () => {\n  if (typeof window === 'undefined') return;\n  try {\n    localStorage.removeItem(LEGACY_TOKEN_KEY);\n  } catch {\n    // Storage may be unavailable in hardened/private browser contexts.\n  }\n};''',
)

replace_once(
    "src/lib/ai/githubConnector.ts",
    '''  cachedConnected = result.connected;\n  return result;\n}\n\n/** Check the same server-side connection used by the AI coding agent. */\nexport async function githubStatus(): Promise<GithubStatus> {\n  const result = await connectorCall<GithubStatus>({ action: 'status' });\n  cachedConnected = result.connected;\n  return result;\n}\n\nexport async function disconnectGithub(): Promise<{ connected: boolean }> {\n  const result = await connectorCall<{ connected: boolean }>({ action: 'disconnect' });\n  cachedConnected = false;\n  return result;\n}''',
    '''  cachedConnected = result.connected;\n  if (result.connected) clearLegacyToken();\n  return result;\n}\n\n/** Check the same server-side connection used by the AI coding agent. */\nexport async function githubStatus(): Promise<GithubStatus> {\n  let result = await connectorCall<GithubStatus>({ action: 'status' });\n\n  // One-time migration for users who connected before the server-side connector existed.\n  if (!result.connected && !legacyMigrationAttempted) {\n    legacyMigrationAttempted = true;\n    const legacyToken = readLegacyToken();\n    if (legacyToken) {\n      try {\n        const migrated = await connectorCall<{ connected: boolean; login: string | null }>({\n          action: 'connect', token: legacyToken,\n        });\n        if (migrated.connected) {\n          clearLegacyToken();\n          result = { connected: true, login: migrated.login };\n        }\n      } catch (error) {\n        console.warn('[ai/github] Legacy GitHub connection migration failed:', error);\n      }\n    }\n  }\n\n  cachedConnected = result.connected;\n  return result;\n}\n\nexport async function disconnectGithub(): Promise<{ connected: boolean }> {\n  const result = await connectorCall<{ connected: boolean }>({ action: 'disconnect' });\n  clearLegacyToken();\n  cachedConnected = false;\n  return result;\n}''',
)

replace_once(
    ".github/workflows/ci.yml",
    '''      - name: AI routing regression tests\n        run: npx vitest run src/lib/ai/agentClient.test.ts src/lib/ai/projectWorkspace.test.ts src/lib/ai/workspaceUrl.test.ts src/lib/aiArtifacts.test.ts''',
    '''      - name: AI routing regression tests\n        run: npx vitest run src/lib/ai/agentClient.test.ts src/lib/ai/projectWorkspace.test.ts src/lib/ai/workspaceUrl.test.ts src/lib/ai/githubIntent.test.ts src/lib/aiArtifacts.test.ts''',
)

print('AI understanding hardening patch applied successfully')

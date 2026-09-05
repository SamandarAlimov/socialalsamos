// Alsamos AI — authenticated first-party superapp capabilities.
//
// These tools are intentionally separate from generic web/media tools because
// they can read the signed-in user's private platform state. Every query is
// scoped by ctx.userId even though ai-agent uses a service-role client.

import type { ToolContext, ToolOutcome, ToolSpec } from "./aiTools.ts";

const str = (description: string) => ({ type: "string", description });
const num = (description: string) => ({ type: "number", description });

export const PLATFORM_TOOL_NAMES = [
  "my_search_insights",
  "my_payment_history",
  "get_recommendation_preferences",
  "update_recommendation_preferences",
] as const;

export const PLATFORM_TOOL_SPECS: Record<string, ToolSpec> = {
  my_search_insights: {
    type: "function",
    function: {
      name: "my_search_insights",
      description:
        "Read the signed-in user's own Alsamos search activity and summarize what they search most often. Use for questions like 'What do I search most?', 'What did I search last month?', or when the user asks about their own search activity. Never use it for another user.",
      parameters: {
        type: "object",
        properties: {
          days: num("Lookback window in days (1-730, default 30)."),
          query_contains: str("Optional text filter applied to the user's own queries."),
          limit: num("How many top/recent entries to return (1-30, default 10)."),
        },
        additionalProperties: false,
      },
    },
  },
  my_payment_history: {
    type: "function",
    function: {
      name: "my_payment_history",
      description:
        "Read the signed-in user's own Alsamos Wallet ledger. Use for questions about payments, transfers, purchases, top-ups, dates, amounts, or payments to/from a specific person. This is read-only and must never move money.",
      parameters: {
        type: "object",
        properties: {
          days: num("Lookback window in days (1-730, default 30)."),
          from: str("Optional inclusive ISO date/time, e.g. 2026-08-01 or 2026-08-01T00:00:00Z."),
          to: str("Optional exclusive ISO date/time."),
          person: str("Optional username/display name/account counterpart filter."),
          direction: {
            type: "string",
            enum: ["all", "debit", "credit"],
            description: "Ledger direction filter, default all.",
          },
          limit: num("Maximum matching ledger rows (1-100, default 40)."),
        },
        additionalProperties: false,
      },
    },
  },
  get_recommendation_preferences: {
    type: "function",
    function: {
      name: "get_recommendation_preferences",
      description:
        "Read the signed-in user's explicit recommendation topics. These preferences directly influence Home/Video recommendation ranking in addition to behavioral signals.",
      parameters: {
        type: "object",
        properties: {},
        additionalProperties: false,
      },
    },
  },
  update_recommendation_preferences: {
    type: "function",
    function: {
      name: "update_recommendation_preferences",
      description:
        "Change the signed-in user's explicit Alsamos recommendation topics ONLY when the user explicitly asks to change what their feed recommends. Example: 'Show me more Islamic lectures and Muhammad Sodiq Muhammad Yusuf'. Positive weights mean more, negative weights mean less. The change affects the real recommendation ranker; do not merely remember it as a note.",
      parameters: {
        type: "object",
        properties: {
          changes: {
            type: "array",
            minItems: 1,
            maxItems: 20,
            items: {
              type: "object",
              properties: {
                topic: str("A concise topic, creator name, phrase, hashtag, or interest to tune."),
                operation: {
                  type: "string",
                  enum: ["increase", "decrease", "set", "remove"],
                },
                weight: num("For set: value -3..3. For increase/decrease: step 0.25..2, default 1."),
              },
              required: ["topic", "operation"],
              additionalProperties: false,
            },
          },
        },
        required: ["changes"],
        additionalProperties: false,
      },
    },
  },
};

function fail(text: string): ToolOutcome {
  return { ok: false, text };
}

function clamp(value: unknown, min: number, max: number, fallback: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

function cleanTopic(value: unknown) {
  return String(value ?? "")
    .trim()
    .replace(/\s+/g, " ")
    .slice(0, 120);
}

function parseDate(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : null;
}

function isMissingRelation(error: { code?: string; message?: string } | null | undefined) {
  if (!error) return false;
  const text = `${error.code ?? ""} ${error.message ?? ""}`.toLowerCase();
  return (
    text.includes("42p01") ||
    text.includes("pgrst") ||
    text.includes("does not exist") ||
    text.includes("schema cache")
  );
}

async function personalizationAllowed(ctx: ToolContext): Promise<boolean> {
  if (!ctx.userId) return false;

  // The settings table predates these AI tools in some deployments. A missing
  // table/column is treated as legacy/default rather than breaking the agent;
  // an explicit `false` is always respected.
  const { data, error } = await ctx.admin
    .from("user_settings")
    .select("ai_personalization")
    .eq("user_id", ctx.userId)
    .maybeSingle();

  if (error) {
    const text = `${error.code ?? ""} ${error.message ?? ""}`.toLowerCase();
    if (
      text.includes("does not exist") ||
      text.includes("schema cache") ||
      text.includes("42703") ||
      text.includes("42p01") ||
      text.includes("pgrst")
    ) {
      return true;
    }
    throw error;
  }

  return data?.ai_personalization !== false;
}

async function requirePrivateAccess(ctx: ToolContext): Promise<ToolOutcome | null> {
  if (!ctx.userId) return fail("Bu ma’lumot uchun tizimga kirish kerak.");
  try {
    const allowed = await personalizationAllowed(ctx);
    if (!allowed) {
      return fail(
        "AI personalization foydalanuvchi sozlamalarida o‘chirilgan. Shaxsiy search/payment/recommendation ma’lumotlarini o‘qimayman.",
      );
    }
    return null;
  } catch (error) {
    return fail(error instanceof Error ? error.message : String(error));
  }
}

type SearchActivityRow = {
  query: string | null;
  normalized_query?: string | null;
  searched_at?: string | null;
  created_at?: string | null;
};

async function mySearchInsights(
  args: Record<string, unknown>,
  ctx: ToolContext,
): Promise<ToolOutcome> {
  const denied = await requirePrivateAccess(ctx);
  if (denied) return denied;

  const days = Math.round(clamp(args.days, 1, 730, 30));
  const limit = Math.round(clamp(args.limit, 1, 30, 10));
  const since = new Date(Date.now() - days * 86_400_000).toISOString();
  const contains = String(args.query_contains ?? "").trim().slice(0, 120);

  // V2 is an append-only search-event ledger. Unlike `search_history`, which
  // is a de-duplicated recent-list UX, it preserves every committed query, so
  // "eng ko‘p nima qidirdim?" is based on actual frequency.
  let activityQuery = ctx.admin
    .from("search_activity_events")
    .select("query, normalized_query, searched_at")
    .eq("user_id", ctx.userId!)
    .gte("searched_at", since)
    .order("searched_at", { ascending: false })
    .limit(5000);
  if (contains) activityQuery = activityQuery.ilike("query", `%${contains}%`);

  const activity = await activityQuery;
  let rows: SearchActivityRow[] = [];
  let source = "search_activity_events";

  if (!activity.error) {
    rows = (activity.data ?? []) as SearchActivityRow[];
  } else if (isMissingRelation(activity.error)) {
    // Backward-compatible while production migrations roll out. Legacy history
    // can answer recency, but because it de-duplicates queries it must NOT be
    // presented as exact historical frequency.
    let legacyQuery = ctx.admin
      .from("search_history")
      .select("query, created_at")
      .eq("user_id", ctx.userId!)
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(1500);
    if (contains) legacyQuery = legacyQuery.ilike("query", `%${contains}%`);
    const legacy = await legacyQuery;
    if (legacy.error) return fail(legacy.error.message);
    rows = (legacy.data ?? []) as SearchActivityRow[];
    source = "search_history_legacy_recent_only";
  } else {
    return fail(activity.error.message);
  }

  const validRows = rows.filter((row) => typeof row.query === "string" && row.query.trim());
  const buckets = new Map<string, { query: string; count: number; last_searched_at: string }>();
  for (const row of validRows) {
    const label = String(row.query).trim().replace(/\s+/g, " ");
    const key = String(row.normalized_query || label.toLocaleLowerCase());
    const searchedAt = String(row.searched_at || row.created_at || "");
    const current = buckets.get(key);
    if (current) {
      current.count += 1;
      if (searchedAt > current.last_searched_at) current.last_searched_at = searchedAt;
    } else {
      buckets.set(key, { query: label, count: 1, last_searched_at: searchedAt });
    }
  }

  const top = [...buckets.values()]
    .sort((a, b) => b.count - a.count || b.last_searched_at.localeCompare(a.last_searched_at))
    .slice(0, limit);
  const recent = validRows.slice(0, limit).map((row) => ({
    query: String(row.query),
    searched_at: row.searched_at || row.created_at,
  }));

  const result = {
    days,
    total_searches: validRows.length,
    unique_queries: buckets.size,
    top,
    recent,
    source,
    exact_frequency: source === "search_activity_events",
  };
  return {
    ok: true,
    text: validRows.length
      ? JSON.stringify(result)
      : `Oxirgi ${days} kunda search tarixi topilmadi.`,
    data: { searchInsights: result },
  };
}

async function resolveCounterparties(
  person: string,
  ctx: ToolContext,
): Promise<Array<{ id: string; username: string | null; display_name: string | null }>> {
  const needle = person.trim().replace(/^@/, "").slice(0, 100);
  if (!needle) return [];

  const safe = needle.replace(/[%,()]/g, " ").trim();
  if (!safe) return [];
  const { data, error } = await ctx.admin
    .from("profiles")
    .select("id, username, display_name")
    .or(`username.ilike.%${safe}%,display_name.ilike.%${safe}%`)
    .limit(20);
  if (error) throw error;
  return (data ?? []) as Array<{ id: string; username: string | null; display_name: string | null }>;
}

async function myPaymentHistory(
  args: Record<string, unknown>,
  ctx: ToolContext,
): Promise<ToolOutcome> {
  const denied = await requirePrivateAccess(ctx);
  if (denied) return denied;

  const limit = Math.round(clamp(args.limit, 1, 100, 40));
  const from = parseDate(args.from) ?? new Date(Date.now() - Math.round(clamp(args.days, 1, 730, 30)) * 86_400_000).toISOString();
  const to = parseDate(args.to);
  const direction = ["debit", "credit"].includes(String(args.direction)) ? String(args.direction) : null;
  const person = String(args.person ?? "").trim();

  let counterparties: Array<{ id: string; username: string | null; display_name: string | null }> = [];
  try {
    if (person) counterparties = await resolveCounterparties(person, ctx);
  } catch (error) {
    return fail(error instanceof Error ? error.message : String(error));
  }
  if (person && counterparties.length === 0) {
    return { ok: true, text: `“${person}” bo‘yicha foydalanuvchi/topshiriq topilmadi.`, data: { payments: [] } };
  }

  let ledgerQuery = ctx.admin
    .from("wallet_ledger")
    .select(
      "id, direction, amount, currency, kind, status, description, counterparty_user_id, transfer_id, context_type, context_id, balance_after, created_at",
    )
    .eq("user_id", ctx.userId!)
    .gte("created_at", from)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (to) ledgerQuery = ledgerQuery.lt("created_at", to);
  if (direction) ledgerQuery = ledgerQuery.eq("direction", direction);
  if (counterparties.length) ledgerQuery = ledgerQuery.in("counterparty_user_id", counterparties.map((item) => item.id));

  const { data, error } = await ledgerQuery;
  if (error) {
    // Legacy production fallback. wallet_transactions is less expressive but
    // still lets the user inspect their own historical ledger while migrations
    // roll out.
    let legacyQuery = ctx.admin
      .from("wallet_transactions")
      .select("id, type, amount, currency, description, reference_id, reference_type, balance_after, created_at, metadata")
      .eq("user_id", ctx.userId!)
      .gte("created_at", from)
      .order("created_at", { ascending: false })
      .limit(limit);
    if (to) legacyQuery = legacyQuery.lt("created_at", to);
    const legacy = await legacyQuery;
    if (legacy.error) return fail(error.message);
    if (person) {
      return fail("Bu production schema’da person-level counterparty ledger hali mavjud emas.");
    }
    return {
      ok: true,
      text: JSON.stringify(legacy.data ?? []),
      data: { payments: legacy.data ?? [], source: "wallet_transactions" },
    };
  }

  const rows = data ?? [];
  const counterpartyIds = [...new Set(rows.map((row) => row.counterparty_user_id).filter(Boolean))] as string[];
  const profileMap = new Map<string, { username: string | null; display_name: string | null }>();
  if (counterpartyIds.length) {
    const profiles = await ctx.admin
      .from("profiles")
      .select("id, username, display_name")
      .in("id", counterpartyIds);
    for (const profile of profiles.data ?? []) {
      profileMap.set(String(profile.id), {
        username: profile.username ?? null,
        display_name: profile.display_name ?? null,
      });
    }
  }

  const payments = rows.map((row) => ({
    id: row.id,
    direction: row.direction,
    amount: Number(row.amount ?? 0),
    currency: row.currency,
    kind: row.kind,
    status: row.status,
    description: row.description,
    counterparty_user_id: row.counterparty_user_id,
    counterparty: row.counterparty_user_id ? profileMap.get(String(row.counterparty_user_id)) ?? null : null,
    transfer_id: row.transfer_id,
    context_type: row.context_type,
    context_id: row.context_id,
    created_at: row.created_at,
  }));

  const totals = payments.reduce(
    (acc, row) => {
      if (row.status !== "completed") return acc;
      const key = `${row.direction}:${row.currency}`;
      acc[key] = (acc[key] ?? 0) + row.amount;
      return acc;
    },
    {} as Record<string, number>,
  );

  return {
    ok: true,
    text: payments.length
      ? JSON.stringify({ from, to, totals, payments })
      : "Bu davr/filter bo‘yicha wallet tranzaksiyasi topilmadi.",
    data: { payments, totals, from, to },
  };
}

async function getRecommendationPreferences(
  _args: Record<string, unknown>,
  ctx: ToolContext,
): Promise<ToolOutcome> {
  const denied = await requirePrivateAccess(ctx);
  if (denied) return denied;

  const { data, error } = await ctx.admin
    .from("user_recommendation_interests")
    .select("topic, weight, source, updated_at")
    .eq("user_id", ctx.userId!)
    .order("weight", { ascending: false })
    .limit(100);
  if (error) return fail(error.message);

  return {
    ok: true,
    text: data?.length ? JSON.stringify(data) : "Explicit recommendation preference hali yo‘q; behavioral ranking ishlayapti.",
    data: { recommendationPreferences: data ?? [] },
  };
}

async function updateRecommendationPreferences(
  args: Record<string, unknown>,
  ctx: ToolContext,
): Promise<ToolOutcome> {
  const denied = await requirePrivateAccess(ctx);
  if (denied) return denied;

  const rawChanges = Array.isArray(args.changes) ? args.changes.slice(0, 20) : [];
  if (!rawChanges.length) return fail("changes talab qilinadi.");

  const changes = rawChanges
    .map((raw) => {
      const row = raw && typeof raw === "object" && !Array.isArray(raw)
        ? raw as Record<string, unknown>
        : {};
      const topic = cleanTopic(row.topic);
      const operation = ["increase", "decrease", "set", "remove"].includes(String(row.operation))
        ? String(row.operation)
        : "";
      const weight = clamp(row.weight, 0.25, 3, 1);
      return { topic, operation, weight };
    })
    .filter((row) => row.topic && row.operation);
  if (!changes.length) return fail("Yaroqli recommendation o‘zgarishi topilmadi.");

  const topics = [...new Set(changes.map((row) => row.topic))];
  const { data: existing, error: existingError } = await ctx.admin
    .from("user_recommendation_interests")
    .select("topic, weight")
    .eq("user_id", ctx.userId!)
    .in("topic", topics);
  if (existingError) return fail(existingError.message);

  const current = new Map<string, number>(
    (existing ?? []).map((row) => [String(row.topic), Number(row.weight ?? 0)]),
  );
  const removed: string[] = [];
  const writes: Array<{ user_id: string; topic: string; weight: number; source: string; updated_at: string }> = [];

  for (const change of changes) {
    if (change.operation === "remove") {
      removed.push(change.topic);
      current.delete(change.topic);
      continue;
    }

    const before = current.get(change.topic) ?? 0;
    let next = before;
    if (change.operation === "increase") next = before + change.weight;
    if (change.operation === "decrease") next = before - change.weight;
    if (change.operation === "set") {
      const source = rawChanges.find((candidate) =>
        candidate && typeof candidate === "object" && cleanTopic((candidate as Record<string, unknown>).topic) === change.topic
      ) as Record<string, unknown> | undefined;
      next = clamp(source?.weight, -3, 3, 0);
    }
    next = Math.round(Math.min(3, Math.max(-3, next)) * 100) / 100;
    current.set(change.topic, next);
    writes.push({
      user_id: ctx.userId!,
      topic: change.topic,
      weight: next,
      source: "ai",
      updated_at: new Date().toISOString(),
    });
  }

  if (removed.length) {
    const deletion = await ctx.admin
      .from("user_recommendation_interests")
      .delete()
      .eq("user_id", ctx.userId!)
      .in("topic", removed);
    if (deletion.error) return fail(deletion.error.message);
  }

  if (writes.length) {
    const write = await ctx.admin
      .from("user_recommendation_interests")
      .upsert(writes, { onConflict: "user_id,topic" });
    if (write.error) return fail(write.error.message);
  }

  const { data: finalRows, error: finalError } = await ctx.admin
    .from("user_recommendation_interests")
    .select("topic, weight, source, updated_at")
    .eq("user_id", ctx.userId!)
    .order("weight", { ascending: false })
    .limit(100);
  if (finalError) return fail(finalError.message);

  return {
    ok: true,
    text:
      "Recommendation preference yangilandi. Bu qiymatlar behavioral signallar bilan birga real Home/Video rankingda ishlatiladi. " +
      JSON.stringify(finalRows ?? []),
    data: { recommendationPreferences: finalRows ?? [], removed },
  };
}

const EXECUTORS: Record<
  string,
  (args: Record<string, unknown>, ctx: ToolContext) => Promise<ToolOutcome>
> = {
  my_search_insights: mySearchInsights,
  my_payment_history: myPaymentHistory,
  get_recommendation_preferences: getRecommendationPreferences,
  update_recommendation_preferences: updateRecommendationPreferences,
};

export function platformSpecsFor(enabled: Set<string>): ToolSpec[] {
  return PLATFORM_TOOL_NAMES
    .filter((name) => enabled.has(name))
    .map((name) => PLATFORM_TOOL_SPECS[name]);
}

export async function executePlatformTool(
  name: string,
  args: Record<string, unknown>,
  ctx: ToolContext,
): Promise<ToolOutcome | null> {
  const executor = EXECUTORS[name];
  if (!executor) return null;
  if (!ctx.enabled.has(name)) return fail(`“${name}” vositasi bu suhbatda o‘chirilgan.`);
  try {
    return await executor(args, ctx);
  } catch (error) {
    return fail(error instanceof Error ? error.message : String(error));
  }
}

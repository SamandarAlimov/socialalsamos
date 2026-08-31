import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { guard, preflight, jsonResponse, guardError } from "../_shared/guard.ts";

const FUNCTION_NAME = "github-connector";
const RATE_LIMIT = 120;
const RATE_WINDOW_MINUTES = 60;

// MUHIM: to'liq URL'ni shablon satr ichida yozmaymiz (kompressiya muammosi).
const API_SCHEME = "https://";
const API_HOST = "api.github.com";
const API_BASE = API_SCHEME + API_HOST;

const UA = "Alsamos-AI-Connector";

type GhInit = { method?: string; body?: unknown };

async function gh(token: string, path: string, init: GhInit = {}) {
  const res = await fetch(API_BASE + path, {
    method: init.method ?? "GET",
    headers: {
      Authorization: "Bearer " + token,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": UA,
      "Content-Type": "application/json",
    },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });

  const text = await res.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  return { ok: res.ok, status: res.status, data };
}

serve(async (req) => {
  const pre = preflight(req);
  if (pre) return pre;

  if (req.method !== "POST") {
    return guardError(req, "METHOD_NOT_ALLOWED", "Faqat POST so'rovi qabul qilinadi.", 405);
  }

  try {
    const gate = await guard(req, {
      functionName: FUNCTION_NAME,
      limit: RATE_LIMIT,
      windowMinutes: RATE_WINDOW_MINUTES,
      requireAuth: true,
    });
    if (gate.response) return gate.response;

    const userId = gate.userId;
    const admin = gate.admin;
    if (!userId) {
      return guardError(req, "UNAUTHORIZED", "Avval tizimga kiring.", 401);
    }

    const body = await req.json().catch(() => null);
    const action = body?.action as string | undefined;
    if (!action) {
      return guardError(req, "INVALID_REQUEST", "action maydoni talab qilinadi.", 400);
    }

    // --- Ulanish: bearer token bilan ---
    if (action === "connect") {
      const token = String(body?.token ?? "").trim();
      if (!token) {
        return guardError(req, "INVALID_REQUEST", "GitHub token kiritilmadi.", 400);
      }

      const me = await gh(token, "/user");
      if (!me.ok) {
        return jsonResponse(
          req,
          { error: "Token noto'g'ri yoki muddati o'tgan.", code: "FORBIDDEN", status: me.status },
          400,
        );
      }

      const login = (me.data as { login?: string } | null)?.login ?? null;

      const { error } = await admin.from("ai_github_connections").upsert(
        {
          user_id: userId,
          token,
          login,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id" },
      );
      if (error) {
        console.error("github connect upsert error", error);
        return guardError(req, "SERVER_ERROR", "Ulanishni saqlab bo'lmadi.", 500);
      }

      return jsonResponse(req, { connected: true, login }, 200);
    }

    // --- Holat ---
    if (action === "status") {
      const { data } = await admin
        .from("ai_github_connections")
        .select("login, updated_at")
        .eq("user_id", userId)
        .maybeSingle();
      return jsonResponse(
        req,
        { connected: Boolean(data), login: data?.login ?? null, updatedAt: data?.updated_at ?? null },
        200,
      );
    }

    // --- Uzish ---
    if (action === "disconnect") {
      await admin.from("ai_github_connections").delete().eq("user_id", userId);
      return jsonResponse(req, { connected: false }, 200);
    }

    // Qolgan amallar uchun saqlangan token kerak.
    const { data: conn } = await admin
      .from("ai_github_connections")
      .select("token")
      .eq("user_id", userId)
      .maybeSingle();

    const token = (conn as { token?: string } | null)?.token;
    if (!token) {
      return jsonResponse(
        req,
        { error: "GitHub ulanmagan. Avval tokenni kiriting.", code: "FORBIDDEN" },
        400,
      );
    }

    if (action === "repos") {
      const page = Number(body?.page ?? 1);
      const r = await gh(
        token,
        "/user/repos?per_page=30&sort=updated&page=" + encodeURIComponent(String(page)),
      );
      if (!r.ok) return jsonResponse(req, { error: "GitHub xatosi", status: r.status }, 502);
      const repos = (r.data as Array<Record<string, unknown>>).map((repo) => ({
        fullName: repo.full_name,
        private: repo.private,
        description: repo.description,
        defaultBranch: repo.default_branch,
        updatedAt: repo.updated_at,
        htmlUrl: repo.html_url,
      }));
      return jsonResponse(req, { repos }, 200);
    }

    if (action === "file") {
      const owner = String(body?.owner ?? "");
      const repo = String(body?.repo ?? "");
      const path = String(body?.path ?? "");
      const ref = body?.ref ? String(body.ref) : null;
      if (!owner || !repo || !path) {
        return guardError(req, "INVALID_REQUEST", "owner, repo va path talab qilinadi.", 400);
      }
      const suffix = ref ? "?ref=" + encodeURIComponent(ref) : "";
      const r = await gh(
        token,
        "/repos/" + owner + "/" + repo + "/contents/" + path.split("/").map(encodeURIComponent).join("/") + suffix,
      );
      if (!r.ok) return jsonResponse(req, { error: "Fayl topilmadi", status: r.status }, 404);

      const file = r.data as { content?: string; encoding?: string; name?: string; size?: number };
      let content = "";
      if (file?.content && file.encoding === "base64") {
        try {
          content = new TextDecoder().decode(
            Uint8Array.from(atob(file.content.replace(/\n/g, "")), (ch) => ch.charCodeAt(0)),
          );
        } catch {
          content = "";
        }
      }
      return jsonResponse(req, { name: file?.name ?? path, size: file?.size ?? 0, content }, 200);
    }

    if (action === "search_code") {
      const q = String(body?.q ?? "").trim();
      if (!q) return guardError(req, "INVALID_REQUEST", "q talab qilinadi.", 400);
      const r = await gh(token, "/search/code?per_page=10&q=" + encodeURIComponent(q));
      if (!r.ok) return jsonResponse(req, { error: "Qidiruv xatosi", status: r.status }, 502);
      const items = ((r.data as { items?: Array<Record<string, unknown>> })?.items ?? []).map((i) => ({
        path: i.path,
        repo: (i.repository as { full_name?: string } | undefined)?.full_name,
        htmlUrl: i.html_url,
      }));
      return jsonResponse(req, { items }, 200);
    }

    if (action === "create_issue") {
      const owner = String(body?.owner ?? "");
      const repo = String(body?.repo ?? "");
      const title = String(body?.title ?? "").trim();
      if (!owner || !repo || !title) {
        return guardError(req, "INVALID_REQUEST", "owner, repo va title talab qilinadi.", 400);
      }
      const r = await gh(token, "/repos/" + owner + "/" + repo + "/issues", {
        method: "POST",
        body: { title, body: String(body?.body ?? "") },
      });
      if (!r.ok) return jsonResponse(req, { error: "Issue yaratilmadi", status: r.status }, 502);
      const issue = r.data as { number?: number; html_url?: string };
      return jsonResponse(req, { number: issue?.number, url: issue?.html_url }, 200);
    }

    return guardError(req, "INVALID_REQUEST", "Noma'lum action: " + action, 400);
  } catch (error) {
    console.error("github-connector error:", error);
    return guardError(req, "SERVER_ERROR", "Kutilmagan xatolik yuz berdi.", 500);
  }
});

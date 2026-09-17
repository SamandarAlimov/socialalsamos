// Resilient web-search fallback shared by Alsamos AI tools.
// Prefer the first-party Global Search endpoint because it already cascades
// Firecrawl -> Google Programmable Search -> Gemini grounding -> Alsamos index.
// DuckDuckGo HTML remains the final keyless fallback.

import { isPublicHttpUrl } from "./net.ts";

export type WebHit = {
  title: string;
  url: string;
  snippet: string;
  thumbnailUrl?: string | null;
  source?: string | null;
};

const SCHEME = "https:";
const HOST = "//html.duckduckgo.com/html/";

function strip(value: string): string {
  return value.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function cleanQuery(value: string): string {
  return value
    .replace(/<alsamos_internal_context>[\s\S]*?<\/alsamos_internal_context>/gi, " ")
    .replace(/Do not quote or mention the internal context\.[\s\S]*$/gi, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 300);
}

async function alsamosGlobalSearch(query: string, max: number): Promise<WebHit[]> {
  const base = Deno.env.get("SUPABASE_URL")?.replace(/\/$/, "");
  if (!base) return [];

  const response = await fetch(`${base}/functions/v1/global-search`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      query: cleanQuery(query),
      category: "all",
      page: 1,
      pageSize: Math.min(Math.max(max, 5), 15),
      locale: "uz",
    }),
    signal: AbortSignal.timeout(22000),
  });

  if (!response.ok) throw new Error(`Alsamos Global Search HTTP ${response.status}`);
  const payload = await response.json();
  const rows = Array.isArray(payload?.results) ? payload.results : [];

  return rows
    .filter((row: Record<string, unknown>) => {
      const url = String(row?.url ?? "");
      return url && isPublicHttpUrl(url);
    })
    .slice(0, max)
    .map((row: Record<string, unknown>) => ({
      title: String(row?.title ?? row?.source ?? "Web result"),
      url: String(row?.url ?? ""),
      snippet: String(row?.snippet ?? "").slice(0, 700),
      thumbnailUrl: typeof row?.thumbnailUrl === "string" ? row.thumbnailUrl : null,
      source: typeof row?.source === "string" ? row.source : null,
    }));
}

async function duckDuckGoHtmlSearch(query: string, max: number): Promise<WebHit[]> {
  const endpoint = SCHEME + HOST + "?q=" + encodeURIComponent(cleanQuery(query));
  const res = await fetch(endpoint, {
    headers: {
      "User-Agent": "Mozilla/5.0 (compatible; AlsamosAI/1.0; +https://alsamos.com)",
      Accept: "text/html,application/xhtml+xml",
    },
    signal: AbortSignal.timeout(12000),
  });
  if (!res.ok) throw new Error(`DuckDuckGo HTTP ${res.status}`);
  const html = await res.text();

  const hits: WebHit[] = [];
  const linkRe = /<a[^>]+class="[^"]*result__a[^"]*"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g;
  const snippetRe = /class="[^"]*result__snippet[^"]*"[^>]*>([\s\S]*?)<\/a>/g;

  const snippets: string[] = [];
  let s: RegExpExecArray | null;
  while ((s = snippetRe.exec(html)) !== null) snippets.push(strip(s[1]));

  let m: RegExpExecArray | null;
  let index = 0;
  while ((m = linkRe.exec(html)) !== null && hits.length < max) {
    let link = m[1];
    const wrapped = link.match(/uddg=([^&]+)/);
    if (wrapped) link = decodeURIComponent(wrapped[1]);
    if (link.startsWith("//")) link = SCHEME + link;
    if (!isPublicHttpUrl(link)) {
      index += 1;
      continue;
    }
    hits.push({
      title: strip(m[2]),
      url: link,
      snippet: (snippets[index] ?? "").slice(0, 600),
    });
    index += 1;
  }
  return hits;
}

export async function duckDuckGoSearch(query: string, max: number): Promise<WebHit[]> {
  const clean = cleanQuery(query);
  if (!clean) return [];

  try {
    const firstParty = await alsamosGlobalSearch(clean, max);
    if (firstParty.length) return firstParty;
  } catch (error) {
    console.warn(
      "Alsamos Global Search fallback failed",
      error instanceof Error ? error.message : String(error),
    );
  }

  return await duckDuckGoHtmlSearch(clean, max);
}

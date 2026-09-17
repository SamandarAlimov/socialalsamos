// Resilient public-web search fallback for Alsamos AI.
//
// The AI agent may not have Tavily/Brave configured in every environment, so
// this module must be useful on its own. We first use the same rotating Gemini
// key pool as the rest of Alsamos AI with Google Search grounding, then fall
// back to DuckDuckGo's public HTML/Lite results. API keys remain server-side.

import { googleFetch } from "./geminiPool.ts";
import { isPublicHttpUrl } from "./net.ts";

export type WebHit = { title: string; url: string; snippet: string };

const GOOGLE_MODELS = ["gemini-3.6-flash", "gemini-flash-latest"];
const SEARCH_TIMEOUT_MS = 18_000;

function cleanText(value: string): string {
  return value
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/\s+/g, " ")
    .trim();
}

function clampMax(max: number): number {
  if (!Number.isFinite(max)) return 5;
  return Math.min(8, Math.max(1, Math.round(max)));
}

function uniqueHits(hits: WebHit[], max: number): WebHit[] {
  const seen = new Set<string>();
  const out: WebHit[] = [];
  for (const hit of hits) {
    const url = hit.url.trim();
    if (!url || !isPublicHttpUrl(url) || seen.has(url)) continue;
    seen.add(url);
    out.push({
      title: cleanText(hit.title || new URL(url).hostname),
      url,
      snippet: cleanText(hit.snippet || "").slice(0, 700),
    });
    if (out.length >= max) break;
  }
  return out;
}

async function geminiGroundedSearch(query: string, max: number): Promise<WebHit[]> {
  const configured = Deno.env.get("ALSAMOS_SEARCH_MODEL")?.trim();
  const models = [...new Set([configured, ...GOOGLE_MODELS].filter(Boolean) as string[])];
  const errors: string[] = [];

  for (const model of models) {
    try {
      const prompt = [
        "Act as a web retrieval engine, not a chat assistant.",
        "Search the live public web for the user's query using Google Search grounding.",
        "Prefer diverse, authoritative and directly relevant pages.",
        "Do not invent links. Return a concise factual digest whose claims are grounded in the search results.",
        `Find up to ${max} useful sources.`,
        `Query: ${query}`,
      ].join("\n");

      const { response } = await googleFetch(
        `/v1beta/models/${encodeURIComponent(model)}:generateContent`,
        {
          body: {
            contents: [{ role: "user", parts: [{ text: prompt }] }],
            tools: [{ google_search: {} }],
            generationConfig: { temperature: 0.05, maxOutputTokens: 1400 },
          },
          signal: AbortSignal.timeout(SEARCH_TIMEOUT_MS),
        },
      );

      if (!response.ok) {
        const detail = await response.text().catch(() => "");
        errors.push(`${model}: HTTP ${response.status} ${detail.slice(0, 180)}`);
        continue;
      }

      const data = await response.json();
      const candidate = data?.candidates?.[0];
      const summary = (candidate?.content?.parts ?? [])
        .map((part: any) => (typeof part?.text === "string" ? part.text : ""))
        .join("")
        .replace(/\s+/g, " ")
        .trim();
      const metadata = candidate?.groundingMetadata ?? {};
      const chunks = Array.isArray(metadata?.groundingChunks) ? metadata.groundingChunks : [];
      const supports = Array.isArray(metadata?.groundingSupports) ? metadata.groundingSupports : [];

      const snippets = new Map<number, string[]>();
      for (const support of supports) {
        const segment = cleanText(String(support?.segment?.text ?? ""));
        if (!segment) continue;
        for (const rawIndex of support?.groundingChunkIndices ?? []) {
          const index = Number(rawIndex);
          if (!Number.isInteger(index) || index < 0) continue;
          const list = snippets.get(index) ?? [];
          if (!list.includes(segment)) list.push(segment);
          snippets.set(index, list);
        }
      }

      const hits: WebHit[] = [];
      for (let index = 0; index < chunks.length; index += 1) {
        const web = chunks[index]?.web;
        const url = String(web?.uri ?? "").trim();
        if (!url) continue;
        hits.push({
          title: String(web?.title ?? ""),
          url,
          snippet: (snippets.get(index) ?? []).join(" ") || summary.slice(0, 650),
        });
      }

      const normalized = uniqueHits(hits, max);
      if (normalized.length) return normalized;
      errors.push(`${model}: Google grounding returned no source URLs`);
    } catch (error) {
      errors.push(`${model}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  throw new Error(errors.join(" | ") || "Google grounded search returned no results");
}

function unwrapDuckDuckGoUrl(raw: string): string {
  const value = raw.replace(/&amp;/g, "&").trim();
  try {
    const absolute = value.startsWith("//") ? `https:${value}` : value;
    const parsed = new URL(absolute, "https://duckduckgo.com");
    const wrapped = parsed.searchParams.get("uddg");
    if (wrapped) return decodeURIComponent(wrapped);
    return parsed.href;
  } catch {
    const match = value.match(/[?&]uddg=([^&]+)/i);
    if (match) {
      try {
        return decodeURIComponent(match[1]);
      } catch {
        return match[1];
      }
    }
    return value;
  }
}

function parseDuckDuckGoHtml(html: string, max: number): WebHit[] {
  const snippets: string[] = [];
  const snippetRe = /class=["'][^"']*result__snippet[^"']*["'][^>]*>([\s\S]*?)<\/a>/gi;
  let snippetMatch: RegExpExecArray | null;
  while ((snippetMatch = snippetRe.exec(html)) !== null) {
    snippets.push(cleanText(snippetMatch[1]));
  }

  const hits: WebHit[] = [];
  const linkRe = /<a[^>]+class=["'][^"']*result__a[^"']*["'][^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let match: RegExpExecArray | null;
  let index = 0;
  while ((match = linkRe.exec(html)) !== null && hits.length < max * 2) {
    hits.push({
      title: cleanText(match[2]),
      url: unwrapDuckDuckGoUrl(match[1]),
      snippet: snippets[index] ?? "",
    });
    index += 1;
  }
  return uniqueHits(hits, max);
}

function parseDuckDuckGoLite(html: string, max: number): WebHit[] {
  const hits: WebHit[] = [];
  const linkRe = /<a[^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let match: RegExpExecArray | null;
  while ((match = linkRe.exec(html)) !== null && hits.length < max * 3) {
    const title = cleanText(match[2]);
    const url = unwrapDuckDuckGoUrl(match[1]);
    if (!title || /next|previous|duckduckgo/i.test(title)) continue;
    if (!isPublicHttpUrl(url)) continue;

    const after = html.slice(linkRe.lastIndex, linkRe.lastIndex + 900);
    const textMatch = after.match(/<td[^>]*class=["'][^"']*result-snippet[^"']*["'][^>]*>([\s\S]*?)<\/td>/i);
    hits.push({ title, url, snippet: textMatch ? cleanText(textMatch[1]) : "" });
  }
  return uniqueHits(hits, max);
}

async function fetchDuckDuckGo(query: string, max: number): Promise<WebHit[]> {
  const endpoints = [
    `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`,
    `https://lite.duckduckgo.com/lite/?q=${encodeURIComponent(query)}`,
  ];
  const errors: string[] = [];

  for (const endpoint of endpoints) {
    try {
      const response = await fetch(endpoint, {
        redirect: "follow",
        signal: AbortSignal.timeout(12_000),
        headers: {
          "User-Agent": "Mozilla/5.0 (compatible; AlsamosAI/1.0; +https://alsamos.com)",
          Accept: "text/html,application/xhtml+xml",
          "Accept-Language": "en-US,en;q=0.8",
        },
      });
      if (!response.ok) {
        errors.push(`DuckDuckGo HTTP ${response.status}`);
        continue;
      }
      const html = await response.text();
      const hits = endpoint.includes("lite.")
        ? parseDuckDuckGoLite(html, max)
        : parseDuckDuckGoHtml(html, max);
      if (hits.length) return hits;
      errors.push("DuckDuckGo returned no parseable results");
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
    }
  }

  throw new Error(errors.join(" | ") || "DuckDuckGo search failed");
}

/**
 * Historical export name kept so existing aiTools.ts callers do not need a
 * migration. The implementation is now a multi-provider search fallback.
 */
export async function duckDuckGoSearch(query: string, max: number): Promise<WebHit[]> {
  const cleanQuery = query.trim();
  if (!cleanQuery) return [];
  const limit = clampMax(max);
  const errors: string[] = [];

  try {
    const hits = await geminiGroundedSearch(cleanQuery, limit);
    if (hits.length) return hits;
  } catch (error) {
    errors.push(error instanceof Error ? error.message : String(error));
  }

  try {
    const hits = await fetchDuckDuckGo(cleanQuery, limit);
    if (hits.length) return hits;
  } catch (error) {
    errors.push(error instanceof Error ? error.message : String(error));
  }

  throw new Error(`Web search fallbacks failed: ${errors.join(" | ")}`.slice(0, 1400));
}

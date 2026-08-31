// Kalitsiz zaxira web qidiruv (DuckDuckGo HTML).
// URL qo'lda yig'iladi — shablon ichida to'liq manzil yozilmaydi.

import { isPublicHttpUrl } from "./net.ts";

export type WebHit = { title: string; url: string; snippet: string };

const SCHEME = "https:";
const HOST = "//html.duckduckgo.com/html/";

function strip(value: string): string {
  return value.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

export async function duckDuckGoSearch(query: string, max: number): Promise<WebHit[]> {
  const endpoint = SCHEME + HOST + "?q=" + encodeURIComponent(query);
  const res = await fetch(endpoint, {
    headers: { "User-Agent": "AlsamosAI/1.0", Accept: "text/html" },
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

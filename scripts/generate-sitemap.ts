// Runs before `vite dev` and `vite build` (predev/prebuild hooks); writes public/sitemap.xml.

import { writeFileSync } from "fs";
import { resolve } from "path";

const BASE_URL = "https://www.alsamos.com";

interface SitemapEntry {
  path: string;
  lastmod?: string;
  changefreq?: "always" | "hourly" | "daily" | "weekly" | "monthly" | "yearly" | "never";
  priority?: string;
}

// Public, indexable routes only (auth-gated admin/settings/messages routes are omitted).
const entries: SitemapEntry[] = [
  { path: "/", changefreq: "weekly", priority: "1.0" },
  { path: "/home", changefreq: "hourly", priority: "0.9" },
  { path: "/discover", changefreq: "hourly", priority: "0.8" },
  { path: "/search", changefreq: "weekly", priority: "0.6" },
  { path: "/videos", changefreq: "hourly", priority: "0.8" },
  { path: "/marketplace", changefreq: "daily", priority: "0.9" },
  { path: "/channels", changefreq: "daily", priority: "0.7" },
  { path: "/map", changefreq: "weekly", priority: "0.6" },
  { path: "/mini-apps", changefreq: "weekly", priority: "0.5" },
  { path: "/ai", changefreq: "weekly", priority: "0.6" },
];

function generateSitemap(list: SitemapEntry[]) {
  const urls = list.map((e) =>
    [
      `  <url>`,
      `    <loc>${BASE_URL}${e.path}</loc>`,
      e.lastmod ? `    <lastmod>${e.lastmod}</lastmod>` : null,
      e.changefreq ? `    <changefreq>${e.changefreq}</changefreq>` : null,
      e.priority ? `    <priority>${e.priority}</priority>` : null,
      `  </url>`,
    ]
      .filter(Boolean)
      .join("\n"),
  );

  return [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">`,
    ...urls,
    `</urlset>`,
  ].join("\n");
}

writeFileSync(resolve("public/sitemap.xml"), generateSitemap(entries));
console.log(`sitemap.xml written (${entries.length} entries)`);

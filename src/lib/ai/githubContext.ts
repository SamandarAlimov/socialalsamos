// Chatga GitHub repo kontekstini qo'shish.
//
// NIMA UCHUN KERAK: `ai-agent` funksiyasi deploy qilinmaganda chat oddiy
// `ai-assistant` oqimiga tushadi — unda server tomonda GitHub vositasi yo'q va model
// "repozitoriyga kirish imkonim yo'q" deb javob beradi. Shuning uchun repo tuzilishini
// va asosiy fayllarni BRAUZERNING O'ZIDA o'qib, savolga qo'shib yuboramiz.
// Natija: chat haqiqatan ham repo bo'yicha javob beradi, deploy talab qilinmaydi.

import { getGithubRepoMeta, hasGithubToken, listGithubTree, readGithubFile } from './githubConnector';

// MUHIM: to'liq URL literalini bitta template ichida yozmaymiz.
const WEB_SCHEME = 'https://';
const WEB_HOST = 'github.com';
const GH_WEB = WEB_SCHEME + WEB_HOST;

export type RepoRef = {
  owner: string;
  repo: string;
  fullName: string;
  url: string;
};

export const githubRepoUrl = (fullName: string) => `${GH_WEB}/${fullName}`;

const RESERVED = new Set([
  'features',
  'about',
  'pricing',
  'settings',
  'marketplace',
  'explore',
  'topics',
  'orgs',
  'sponsors',
  'notifications',
  'login',
  'join',
]);

const REPO_URL_RE = /(?:https?:\/\/)?(?:www\.)?github\.com\/([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)/gi;
const BARE_RE = /(?:^|[\s(«"'`])([A-Za-z0-9][A-Za-z0-9_.-]{0,38})\/([A-Za-z0-9][A-Za-z0-9_.-]{0,99})(?=$|[\s)»"'`,.:;!?])/g;

const clean = (value: string) => value.replace(/\.git$/i, '').replace(/[.,;:!?)»"'`]+$/g, '');

/** Matndan GitHub repo havolalarini/nomlarini ajratib oladi. */
export function detectRepoRefs(text: string): RepoRef[] {
  if (!text) return [];
  const found = new Map<string, RepoRef>();

  const add = (ownerRaw: string, repoRaw: string) => {
    const owner = clean(ownerRaw);
    const repo = clean(repoRaw);
    if (!owner || !repo) return;
    if (RESERVED.has(owner.toLowerCase())) return;
    const fullName = `${owner}/${repo}`;
    if (found.has(fullName.toLowerCase())) return;
    found.set(fullName.toLowerCase(), {
      owner,
      repo,
      fullName,
      url: githubRepoUrl(fullName),
    });
  };

  let match: RegExpExecArray | null;
  REPO_URL_RE.lastIndex = 0;
  while ((match = REPO_URL_RE.exec(text)) !== null) add(match[1], match[2]);

  // Havola yo'q bo'lsa, "owner/repo" ko'rinishidagi nomlarni ham qabul qilamiz.
  if (found.size === 0) {
    BARE_RE.lastIndex = 0;
    while ((match = BARE_RE.exec(text)) !== null) {
      const candidate = `${match[1]}/${match[2]}`;
      // Yo'l/sana/kasr kabi noto'g'ri mosliklarni chetlab o'tamiz.
      if (/^\d+\/\d+$/.test(candidate)) continue;
      if (candidate.split('/').length !== 2) continue;
      add(match[1], match[2]);
    }
  }

  return Array.from(found.values()).slice(0, 2);
}

/** Matndagi barcha github.com havolalari (UI chiplari uchun). */
export const detectRepoLinks = (text: string): RepoRef[] => {
  if (!text) return [];
  const found = new Map<string, RepoRef>();
  let match: RegExpExecArray | null;
  REPO_URL_RE.lastIndex = 0;
  while ((match = REPO_URL_RE.exec(text)) !== null) {
    const owner = clean(match[1]);
    const repo = clean(match[2]);
    if (!owner || !repo || RESERVED.has(owner.toLowerCase())) continue;
    const fullName = `${owner}/${repo}`;
    if (!found.has(fullName.toLowerCase())) {
      found.set(fullName.toLowerCase(), { owner, repo, fullName, url: githubRepoUrl(fullName) });
    }
  }
  return Array.from(found.values());
};

export const githubReady = () => hasGithubToken();

const IGNORED = [
  'node_modules/',
  '.git/',
  'dist/',
  'build/',
  '.next/',
  'coverage/',
  'ios/Pods/',
  '.dart_tool/',
];

const IGNORED_EXT = /\.(png|jpe?g|gif|webp|svg|ico|mp4|mov|mp3|wav|woff2?|ttf|eot|lock|zip|pdf)$/i;

/** "Sahifa" deb hisoblanadigan fayllar (React/Next/Flutter). */
const isPage = (path: string) =>
  /(^|\/)(pages|screens|views|routes)\//i.test(path) ||
  /(^|\/)app\/.*\/page\.(t|j)sx?$/i.test(path) ||
  /_(page|screen)\.dart$/i.test(path) ||
  /(Page|Screen)\.(t|j)sx?$/.test(path);

const KEY_FILES = [
  'package.json',
  'pubspec.yaml',
  'README.md',
  'src/App.tsx',
  'src/App.jsx',
  'src/main.tsx',
  'src/routes.tsx',
  'lib/main.dart',
  'next.config.js',
  'vite.config.ts',
];

const MAX_FILE_CHARS = 6000;
const MAX_LISTED_PATHS = 500;

export type RepoContext = {
  ref: RepoRef;
  summary: string;
  context: string;
  fileCount: number;
  pageCount: number;
};

/**
 * Repo tuzilishini va bir nechta asosiy faylni o'qib, model uchun kontekst matni tuzadi.
 */
export async function buildRepoContext(ref: RepoRef): Promise<RepoContext> {
  const [meta, tree] = await Promise.all([
    getGithubRepoMeta(ref.owner, ref.repo).catch(() => null),
    listGithubTree(ref.owner, ref.repo),
  ]);

  const paths = tree.paths.filter(
    (p) => !IGNORED.some((prefix) => p.startsWith(prefix) || p.includes(`/${prefix}`)) && !IGNORED_EXT.test(p),
  );

  const pages = paths.filter(isPage);

  const wanted = KEY_FILES.filter((f) => paths.includes(f)).slice(0, 4);
  const files = await Promise.all(
    wanted.map(async (path) => {
      try {
        const file = await readGithubFile(ref.owner, ref.repo, path, tree.branch);
        const body =
          file.content.length > MAX_FILE_CHARS
            ? `${file.content.slice(0, MAX_FILE_CHARS)}\n… (qisqartirildi)`
            : file.content;
        return { path, body };
      } catch {
        return null;
      }
    }),
  );

  const listed = paths.slice(0, MAX_LISTED_PATHS);

  const lines: string[] = [];
  lines.push('[ALSAMOS GITHUB KONTEKSTI — quyidagi maʼlumot repodan real vaqtda oʻqildi]');
  lines.push(`Repo: ${ref.fullName}`);
  lines.push(`Havola: ${ref.url}`);
  if (meta) {
    lines.push(`Tarmoq: ${meta.defaultBranch}`);
    if (meta.language) lines.push(`Asosiy til: ${meta.language}`);
    if (meta.description) lines.push(`Tavsif: ${meta.description}`);
    lines.push(`Turi: ${meta.private ? 'private' : 'public'}`);
  }
  lines.push(`Jami fayl (filtrlangan): ${paths.length}${tree.truncated ? '+ (roʻyxat qisqartirilgan)' : ''}`);
  lines.push(`Sahifa/ekran koʻrinishidagi fayllar: ${pages.length}`);
  lines.push('');

  if (pages.length > 0) {
    lines.push('Sahifa fayllari:');
    for (const p of pages.slice(0, 200)) lines.push(`- ${p}`);
    lines.push('');
  }

  lines.push(`Fayl tuzilishi (${listed.length} ta):`);
  for (const p of listed) lines.push(`- ${p}`);
  lines.push('');

  for (const file of files) {
    if (!file) continue;
    lines.push(`--- FAYL: ${file.path} ---`);
    lines.push(file.body);
    lines.push('');
  }

  lines.push(
    'Yuqoridagi maʼlumotga tayanib javob ber. "Menda repozitoriyga kirish imkonim yoʻq" deb aytma — kontekst allaqachon berilgan. Fayl nomlarini aniq keltir.',
  );

  return {
    ref,
    summary: `${ref.fullName}: ${paths.length} fayl, ${pages.length} sahifa oʻqildi`,
    context: lines.join('\n'),
    fileCount: paths.length,
    pageCount: pages.length,
  };
}

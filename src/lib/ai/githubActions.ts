/**
 * GitHub AMALLARI — chatdan turib real yozish operatsiyalari.
 *
 * Muammo: AI «repo yarat» deyilganda hech narsa qilmasdi, chunki unda faqat
 * O'QISH konteksti bor edi (githubContext.ts). Bu modul foydalanuvchining o'z
 * tokeni bilan haqiqiy amallarni bajaradi: repo yaratish, fayl yozish, branch
 * ochish, issue yaratish. Hech qanday deploy talab qilinmaydi — so'rov
 * brauzerdan to'g'ridan-to'g'ri GitHub API'ga ketadi.
 */

const GH_API = 'https://' + 'api.github.com';
const TOKEN_KEY = 'alsamos.github.pat';

const readToken = (): string | null => {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
};

export const canRunGithubActions = (): boolean => Boolean(readToken());

async function gh<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = readToken();
  if (!token) {
    throw new Error(
      'GitHub ulanmagan. Yon paneldagi GitHub bo\u2018limidan token bilan ulang.',
    );
  }

  const response = await fetch(GH_API + path, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'Content-Type': 'application/json',
      ...(init.headers || {}),
    },
  });

  const text = await response.text();
  const data = text ? JSON.parse(text) : {};

  if (!response.ok) {
    const message =
      (data as { message?: string }).message || `GitHub xatosi (${response.status})`;
    const details = (data as { errors?: Array<{ message?: string; field?: string }> }).errors;
    const extra = details?.map((e) => e.message || e.field).filter(Boolean).join(', ');
    throw new Error(extra ? `${message}: ${extra}` : message);
  }

  return data as T;
}

/** UTF-8 matnni base64 ga o'giradi (GitHub contents API shuni kutadi). */
function toBase64(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  bytes.forEach((b) => {
    binary += String.fromCharCode(b);
  });
  return btoa(binary);
}

/* ------------------------------ amal turlari ------------------------------ */

export type GithubAction =
  | { kind: 'create_repo'; name: string; isPrivate: boolean; description?: string }
  | { kind: 'create_issue'; owner: string; repo: string; title: string; body?: string }
  | {
      kind: 'create_file';
      owner: string;
      repo: string;
      path: string;
      content: string;
      message?: string;
      branch?: string;
    }
  | { kind: 'create_branch'; owner: string; repo: string; branch: string; from?: string };

export type GithubActionResult = {
  summary: string;
  url?: string;
  data?: Record<string, unknown>;
};

export function githubActionLabel(action: GithubAction): string {
  switch (action.kind) {
    case 'create_repo':
      return `GitHub: «${action.name}» repozitoriysi yaratilmoqda`;
    case 'create_issue':
      return `GitHub: ${action.owner}/${action.repo} — issue yaratilmoqda`;
    case 'create_file':
      return `GitHub: ${action.path} fayli yozilmoqda`;
    case 'create_branch':
      return `GitHub: ${action.branch} branchi ochilmoqda`;
  }
}

/* -------------------------------- bajarish -------------------------------- */

export async function runGithubAction(action: GithubAction): Promise<GithubActionResult> {
  switch (action.kind) {
    case 'create_repo': {
      const created = await gh<{ full_name: string; html_url: string; private: boolean }>(
        '/user/repos',
        {
          method: 'POST',
          body: JSON.stringify({
            name: action.name,
            private: action.isPrivate,
            description: action.description,
            auto_init: true,
          }),
        },
      );
      return {
        summary: `${created.full_name} yaratildi (${
          created.private ? 'yopiq' : 'ochiq'
        }), README bilan.`,
        url: created.html_url,
        data: { fullName: created.full_name, private: created.private },
      };
    }

    case 'create_issue': {
      const created = await gh<{ number: number; html_url: string }>(
        `/repos/${action.owner}/${action.repo}/issues`,
        {
          method: 'POST',
          body: JSON.stringify({ title: action.title, body: action.body }),
        },
      );
      return {
        summary: `#${created.number} issue yaratildi: ${action.title}`,
        url: created.html_url,
        data: { number: created.number },
      };
    }

    case 'create_file': {
      const encodedPath = action.path
        .split('/')
        .map((part) => encodeURIComponent(part))
        .join('/');

      // Fayl mavjud bo'lsa sha kerak — aks holda GitHub 422 qaytaradi.
      let sha: string | undefined;
      try {
        const existing = await gh<{ sha?: string }>(
          `/repos/${action.owner}/${action.repo}/contents/${encodedPath}`,
        );
        sha = existing.sha;
      } catch {
        sha = undefined;
      }

      const saved = await gh<{ content?: { html_url?: string } }>(
        `/repos/${action.owner}/${action.repo}/contents/${encodedPath}`,
        {
          method: 'PUT',
          body: JSON.stringify({
            message: action.message || `feat: ${action.path}`,
            content: toBase64(action.content),
            branch: action.branch,
            sha,
          }),
        },
      );
      return {
        summary: `${action.path} ${sha ? 'yangilandi' : 'yaratildi'}.`,
        url: saved.content?.html_url,
      };
    }

    case 'create_branch': {
      const base = action.from || 'main';
      const ref = await gh<{ object: { sha: string } }>(
        `/repos/${action.owner}/${action.repo}/git/ref/heads/${base}`,
      );
      await gh(`/repos/${action.owner}/${action.repo}/git/refs`, {
        method: 'POST',
        body: JSON.stringify({
          ref: `refs/heads/${action.branch}`,
          sha: ref.object.sha,
        }),
      });
      return { summary: `${action.branch} branchi ${base} dan ochildi.` };
    }
  }
}

/* ------------------------------ niyatni aniqlash --------------------------- */

const CREATE_WORDS =
  '(yarat|yaratib|yasa|yasab|och|ochib|qur|tuz|tuzib|create|make|new|\u0441\u043e\u0437\u0434\u0430)';
const REPO_WORDS = '(repo|repozitoriy|repozitoriya|repository|\u0440\u0435\u043f\u043e)';

const REPO_INTENT = new RegExp(`${REPO_WORDS}[^.\\n]{0,40}${CREATE_WORDS}`, 'i');
const REPO_INTENT_REVERSE = new RegExp(`${CREATE_WORDS}[^.\\n]{0,20}${REPO_WORDS}`, 'i');

const ISSUE_INTENT = new RegExp(`(issue|masala|vazifa)[^.\\n]{0,40}${CREATE_WORDS}`, 'i');

const PRIVATE_WORDS = /(private|yopiq|maxfiy|\u043f\u0440\u0438\u0432\u0430\u0442)/i;
const PUBLIC_WORDS = /(public|ochiq|\u043f\u0443\u0431\u043b\u0438\u0447)/i;

/** Nom: qo'shtirnoq ichida yoki «nomi/nomli/named/called» dan keyin. */
function extractName(text: string): string | null {
  const quoted = text.match(/[«"'`“]([A-Za-z0-9._-]{2,60})[»"'`”]/);
  if (quoted) return quoted[1];

  const named = text.match(
    /(?:nomi|nomli|nomida|deb|named|called|\u0438\u043c\u0435\u043d\u0435\u043c)\s+[«"'`]?([A-Za-z0-9._-]{2,60})[»"'`]?/i,
  );
  if (named) return named[1];

  // Slug ko'rinishidagi so'z (chiziqcha yoki pastki chiziq bilan).
  const slug = text.match(/\b([a-z0-9]+(?:[-_][a-z0-9]+)+)\b/i);
  if (slug && !/^https?/i.test(slug[1])) return slug[1];

  return null;
}

/**
 * Foydalanuvchi matnidan bajarish mumkin bo'lgan GitHub amalini aniqlaydi.
 * Aniq emas bo'lsa `null` qaytaradi — unda AI oddiy javob beradi.
 *
 * @param text foydalanuvchi xabari
 * @param contextRepo matnda havola qilingan repo (owner/name), agar bo'lsa
 */
export function detectGithubAction(
  text: string,
  contextRepo?: { owner: string; repo: string } | null,
): GithubAction | null {
  if (!text) return null;

  // 1) Yangi repozitoriy yaratish
  if (REPO_INTENT.test(text) || REPO_INTENT_REVERSE.test(text)) {
    const name = extractName(text);
    if (name) {
      return {
        kind: 'create_repo',
        name,
        // Xavfsiz standart: aniq «ochiq» deyilmasa, yopiq repo yaratamiz.
        isPrivate: PUBLIC_WORDS.test(text) ? false : true || PRIVATE_WORDS.test(text),
        description: 'Alsamos AI orqali yaratildi',
      };
    }
  }

  // 2) Issue yaratish — repo aniq bo'lishi shart
  if (contextRepo && ISSUE_INTENT.test(text)) {
    const title = extractName(text) || text.trim().slice(0, 80);
    return {
      kind: 'create_issue',
      owner: contextRepo.owner,
      repo: contextRepo.repo,
      title,
      body: `Alsamos AI chatidan yaratildi.\n\nSo\u2018rov: ${text.trim().slice(0, 500)}`,
    };
  }

  return null;
}

/** Brain kontekstiga qo'shiladigan blok — AI o'z imkoniyatini bilib tursin. */
export function githubActionsBlock(): string {
  if (!canRunGithubActions()) {
    return [
      '[GITHUB AMALLARI]',
      'GitHub hozir ULANMAGAN. Foydalanuvchi repo yaratishni yoki repoda o\u2018zgarish',
      'qilishni so\u2018rasa, avval yon paneldagi GitHub bo\u2018limidan ulanishni ayting.',
    ].join('\n');
  }

  return [
    '[GITHUB AMALLARI]',
    'GitHub ULANGAN va sen REAL amallarni bajara olasan (foydalanuvchi tokeni bilan):',
    '- yangi repozitoriy yaratish',
    '- repoga fayl yozish yoki mavjud faylni yangilash',
    '- branch ochish',
    '- issue yaratish',
    'Bu amallar chat qatlamida avtomatik bajariladi va natijasi senga',
    '«GITHUB AMALI BAJARILDI» bloki sifatida keladi.',
    'MUHIM: «menda GitHub’ga kirish imkoni yo\u2018q» yoki «buni o\u2018zingiz qiling» DEMA.',
    'Amal bajarilgan bo\u2018lsa — natijani havolasi bilan tasdiqla. Bajarilmagan bo\u2018lsa —',
    'aniq sababini ayt va nima kerakligini bir jumlada tushuntir.',
  ].join('\n');
}

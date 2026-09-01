// Skillar — qayta ishlatiladigan ko'rsatma to'plamlari (Claude "Skills" kabi).
//
// Har bir skill: qachon yoqilishi (triggers) va model qanday ishlashi (instructions).
// Tayyor skillar kodda, foydalanuvchi qo'shganlari brauzerda saqlanadi.

const KEY = 'alsamos.ai.skills';

export type Skill = {
  id: string;
  name: string;
  description: string;
  /** Kichik harfli kalit so'zlar — xabarda uchrasa skill yoqiladi. */
  triggers: string[];
  instructions: string;
  builtin?: boolean;
  enabled?: boolean;
};

export const BUILTIN_SKILLS: Skill[] = [
  {
    id: 'code-engineer',
    name: 'Muhandis (kod)',
    description: 'To\u2018liq ishlaydigan kod, arxitektura, refaktoring va debug',
    triggers: ['kod', 'code', 'bug', 'xato', 'funksiya', 'component', 'api', 'refactor', 'debug', 'typescript', 'react', 'python', 'flutter', 'dart', 'sql'],
    instructions: [
      'Kod yozganda: to\u2018liq, ishga tushadigan fayl ber — "..." qoldirma.',
      'Avval qisqa reja, keyin kod, keyin qanday sinash kerakligi.',
      'Xatolarni tuzatganda ildiz sababini ayt, keyin tuzatishni ber.',
      'Til/freymvork versiyasiga mos zamonaviy uslub ishlat, xavfsizlikka e\u02bctibor ber.',
    ].join('\n'),
    builtin: true,
  },
  {
    id: 'git-workflow',
    name: 'Git va repo',
    description: 'Repo tahlili, commit/PR matnlari, branch strategiyasi',
    triggers: ['git', 'github', 'repo', 'commit', 'pull request', 'pr', 'branch', 'merge'],
    instructions: [
      'Repo konteksti berilgan bo\u2018lsa — faqat real fayl nomlariga tayan, taxmin qilma.',
      'Commit xabarlari Conventional Commits uslubida bo\u2018lsin.',
      'O\u2018zgarish taklif qilsang, qaysi faylning qaysi qismi ekanini aniq ko\u2018rsat.',
    ].join('\n'),
    builtin: true,
  },
  {
    id: 'data-sheets',
    name: 'Excel va jadvallar',
    description: 'Excel/CSV tahlili, formulalar, hisobotlar',
    triggers: ['excel', 'csv', 'jadval', 'sheet', 'formula', 'hisobot', 'byudjet', 'statistika', 'pivot'],
    instructions: [
      'Jadval so\u2018ralsa Markdown jadval ber; katta hisob-kitobni kod bilan tekshir.',
      'Excel formulasi so\u2018ralsa aniq formulani ber va nima qilishini bir qatorda tushuntir.',
      'Fayl yaratish kerak bo\u2018lsa CSV yoki JS (SheetJS) kodi ko\u2018rinishida ber.',
    ].join('\n'),
    builtin: true,
  },
  {
    id: 'automation',
    name: 'Kompyuter va brauzer boshqaruvi',
    description: 'Bridge orqali buyruq, fayl, ekran; brauzer avtomatizatsiyasi',
    triggers: ['kompyuter', 'terminal', 'buyruq', 'shell', 'fayl och', 'papka', 'brauzer', 'browser', 'avtomat', 'skript', 'vs code', 'vscode'],
    instructions: [
      'Kompyuter amali kerak bo\u2018lsa: aniq qadamlar rejasini ber va tasdiq so\u2018ra.',
      'Xavfli buyruqlarni (o\u2018chirish, format, tizim fayllari) hech qachon tasdiqsiz taklif qilma.',
      'Bridge ulanmagan bo\u2018lsa — qo\u2018lda bajariladigan aniq buyruqlarni ber (Windows/macOS/Linux).',
      'VS Code uchun: aniq fayl yo\u2018li, kengaytma nomi yoki buyruq palitrasi qadamlarini ko\u2018rsat.',
    ].join('\n'),
    builtin: true,
  },
  {
    id: 'media',
    name: 'Rasm va video',
    description: 'Vizual kontent generatsiyasi va prompt muhandisligi',
    triggers: ['rasm', 'surat', 'image', 'logo', 'dizayn', 'video', 'animatsiya', 'banner', 'thumbnail'],
    instructions: [
      'Foydalanuvchi rasm/video so\u2018rasa — hech qanday rejim tanlashini kutma, darhol yaratishga o\u2018t.',
      'Prompt tuzganda uslub, kompozitsiya, yorug\u2018lik va format nisbatini aniq yoz.',
      'Vosita mavjud bo\u2018lmasa — tayyor promptni ber va qayerda ishlatishni ayt.',
    ].join('\n'),
    builtin: true,
  },
  {
    id: 'research',
    name: 'Tadqiqot va tahlil',
    description: 'Manbalar bilan chuqur tahlil, taqqoslash, xulosa',
    triggers: ['tahlil', 'taqqosla', 'qidir', 'research', 'manba', 'statistika', 'bozor', 'raqobat'],
    instructions: [
      'Xulosani birinchi qil, keyin dalillar.',
      'Aniq bo\u2018lmagan joyni "aniq emas" deb belgila — to\u2018qima.',
      'Veb natijalari bo\u2018lsa manbalarni raqamlab ko\u2018rsat.',
    ].join('\n'),
    builtin: true,
  },
  {
    id: 'writing',
    name: 'Hujjat va matn',
    description: 'Reja, taqdimot, hujjat, post matni',
    triggers: ['hujjat', 'reja', 'maqola', 'post', 'matn', 'taqdimot', 'shartnoma', 'xat', 'strategiya'],
    instructions: [
      'Tuzilma bilan yoz: sarlavhalar, qisqa xatboshi, kerak bo\u2018lsa jadval.',
      'Ortiqcha muqaddima yozma — darhol mazmunga o\u2018t.',
    ].join('\n'),
    builtin: true,
  },
];

const readCustom = (): Skill[] => {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || '[]');
    return Array.isArray(raw) ? (raw as Skill[]) : [];
  } catch {
    return [];
  }
};

const writeCustom = (items: Skill[]) => {
  try {
    localStorage.setItem(KEY, JSON.stringify(items));
  } catch {
    /* e'tiborsiz */
  }
};

export const listSkills = (): Skill[] => [...BUILTIN_SKILLS, ...readCustom()];

export function saveSkill(skill: Omit<Skill, 'builtin'> & { id?: string }): Skill {
  const items = readCustom();
  const id = skill.id && !BUILTIN_SKILLS.some((b) => b.id === skill.id) ? skill.id : crypto.randomUUID();
  const next: Skill = {
    id,
    name: skill.name.trim() || 'Nomsiz skill',
    description: skill.description?.trim() || '',
    triggers: (skill.triggers || []).map((t) => t.trim().toLowerCase()).filter(Boolean),
    instructions: skill.instructions.trim(),
    enabled: skill.enabled ?? true,
  };
  const existing = items.findIndex((s) => s.id === id);
  if (existing >= 0) items[existing] = next;
  else items.push(next);
  writeCustom(items);
  return next;
}

export function deleteSkill(id: string) {
  writeCustom(readCustom().filter((s) => s.id !== id));
}

/** Xabar matniga mos skillarni tanlaydi. */
export function matchSkills(text: string, limit = 3): Skill[] {
  const lower = (text || '').toLowerCase();
  const scored = listSkills()
    .filter((s) => s.enabled !== false)
    .map((skill) => ({
      skill,
      score: skill.triggers.reduce((sum, trigger) => (lower.includes(trigger) ? sum + 1 : sum), 0),
    }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score);

  return scored.slice(0, limit).map((entry) => entry.skill);
}

/** Tanlangan skillarni model uchun matn blokiga aylantiradi. */
export function skillBlock(skills: Skill[]): string {
  if (skills.length === 0) return '';
  return [
    'FAOL SKILLAR (shu savol uchun tanlandi — ko\u02bbrsatmalariga amal qil):',
    ...skills.map((s) => `▸ ${s.name}\n${s.instructions}`),
  ].join('\n');
}

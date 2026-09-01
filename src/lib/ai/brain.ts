// "Miya" qatlami — Alsamos AI ning asosiy ko'rsatmasi va konteksti.
//
// NIMA UCHUN BU YERDA (serverda emas): jonli `ai-assistant` funksiyasi so'rovdagi
// `context` maydonini o'z system prompti ichiga qo'shadi. Shu sababli AI ning
// xulqini deploy qilmasdan turib shu yerdan kengaytira olamiz.
// `ai-agent` deploy qilinganda ham bu kontekst o'z kuchini saqlaydi.

import type { AIConversation } from '@/components/ai/types';
import { memoryBlock, listMemories, type MemoryItem } from './memory';
import { matchSkills, skillBlock } from './skills';
import { hasGithubToken } from './githubConnector';

export const MASTER_PROMPT = `Sen — Alsamos AI. Sen umumiy maqsadli, professional darajadagi AI yordamchisan (Claude yoki ChatGPT darajasida), Alsamos superilovasiga chuqur integratsiyalangan.

SENING DOIRANG CHEKLANMAGAN. Sen quyidagilarning barchasi bilan ishlaysan:
• Dasturlash: har qanday tilda toʻliq ishlaydigan kod, arxitektura, code review, debug, testlar, migratsiyalar.
• Git va repozitoriylar: ulangan GitHub orqali repo tuzilishi va fayllarni oʻqish, tahlil qilish, oʻzgarish taklif qilish, commit/PR matnlari.
• Kompyuter boshqaruvi: Alsamos Bridge orqali terminal buyruqlari, fayl oʻqish/yozish, papkalar, ilovalarni ochish, ekran amallari — har doim foydalanuvchi tasdigʻi bilan.
• Brauzer va veb: sahifalarni oʻqish, maʼlumot qidirish, veb jarayonlarini avtomatlashtirish boʻyicha skript va qadamlar.
• Hujjatlar va maʼlumot: Excel/CSV/jadval tahlili, formulalar, hisobotlar, taqdimotlar, shartnoma va reja matnlari.
• Vizual kontent: rasm generatsiyasi va tahriri, video ssenariysi va generatsiyasi, prompt muhandisligi.
• Alsamos maʼlumotlari: postlar, marketplace, hamyon, xabarlar boʻyicha yordam.
• Konnektorlar/MCP: ulangan tashqi xizmatlar vositalari.

ISHLASH USULING:
1. Foydalanuvchi nima soʻraganini bajar — imkoniyatlaring haqida uzundan-uzoq ogohlantirish yozma.
2. Rejim yoki vosita tanlashini soʻrama. Rasm kerak boʻlsa — rasm yarat, kod kerak boʻlsa — kod yoz. Qaror sen qabul qilasan.
3. Qoʻlingda kerakli vosita ishlamasa: buni bir jumlada ayt va DARHOL eng yaxshi muqobilni ber (tayyor kod, aniq buyruq, tayyor prompt, qadamlar roʻyxati). Hech qachon shunchaki "imkonim yoʻq" deb toʻxtama.
4. Kontekstda repo, fayl yoki maʼlumot berilgan boʻlsa — u REAL oʻqilgan maʼlumot. "Menda kirish yoʻq" dema, aniq fayl nomlari va raqamlar bilan javob ber.
5. Uzun ishni bosqichlarga boʻl va oxirigacha yetkaz; yarim javob qoldirma.
6. Aniq bilmagan narsani taxmin qilib toʻqima — "aniq emas" deb belgila.

USLUB:
• Foydalanuvchi qaysi tilda yozsa, oʻsha tilda javob ber (asosan oʻzbekcha).
• Qisqa muqaddima, keyin mazmun. Ortiqcha uzr va takrorlash yoʻq.
• Kodni doim toʻliq blok ichida ber; jadval kerak boʻlsa Markdown jadval ishlat.

XAVFSIZLIK (buzilmaydi):
• Pul oʻtkazish, post chop etish, xabar yuborish yoki fayl oʻchirish kabi qaytarib boʻlmaydigan amallarni foydalanuvchi tasdigʻisiz bajarma.
• Boshqa foydalanuvchining shaxsiy maʼlumotini oshkor qilma.
• Firibgarlik belgilarini koʻrsang ogohlantir.`;

export type BrainInput = {
  userText: string;
  conversations?: AIConversation[];
  currentConversationId?: string | null;
  memories?: MemoryItem[];
};

/** Boshqa suhbatlardan qisqacha — "bitta chatdagi gap boshqasida davom etsin" uchun. */
export function crossChatBlock(
  conversations: AIConversation[] = [],
  currentId?: string | null,
  limit = 6,
): string {
  const others = conversations
    .filter((c) => c.id !== currentId && c.messages.length > 0)
    .slice(0, limit);
  if (others.length === 0) return '';

  const lines = others.map((conv) => {
    const lastUser = [...conv.messages].reverse().find((m) => m.role === 'user');
    const lastAssistant = [...conv.messages].reverse().find((m) => m.role === 'assistant');
    const snippet = [
      lastUser ? `so\u02bbradi: ${lastUser.content.slice(0, 160)}` : '',
      lastAssistant ? `javob: ${lastAssistant.content.slice(0, 160)}` : '',
    ]
      .filter(Boolean)
      .join(' | ');
    return `- «${conv.title}» — ${snippet}`;
  });

  return [
    'BOSHQA SUHBATLAR (foydalanuvchining yaqinda gaplashgan mavzulari):',
    ...lines,
    'Foydalanuvchi "oldin gaplashgan edik", "o\u02bbsha loyiha" desa — shu ro\u02bbyxatdan mos mavzuni top va davom ettir.',
  ].join('\n');
}

/** Ulangan imkoniyatlar holati — model nimaga tayanishi mumkinligini bilsin. */
function environmentBlock(): string {
  const lines = [
    `GitHub: ${hasGithubToken() ? 'ULANGAN — repo fayllari o\u02bbqilishi mumkin' : 'ulanmagan'}`,
    'Veb qidiruv: mavjud',
    'Rasm generatsiyasi: mavjud',
    'Kod sandbox: mavjud',
    'Kompyuter (Bridge): foydalanuvchi ulagan bo\u02bblsa tasdiq bilan',
  ];
  return ['MUHIT HOLATI:', ...lines.map((l) => `- ${l}`)].join('\n');
}

/**
 * `ai-assistant`/`ai-agent` ga yuboriladigan to'liq kontekst matni.
 * Server uni o'z system prompti ichiga qo'shadi.
 */
export function buildBrainContext(input: BrainInput): string {
  const memories = input.memories ?? listMemories();
  const skills = matchSkills(input.userText);

  const blocks = [
    MASTER_PROMPT,
    environmentBlock(),
    memoryBlock(memories),
    crossChatBlock(input.conversations, input.currentConversationId),
    skillBlock(skills),
  ].filter(Boolean);

  return blocks.join('\n\n');
}

export { listMemories };

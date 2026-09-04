// Alsamos AI context layer: durable memory, project knowledge and recent chats.
// The resulting text is injected into the request by AIPage so both the full
// agent and the lightweight fallback receive the same long-term context.

import type { AIConversation, AIProject } from '@/components/ai/types';
import { memoryBlock, listMemories, type MemoryItem } from './memory';
import { matchSkills, skillBlock } from './skills';
import { hasGithubToken } from './githubConnector';
import { projectForConversation, readActiveLocalProject } from './projectsStore';

export const MASTER_PROMPT = `Sen — Alsamos AI. Sen umumiy maqsadli, professional darajadagi AI yordamchisan va Alsamos ichida foydalanuvchining vazifasini imkon qadar oxirigacha bajarasan.

ASOSIY QOIDA
• Foydalanuvchi nima so‘ragan bo‘lsa shuni bajar. Uni keraksiz rejim, bot yoki sun’iy cheklovlar bilan to‘xtatma.
• Mavjud vositalarni o‘zing tanla. Rasm kerak bo‘lsa rasm vositasini, video kerak bo‘lsa video vositasini, web kerak bo‘lsa webni, kod tekshirish kerak bo‘lsa sandboxni ishlat.
• Vosita ishlamasa aniq xatoni bir jumlada ayt va keyingi eng yaxshi amaliy yechimga o‘t.
• Repo/fayl/kontekst real berilgan bo‘lsa, uni o‘qilgan ma’lumot deb qabul qil; umumiy gap o‘rniga aniq fayl, funksiya va natijalar bilan ishlagin.
• Xavfsizlik va qaytarib bo‘lmaydigan amallar uchun zarur tasdiqlar saqlanadi; qolgan joylarda keraksiz ruxsat so‘rama.

JAVOB UZUNLIGI — VAZIYATGA MOS
• Oddiy savol, tasdiq yoki bitta fakt: 1–4 gap, ortiqcha bo‘limlarsiz.
• Taqqoslash yoki tavsiya: qisqa xulosa + kerakli dalillar.
• Arxitektura, kod, debugging, research, strategiya, loyiha yoki “to‘liq” so‘rov: yetarlicha batafsil va oxirigacha.
• Foydalanuvchi “qisqa” yoki “batafsil” desa, shu ko‘rsatma ustun.
• Murakkab ishni faqat “qisqa bo‘lish” uchun kesib tashlama; lekin keraksiz nazariya bilan cho‘zma.

ISHLASH USULI
1. Vazifani tushun, zarur bo‘lsa vositalarni ketma-ket ishlat, keyin natijani ber.
2. Kod so‘ralganda ishlaydigan, yaxlit yechim ber; faqat kerakli joyni tushuntir.
3. Yangilanib turadigan yoki ishonchsiz faktni web orqali tekshir.
4. Rasm/video generatsiyasi so‘ralsa “qila olmayman” demasdan media vositasini chaqir; vosita xato qilsa aynan xatoni ayt.
5. Oldingi suhbat, loyiha ko‘rsatmalari va xotiradagi ma’lumotlardan tabiiy foydalan.
6. Bilmagan narsani to‘qima.

TIL VA USLUB
• Foydalanuvchi qaysi tilda yozsa o‘sha tilda javob ber.
• To‘g‘ridan-to‘g‘ri mazmunga o‘t; ortiqcha uzr, self-reference va takrorlash yo‘q.
• Markdownni faqat o‘qishni yaxshilaganda ishlat.

XAVFSIZLIK
• Pul sarflash/o‘tkazish, tashqi xabar yuborish, post chop etish, faylni qaytarib bo‘lmaydigan tarzda o‘chirish kabi amallar foydalanuvchi tasdig‘isiz bajarilmaydi.
• Maxfiy ma’lumotni oshkor qilma va zararli amallarni bajarishda xavfsizlik qoidalarini saqla.`;

export type BrainInput = {
  userText: string;
  conversations?: AIConversation[];
  currentConversationId?: string | null;
  memories?: MemoryItem[];
  activeProject?: AIProject | null;
};

function cleanSnippet(value: string, max = 520): string {
  return value.replace(/\s+/g, ' ').trim().slice(0, max);
}

export function crossChatBlock(
  conversations: AIConversation[] = [],
  currentId?: string | null,
  limit = 10,
): string {
  const others = conversations
    .filter((conversation) => conversation.id !== currentId && conversation.messages.length > 0)
    .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())
    .slice(0, limit);
  if (others.length === 0) return '';

  const lines = others.map((conversation) => {
    const recent = conversation.messages.slice(-4).map((message) => {
      const who = message.role === 'user' ? 'user' : 'assistant';
      return `${who}: ${cleanSnippet(message.content)}`;
    });
    return [`## ${conversation.title}`, ...recent].join('\n');
  });

  return [
    'YAQIN SUHBATLAR KONTEKSTI:',
    ...lines,
    'Agar foydalanuvchi oldingi mavzuga ishora qilsa, mos kontekstni topib tabiiy davom ettir. Noaniq bo‘lsa taxminni aniq belgilagin.',
  ].join('\n');
}

export function projectBlock(
  project: AIProject | null | undefined,
  conversations: AIConversation[] = [],
  currentId?: string | null,
  localUserId?: string,
): string {
  if (!project) return '';

  const projectChats = conversations
    .filter((conversation) => {
      if (conversation.id === currentId || conversation.messages.length === 0) return false;
      if (conversation.projectId === project.id) return true;
      return Boolean(
        localUserId && projectForConversation(localUserId, conversation.id) === project.id,
      );
    })
    .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())
    .slice(0, 8);

  const chatContext = projectChats.flatMap((conversation) => [
    `### ${conversation.title}`,
    ...conversation.messages
      .slice(-5)
      .map((message) => `${message.role}: ${cleanSnippet(message.content, 650)}`),
  ]);

  return [
    `AKTIV LOYIHA: ${project.name}`,
    project.instructions.trim()
      ? `LOYIHA KO‘RSATMALARI:\n${project.instructions.trim().slice(0, 12000)}`
      : 'Loyiha uchun alohida ko‘rsatma berilmagan.',
    chatContext.length ? `LOYIHADAGI BOSHQA SUHBATLAR:\n${chatContext.join('\n')}` : '',
    'Bu loyiha konteksti shu loyiha ichidagi suhbat uchun umumiy bilim va ko‘rsatma sifatida ishlatiladi.',
  ]
    .filter(Boolean)
    .join('\n\n');
}

function environmentBlock(): string {
  const lines = [
    `GitHub: ${hasGithubToken() ? 'ulangan — repo fayllari o‘qilishi mumkin' : 'ulanmagan'}`,
    'Veb qidiruv: mavjud',
    'Rasm generatsiyasi: mavjud',
    'Video generatsiyasi: mavjud; render vaqt olishi mumkin',
    'Kod sandbox: mavjud',
    'Kompyuter Bridge: foydalanuvchi ulagan bo‘lsa tasdiq bilan',
  ];
  return ['MUHIT HOLATI:', ...lines.map((line) => `- ${line}`)].join('\n');
}

export function buildBrainContext(input: BrainInput): string {
  const memories = input.memories ?? listMemories();
  const skills = matchSkills(input.userText);
  const localActive = readActiveLocalProject();
  const effectiveProject = input.activeProject || localActive?.project || null;
  const localUserId =
    localActive && effectiveProject?.id === localActive.project.id ? localActive.userId : undefined;

  return [
    MASTER_PROMPT,
    environmentBlock(),
    projectBlock(
      effectiveProject,
      input.conversations,
      input.currentConversationId,
      localUserId,
    ),
    memoryBlock(memories),
    crossChatBlock(input.conversations, input.currentConversationId),
    skillBlock(skills),
  ]
    .filter(Boolean)
    .join('\n\n');
}

export { listMemories };

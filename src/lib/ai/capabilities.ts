// Alsamos AI — umumiy imkoniyatlar kontrakti (web + Flutter uchun yagona manba).
//
// MUHIM: bu fayl `alsamos-superapp` reposidagi
// `lib/features/ai/domain/ai_capabilities.dart` bilan 1:1 mos bo'lishi shart.
// O'zgartirish kiritilsa, ikkala repoda ham yangilanadi
// (qarang: docs/AI_PLATFORM_SPEC.md).

export const AI_CONTRACT_VERSION = "1.0.0";

/** Backendga yuboriladigan imkoniyat guruhlari. */
export type ToolGroupId =
  | "web"
  | "image"
  | "video"
  | "code"
  | "alsamos"
  | "connectors"
  | "computer";

export type ToolGroup = {
  id: ToolGroupId;
  label: string;
  description: string;
  /** Lucide (web) / Material (Flutter) ikonka nomi. */
  icon: string;
  /** Standart holatda yoqilganmi. */
  defaultOn: boolean;
  /** Foydalanuvchi tasdig'ini talab qiladimi. */
  sensitive?: boolean;
  /** Shu guruhga tegishli server vositalari. */
  tools: string[];
};

// Standart holatda deyarli hamma narsa YOQILGAN: AI o'zi qaysi vositani
// ishlatishni tanlaydi. Foydalanuvchi "rasm yarat" deb yozsa, avval biror
// tugmani bosishi shart emas. Faqat "computer" guruhi tasdiq talab qiladi.
export const TOOL_GROUPS: ToolGroup[] = [
  {
    id: "web",
    label: "Web qidiruv",
    description: "Internetdan real vaqtda ma'lumot izlash va sahifalarni o'qish",
    icon: "globe",
    defaultOn: true,
    tools: ["web_search", "web_fetch"],
  },
  {
    id: "code",
    label: "Kod ijrosi",
    description: "JavaScript, TypeScript va Python kodini izolyatsiyalangan server sandboxida ishga tushirish",
    icon: "terminal",
    defaultOn: true,
    tools: ["run_code"],
  },
  {
    id: "image",
    label: "Rasm generatsiyasi",
    description: "Matn asosida rasm yaratish yoki mavjud rasmni tahrirlash",
    icon: "image",
    defaultOn: true,
    tools: ["generate_image"],
  },
  {
    id: "video",
    label: "Video generatsiyasi",
    description: "Matn yoki rasm asosida qisqa video yaratish (1-3 daqiqa render)",
    icon: "video",
    defaultOn: true,
    tools: ["generate_video", "media_job_status"],
  },
  {
    id: "alsamos",
    label: "Alsamos ma'lumotlari",
    description: "Postlar, marketplace va shaxsiy eslatmalar bilan ishlash",
    icon: "layout-grid",
    defaultOn: true,
    tools: ["search_posts", "search_marketplace", "remember"],
  },
  {
    id: "connectors",
    label: "Konnektorlar (MCP)",
    description: "Ulangan pluginlar: Notion, GitHub, Drive va boshqa MCP serverlar",
    icon: "plug",
    defaultOn: true,
    tools: ["list_connector_tools", "connector_call"],
  },
  {
    id: "computer",
    label: "Kompyuter boshqaruvi",
    description:
      "Alsamos Bridge orqali shaxsiy kompyuterda buyruq, fayl va ekran amallari (tasdiq talab qiladi)",
    icon: "monitor",
    defaultOn: false,
    sensitive: true,
    tools: ["computer_task", "computer_task_result"],
  },
];

export const DEFAULT_TOOL_GROUPS: ToolGroupId[] = TOOL_GROUPS.filter((g) => g.defaultOn).map(
  (g) => g.id,
);

/** Model tanlovi (server MODEL_ROUTES bilan mos). */
export type ModelId = "auto" | "fast" | "balanced" | "coding" | "reasoning" | "vision";

export type ModelOption = {
  id: ModelId;
  label: string;
  hint: string;
  badge?: string;
};

export const MODEL_OPTIONS: ModelOption[] = [
  { id: "auto", label: "Avto", hint: "Savolga qarab eng mos modelni tanlaydi", badge: "Tavsiya" },
  { id: "fast", label: "Tezkor", hint: "Qisqa savollar uchun eng tez javob" },
  { id: "balanced", label: "Muvozanat", hint: "Kundalik vazifalar uchun" },
  { id: "coding", label: "Kod", hint: "Dasturlash, debug va refaktoring" },
  { id: "reasoning", label: "Chuqur fikrlash", hint: "Matematika, tahlil, reja tuzish" },
  { id: "vision", label: "Vizual", hint: "Rasm va media tahlili" },
];

/** UI rejimi. */
export type AIMode = "chat" | "agent";

export const MODE_OPTIONS: Array<{ id: AIMode; label: string; hint: string }> = [
  { id: "chat", label: "Suhbat", hint: "Tez javob, vositalar faqat kerak bo'lganda" },
  { id: "agent", label: "Agent", hint: "Ko'p qadamli vazifalar: qidiradi, kod yozadi, bajaradi" },
];

// ------------------------------------------------------- SSE hodisa sxemasi

export type AgentEvent =
  | { type: "meta"; model: string; task: string; language: string; tools: string[] }
  | { type: "delta"; text: string }
  | { type: "tool_call"; id: string; name: string; args: Record<string, unknown> }
  | {
      type: "tool_result";
      id: string;
      name: string;
      ok: boolean;
      summary: string;
      data: Record<string, unknown> | null;
    }
  | { type: "notice"; message: string }
  | { type: "error"; message: string };

export type AgentRequest = {
  messages: Array<{ role: "user" | "assistant"; content: string }>;
  mode: AIMode;
  model: ModelId;
  toolGroups: ToolGroupId[];
  conversationId?: string | null;
};

/** Vosita nomi -> foydalanuvchiga ko'rinadigan yorliq (UI timeline uchun). */
export const TOOL_LABELS: Record<string, string> = {
  web_search: "Internetda qidirmoqda",
  web_fetch: "Sahifani o'qimoqda",
  generate_image: "Rasm yaratmoqda",
  generate_video: "Video tayyorlamoqda",
  media_job_status: "Media holatini tekshirmoqda",
  run_code: "Kodni izolyatsiyalangan serverda ishga tushirmoqda",
  search_posts: "Postlarni izlamoqda",
  search_marketplace: "Mahsulotlarni izlamoqda",
  remember: "Eslab qolmoqda",
  list_connector_tools: "Pluginlarni tekshirmoqda",
  connector_call: "Plugin vositasini chaqirmoqda",
  computer_task: "Kompyuter vazifasini navbatga qo'ymoqda",
  computer_task_result: "Vazifa natijasini olmoqda",
};

export function toolLabel(name: string): string {
  return TOOL_LABELS[name] ?? name;
}

export function groupsForMode(mode: AIMode, selected: ToolGroupId[]): ToolGroupId[] {
  // Suhbat rejimida ham vositalar mavjud, lekin "computer" faqat agent rejimida.
  return mode === "agent" ? selected : selected.filter((g) => g !== "computer");
}

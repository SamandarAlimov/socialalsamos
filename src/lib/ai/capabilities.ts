// Alsamos AI — shared capability contract (web + Flutter should stay aligned).

export const AI_CONTRACT_VERSION = "1.1.0";

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
  icon: string;
  defaultOn: boolean;
  sensitive?: boolean;
  tools: string[];
};

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
    description:
      "Self-contained kodni tekshirish; tashqi sandbox ulanganida JavaScript, TypeScript, Python va Bashni izolyatsiyada bajarish",
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
    description: "Matn yoki rasm asosida qisqa video yaratish",
    icon: "video",
    defaultOn: true,
    tools: ["generate_video", "media_job_status"],
  },
  {
    id: "alsamos",
    label: "Alsamos ma'lumotlari",
    description: "Alsamos ichidagi store, mahsulot, post, profil, joy va shaxsiy ma'lumotlar bilan ishlash",
    icon: "layout-grid",
    defaultOn: true,
    tools: ["search_alsamos_platform", "search_posts", "search_marketplace", "remember"],
  },
  {
    id: "connectors",
    label: "Konnektorlar va GitHub",
    description:
      "Native GitHub coding agent hamda ulangan MCP pluginlar: repo yaratish/o'qish/yozish, atomic multi-file commit, branch, PR, merge, CI va boshqa servislar",
    icon: "plug",
    defaultOn: true,
    tools: [
      "github_list_repositories",
      "github_create_repository",
      "github_read_file",
      "github_list_directory",
      "github_search_code",
      "github_create_branch",
      "github_write_file",
      "github_apply_patch",
      "github_delete_file",
      "github_atomic_commit",
      "github_open_pull_request",
      "github_get_pull_request",
      "github_merge_pull_request",
      "github_merge_branch",
      "github_compare",
      "github_ci_status",
      "list_connector_tools",
      "connector_call",
    ],
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

export const DEFAULT_TOOL_GROUPS: ToolGroupId[] = TOOL_GROUPS.filter((group) => group.defaultOn).map(
  (group) => group.id,
);

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
  { id: "coding", label: "Kod", hint: "Kuchli Pro-family coding routing, repo va debug uchun" },
  { id: "reasoning", label: "Chuqur fikrlash", hint: "Matematika, tahlil, reja va research" },
  { id: "vision", label: "Vizual", hint: "Rasm va media tahlili" },
];

export type AIMode = "chat" | "agent";

export const MODE_OPTIONS: Array<{ id: AIMode; label: string; hint: string }> = [
  { id: "chat", label: "Suhbat", hint: "Tez javob; minimal tool budget va qisqa orchestration" },
  { id: "agent", label: "Agent", hint: "Durable vazifa; plan, checkpoint, background davom etish va ko'p qadamli ish" },
];

export type AgentEvent =
  | { type: "meta"; model: string; task: string; language: string; tools: string[]; mode?: AIMode; keyPool?: string }
  | { type: "plan"; steps: string[]; runId?: string; eventId?: number }
  | { type: "delta"; text: string; runId?: string; eventId?: number }
  | { type: "tool_call"; id: string; name: string; args: Record<string, unknown>; runId?: string; eventId?: number }
  | {
      type: "tool_result";
      id: string;
      name: string;
      ok: boolean;
      summary: string;
      data: Record<string, unknown> | null;
      runId?: string;
      eventId?: number;
    }
  | { type: "notice"; message: string; runId?: string; eventId?: number }
  | { type: "run_state"; runId: string; status: string; eventId?: number; resumable?: boolean; canContinue?: boolean }
  | { type: "error"; message: string; runId?: string; eventId?: number };

export type AgentRequest = {
  messages: Array<{ role: "user" | "assistant"; content: string }>;
  mode: AIMode;
  model: ModelId;
  toolGroups: ToolGroupId[];
  conversationId?: string | null;
};

export const TOOL_LABELS: Record<string, string> = {
  web_search: "Internetda qidirmoqda",
  web_fetch: "Sahifani o'qimoqda",
  generate_image: "Rasm yaratmoqda",
  generate_video: "Video tayyorlamoqda",
  media_job_status: "Media holatini tekshirmoqda",
  run_code: "Kodni ishga tushirmoqda",
  search_alsamos_platform: "Alsamos ichida qidirmoqda",
  search_posts: "Postlarni izlamoqda",
  search_marketplace: "Mahsulotlarni izlamoqda",
  my_search_insights: "Qidiruv tarixingizni tekshirmoqda",
  my_payment_history: "To'lov tarixingizni tekshirmoqda",
  my_marketplace_orders: "Buyurtmalaringizni tekshirmoqda",
  my_saved_places: "Saqlangan joylaringizni tekshirmoqda",
  get_recommendation_preferences: "Tavsiyalar sozlamasini o'qimoqda",
  update_recommendation_preferences: "Tavsiyalar sozlamasini yangilamoqda",
  remember: "Eslab qolmoqda",
  github_list_repositories: "GitHub repolarini ko'rmoqda",
  github_create_repository: "GitHub repository yaratmoqda",
  github_read_file: "GitHub faylini o'qimoqda",
  github_list_directory: "GitHub papkasini ko'rmoqda",
  github_search_code: "GitHub kodini qidirmoqda",
  github_create_branch: "GitHub branch yaratmoqda",
  github_write_file: "GitHub fayliga yozmoqda",
  github_apply_patch: "GitHub kodini tahrirlamoqda",
  github_delete_file: "GitHub faylini o'chirmoqda",
  github_atomic_commit: "GitHub'da atomic multi-file commit qilmoqda",
  github_open_pull_request: "Pull request ochmoqda",
  github_get_pull_request: "Pull request holatini tekshirmoqda",
  github_merge_pull_request: "Pull requestni merge qilmoqda",
  github_merge_branch: "GitHub branchlarni merge qilmoqda",
  github_compare: "GitHub o'zgarishlarini solishtirmoqda",
  github_ci_status: "GitHub CI holatini tekshirmoqda",
  list_connector_tools: "Pluginlarni tekshirmoqda",
  connector_call: "Plugin vositasini chaqirmoqda",
  computer_task: "Kompyuter vazifasini navbatga qo'ymoqda",
  computer_task_result: "Vazifa natijasini olmoqda",
};

export function toolLabel(name: string): string {
  return TOOL_LABELS[name] ?? name;
}

export function groupsForMode(mode: AIMode, selected: ToolGroupId[]): ToolGroupId[] {
  return mode === "agent" ? selected : selected.filter((group) => group !== "computer");
}

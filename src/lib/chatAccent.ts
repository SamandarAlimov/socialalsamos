export type ChatAccent = 'green' | 'blue' | 'violet' | 'rose' | 'graphite';

export const CHAT_ACCENT_STORAGE_KEY = 'alsamos.chat-accent';

export const CHAT_ACCENTS: Array<{
  id: ChatAccent;
  label: string;
  description: string;
  swatchClass: string;
}> = [
  {
    id: 'green',
    label: 'Yashil',
    description: 'Standart — sokin va professional',
    swatchClass: 'bg-emerald-500',
  },
  {
    id: 'blue',
    label: "Ko'k",
    description: 'Klassik messenjer uslubi',
    swatchClass: 'bg-sky-500',
  },
  {
    id: 'violet',
    label: 'Binafsha',
    description: 'Yumshoq shaxsiy aksent',
    swatchClass: 'bg-violet-500',
  },
  {
    id: 'rose',
    label: 'Pushti',
    description: 'Iliq shaxsiy aksent',
    swatchClass: 'bg-rose-500',
  },
  {
    id: 'graphite',
    label: 'Grafit',
    description: 'To\'liq neytral variant',
    swatchClass: 'bg-zinc-600 dark:bg-zinc-400',
  },
];

export function normalizeChatAccent(value: string | null | undefined): ChatAccent {
  return CHAT_ACCENTS.some((item) => item.id === value) ? (value as ChatAccent) : 'green';
}

export function applyChatAccent(accent: ChatAccent) {
  if (typeof document === 'undefined') return;
  document.documentElement.dataset.chatAccent = accent;
}

export function getStoredChatAccent(): ChatAccent {
  if (typeof window === 'undefined') return 'green';
  return normalizeChatAccent(window.localStorage.getItem(CHAT_ACCENT_STORAGE_KEY));
}

export function setStoredChatAccent(accent: ChatAccent) {
  if (typeof window !== 'undefined') {
    window.localStorage.setItem(CHAT_ACCENT_STORAGE_KEY, accent);
  }
  applyChatAccent(accent);
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('alsamos:chat-accent', { detail: accent }));
  }
}

// Intent detection for the unified AI composer.
// The user never picks a "Chat" vs "Imagine" mode — we infer it from the message.

export type AIIntent = 'image' | 'chat';

const IMAGE_PATTERNS: RegExp[] = [
  // Uzbek
  /\brasm(ini|ni|lar)?\s+(chiz|yasa|yarat|generatsiya|ishla)/i,
  /\b(chiz|yasa|yarat)\w*\s+(menga\s+)?(bitta\s+)?rasm/i,
  /\brasm\s+(chizib|yaratib|yasab)\s+ber/i,
  /\b(logo|banner|avatar|illyustratsiya|poster|afisha)\s*(yarat|chiz|yasa)/i,
  /\bsurat\s+(chiz|yarat|yasa)/i,
  // Russian
  /\b(нарисуй|сгенерируй|создай)\s+(мне\s+)?(картинк|изображен|фото|логотип|постер)/i,
  // English
  /\b(draw|paint|sketch|illustrate)\b/i,
  /\b(generate|create|make|design)\s+(me\s+)?(an?\s+)?(image|picture|photo|logo|poster|banner|illustration|artwork|wallpaper|icon)/i,
  /\bimage\s+of\b/i,
  /\bphoto\s+of\b/i,
];

/** Explicit slash command wins over heuristics. */
export function detectIntent(rawText: string): { intent: AIIntent; prompt: string } {
  const text = rawText.trim();

  if (/^\/image\s+/i.test(text) || /^\/rasm\s+/i.test(text)) {
    return { intent: 'image', prompt: text.replace(/^\/\w+\s+/, '') };
  }
  if (/^\/(chat|text)\s+/i.test(text)) {
    return { intent: 'chat', prompt: text.replace(/^\/\w+\s+/, '') };
  }

  const isImage = IMAGE_PATTERNS.some((re) => re.test(text));
  return { intent: isImage ? 'image' : 'chat', prompt: text };
}

export const SLASH_COMMANDS = [
  { cmd: '/image', label: 'Rasm yaratish', hint: 'Tavsif bo\'yicha rasm generatsiya qiladi' },
  { cmd: '/code', label: 'Kod yozish', hint: 'Kod yozish yoki tuzatish' },
  { cmd: '/summarize', label: 'Qisqartirish', hint: 'Matnni qisqacha bayon qiladi' },
  { cmd: '/translate', label: 'Tarjima', hint: 'Matnni boshqa tilga tarjima qiladi' },
];

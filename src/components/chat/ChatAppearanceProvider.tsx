import { useEffect } from 'react';
import { useChatAppearance } from '@/hooks/useChatAppearance';
import { appearanceCssVars } from '@/lib/chatAppearance';

/**
 * Chat ko'rinishi sozlamalarini butun ilovaga qo'llaydi.
 *
 * Xabar elementlari `id="message-<id>"` ko'rinishida bo'lgani uchun CSS shular
 * ichidagi matn va puffak burchaklarini boshqaradi. Stil bir marta <style>
 * sifatida qo'shiladi, global stylesheet o'zgarmaydi.
 */

const STYLE_ID = 'chat-appearance-style';

const CSS = [
  // Xabar matni o'lchami
  'html[data-chat-appearance] [id^="message-"] p,',
  'html[data-chat-appearance] [id^="message-"] .whitespace-pre-wrap,',
  'html[data-chat-appearance] [id^="message-"] .break-words{',
  'font-size:var(--chat-font-size,15px)!important;line-height:var(--chat-line-height,20px)!important;}',
  // Xabar puffagi burchaklari
  'html[data-chat-appearance] [id^="message-"] .rounded-2xl,',
  'html[data-chat-appearance] [id^="message-"] .rounded-xl{',
  'border-radius:var(--chat-corners,16px)!important;}',
  'html[data-chat-appearance] [id^="message-"] .rounded-br-md{',
  'border-bottom-right-radius:var(--chat-corners-tail,6px)!important;}',
  'html[data-chat-appearance] [id^="message-"] .rounded-bl-md{',
  'border-bottom-left-radius:var(--chat-corners-tail,6px)!important;}',
  // Energiya tejash rejimi
  'html[data-energy-saver="on"] *,',
  'html[data-energy-saver="on"] *::before,',
  'html[data-energy-saver="on"] *::after{',
  'animation-duration:0.001ms!important;animation-iteration-count:1!important;',
  'transition-duration:0.001ms!important;scroll-behavior:auto!important;}',
].join('');

function ensureStyleTag() {
  if (typeof document === 'undefined') return;
  if (document.getElementById(STYLE_ID)) return;

  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = CSS;
  document.head.appendChild(style);
}

export function ChatAppearanceProvider() {
  const { appearance } = useChatAppearance();

  useEffect(() => {
    ensureStyleTag();
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    const vars = appearanceCssVars(appearance);

    Object.entries(vars).forEach(([key, value]) => root.style.setProperty(key, value));
    root.setAttribute('data-chat-appearance', String(appearance.fontSize));

    if (appearance.energySaver) {
      root.setAttribute('data-energy-saver', 'on');
    } else {
      root.removeAttribute('data-energy-saver');
    }
  }, [appearance]);

  return null;
}

export default ChatAppearanceProvider;

import { useEffect } from 'react';
import { useChatWallpaper } from '@/hooks/useChatWallpaper';
import { wallpaperCssVars } from '@/lib/chatWallpaper';

/**
 * Tanlangan chat fonini haqiqiy chat oynasiga qo'llaydi.
 *
 * Nega DOM orqali? Chat ro'yxati va xabarlar oynasi bitta katta sahifada
 * joylashgan. Fonni faqat xabarlar (scroll) qismiga qo'yish kerak — shuning
 * uchun komponent xabar elementlari (`#message-<id>`) bo'yicha scroll
 * konteynerini topadi va unga `chat-wallpaper-surface` klassini beradi.
 * CSS esa shu yerda bir marta <style> sifatida qo'shiladi, ya'ni global
 * stylesheet o'zgartirilmaydi.
 *
 * Fon `background-attachment: fixed` bilan chiziladi — Telegramdagidek scroll
 * paytida joyida turadi. Xabar puffaklari o'z ranglarini saqlaydi.
 */

const STYLE_ID = 'chat-wallpaper-style';
const SURFACE_CLASS = 'chat-wallpaper-surface';

const CSS = [
  '.' + SURFACE_CLASS + '{position:relative;isolation:isolate;background-color:var(--cw-color,transparent)!important;}',
  '.' + SURFACE_CLASS + '::before{content:"";position:absolute;inset:0;z-index:0;pointer-events:none;',
  'background-color:var(--cw-color,transparent);background-image:var(--cw-image,none);',
  'background-size:var(--cw-size,cover);background-repeat:var(--cw-repeat,no-repeat);',
  'background-position:center;background-attachment:fixed;filter:blur(var(--cw-blur,0px));}',
  '.' + SURFACE_CLASS + '::after{content:"";position:absolute;inset:0;z-index:0;pointer-events:none;',
  'background-color:rgba(0,0,0,var(--cw-dim,0));}',
  '.' + SURFACE_CLASS + '>*{position:relative;z-index:1;}',
].join('');

function ensureStyleTag() {
  if (typeof document === 'undefined') return;
  if (document.getElementById(STYLE_ID)) return;

  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = CSS;
  document.head.appendChild(style);
}

function isScrollable(element: HTMLElement): boolean {
  const overflowY = window.getComputedStyle(element).overflowY;
  if (overflowY !== 'auto' && overflowY !== 'scroll') return false;
  return element.scrollHeight > element.clientHeight - 1;
}

/** Xabarlar ro'yxatining scroll konteynerini topish */
function findChatSurface(): HTMLElement | null {
  if (typeof document === 'undefined') return null;

  const explicit = document.querySelector<HTMLElement>('[data-chat-surface]');
  if (explicit) return explicit;

  const anchor = document.querySelector<HTMLElement>('[id^="message-"]');
  if (!anchor) return null;

  let node: HTMLElement | null = anchor.parentElement;
  let fallback: HTMLElement | null = null;

  while (node && node !== document.body) {
    if (isScrollable(node)) return node;
    if (!fallback && node.clientHeight > 200) fallback = node;
    node = node.parentElement;
  }

  return fallback;
}

export function ChatWallpaperProvider() {
  const { wallpaper, isActive } = useChatWallpaper();

  useEffect(() => {
    ensureStyleTag();
  }, []);

  // CSS o'zgaruvchilarini yangilash
  useEffect(() => {
    const root = document.documentElement;
    const vars = wallpaperCssVars(wallpaper);

    if (!isActive) {
      Object.keys(vars).forEach((key) => root.style.removeProperty(key));
      root.removeAttribute('data-chat-wallpaper');
      return;
    }

    Object.entries(vars).forEach(([key, value]) => root.style.setProperty(key, value));
    root.setAttribute('data-chat-wallpaper', wallpaper.id);
  }, [wallpaper, isActive]);

  // Chat oynasiga klass qo'shish / olib tashlash
  useEffect(() => {
    let current: HTMLElement | null = null;

    const detach = () => {
      if (current) {
        current.classList.remove(SURFACE_CLASS);
        current = null;
      }
    };

    const sync = () => {
      if (!isActive) {
        detach();
        return;
      }

      const surface = findChatSurface();
      if (surface === current) return;

      detach();

      if (surface) {
        surface.classList.add(SURFACE_CLASS);
        current = surface;
      }
    };

    sync();

    const observer = new MutationObserver(() => sync());
    observer.observe(document.body, { childList: true, subtree: true });

    // Ba'zi holatlarda (masalan chat almashganda) DOM o'zgarishi kuzatilmasligi
    // mumkin — yengil interval zaxira sifatida ishlaydi.
    const interval = window.setInterval(sync, 1500);

    return () => {
      observer.disconnect();
      window.clearInterval(interval);
      detach();
    };
  }, [isActive, wallpaper.id]);

  return null;
}

export default ChatWallpaperProvider;

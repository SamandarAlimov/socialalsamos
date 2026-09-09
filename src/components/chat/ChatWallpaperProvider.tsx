import { useEffect } from 'react';
import { useChatWallpaper } from '@/hooks/useChatWallpaper';
import { wallpaperCssVars } from '@/lib/chatWallpaper';
import { ChatAppearanceProvider } from './ChatAppearanceProvider';

/**
 * Tanlangan chat fonini haqiqiy chat oynasiga qo'llaydi.
 *
 * MUHIM: wallpaper messages scroll elementining layoutiga tegmaydi. MessagesPage
 * scrollerni `position:absolute; inset:0` bilan viewportga bog'laydi. Wallpaper
 * klassi shu elementga `position:relative` bersa canonical layout buziladi va
 * scroll sakrashi/height qayta hisoblanishi yuz beradi.
 *
 * Shu sabab wallpaper scroll elementning o'zida emas, uning harakatsiz viewport
 * parentida pseudo-layer sifatida chiziladi. Xabarlar esa transparent scroll
 * surface ustida odatdagidek harakat qiladi. Background layer scroll qilmagani
 * uchun `background-attachment: fixed` ham kerak emas — bu mobil va desktopda
 * repaint/compositing xarajatini sezilarli kamaytiradi.
 *
 * Shu komponent chat ko'rinishi sozlamalarini (matn o'lchami, burchaklar,
 * energiya tejash) qo'llovchi ChatAppearanceProvider'ni ham ishga tushiradi.
 */

const STYLE_ID = 'chat-wallpaper-style';
const HOST_CLASS = 'chat-wallpaper-host';
const SCROLL_CLASS = 'chat-wallpaper-scroll';

const CSS = [
  '.' +
    HOST_CLASS +
    '{isolation:isolate;overflow:hidden;background-color:var(--cw-color,transparent)!important;}',
  '.' +
    HOST_CLASS +
    '::before{content:"";position:absolute;inset:0;z-index:-2;pointer-events:none;',
  'background-color:var(--cw-color,transparent);background-image:var(--cw-image,none);',
  'background-size:var(--cw-size,cover);background-repeat:var(--cw-repeat,no-repeat);',
  'background-position:center;filter:blur(var(--cw-blur,0px));transform:translateZ(0);',
  'will-change:transform;}',
  '.' +
    HOST_CLASS +
    '::after{content:"";position:absolute;inset:0;z-index:-1;pointer-events:none;',
  'background-color:rgba(0,0,0,var(--cw-dim,0));}',
  '.' + HOST_CLASS + '>.' + SCROLL_CLASS + '{background-color:transparent!important;}',
].join('');

function ensureStyleTag() {
  if (typeof document === 'undefined') return;

  const existing = document.getElementById(STYLE_ID) as HTMLStyleElement | null;
  if (existing) {
    // HMR/dev paytida eski CSS qolib ketmasin.
    if (existing.textContent !== CSS) existing.textContent = CSS;
    return;
  }

  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = CSS;
  document.head.appendChild(style);
}

function isScrollContainer(element: HTMLElement): boolean {
  const overflowY = window.getComputedStyle(element).overflowY;
  return overflowY === 'auto' || overflowY === 'scroll';
}

/** Xabarlar ro'yxatining canonical scroll konteynerini topish. */
function findChatSurface(): HTMLElement | null {
  if (typeof document === 'undefined') return null;

  const explicit = document.querySelector<HTMLElement>('[data-chat-surface]');
  if (explicit) return explicit;

  // MessagesPage'dagi canonical messages scroller. `.chat-shell` scope chapdagi
  // chat-list ScrollArea bilan adashishning oldini oladi.
  const canonical = document.querySelector<HTMLElement>('.chat-shell .scrollbar-custom');
  if (canonical && isScrollContainer(canonical)) return canonical;

  const chatShell = document.querySelector<HTMLElement>('.chat-shell');
  if (chatShell) {
    const descendants = Array.from(chatShell.querySelectorAll<HTMLElement>('*'));
    const scrollSurface = descendants.find(isScrollContainer);
    if (scrollSurface) return scrollSurface;
  }

  // Legacy fallback: eski layoutlarda message anchor bo'yicha yuqoriga yuramiz.
  const anchor = document.querySelector<HTMLElement>('[id^="message-"]');
  if (!anchor) return null;

  let node: HTMLElement | null = anchor.parentElement;
  let fallback: HTMLElement | null = null;

  while (node && node !== document.body) {
    if (isScrollContainer(node)) return node;
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

  // Wallpaper almashtirish faqat CSS variables/paintni yangilaydi; messages
  // scrollerning position, scrollTop, height yoki virtualizer DOMiga tegmaydi.
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

  useEffect(() => {
    let currentSurface: HTMLElement | null = null;
    let currentHost: HTMLElement | null = null;

    const detach = () => {
      if (currentSurface) currentSurface.classList.remove(SCROLL_CLASS);
      if (currentHost) currentHost.classList.remove(HOST_CLASS);
      currentSurface = null;
      currentHost = null;
    };

    const sync = () => {
      if (!isActive) {
        detach();
        return;
      }

      const surface = findChatSurface();
      const host = surface?.parentElement ?? null;

      if (!surface || !host) {
        detach();
        return;
      }

      if (surface === currentSurface && host === currentHost) return;

      detach();
      surface.classList.add(SCROLL_CLASS);
      host.classList.add(HOST_CLASS);
      currentSurface = surface;
      currentHost = host;
    };

    sync();

    // Chat almashganda messages scroller mount/unmount bo'ladi. Observer faqat
    // surface/hostni qayta bog'laydi; wallpaper qiymati o'zgarishi DOMni tegmaydi.
    const observer = new MutationObserver(() => sync());
    observer.observe(document.body, { childList: true, subtree: true });

    return () => {
      observer.disconnect();
      detach();
    };
  }, [isActive]);

  return <ChatAppearanceProvider />;
}

export default ChatWallpaperProvider;

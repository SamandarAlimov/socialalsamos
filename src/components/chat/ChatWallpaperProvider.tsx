import { useEffect } from 'react';
import { useChatWallpaper } from '@/hooks/useChatWallpaper';
import { wallpaperCssVars } from '@/lib/chatWallpaper';
import { ChatAppearanceProvider } from './ChatAppearanceProvider';

/**
 * Tanlangan chat fonini haqiqiy chat oynasiga qo'llaydi.
 *
 * Muhim qoida: wallpaper hech qachon chat history layoutini o'zgartirmasligi
 * kerak. Shu sabab fon alohida pseudo-layerlarda chiziladi; xabarlar wrapperlari
 * yoki virtualizer elementlarining `position` qiymatiga tegilmaydi.
 *
 * Chat scroll konteyneri overflow holatiga qarab aniqlanadi. History hali qisqa
 * yoki umuman bo'sh bo'lsa ham `overflow-y:auto|scroll` konteynerning o'zi
 * haqiqiy chat surface hisoblanadi — scrollHeight tekshirilmaydi. Bu wallpaper
 * noto'g'ri message wrapperga yopishib qolishining oldini oladi.
 *
 * Shu komponent chat ko'rinishi sozlamalarini (matn o'lchami, burchaklar,
 * energiya tejash) qo'llovchi ChatAppearanceProvider'ni ham ishga tushiradi.
 */

const STYLE_ID = 'chat-wallpaper-style';
const SURFACE_CLASS = 'chat-wallpaper-surface';

const CSS = [
  '.' +
    SURFACE_CLASS +
    '{position:relative;isolation:isolate;background-color:var(--cw-color,transparent)!important;}',
  '.' +
    SURFACE_CLASS +
    '::before{content:"";position:absolute;inset:0;z-index:-2;pointer-events:none;',
  'background-color:var(--cw-color,transparent);background-image:var(--cw-image,none);',
  'background-size:var(--cw-size,cover);background-repeat:var(--cw-repeat,no-repeat);',
  'background-position:center;background-attachment:fixed;filter:blur(var(--cw-blur,0px));}',
  '.' +
    SURFACE_CLASS +
    '::after{content:"";position:absolute;inset:0;z-index:-1;pointer-events:none;',
  'background-color:rgba(0,0,0,var(--cw-dim,0));}',
].join('');

function ensureStyleTag() {
  if (typeof document === 'undefined') return;
  if (document.getElementById(STYLE_ID)) return;

  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = CSS;
  document.head.appendChild(style);
}

/**
 * Element hozircha real overflow qilmasa ham overflow-y:auto|scroll bo'lsa,
 * aynan shu scroll konteyner hisoblanadi. Oldingi scrollHeight tekshiruvi qisqa
 * historyda noto'g'ri fallback tanlanishiga sabab bo'lar edi.
 */
function isScrollContainer(element: HTMLElement): boolean {
  const overflowY = window.getComputedStyle(element).overflowY;
  return overflowY === 'auto' || overflowY === 'scroll';
}

/** Xabarlar ro'yxatining scroll konteynerini topish */
function findChatSurface(): HTMLElement | null {
  if (typeof document === 'undefined') return null;

  // Kelajakdagi/aniq integratsiya uchun explicit surface har doim ustun.
  const explicit = document.querySelector<HTMLElement>('[data-chat-surface]');
  if (explicit) return explicit;

  // MessagesPage o'ng paneli `.chat-shell` bilan scope qilingan. Avval shu
  // panel ichidagi haqiqiy scroll container olinadi. Bu usul empty chatda ham
  // ishlaydi va chapdagi chat-list scrollini tasodifan tanlamaydi.
  const chatShell = document.querySelector<HTMLElement>('.chat-shell');
  if (chatShell) {
    const descendants = Array.from(chatShell.querySelectorAll<HTMLElement>('*'));
    const scrollSurface = descendants.find(isScrollContainer);
    if (scrollSurface) return scrollSurface;
  }

  // Legacy/fallback: eski layoutlarda message anchor bo'yicha yuqoriga yuramiz.
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

  // CSS o'zgaruvchilarini yangilash. Wallpaper almashtirish faqat paint qiladi;
  // chat DOM, virtualizer yoki scroll positionga tegmaydi.
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

  // Chat oynasiga klass faqat surface paydo/yo'qolganda qo'shiladi.
  // Wallpaper id/dim/blur o'zgarishi bu effectni qayta yaratmaydi, shuning uchun
  // history va scroll holati saqlanadi.
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

    return () => {
      observer.disconnect();
      detach();
    };
  }, [isActive]);

  return <ChatAppearanceProvider />;
}

export default ChatWallpaperProvider;

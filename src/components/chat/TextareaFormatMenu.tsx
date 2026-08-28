import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Bold,
  Code,
  Eraser,
  EyeOff,
  Heading,
  Italic,
  Link2,
  List,
  Quote,
  Strikethrough,
  Underline,
} from 'lucide-react';
import { prefixLine, wrapSelection } from '@/lib/messageFormat';

interface TextareaFormatMenuProps {
  /** Formatlanadigan maydon */
  targetRef: React.RefObject<HTMLTextAreaElement>;
  value: string;
  onChange: (value: string) => void;
  /** Maqola rejimida sarlavha/ro'yxat tugmalari ham chiqadi */
  extended?: boolean;
}

interface ToolDef {
  key: string;
  label: string;
  hint?: string;
  icon: React.ElementType;
  marker?: string;
  markerEnd?: string;
  prefix?: string;
  clear?: boolean;
  onlyExtended?: boolean;
}

const TOOLS: ToolDef[] = [
  { key: 'bold', label: 'Qalin', hint: 'Ctrl+B', icon: Bold, marker: '**' },
  { key: 'italic', label: 'Kursiv', hint: 'Ctrl+I', icon: Italic, marker: '__' },
  { key: 'underline', label: 'Tagi chizilgan', hint: 'Ctrl+U', icon: Underline, marker: '++' },
  {
    key: 'strike',
    label: 'Ustidan chizilgan',
    hint: 'Ctrl+Shift+X',
    icon: Strikethrough,
    marker: '~~',
  },
  { key: 'mono', label: 'Monospace', hint: 'Ctrl+Shift+M', icon: Code, marker: '`' },
  { key: 'spoiler', label: 'Spoiler', hint: 'Ctrl+Shift+P', icon: EyeOff, marker: '||' },
  { key: 'quote', label: 'Iqtibos', icon: Quote, prefix: '> ' },
  { key: 'heading', label: 'Sarlavha', icon: Heading, prefix: '## ', onlyExtended: true },
  { key: 'list', label: "Ro'yxat", icon: List, prefix: '- ', onlyExtended: true },
  { key: 'link', label: 'Havola', hint: 'Ctrl+K', icon: Link2, marker: '[', markerEnd: '](url)' },
  { key: 'clear', label: 'Formatni tozalash', icon: Eraser, clear: true },
];

const MENU_HEIGHT = 40;
const GAP = 8;
const EDGE = 8;

/** Formatlash belgilarini tanlangan matndan olib tashlaydi */
function stripMarkers(text: string): string {
  return text
    .replace(/^\s*(?:>|#{1,6}|[-*])\s+/gm, '')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/__(.+?)__/g, '$1')
    .replace(/\+\+(.+?)\+\+/g, '$1')
    .replace(/~~(.+?)~~/g, '$1')
    .replace(/\|\|(.+?)\|\|/g, '$1')
    .replace(/`(.+?)`/g, '$1')
    .replace(/\[(.+?)\]\((.*?)\)/g, '$1');
}

const MIRROR_STYLE_KEYS = [
  'fontFamily',
  'fontSize',
  'fontWeight',
  'fontStyle',
  'letterSpacing',
  'textTransform',
  'lineHeight',
  'paddingTop',
  'paddingRight',
  'paddingBottom',
  'paddingLeft',
  'borderTopWidth',
  'borderRightWidth',
  'borderBottomWidth',
  'borderLeftWidth',
  'boxSizing',
  'textIndent',
  'wordSpacing',
  'tabSize',
] as const;

/**
 * `textarea` ichidagi tanlovning ekrandagi joyini o'lchaydi.
 * Buning uchun bir xil tipografiyaga ega "soya" (mirror) element ishlatiladi -
 * brauzerlar textarea ichidagi tanlov uchun Range API bermaydi.
 */
function selectionRect(el: HTMLTextAreaElement): { top: number; centerX: number } | null {
  const start = el.selectionStart;
  const end = el.selectionEnd;
  if (start === end) return null;

  const computed = window.getComputedStyle(el);
  const mirror = document.createElement('div');

  MIRROR_STYLE_KEYS.forEach((key) => {
    mirror.style[key as any] = computed[key as any];
  });

  mirror.style.position = 'absolute';
  mirror.style.visibility = 'hidden';
  mirror.style.whiteSpace = 'pre-wrap';
  mirror.style.wordWrap = 'break-word';
  mirror.style.overflowWrap = 'break-word';
  mirror.style.width = el.clientWidth + 'px';
  mirror.style.top = '0';
  mirror.style.left = '-9999px';

  const before = document.createTextNode(el.value.slice(0, start));
  const marker = document.createElement('span');
  marker.textContent = el.value.slice(start, end) || ' ';

  mirror.appendChild(before);
  mirror.appendChild(marker);
  document.body.appendChild(mirror);

  const markerTop = marker.offsetTop;
  const markerLeft = marker.offsetLeft;
  const markerWidth = marker.offsetWidth;
  const markerHeight = marker.offsetHeight;

  document.body.removeChild(mirror);

  const box = el.getBoundingClientRect();
  const top = box.top + markerTop - el.scrollTop;
  const centerX = box.left + markerLeft + markerWidth / 2;

  // Tanlov maydon ichida ko'rinmasa, menyu ham chiqmaydi
  if (top + markerHeight < box.top || top > box.bottom) return null;

  return { top, centerX: Math.min(Math.max(centerX, box.left), box.right) };
}

/**
 * Telegramdek: `textarea` ichida matn TANLANGANDA tanlov ustida suzuvchi
 * formatlash menyusi chiqadi. Formatlar matn belgilari (`**`, `__`, `||` ...)
 * ko'rinishida qo'yiladi - chatda ular chiroyli ko'rinishga aylanadi.
 */
export function TextareaFormatMenu({
  targetRef,
  value,
  onChange,
  extended,
}: TextareaFormatMenuProps) {
  const [position, setPosition] = useState<{ top: number; left: number; below: boolean } | null>(
    null
  );
  const menuRef = useRef<HTMLDivElement>(null);

  const tools = TOOLS.filter((tool) => extended || !tool.onlyExtended);
  const menuWidth = tools.length * 36 + 12;

  const update = useCallback(() => {
    const el = targetRef.current;
    if (!el || document.activeElement !== el) {
      setPosition(null);
      return;
    }

    const rect = selectionRect(el);
    if (!rect) {
      setPosition(null);
      return;
    }

    const below = rect.top - MENU_HEIGHT - GAP < EDGE;
    const lineHeight = parseFloat(window.getComputedStyle(el).lineHeight) || 20;

    setPosition({
      top: below ? rect.top + lineHeight + GAP : rect.top - MENU_HEIGHT - GAP,
      left: Math.min(
        Math.max(rect.centerX - menuWidth / 2, EDGE),
        Math.max(window.innerWidth - menuWidth - EDGE, EDGE)
      ),
      below,
    });
  }, [targetRef, menuWidth]);

  useEffect(() => {
    const el = targetRef.current;
    if (!el) return;

    const onSelect = () => update();
    const onBlur = (event: FocusEvent) => {
      const next = event.relatedTarget as Node | null;
      if (next && menuRef.current?.contains(next)) return;
      setPosition(null);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setPosition(null);
    };

    el.addEventListener('select', onSelect);
    el.addEventListener('keyup', onSelect);
    el.addEventListener('mouseup', onSelect);
    el.addEventListener('blur', onBlur);
    document.addEventListener('selectionchange', onSelect);
    document.addEventListener('keydown', onKey);
    window.addEventListener('resize', onSelect);
    window.addEventListener('scroll', onSelect, true);

    return () => {
      el.removeEventListener('select', onSelect);
      el.removeEventListener('keyup', onSelect);
      el.removeEventListener('mouseup', onSelect);
      el.removeEventListener('blur', onBlur);
      document.removeEventListener('selectionchange', onSelect);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', onSelect);
      window.removeEventListener('scroll', onSelect, true);
    };
  }, [targetRef, update]);

  // Matn o'zgarsa menyu joyi ham yangilanadi
  useEffect(() => {
    update();
  }, [value, update]);

  const apply = (tool: ToolDef) => {
    const el = targetRef.current;
    if (!el) return;

    const start = el.selectionStart;
    const end = el.selectionEnd;

    if (tool.clear) {
      const selected = value.slice(start, end);
      const cleaned = stripMarkers(selected);
      const next = value.slice(0, start) + cleaned + value.slice(end);
      onChange(next);
      requestAnimationFrame(() => {
        el.focus();
        el.setSelectionRange(start, start + cleaned.length);
        update();
      });
      return;
    }

    const result = tool.prefix
      ? prefixLine(value, start, tool.prefix)
      : wrapSelection(value, start, end, tool.marker || '', tool.markerEnd);

    onChange(result.value);

    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(result.selectionStart, result.selectionEnd);
      update();
    });
  };

  if (!position) return null;

  return createPortal(
    <div
      ref={menuRef}
      role="toolbar"
      aria-label="Matnni formatlash"
      onMouseDown={(event) => event.preventDefault()}
      onPointerDown={(event) => event.preventDefault()}
      className="fixed z-[60] flex items-center gap-0.5 rounded-xl border border-border bg-popover/95 px-1.5 py-1 shadow-lg backdrop-blur"
      style={{ top: position.top, left: position.left, height: MENU_HEIGHT }}
    >
      {tools.map((tool) => (
        <button
          key={tool.key}
          type="button"
          title={tool.hint ? tool.label + ' (' + tool.hint + ')' : tool.label}
          aria-label={tool.label}
          onClick={() => apply(tool)}
          className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground active:scale-90"
        >
          <tool.icon className="h-4 w-4" />
        </button>
      ))}
    </div>,
    document.body
  );
}

export default TextareaFormatMenu;

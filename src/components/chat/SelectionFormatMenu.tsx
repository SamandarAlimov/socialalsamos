import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Bold,
  Code2,
  Eraser,
  EyeOff,
  Italic,
  Link2,
  Quote,
  Strikethrough,
  Underline,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { prefixLine, stripFormatting, wrapSelection } from '@/lib/messageFormat';

interface SelectionFormatMenuProps {
  targetRef: React.RefObject<HTMLTextAreaElement>;
  value: string;
  onChange: (value: string) => void;
  className?: string;
}

interface Tool {
  key: string;
  label: string;
  hint?: string;
  icon: React.ElementType;
  marker?: string;
  markerEnd?: string;
  prefix?: string;
  clear?: boolean;
}

const TOOLS: Tool[] = [
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
  { key: 'mono', label: 'Monospace', hint: 'Ctrl+Shift+M', icon: Code2, marker: '`' },
  { key: 'spoiler', label: 'Spoiler', hint: 'Ctrl+Shift+P', icon: EyeOff, marker: '||' },
  { key: 'quote', label: 'Iqtibos', icon: Quote, prefix: '> ' },
  {
    key: 'link',
    label: 'Havola qo\u2018shish',
    hint: 'Ctrl+K',
    icon: Link2,
    marker: '[',
    markerEnd: '](https://)',
  },
  { key: 'clear', label: 'Formatlashni tozalash', hint: 'Ctrl+Shift+N', icon: Eraser, clear: true },
];

/** Ko'zgu (mirror) uchun ko'chiriladigan uslublar. */
const MIRROR_PROPS = [
  'fontFamily',
  'fontSize',
  'fontWeight',
  'fontStyle',
  'letterSpacing',
  'lineHeight',
  'textTransform',
  'textIndent',
  'paddingTop',
  'paddingRight',
  'paddingBottom',
  'paddingLeft',
  'borderTopWidth',
  'borderRightWidth',
  'borderLeftWidth',
  'boxSizing',
];

interface CaretRect {
  top: number;
  left: number;
  height: number;
}

/**
 * Textarea ichidagi belgilangan indeks koordinatasini hisoblaydi.
 * Textarea'da Range API ishlamaydi, shuning uchun bir xil uslubdagi yashirin
 * "ko'zgu" div yaratib, marker span'ning o'rni o'lchanadi (standart usul).
 */
function caretRect(el: HTMLTextAreaElement, index: number): CaretRect {
  const styles = window.getComputedStyle(el);
  const mirror = document.createElement('div');
  const mirrorStyle = mirror.style as unknown as Record<string, string>;
  const computed = styles as unknown as Record<string, string>;

  MIRROR_PROPS.forEach((prop) => {
    mirrorStyle[prop] = computed[prop];
  });

  mirrorStyle.position = 'absolute';
  mirrorStyle.visibility = 'hidden';
  mirrorStyle.whiteSpace = 'pre-wrap';
  mirrorStyle.wordBreak = 'break-word';
  mirrorStyle.overflowWrap = 'anywhere';
  mirrorStyle.top = '0px';
  mirrorStyle.left = '-9999px';
  mirrorStyle.width = el.clientWidth + 'px';

  mirror.textContent = el.value.slice(0, index);
  const marker = document.createElement('span');
  marker.textContent = '\u200b';
  mirror.appendChild(marker);
  document.body.appendChild(mirror);

  const lineHeight = parseFloat(styles.lineHeight) || 20;
  const rect: CaretRect = {
    top: marker.offsetTop - el.scrollTop,
    left: marker.offsetLeft,
    height: marker.offsetHeight || lineHeight,
  };

  mirror.remove();
  return rect;
}

interface MenuState {
  start: number;
  end: number;
  top: number;
  left: number;
  below: boolean;
}

/**
 * Telegramdek: matn TANLANGANDA uning ustida suzuvchi formatlash menyusi
 * paydo bo'ladi (Qalin / Kursiv / Tagi chizilgan / Ustidan chizilgan /
 * Monospace / Spoiler / Iqtibos / Havola / Tozalash).
 *
 * Doimiy tugmalar qatori kerak emas - shuning uchun kompozitor ham baland
 * bo'lib qolmaydi.
 */
export function SelectionFormatMenu({
  targetRef,
  value,
  onChange,
  className,
}: SelectionFormatMenuProps) {
  const [menu, setMenu] = useState<MenuState | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  const update = useCallback(() => {
    const el = targetRef.current;
    if (!el) {
      setMenu(null);
      return;
    }

    const start = el.selectionStart ?? 0;
    const end = el.selectionEnd ?? 0;

    if (end <= start) {
      setMenu(null);
      return;
    }

    const startRect = caretRect(el, start);
    const endRect = caretRect(el, end);
    const sameLine = Math.abs(endRect.top - startRect.top) < 2;

    const rawLeft = sameLine ? (startRect.left + endRect.left) / 2 : el.clientWidth / 2;
    const limit = Math.max(el.clientWidth - 150, 150);
    const left = Math.min(Math.max(rawLeft, 150), limit);

    setMenu({
      start,
      end,
      top: startRect.top,
      left,
      // Yuqorida joy bo'lmasa menyu tanlovning ostida chiziladi
      below: startRect.top < 34,
    });
  }, [targetRef]);

  // Tanlov o'zgarishini kuzatish
  useEffect(() => {
    const el = targetRef.current;
    if (!el) return;

    const handler = () => update();

    el.addEventListener('select', handler);
    el.addEventListener('keyup', handler);
    el.addEventListener('pointerup', handler);
    el.addEventListener('scroll', handler);
    document.addEventListener('selectionchange', handler);

    return () => {
      el.removeEventListener('select', handler);
      el.removeEventListener('keyup', handler);
      el.removeEventListener('pointerup', handler);
      el.removeEventListener('scroll', handler);
      document.removeEventListener('selectionchange', handler);
    };
  }, [targetRef, update]);

  // Tashqariga bosilganda yopish
  useEffect(() => {
    if (!menu) return;
    const onPointerDown = (event: PointerEvent) => {
      const node = event.target as Node;
      if (menuRef.current?.contains(node)) return;
      if (targetRef.current?.contains(node)) return;
      setMenu(null);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenu(null);
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [menu, targetRef]);

  // Matn tashqaridan o'zgarsa (yuborilsa) menyu yopiladi
  useEffect(() => {
    if (!value) setMenu(null);
  }, [value]);

  const apply = (tool: Tool) => {
    const el = targetRef.current;
    if (!el || !menu) return;

    let result: { value: string; selectionStart: number; selectionEnd: number };

    if (tool.clear) {
      const selected = value.slice(menu.start, menu.end);
      const cleaned = stripFormatting(selected) || selected;
      result = {
        value: value.slice(0, menu.start) + cleaned + value.slice(menu.end),
        selectionStart: menu.start,
        selectionEnd: menu.start + cleaned.length,
      };
    } else if (tool.prefix) {
      result = prefixLine(value, menu.start, tool.prefix);
    } else {
      result = wrapSelection(value, menu.start, menu.end, tool.marker || '', tool.markerEnd);
    }

    onChange(result.value);

    requestAnimationFrame(() => {
      const target = targetRef.current;
      if (!target) return;
      target.focus();
      target.setSelectionRange(result.selectionStart, result.selectionEnd);
      update();
    });
  };

  if (!menu) return null;

  return (
    <div
      ref={menuRef}
      className={cn(
        'absolute z-50 flex items-center gap-0.5 rounded-xl border border-border bg-popover p-1 shadow-lg',
        'animate-in fade-in-0 zoom-in-95 duration-100',
        className
      )}
      style={{
        top: menu.top,
        left: menu.left,
        transform: menu.below
          ? 'translate(-50%, 26px)'
          : 'translate(-50%, calc(-100% - 8px))',
      }}
      // Menyu bosilganda tanlov saqlanib qolishi kerak
      onMouseDown={(event) => event.preventDefault()}
      onPointerDown={(event) => event.preventDefault()}
    >
      {TOOLS.map((tool) => (
        <button
          key={tool.key}
          type="button"
          onClick={() => apply(tool)}
          title={tool.hint ? tool.label + ' (' + tool.hint + ')' : tool.label}
          aria-label={tool.label}
          className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <tool.icon className="h-4 w-4" />
        </button>
      ))}
    </div>
  );
}

export default SelectionFormatMenu;

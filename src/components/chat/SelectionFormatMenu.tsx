import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Bold,
  Italic,
  Underline,
  Strikethrough,
  Code2,
  EyeOff,
  Quote,
  Link2,
  RemoveFormatting,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { FormatToolId } from './RichComposer';

/**
 * Telegramdek suzuvchi formatlash menyusi.
 *
 * - matn TANLANGANDA chiqadi va aynan tanlovning USTIDA turadi
 *   (avvalgi variant pastda, ekran chetida qolib ketardi);
 * - o'lchov brauzerning haqiqiy Range koordinatalari bilan olinadi,
 *   shuning uchun ko'p qatorli matnda ham to'g'ri joyda turadi;
 * - portal orqali <body>ga chiziladi, ya'ni chat oynasi tomonidan kesilmaydi.
 */

interface SelectionFormatMenuProps {
  /** Formatlash faqat shu element ichidagi tanlov uchun ishlaydi */
  containerRef: React.RefObject<HTMLElement>;
  onApply: (tool: FormatToolId) => void;
}

const TOOLS: Array<{
  id: FormatToolId;
  label: string;
  hint: string;
  Icon: typeof Bold;
}> = [
  { id: 'bold', label: 'Qalin', hint: 'Ctrl+B', Icon: Bold },
  { id: 'italic', label: 'Kursiv', hint: 'Ctrl+I', Icon: Italic },
  { id: 'underline', label: 'Tagi chizilgan', hint: 'Ctrl+U', Icon: Underline },
  { id: 'strike', label: 'Ustidan chizilgan', hint: 'Ctrl+Shift+X', Icon: Strikethrough },
  { id: 'mono', label: 'Monospace', hint: 'Ctrl+Shift+M', Icon: Code2 },
  { id: 'spoiler', label: 'Spoiler', hint: 'Ctrl+Shift+P', Icon: EyeOff },
  { id: 'quote', label: 'Iqtibos', hint: '', Icon: Quote },
  { id: 'link', label: 'Havola', hint: 'Ctrl+K', Icon: Link2 },
  { id: 'clear', label: 'Formatni tozalash', hint: '', Icon: RemoveFormatting },
];

/** 9 tugma x 32px + ichki bo'shliq */
const MENU_WIDTH = 316;
const MENU_HEIGHT = 40;
const GAP = 8;
const EDGE = 8;

interface MenuPosition {
  top: number;
  left: number;
  below: boolean;
}

export function SelectionFormatMenu({ containerRef, onApply }: SelectionFormatMenuProps) {
  const [position, setPosition] = useState<MenuPosition | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const update = useCallback(() => {
    const container = containerRef.current;
    const selection = window.getSelection();

    if (!container || !selection || selection.rangeCount === 0 || selection.isCollapsed) {
      setPosition(null);
      return;
    }

    const range = selection.getRangeAt(0);
    if (!container.contains(range.commonAncestorContainer)) {
      setPosition(null);
      return;
    }

    const rects = Array.from(range.getClientRects());
    const rect = rects.length > 0 ? rects[0] : range.getBoundingClientRect();
    if (!rect || (rect.width === 0 && rect.height === 0)) {
      setPosition(null);
      return;
    }

    const half = MENU_WIDTH / 2;
    const centerX = rect.left + rect.width / 2;
    const left = Math.min(
      Math.max(centerX, half + EDGE),
      window.innerWidth - half - EDGE
    );

    // Odatda tanlov ustida; joy bo'lmasa - pastida.
    const fitsAbove = rect.top - MENU_HEIGHT - GAP > EDGE;
    const top = fitsAbove ? rect.top - GAP : rect.bottom + GAP;

    setPosition({ top, left, below: !fitsAbove });
  }, [containerRef]);

  useEffect(() => {
    const onSelectionChange = () => update();
    const onPointerDown = (e: PointerEvent) => {
      if (menuRef.current?.contains(e.target as Node)) return;
      if (containerRef.current?.contains(e.target as Node)) return;
      setPosition(null);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setPosition(null);
    };

    document.addEventListener('selectionchange', onSelectionChange);
    document.addEventListener('pointerdown', onPointerDown, true);
    document.addEventListener('keydown', onKeyDown);
    window.addEventListener('resize', onSelectionChange);
    window.addEventListener('scroll', onSelectionChange, true);

    return () => {
      document.removeEventListener('selectionchange', onSelectionChange);
      document.removeEventListener('pointerdown', onPointerDown, true);
      document.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('resize', onSelectionChange);
      window.removeEventListener('scroll', onSelectionChange, true);
    };
  }, [containerRef, update]);

  if (!position) return null;

  return createPortal(
    <div
      ref={menuRef}
      role="toolbar"
      aria-label="Formatlash"
      // Tanlov yo'qolmasligi uchun menyu fokusni o'ziga olmaydi
      onMouseDown={(e) => e.preventDefault()}
      onPointerDown={(e) => e.preventDefault()}
      className={cn(
        'fixed z-[60] flex items-center gap-0.5 rounded-2xl border border-border bg-popover p-1 shadow-xl',
        'animate-in fade-in-0 zoom-in-95 duration-100'
      )}
      style={{
        top: position.top,
        left: position.left,
        transform: position.below
          ? 'translate(-50%, 0)'
          : 'translate(-50%, -100%)',
      }}
    >
      {TOOLS.map(({ id, label, hint, Icon }) => (
        <button
          key={id}
          type="button"
          title={hint ? label + ' (' + hint + ')' : label}
          aria-label={label}
          onClick={() => onApply(id)}
          className="flex h-8 w-8 items-center justify-center rounded-xl text-muted-foreground tg-transition hover:bg-muted hover:text-foreground active:scale-95"
        >
          <Icon className="h-4 w-4" />
        </button>
      ))}
    </div>,
    document.body
  );
}

export default SelectionFormatMenu;

import { useState, type RefObject } from 'react';
import {
  Bold,
  Code,
  Heading1,
  Heading2,
  Heading3,
  Italic,
  List,
  Palette,
  Quote,
  Strikethrough,
  Underline,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  TEXT_COLORS,
  applyTextColor,
  toggleBlockFormat,
  toggleInlineFormat,
  type BlockFormat,
  type InlineFormat,
  type TextColorId,
} from '@/lib/richText';

interface FormatToolbarProps {
  textareaRef: RefObject<HTMLTextAreaElement>;
  value: string;
  onChange: (value: string) => void;
  className?: string;
}

const INLINE_BUTTONS: Array<{ format: InlineFormat; icon: typeof Bold; label: string }> = [
  { format: 'bold', icon: Bold, label: 'Qalin' },
  { format: 'italic', icon: Italic, label: 'Qiya' },
  { format: 'strike', icon: Strikethrough, label: 'Chizilgan' },
  { format: 'underline', icon: Underline, label: 'Tagi chizilgan' },
  { format: 'code', icon: Code, label: 'Kod' },
];

const BLOCK_BUTTONS: Array<{ format: BlockFormat; icon: typeof Bold; label: string }> = [
  { format: 'h1', icon: Heading1, label: 'Sarlavha 1' },
  { format: 'h2', icon: Heading2, label: 'Sarlavha 2' },
  { format: 'h3', icon: Heading3, label: 'Sarlavha 3' },
  { format: 'quote', icon: Quote, label: 'Sitata' },
  { format: 'bullet', icon: List, label: "Ro'yxat" },
];

/**
 * Post matnini boyitish paneli: qalin, qiya, chizilgan, tagi chizilgan,
 * kod, sarlavhalar, sitata, ro'yxat va rangli matn.
 */
export function FormatToolbar({ textareaRef, value, onChange, className }: FormatToolbarProps) {
  const [showColors, setShowColors] = useState(false);

  const applyResult = (result: { text: string; selectionStart: number; selectionEnd: number }) => {
    onChange(result.text);

    // Kursorni to'g'ri joyga qaytaramiz
    requestAnimationFrame(() => {
      const element = textareaRef.current;
      if (!element) return;
      element.focus();
      element.setSelectionRange(result.selectionStart, result.selectionEnd);
    });
  };

  const handleInline = (format: InlineFormat) => {
    const element = textareaRef.current;
    if (!element) return;
    applyResult(toggleInlineFormat(value, element.selectionStart, element.selectionEnd, format));
  };

  const handleBlock = (format: BlockFormat) => {
    const element = textareaRef.current;
    if (!element) return;
    applyResult(toggleBlockFormat(value, element.selectionStart, format));
  };

  const handleColor = (color: TextColorId) => {
    const element = textareaRef.current;
    if (!element) return;
    setShowColors(false);
    applyResult(applyTextColor(value, element.selectionStart, element.selectionEnd, color));
  };

  const buttonClass =
    'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition hover:bg-muted hover:text-foreground active:scale-95';

  return (
    <div className={cn('space-y-2', className)}>
      <div className="flex items-center gap-1 overflow-x-auto pb-1 [-webkit-overflow-scrolling:touch]">
        {INLINE_BUTTONS.map(({ format, icon: Icon, label }) => (
          <button
            key={format}
            type="button"
            title={label}
            aria-label={label}
            onClick={() => handleInline(format)}
            className={buttonClass}
          >
            <Icon className="h-4 w-4" />
          </button>
        ))}

        <span className="mx-1 h-5 w-px shrink-0 bg-border" />

        {BLOCK_BUTTONS.map(({ format, icon: Icon, label }) => (
          <button
            key={format}
            type="button"
            title={label}
            aria-label={label}
            onClick={() => handleBlock(format)}
            className={buttonClass}
          >
            <Icon className="h-4 w-4" />
          </button>
        ))}

        <span className="mx-1 h-5 w-px shrink-0 bg-border" />

        <button
          type="button"
          title="Rang"
          aria-label="Matn rangi"
          onClick={() => setShowColors((current) => !current)}
          className={cn(buttonClass, showColors && 'bg-muted text-foreground')}
        >
          <Palette className="h-4 w-4" />
        </button>
      </div>

      {showColors && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border/60 bg-muted/30 p-2">
          {TEXT_COLORS.map((color) => (
            <button
              key={color.id}
              type="button"
              title={color.label}
              aria-label={color.label}
              onClick={() => handleColor(color.id)}
              className={cn(
                'flex h-7 items-center gap-1.5 rounded-full border border-border/60 bg-background px-2.5 text-xs font-medium transition hover:bg-muted',
                color.className,
              )}
            >
              <span className={cn('h-2.5 w-2.5 rounded-full bg-current')} />
              {color.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

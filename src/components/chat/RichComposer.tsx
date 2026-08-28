import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef } from 'react';
import { cn } from '@/lib/utils';

/**
 * Telegramdek WYSIWYG kompozitor.
 *
 * Muammo: oddiy <textarea> ichida formatlash faqat belgilar (** __ ~~) bilan
 * ko'rsatiladi va foydalanuvchi xom kodni ko'radi. Telegram esa matnni darhol
 * qalin/kursiv holida chizadi, belgilar hech qachon ko'rinmaydi.
 *
 * Yechim: contenteditable maydon. Ichida haqiqiy <b>, <i>, <u>, <s>, <code>,
 * spoiler va havola elementlari turadi; tashqariga esa avvalgidek belgili
 * (marker) matn chiqadi, shuning uchun yuborish/saqlash mantig'i o'zgarmaydi.
 */

export type FormatToolId =
  | 'bold'
  | 'italic'
  | 'underline'
  | 'strike'
  | 'mono'
  | 'spoiler'
  | 'quote'
  | 'link'
  | 'clear';

const SPOILER_CLASS = 'rounded bg-foreground/25 px-0.5';

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Belgili matnni (markerlarni) tahrirlanadigan HTMLga aylantirish */
export function markersToHtml(text: string): string {
  let html = escapeHtml(text);
  html = html.replace(/`([^`\n]+)`/g, '<code>$1</code>');
  html = html.replace(
    /\|\|([^\n|]+)\|\|/g,
    '<span data-spoiler="true" class="' + SPOILER_CLASS + '">$1</span>'
  );
  html = html.replace(/\*\*([^\n*]+)\*\*/g, '<b>$1</b>');
  html = html.replace(/\+\+([^\n+]+)\+\+/g, '<u>$1</u>');
  html = html.replace(/__([^\n_]+)__/g, '<i>$1</i>');
  html = html.replace(/~~([^\n~]+)~~/g, '<s>$1</s>');
  html = html.replace(/\[([^\]\n]+)\]\(([^)\s]+)\)/g, '<a href="$2">$1</a>');
  html = html.replace(/\n/g, '<br>');
  return html;
}

function wrap(inner: string, marker: string, markerEnd?: string): string {
  if (!inner) return '';
  return marker + inner + (markerEnd ?? marker);
}

/** DOM daraxtini belgili matnga qaytarish */
function serializeNode(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) return node.textContent || '';
  if (node.nodeType !== Node.ELEMENT_NODE) return '';

  const el = node as HTMLElement;
  const tag = el.tagName.toLowerCase();
  if (tag === 'br') return '\n';

  const inner = serializeChildren(el);

  switch (tag) {
    case 'b':
    case 'strong':
      return wrap(inner, '**');
    case 'i':
    case 'em':
      return wrap(inner, '__');
    case 'u':
      return wrap(inner, '++');
    case 's':
    case 'strike':
    case 'del':
      return wrap(inner, '~~');
    case 'code':
      return wrap(inner, '`');
    case 'a': {
      const href = el.getAttribute('href') || '';
      return href && inner ? '[' + inner + '](' + href + ')' : inner;
    }
    case 'blockquote':
      return inner ? '\n> ' + inner : '';
    case 'div':
    case 'p':
      return '\n' + inner;
    default:
      break;
  }

  if (el.getAttribute('data-spoiler') === 'true') return wrap(inner, '||');

  // execCommand ba'zi brauzerlarda inline style qo'yadi - uni ham hisobga olamiz
  const style = el.style;
  let result = inner;
  if (style) {
    const weight = style.fontWeight;
    if (weight === 'bold' || weight === 'bolder' || Number(weight) >= 600) {
      result = wrap(result, '**');
    }
    if (style.fontStyle === 'italic') result = wrap(result, '__');
    const decoration = style.textDecorationLine || style.textDecoration || '';
    if (decoration.includes('line-through')) result = wrap(result, '~~');
    else if (decoration.includes('underline')) result = wrap(result, '++');
  }
  return result;
}

function serializeChildren(root: Node): string {
  let out = '';
  root.childNodes.forEach((child) => {
    out += serializeNode(child);
  });
  return out;
}

function serializeRoot(root: HTMLElement): string {
  let text = serializeChildren(root);
  if (text.startsWith('\n')) text = text.slice(1);
  if (text.endsWith('\n')) text = text.slice(0, -1);
  return text;
}

function placeCaretAtEnd(el: HTMLElement) {
  const range = document.createRange();
  range.selectNodeContents(el);
  range.collapse(false);
  const sel = window.getSelection();
  sel?.removeAllRanges();
  sel?.addRange(range);
}

function surroundSelection(node: HTMLElement) {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return;
  const range = sel.getRangeAt(0);
  try {
    range.surroundContents(node);
  } catch {
    // Tanlov bir nechta elementni kesib o'tsa surroundContents ishlamaydi
    node.appendChild(range.extractContents());
    range.insertNode(node);
  }
  const next = document.createRange();
  next.selectNodeContents(node);
  sel.removeAllRanges();
  sel.addRange(next);
}

export interface RichComposerHandle {
  focus: () => void;
  /** Kursorning belgili matndagi o'rni (mention aniqlash uchun) */
  getCaretIndex: () => number;
  insertText: (text: string) => void;
  applyFormat: (tool: FormatToolId) => void;
  element: () => HTMLDivElement | null;
}

interface RichComposerProps {
  value: string;
  onChange: (value: string, caretIndex: number) => void;
  onKeyDown?: (e: React.KeyboardEvent<HTMLDivElement>) => void;
  onImagePaste?: (file: File) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}

export const RichComposer = forwardRef<RichComposerHandle, RichComposerProps>(
  function RichComposer(
    { value, onChange, onKeyDown, onImagePaste, placeholder, disabled, className },
    ref
  ) {
    const elRef = useRef<HTMLDivElement>(null);
    const lastValueRef = useRef<string>('');

    const emitChange = useCallback(() => {
      const el = elRef.current;
      if (!el) return;
      const text = serializeRoot(el);
      lastValueRef.current = text;
      onChange(text, getCaretIndex());
    }, [onChange]);

    const getCaretIndex = useCallback((): number => {
      const el = elRef.current;
      const sel = window.getSelection();
      if (!el || !sel || sel.rangeCount === 0) return 0;
      const range = sel.getRangeAt(0);
      if (!el.contains(range.startContainer)) return 0;
      const pre = document.createRange();
      pre.setStart(el, 0);
      try {
        pre.setEnd(range.startContainer, range.startOffset);
      } catch {
        return 0;
      }
      const holder = document.createElement('div');
      holder.appendChild(pre.cloneContents());
      return serializeChildren(holder).length;
    }, []);

    // Tashqaridan kelgan qiymat (tozalash, mention, dastlabki matn) DOMga tushadi.
    useEffect(() => {
      const el = elRef.current;
      if (!el) return;
      if (value === lastValueRef.current) return;
      lastValueRef.current = value;
      el.innerHTML = value ? markersToHtml(value) : '';
      if (document.activeElement === el) placeCaretAtEnd(el);
    }, [value]);

    const applyFormat = useCallback(
      (tool: FormatToolId) => {
        const el = elRef.current;
        if (!el) return;
        el.focus();
        try {
          document.execCommand('styleWithCSS', false, 'false');
        } catch {
          // eski brauzerlar - muhim emas
        }

        switch (tool) {
          case 'bold':
            document.execCommand('bold');
            break;
          case 'italic':
            document.execCommand('italic');
            break;
          case 'underline':
            document.execCommand('underline');
            break;
          case 'strike':
            document.execCommand('strikeThrough');
            break;
          case 'mono':
            surroundSelection(document.createElement('code'));
            break;
          case 'spoiler': {
            const span = document.createElement('span');
            span.setAttribute('data-spoiler', 'true');
            span.className = SPOILER_CLASS;
            surroundSelection(span);
            break;
          }
          case 'quote':
            document.execCommand('formatBlock', false, 'blockquote');
            break;
          case 'link': {
            const url = window.prompt('Havola manzili', 'https://');
            if (url) document.execCommand('createLink', false, url);
            break;
          }
          case 'clear':
            document.execCommand('removeFormat');
            document.execCommand('unlink');
            break;
          default:
            break;
        }
        emitChange();
      },
      [emitChange]
    );

    useImperativeHandle(
      ref,
      () => ({
        focus: () => elRef.current?.focus(),
        getCaretIndex,
        insertText: (text: string) => {
          const el = elRef.current;
          if (!el) return;
          el.focus();
          document.execCommand('insertText', false, text);
          emitChange();
        },
        applyFormat,
        element: () => elRef.current,
      }),
      [applyFormat, emitChange, getCaretIndex]
    );

    const handlePaste = (e: React.ClipboardEvent<HTMLDivElement>) => {
      const items = Array.from(e.clipboardData?.items || []);
      const imageItem = items.find((item) => item.type.startsWith('image/'));
      if (imageItem && onImagePaste) {
        const file = imageItem.getAsFile();
        if (file) {
          e.preventDefault();
          onImagePaste(file);
          return;
        }
      }
      // Tashqi HTML formatlar kompozitorni buzmasligi uchun faqat oddiy matn
      e.preventDefault();
      const text = e.clipboardData?.getData('text/plain') || '';
      if (text) document.execCommand('insertText', false, text);
      emitChange();
    };

    const isEmpty = !value;

    return (
      <div className="relative">
        <div
          ref={elRef}
          role="textbox"
          aria-multiline="true"
          aria-label={placeholder}
          contentEditable={!disabled}
          suppressContentEditableWarning
          onInput={emitChange}
          onKeyUp={() => {
            // kursor siljiganda mention holati ham yangilanishi kerak
            onChange(lastValueRef.current, getCaretIndex());
          }}
          onPaste={handlePaste}
          onKeyDown={onKeyDown}
          className={cn(
            'chat-selectable block w-full whitespace-pre-wrap break-words rounded-[20px] border border-border bg-muted/50',
            'px-3.5 py-[9px] pr-11 text-[15px] leading-[22px]',
            'min-h-[40px] max-h-[140px] overflow-y-auto scrollbar-hide',
            'focus:outline-none focus:ring-2 focus:ring-primary/40',
            '[&_code]:font-mono [&_code]:text-[13.5px] [&_a]:text-primary [&_a]:underline',
            '[&_blockquote]:border-l-2 [&_blockquote]:border-primary [&_blockquote]:pl-2 [&_blockquote]:my-0',
            disabled && 'cursor-not-allowed opacity-50',
            className
          )}
        />
        {isEmpty && (
          <span className="pointer-events-none absolute left-3.5 top-[9px] select-none text-[15px] leading-[22px] text-muted-foreground">
            {placeholder}
          </span>
        )}
      </div>
    );
  }
);

export default RichComposer;

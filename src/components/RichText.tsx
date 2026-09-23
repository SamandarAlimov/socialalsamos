import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { colorClassName, parseRichText, type InlineToken } from '@/lib/richText';
import { normalizeAlsamosRichTextDocument } from '@/lib/richTextDocument';

interface RichTextProps {
  content?: string | null;
  formattedContent?: unknown;
  className?: string;
  /**
   * Long post text can be collapsed behind `more` / `less` controls.
   * When omitted, normal feed-style `text-sm leading-relaxed` post bodies use
   * the compact behaviour automatically, while draft/editor previews keep
   * their existing full-height rendering.
   */
  collapsible?: boolean;
}

const MENTION_HASHTAG_LINK = /(@[\p{L}\p{N}_]+)|(#[\p{L}\p{N}_]+)|(https?:\/\/[^\s<]+[^<.,:;"')\]\s])/gu;

// Legacy post composer metadata must never be shown as raw JSON in the feed.
// Music is rendered by PostExtras/PostMusicCard instead.
const LEGACY_MUSIC_BLOCK = /\s*\[MUSIC\][\s\S]*?\[\/MUSIC\]\s*/gi;

function stripLegacyMetadata(content: string): string {
  return content.replace(LEGACY_MUSIC_BLOCK, '').trim();
}

function tokenClassName(token: InlineToken): string {
  return cn(
    token.bold && 'font-bold',
    token.italic && 'italic',
    token.strike && 'line-through',
    token.underline && 'underline underline-offset-2',
    token.code && 'rounded bg-muted px-1 py-0.5 font-mono text-[0.9em]',
    token.color && colorClassName(token.color),
  );
}

/** Token matni ichidagi mention, hashtag va havolalarni linkka aylantiradi. */
function renderTokenText(text: string, keyPrefix: string) {
  const nodes: JSX.Element[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  MENTION_HASHTAG_LINK.lastIndex = 0;

  while ((match = MENTION_HASHTAG_LINK.exec(text)) !== null) {
    if (match.index > lastIndex) {
      nodes.push(
        <Fragment key={`${keyPrefix}-t-${lastIndex}`}>{text.slice(lastIndex, match.index)}</Fragment>,
      );
    }

    if (match[1]) {
      nodes.push(
        <Link
          key={`${keyPrefix}-m-${match.index}`}
          to={`/user/${match[1].slice(1)}`}
          className="font-semibold text-link hover:text-link-hover hover:underline"
          onClick={(event) => event.stopPropagation()}
        >
          {match[1]}
        </Link>,
      );
    } else if (match[2]) {
      nodes.push(
        <Link
          key={`${keyPrefix}-h-${match.index}`}
          to={`/search?q=%23${encodeURIComponent(match[2].slice(1))}`}
          className="font-medium text-link hover:text-link-hover hover:underline"
          onClick={(event) => event.stopPropagation()}
        >
          {match[2]}
        </Link>,
      );
    } else if (match[3]) {
      nodes.push(
        <a
          key={`${keyPrefix}-l-${match.index}`}
          href={match[3]}
          target="_blank"
          rel="noopener noreferrer"
          className="break-all text-link underline underline-offset-2 hover:text-link-hover"
          onClick={(event) => event.stopPropagation()}
        >
          {match[3]}
        </a>,
      );
    }

    lastIndex = MENTION_HASHTAG_LINK.lastIndex;
  }

  if (lastIndex < text.length) {
    nodes.push(<Fragment key={`${keyPrefix}-t-end`}>{text.slice(lastIndex)}</Fragment>);
  }

  return nodes;
}

/**
 * Formatlangan post matnini render qiladi.
 * HTML ishlatilmaydi — faqat tokenlar, shuning uchun XSS xavfi yo'q.
 */
export function RichText({ content, formattedContent, className, collapsible }: RichTextProps) {
  const previewRef = useRef<HTMLDivElement | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [canExpand, setCanExpand] = useState(false);

  const cleanContent = useMemo(
    () => stripLegacyMetadata(content ?? ''),
    [content],
  );

  const structured = useMemo(() => {
    const normalized = normalizeAlsamosRichTextDocument(formattedContent);
    // Old formatted documents can contain the same legacy [MUSIC] metadata.
    // In that case fall back to the sanitized plain content rather than exposing
    // the serialized implementation detail in the UI.
    if (normalized && /\[MUSIC\]/i.test(JSON.stringify(formattedContent))) {
      return null;
    }
    return normalized;
  }, [formattedContent]);

  const blocks = useMemo(
    () => structured?.blocks ?? parseRichText(cleanContent),
    [cleanContent, structured],
  );

  // Existing feed/post surfaces already use this exact typography. Making that
  // convention the default lets Home, feed cards and post views stay compact
  // without changing unrelated editor/draft previews. Callers can still opt in
  // or out explicitly through `collapsible`.
  const compactPostBody = useMemo(() => {
    if (typeof collapsible === 'boolean') return collapsible;
    const classes = className?.split(/\s+/) ?? [];
    return classes.includes('text-sm') && classes.includes('leading-relaxed');
  }, [className, collapsible]);

  useEffect(() => {
    setExpanded(false);
    setCanExpand(false);
  }, [cleanContent, formattedContent]);

  useEffect(() => {
    if (!compactPostBody || expanded) return;
    const node = previewRef.current;
    if (!node) return;

    let frame = 0;
    const measure = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const next = node.scrollHeight > node.clientHeight + 2;
        setCanExpand((current) => (current === next ? current : next));
      });
    };

    measure();

    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', measure);
      return () => {
        cancelAnimationFrame(frame);
        window.removeEventListener('resize', measure);
      };
    }

    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [blocks, compactPostBody, expanded]);

  if (blocks.length === 0) return null;

  return (
    <div className={className}>
      <div
        ref={previewRef}
        className={cn(
          'relative space-y-1',
          compactPostBody && !expanded && 'max-h-[8rem] overflow-hidden',
        )}
      >
        {blocks.map((block, blockIndex) => {
          const children = block.tokens.map((token, tokenIndex) => (
            <span key={tokenIndex} className={tokenClassName(token)}>
              {renderTokenText(token.text, `${blockIndex}-${tokenIndex}`)}
            </span>
          ));

          if (block.tokens.length === 0) {
            return <div key={blockIndex} className="h-2" />;
          }

          switch (block.type) {
            case 'h1':
              return (
                <h3 key={blockIndex} className="text-xl font-bold leading-tight">
                  {children}
                </h3>
              );
            case 'h2':
              return (
                <h4 key={blockIndex} className="text-lg font-bold leading-tight">
                  {children}
                </h4>
              );
            case 'h3':
              return (
                <h5 key={blockIndex} className="text-base font-semibold leading-tight">
                  {children}
                </h5>
              );
            case 'quote':
              return (
                <blockquote
                  key={blockIndex}
                  className="border-l-2 border-border pl-3 text-muted-foreground"
                >
                  {children}
                </blockquote>
              );
            case 'bullet':
              return (
                <div key={blockIndex} className="flex gap-2">
                  <span className="select-none text-muted-foreground">•</span>
                  <span className="min-w-0 flex-1">{children}</span>
                </div>
              );
            default:
              return (
                <p key={blockIndex} className="whitespace-pre-wrap break-words">
                  {children}
                </p>
              );
          }
        })}

        {compactPostBody && !expanded && canExpand && (
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 bottom-0 h-7 bg-gradient-to-t from-card via-card/90 to-transparent"
          />
        )}
      </div>

      {compactPostBody && canExpand && (
        <button
          type="button"
          aria-expanded={expanded}
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            setExpanded((current) => !current);
          }}
          className="mt-1 inline-flex min-h-7 items-center text-sm font-medium text-muted-foreground transition-colors hover:text-foreground active:opacity-70"
        >
          {expanded ? 'less' : 'more'}
        </button>
      )}
    </div>
  );
}

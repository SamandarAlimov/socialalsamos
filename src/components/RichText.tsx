import { Fragment, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { colorClassName, parseRichText, type InlineToken } from '@/lib/richText';

interface RichTextProps {
  content: string;
  className?: string;
}

const MENTION_HASHTAG_LINK = /(@[\p{L}\p{N}_]+)|(#[\p{L}\p{N}_]+)|(https?:\/\/[^\s<]+[^<.,:;"')\]\s])/gu;

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
          className="font-semibold text-alsamos-orange-light hover:underline"
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
          className="font-medium text-blue-400 hover:underline"
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
          className="break-all text-sky-400 underline underline-offset-2"
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
export function RichText({ content, className }: RichTextProps) {
  const blocks = useMemo(() => parseRichText(content), [content]);

  if (blocks.length === 0) return null;

  return (
    <div className={cn('space-y-1', className)}>
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
                className="border-l-2 border-primary/60 pl-3 text-muted-foreground"
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
    </div>
  );
}

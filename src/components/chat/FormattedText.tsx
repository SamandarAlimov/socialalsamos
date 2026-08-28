import { Fragment, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { EmojiText } from '@/components/emoji/EmojiText';
import { InlineNode, parseInline } from '@/lib/messageFormat';

interface FormattedTextProps {
  text: string;
  className?: string;
  emojiSize?: number;
}

/** Spoiler: bosilgunga qadar yashirin turadi (Telegramdek) */
function Spoiler({ children }: { children: React.ReactNode }) {
  const [revealed, setRevealed] = useState(false);

  return (
    <span
      role="button"
      tabIndex={0}
      onClick={(event) => {
        event.stopPropagation();
        setRevealed(true);
      }}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') setRevealed(true);
      }}
      className={
        revealed
          ? 'rounded-sm bg-transparent transition-colors'
          : 'cursor-pointer select-none rounded-sm bg-foreground/25 text-transparent transition-colors'
      }
      style={revealed ? undefined : { textShadow: '0 0 8px rgba(0,0,0,0.45)' }}
    >
      {children}
    </span>
  );
}

/** Oddiy matn ichidagi mention, hashtag, havola va emojilar */
function PlainText({ text, emojiSize }: { text: string; emojiSize: number }) {
  const parts = useMemo(() => {
    const pattern = /(@[a-zA-Z0-9_]+)|(#[\p{L}0-9_]+)|(https?:\/\/[^\s<]+[^<.,:;"')\]\s])/gu;
    const result: { type: 'text' | 'mention' | 'hashtag' | 'link'; value: string }[] = [];

    let lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = pattern.exec(text)) !== null) {
      if (match.index > lastIndex) {
        result.push({ type: 'text', value: text.slice(lastIndex, match.index) });
      }

      if (match[1]) result.push({ type: 'mention', value: match[1].slice(1) });
      else if (match[2]) result.push({ type: 'hashtag', value: match[2].slice(1) });
      else if (match[3]) result.push({ type: 'link', value: match[3] });

      lastIndex = pattern.lastIndex;
    }

    if (lastIndex < text.length) {
      result.push({ type: 'text', value: text.slice(lastIndex) });
    }

    return result;
  }, [text]);

  return (
    <>
      {parts.map((part, index) => {
        switch (part.type) {
          case 'mention':
            return (
              <Link
                key={index}
                to={'/user/' + part.value}
                className="font-medium text-primary hover:underline"
                onClick={(event) => event.stopPropagation()}
              >
                @{part.value}
              </Link>
            );
          case 'hashtag':
            return (
              <Link
                key={index}
                to={'/search?q=%23' + encodeURIComponent(part.value)}
                className="font-medium text-sky-500 hover:underline"
                onClick={(event) => event.stopPropagation()}
              >
                #{part.value}
              </Link>
            );
          case 'link':
            return (
              <a
                key={index}
                href={part.value}
                target="_blank"
                rel="noopener noreferrer"
                className="break-all text-sky-500 underline underline-offset-2"
                onClick={(event) => event.stopPropagation()}
              >
                {part.value}
              </a>
            );
          default:
            return <EmojiText key={index} text={part.value} size={emojiSize} />;
        }
      })}
    </>
  );
}

function renderNodes(nodes: InlineNode[], emojiSize: number): React.ReactNode {
  return nodes.map((node, index) => {
    const children = node.children ? renderNodes(node.children, emojiSize) : null;

    switch (node.type) {
      case 'bold':
        return <strong key={index} className="font-semibold">{children}</strong>;
      case 'italic':
        return <em key={index}>{children}</em>;
      case 'underline':
        return <u key={index}>{children}</u>;
      case 'strike':
        return <s key={index} className="opacity-80">{children}</s>;
      case 'code':
        return (
          <code
            key={index}
            className="rounded bg-foreground/10 px-1 py-0.5 font-mono text-[0.92em]"
          >
            {node.text}
          </code>
        );
      case 'spoiler':
        return <Spoiler key={index}>{children}</Spoiler>;
      case 'link':
        return (
          <a
            key={index}
            href={node.href}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sky-500 underline underline-offset-2"
            onClick={(event) => event.stopPropagation()}
          >
            {children}
          </a>
        );
      default:
        return (
          <Fragment key={index}>
            <PlainText text={node.text || ''} emojiSize={emojiSize} />
          </Fragment>
        );
    }
  });
}

/** Telegram uslubidagi formatlangan matn */
export function FormattedText({ text, className, emojiSize = 18 }: FormattedTextProps) {
  const nodes = useMemo(() => parseInline(text || ''), [text]);

  return (
    <span className={'whitespace-pre-wrap break-words ' + (className || '')}>
      {renderNodes(nodes, emojiSize)}
    </span>
  );
}

export default FormattedText;

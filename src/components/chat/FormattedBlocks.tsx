import { useMemo } from 'react';
import { parseBlocks } from '@/lib/messageFormat';
import { FormattedText } from './FormattedText';

interface FormattedBlocksProps {
  text: string;
  className?: string;
  emojiSize?: number;
}

/** Maqola va uzun matnlarni bloklar (sarlavha, iqtibos, ro'yxat, kod) bilan chizadi */
export function FormattedBlocks({ text, className, emojiSize = 18 }: FormattedBlocksProps) {
  const blocks = useMemo(() => parseBlocks(text || ''), [text]);

  return (
    <div className={'space-y-3 ' + (className || '')}>
      {blocks.map((block, index) => {
        switch (block.type) {
          case 'heading1':
            return (
              <h2 key={index} className="text-xl font-bold text-foreground">
                <FormattedText text={block.text} emojiSize={emojiSize + 2} />
              </h2>
            );
          case 'heading2':
            return (
              <h3 key={index} className="text-base font-semibold text-foreground">
                <FormattedText text={block.text} emojiSize={emojiSize} />
              </h3>
            );
          case 'quote':
            return (
              <blockquote
                key={index}
                className="border-l-2 border-border pl-3 text-muted-foreground"
              >
                <FormattedText text={block.text} emojiSize={emojiSize} />
              </blockquote>
            );
          case 'bullet':
            return (
              <div key={index} className="flex gap-2">
                <span className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-muted-foreground" />
                <span className="flex-1">
                  <FormattedText text={block.text} emojiSize={emojiSize} />
                </span>
              </div>
            );
          case 'ordered':
            return (
              <div key={index} className="flex gap-2">
                <span className="shrink-0 font-semibold text-muted-foreground">{block.index}.</span>
                <span className="flex-1">
                  <FormattedText text={block.text} emojiSize={emojiSize} />
                </span>
              </div>
            );
          case 'pre':
            return (
              <pre
                key={index}
                className="overflow-x-auto rounded-xl bg-foreground/10 p-3 font-mono text-xs leading-relaxed"
              >
                <code>{block.text}</code>
              </pre>
            );
          case 'divider':
            return <hr key={index} className="border-border" />;
          default:
            return (
              <p key={index} className="leading-relaxed">
                <FormattedText text={block.text} emojiSize={emojiSize} />
              </p>
            );
        }
      })}
    </div>
  );
}

export default FormattedBlocks;

import { useState } from 'react';
import { BookOpen, Clock, X } from 'lucide-react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { ArticleData, articleExcerpt, estimateReadingMinutes } from '@/lib/messageFormat';
import { FormattedBlocks } from './FormattedBlocks';

interface ArticleMessageProps {
  article: ArticleData;
  isMine?: boolean;
  className?: string;
}

/** Chatdagi maqola xabari: karta + to'liq o'qish oynasi */
export function ArticleMessage({ article, isMine, className }: ArticleMessageProps) {
  const [open, setOpen] = useState(false);
  const minutes = estimateReadingMinutes(article.body);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={
          'w-full overflow-hidden rounded-xl border text-left transition-colors ' +
          (isMine
            ? 'border-primary-foreground/25 bg-primary-foreground/10 hover:bg-primary-foreground/15'
            : 'border-border bg-muted/50 hover:bg-muted') +
          ' ' +
          (className || '')
        }
      >
        {article.cover && (
          <img src={article.cover} alt={article.title} className="h-36 w-full object-cover" />
        )}

        <div className="space-y-1 p-3">
          <div className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide opacity-70">
            <BookOpen className="h-3.5 w-3.5" />
            Maqola
            <span className="opacity-60">{'\u00b7'}</span>
            <Clock className="h-3.5 w-3.5" />
            {minutes} daq
          </div>

          <p className="line-clamp-2 text-[15px] font-semibold leading-snug">{article.title}</p>
          <p className="line-clamp-2 text-xs opacity-80">{articleExcerpt(article.body)}</p>
          <span className="inline-block pt-1 text-xs font-medium underline underline-offset-2">
            To'liq o'qish
          </span>
        </div>
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="flex max-h-[92vh] w-[96vw] max-w-3xl flex-col gap-0 p-0 sm:w-full">
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <BookOpen className="h-4 w-4" />
              Maqola
              <span>{'\u00b7'}</span>
              {minutes} daqiqalik o'qish
            </div>
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setOpen(false)}>
              <X className="h-4 w-4" />
            </Button>
          </div>

          <ScrollArea className="max-h-[80vh]">
            <article className="px-5 py-5">
              {article.cover && (
                <img
                  src={article.cover}
                  alt={article.title}
                  className="mb-4 max-h-72 w-full rounded-2xl object-cover"
                />
              )}
              <h1 className="mb-4 text-2xl font-bold leading-tight text-foreground md:text-3xl">
                {article.title}
              </h1>
              <FormattedBlocks text={article.body} className="text-[15px] leading-7" emojiSize={20} />
            </article>
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </>
  );
}

export default ArticleMessage;

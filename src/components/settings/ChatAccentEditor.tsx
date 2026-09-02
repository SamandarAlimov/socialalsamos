import { useEffect, useState } from 'react';
import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  CHAT_ACCENTS,
  ChatAccent,
  getStoredChatAccent,
  setStoredChatAccent,
} from '@/lib/chatAccent';

export function ChatAccentEditor() {
  const [accent, setAccent] = useState<ChatAccent>(() => getStoredChatAccent());

  useEffect(() => {
    const sync = (event: Event) => {
      const detail = (event as CustomEvent<ChatAccent>).detail;
      if (detail) setAccent(detail);
    };
    window.addEventListener('alsamos:chat-accent', sync);
    return () => window.removeEventListener('alsamos:chat-accent', sync);
  }, []);

  const choose = (next: ChatAccent) => {
    setAccent(next);
    setStoredChatAccent(next);
  };

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-semibold text-foreground">Mening xabarlarim rangi</h3>
        <p className="mt-1 text-xs text-muted-foreground">
          Standart rang yashil. Bu tanlov Alsamos orange brend rangidan mustaqil va light/dark rejimga moslashadi.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        {CHAT_ACCENTS.map((item) => {
          const selected = accent === item.id;
          return (
            <button
              key={item.id}
              type="button"
              aria-pressed={selected}
              onClick={() => choose(item.id)}
              className={cn(
                'flex min-h-20 flex-col items-center justify-center gap-2 rounded-xl border px-2 py-3 text-center transition-colors',
                selected
                  ? 'border-foreground/25 bg-muted font-semibold text-foreground'
                  : 'border-border bg-background text-muted-foreground hover:bg-muted/60 hover:text-foreground'
              )}
            >
              <span className={cn('flex h-7 w-7 items-center justify-center rounded-full', item.swatchClass)}>
                {selected && <Check className="h-4 w-4 text-white" strokeWidth={3} />}
              </span>
              <span className="text-xs">{item.label}</span>
            </button>
          );
        })}
      </div>

      <div className="rounded-2xl border border-border bg-muted/30 p-3">
        <div className="flex justify-start">
          <div className="max-w-[72%] rounded-2xl rounded-bl-md border border-border bg-bubble-other px-3 py-2 text-sm text-bubble-other-foreground">
            Salom, xabar ko'rinishi shunday.
          </div>
        </div>
        <div className="mt-2 flex justify-end">
          <div className="max-w-[72%] rounded-2xl rounded-br-md border border-border/60 bg-bubble-own px-3 py-2 text-sm text-bubble-own-foreground">
            Juda yaxshi, shu rang menga mos.
          </div>
        </div>
      </div>
    </div>
  );
}

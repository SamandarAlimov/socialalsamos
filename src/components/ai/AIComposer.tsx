import { useEffect, useState, type ComponentProps } from 'react';
import { Bot, MessageCircle } from 'lucide-react';
import { AIComposer as AIComposerV2 } from './AIComposerV2';
import type { ComposerAttachment } from './AIComposerV2';
import type { AIMode } from '@/lib/ai/capabilities';
import { cn } from '@/lib/utils';

const MODE_KEY = 'alsamos.ai.mode';

type Props = ComponentProps<typeof AIComposerV2>;

function initialMode(): AIMode {
  try {
    const value = localStorage.getItem(MODE_KEY);
    return value === 'chat' || value === 'agent' ? value : 'agent';
  } catch {
    return 'agent';
  }
}

export function AIComposer(props: Props) {
  const [mode, setMode] = useState<AIMode>(initialMode);

  useEffect(() => {
    try {
      localStorage.setItem(MODE_KEY, mode);
    } catch {
      // ignore storage failures
    }
  }, [mode]);

  return (
    <div className="w-full">
      <div className="mx-auto mb-1.5 flex w-full max-w-3xl justify-end px-3 sm:px-4">
        <div className="inline-flex rounded-full border border-border/60 bg-background/95 p-0.5 shadow-sm backdrop-blur">
          {([
            ['chat', 'Suhbat', MessageCircle],
            ['agent', 'Agent', Bot],
          ] as const).map(([id, label, Icon]) => (
            <button
              key={id}
              type="button"
              onClick={() => setMode(id)}
              className={cn(
                'flex h-7 items-center gap-1.5 rounded-full px-2.5 text-[11px] font-medium transition-colors',
                mode === id
                  ? 'bg-foreground text-background'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground',
              )}
              title={
                id === 'agent'
                  ? 'Ko‘p qadamli durable vazifa: plan, tools, checkpoint va background davom etish'
                  : 'Tez suhbat: minimal tool budget va qisqa orchestration'
              }
            >
              <Icon className="h-3.5 w-3.5" />
              {label}
            </button>
          ))}
        </div>
      </div>
      <AIComposerV2 {...props} mode={mode} onModeChange={setMode} />
    </div>
  );
}

export type { ComposerAttachment };

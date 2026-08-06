import { useEffect, useRef, useState } from 'react';
import {
  Paperclip,
  ArrowUp,
  Square,
  Mic,
  Loader2,
  X,
  FileText,
  Film,
  Music,
  Zap,
  ImageIcon,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { SLASH_COMMANDS, detectIntent } from '@/lib/aiIntent';

export interface ComposerAttachment {
  url: string;
  name: string;
  type: string;
}

interface Props {
  value: string;
  onChange: (v: string) => void;
  onSend: () => void;
  onStop: () => void;
  busy: boolean;
  uploading: boolean;
  attachments: ComposerAttachment[];
  onPickFiles: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onDropFiles: (files: File[]) => void;
  onRemoveAttachment: (index: number) => void;
}

const PLACEHOLDERS = [
  'Savol bering, rasm yarating yoki kod yozing...',
  'Masalan: "Bozor uchun reklama matni yoz"',
  'Masalan: "Tog\' manzarasi rasmini chiz"',
  'Masalan: "Ushbu matnni ingliz tiliga tarjima qil"',
];

export function AIComposer({
  value,
  onChange,
  onSend,
  onStop,
  busy,
  uploading,
  attachments,
  onPickFiles,
  onDropFiles,
  onRemoveAttachment,
}: Props) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [placeholderIdx, setPlaceholderIdx] = useState(0);
  const [dragging, setDragging] = useState(false);

  // Rotating placeholder while the input is empty.
  useEffect(() => {
    if (value) return;
    const t = setInterval(() => setPlaceholderIdx((i) => (i + 1) % PLACEHOLDERS.length), 4000);
    return () => clearInterval(t);
  }, [value]);

  // Auto-grow
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  }, [value]);

  const showSlash = value.startsWith('/') && !value.includes(' ');
  const slashMatches = SLASH_COMMANDS.filter((c) => c.cmd.startsWith(value.toLowerCase()));
  const intent = value.trim() ? detectIntent(value).intent : 'chat';
  const canSend = (value.trim().length > 0 || attachments.length > 0) && !busy;

  return (
    <div className="border-t border-border/20 bg-background/80 p-3 backdrop-blur-xl pb-[max(0.75rem,env(safe-area-inset-bottom))]">
      <div className="mx-auto max-w-3xl">
        <input
          ref={fileInputRef}
          type="file"
          multiple
          className="hidden"
          onChange={onPickFiles}
          accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.txt,.md,.xlsx,.xls,.pptx,.ppt,.csv,.json,.zip,.rar,.7z"
        />

        {attachments.length > 0 && (
          <div className="mb-2 flex flex-wrap gap-2">
            {attachments.map((a, i) => (
              <div
                key={`${a.url}-${i}`}
                className="flex max-w-[220px] items-center gap-2 rounded-lg border border-border/50 bg-muted/60 py-1 pl-2 pr-1 text-xs"
              >
                {a.type === 'image' ? (
                  <img src={a.url} className="h-7 w-7 rounded object-cover" alt="" />
                ) : a.type === 'video' ? (
                  <Film className="h-4 w-4 shrink-0 text-alsamos-orange" />
                ) : a.type === 'audio' ? (
                  <Music className="h-4 w-4 shrink-0 text-alsamos-orange" />
                ) : (
                  <FileText className="h-4 w-4 shrink-0 text-alsamos-orange" />
                )}
                <span className="truncate">{a.name}</span>
                <button
                  onClick={() => onRemoveAttachment(i)}
                  className="rounded p-0.5 hover:bg-background"
                  aria-label="Olib tashlash"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
        )}

        {showSlash && slashMatches.length > 0 && (
          <div className="mb-2 overflow-hidden rounded-xl border border-border/50 bg-card shadow-lg">
            {slashMatches.map((c) => (
              <button
                key={c.cmd}
                onClick={() => onChange(`${c.cmd} `)}
                className="flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-muted/60"
              >
                <span className="font-mono text-xs text-alsamos-orange">{c.cmd}</span>
                <span className="text-xs font-medium">{c.label}</span>
                <span className="ml-auto truncate text-[10px] text-muted-foreground">{c.hint}</span>
              </button>
            ))}
          </div>
        )}

        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            const files = Array.from(e.dataTransfer.files || []);
            if (files.length) onDropFiles(files);
          }}
          className={cn(
            'relative rounded-2xl border bg-card/80 shadow-lg transition-all duration-200',
            dragging
              ? 'border-alsamos-orange bg-alsamos-orange/5'
              : 'border-border/50 focus-within:border-alsamos-orange/50 focus-within:shadow-alsamos-orange/10',
          )}
        >
          <Textarea
            ref={textareaRef}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                if (canSend) onSend();
              }
            }}
            rows={1}
            placeholder={PLACEHOLDERS[placeholderIdx]}
            className="max-h-[200px] min-h-[52px] resize-none border-0 bg-transparent px-4 py-3.5 pr-28 text-sm placeholder:text-muted-foreground/60 focus-visible:ring-0"
          />

          <div className="absolute bottom-2 right-2 flex items-center gap-1">
            <Button
              size="icon"
              variant="ghost"
              className="h-8 w-8 rounded-lg text-muted-foreground hover:text-alsamos-orange"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              aria-label="Fayl biriktirish"
            >
              {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Paperclip className="h-4 w-4" />}
            </Button>
            <Button
              size="icon"
              variant="ghost"
              className="hidden h-8 w-8 rounded-lg text-muted-foreground sm:inline-flex"
              disabled
              aria-label="Ovozli kiritish (tez orada)"
            >
              <Mic className="h-4 w-4" />
            </Button>
            {busy ? (
              <Button
                size="icon"
                className="h-8 w-8 rounded-xl bg-foreground text-background hover:opacity-90"
                onClick={onStop}
                aria-label="To'xtatish"
              >
                <Square className="h-3.5 w-3.5 fill-current" />
              </Button>
            ) : (
              <Button
                size="icon"
                className={cn(
                  'h-8 w-8 rounded-xl transition-all',
                  canSend
                    ? 'bg-gradient-to-r from-alsamos-orange to-alsamos-orange-dark text-white shadow-md shadow-alsamos-orange/20 hover:opacity-90'
                    : 'bg-muted text-muted-foreground',
                )}
                onClick={onSend}
                disabled={!canSend}
                aria-label="Yuborish"
              >
                <ArrowUp className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>

        <div className="mt-2 flex items-center justify-center gap-2 text-[10px] text-muted-foreground/70">
          {intent === 'image' ? (
            <span className="flex items-center gap-1 rounded-full bg-alsamos-orange/10 px-2 py-0.5 text-alsamos-orange">
              <ImageIcon className="h-3 w-3" /> Rasm yaratish rejimi aniqlandi
            </span>
          ) : (
            <span className="flex items-center gap-1">
              <Zap className="h-3 w-3 text-alsamos-orange" /> Alsamos AI xato qilishi mumkin — muhim
              ma'lumotlarni tekshiring.
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

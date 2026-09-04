import { useEffect, useId, useMemo, useRef, useState } from 'react';
import {
  ArrowUp,
  Check,
  FileArchive,
  FileSpreadsheet,
  FileText,
  Film,
  Github,
  Globe,
  Loader2,
  Mic,
  MicOff,
  Music,
  Paperclip,
  Plug,
  Plus,
  Puzzle,
  Square,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { useVoiceInput } from '@/hooks/useVoiceInput';
import { AIModelPicker } from './AIModelPicker';
import { AIGithubDialog } from './AIGithubDialog';
import { detectRepoLinks, githubRepoUrl } from '@/lib/ai/githubContext';
import type { AIMode, ModelId, ToolGroupId } from '@/lib/ai/capabilities';

const PLACEHOLDERS = [
  'Alsamos AI dan so‘rang…',
  'Kod, tahlil, reja yoki savol yozing…',
  'Internetdan tekshirishni so‘rang…',
  'Rasm yoki video yarating…',
];

type SlashCommand = { cmd: string; label: string; hint: string };
const SLASH_COMMANDS: SlashCommand[] = [
  { cmd: '/image', label: 'Rasm yaratish', hint: 'Matndan rasm generatsiyasi' },
  { cmd: '/video', label: 'Video yaratish', hint: 'Qisqa video generatsiyasi' },
  { cmd: '/code', label: 'Kod yozish', hint: 'Ishlaydigan kod yechimi' },
  { cmd: '/run', label: 'Kodni tekshirish', hint: 'Sandboxda ishga tushirish' },
  { cmd: '/web', label: 'Internetdan qidirish', hint: 'Yangilangan manbalar bilan' },
  { cmd: '/computer', label: 'Kompyuterda bajarish', hint: 'Alsamos Bridge orqali' },
];

export type ComposerAttachment = {
  url: string;
  name: string;
  type: string;
  size?: number;
};

function formatSize(bytes?: number): string | null {
  if (!bytes || bytes <= 0) return null;
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function attachmentIcon(type: string, name: string) {
  if (type.startsWith('video')) return Film;
  if (type.startsWith('audio')) return Music;
  const ext = name.split('.').pop()?.toLowerCase() || '';
  if (['xlsx', 'xls', 'csv'].includes(ext)) return FileSpreadsheet;
  if (['zip', 'rar', '7z'].includes(ext)) return FileArchive;
  return FileText;
}

interface AIComposerProps {
  value: string;
  onChange: (value: string) => void;
  onSend: () => void;
  onStop?: () => void;
  busy?: boolean;
  uploading?: boolean;
  attachments: ComposerAttachment[];
  onPickFiles: (files: FileList | null) => void;
  onDropFiles?: (files: FileList | null) => void;
  onRemoveAttachment: (url: string) => void;
  model: ModelId;
  onModelChange: (model: ModelId) => void;
  activeModel?: string | null;
  mode?: AIMode;
  onModeChange?: (mode: AIMode) => void;
  toolGroups?: ToolGroupId[];
  onToolGroupsChange?: (groups: ToolGroupId[]) => void;
  onOpenConnectors?: () => void;
  onOpenGithub?: () => void;
  onOpenPlugins?: () => void;
}

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
  model,
  onModelChange,
  activeModel,
  toolGroups,
  onToolGroupsChange,
  onOpenConnectors,
  onOpenGithub,
  onOpenPlugins,
}: AIComposerProps) {
  const { toast } = useToast();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputId = useId();
  const voice = useVoiceInput();
  const voiceBaseRef = useRef('');

  const [placeholderIndex, setPlaceholderIndex] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [slashOpen, setSlashOpen] = useState(false);
  const [githubOpen, setGithubOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  const webEnabled = toolGroups ? toolGroups.includes('web') : true;
  const repoLinks = useMemo(() => detectRepoLinks(value), [value]);

  useEffect(() => {
    if (value) return;
    const timer = window.setInterval(
      () => setPlaceholderIndex((index) => (index + 1) % PLACEHOLDERS.length),
      4200,
    );
    return () => window.clearInterval(timer);
  }, [value]);

  useEffect(() => {
    const element = textareaRef.current;
    if (!element) return;
    element.style.height = '30px';
    const max = Math.min(190, Math.round(window.innerHeight * 0.3));
    element.style.height = `${Math.max(30, Math.min(element.scrollHeight, max))}px`;
  }, [value]);

  useEffect(() => {
    if (!voice.listening) return;
    const spoken = [voice.transcript, voice.interim].filter(Boolean).join(' ').trim();
    if (!spoken) return;
    const base = voiceBaseRef.current;
    onChange(base ? `${base} ${spoken}` : spoken);
  }, [onChange, voice.interim, voice.listening, voice.transcript]);

  useEffect(() => {
    if (voice.error) {
      toast({ title: 'Ovozli kiritish', description: voice.error, variant: 'destructive' });
    }
  }, [toast, voice.error]);

  const slashMatches = useMemo(() => {
    if (!slashOpen) return [];
    const query = value.trim().toLowerCase();
    if (!query.startsWith('/')) return [];
    return SLASH_COMMANDS.filter((command) => command.cmd.startsWith(query));
  }, [slashOpen, value]);

  const canSend = Boolean(value.trim() || attachments.length > 0) && !busy && !uploading;

  const toggleWeb = () => {
    if (!toolGroups || !onToolGroupsChange) return;
    onToolGroupsChange(
      webEnabled ? toolGroups.filter((group) => group !== 'web') : [...toolGroups, 'web'],
    );
  };

  const openGithub = () => {
    if (onOpenGithub) onOpenGithub();
    else setGithubOpen(true);
  };

  const handleMic = () => {
    if (!voice.supported) {
      toast({
        title: 'Qo‘llab-quvvatlanmaydi',
        description: 'Bu brauzerda ovozli kiritish mavjud emas.',
        variant: 'destructive',
      });
      return;
    }
    if (voice.listening) {
      voice.stop();
      voice.reset();
      return;
    }
    voiceBaseRef.current = value.trim();
    voice.reset();
    voice.start();
  };

  const applyCommand = (cmd: string) => {
    onChange(`${cmd} `);
    setSlashOpen(false);
    textareaRef.current?.focus();
  };

  return (
    <div className="px-2 pb-2 sm:px-4 sm:pb-3">
      <AIGithubDialog
        open={githubOpen}
        onOpenChange={setGithubOpen}
        onPickRepo={(repo) => {
          const prefix = value.trim() ? `${value.trim()} ` : '';
          onChange(`${prefix}${githubRepoUrl(repo.fullName)} `);
          textareaRef.current?.focus();
        }}
      />

      <input
        id={fileInputId}
        type="file"
        multiple
        className="sr-only"
        tabIndex={-1}
        accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.txt,.md,.xlsx,.xls,.pptx,.ppt,.csv,.json,.zip,.rar,.7z"
        onChange={(event) => {
          onPickFiles(event.currentTarget.files);
          setMenuOpen(false);
          event.currentTarget.value = '';
        }}
      />

      <div className="mx-auto w-full max-w-3xl">
        {slashMatches.length > 0 && (
          <div className="mb-1.5 overflow-hidden rounded-xl border border-border/60 bg-popover shadow-lg">
            {slashMatches.map((command) => (
              <button
                key={command.cmd}
                type="button"
                onClick={() => applyCommand(command.cmd)}
                className="flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-muted/60"
              >
                <span className="font-mono text-xs text-blue-600 dark:text-blue-400">{command.cmd}</span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium">{command.label}</span>
                  <span className="block truncate text-[11px] text-muted-foreground">{command.hint}</span>
                </span>
              </button>
            ))}
          </div>
        )}

        <div
          onDragOver={(event) => {
            event.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(event) => {
            event.preventDefault();
            setDragging(false);
            onDropFiles?.(event.dataTransfer?.files ?? null);
          }}
          className={cn(
            'rounded-[22px] border bg-background/95 p-1 shadow-[0_8px_30px_rgba(0,0,0,0.08)] backdrop-blur-xl transition-colors',
            dragging ? 'border-blue-500/60 bg-blue-500/5' : 'border-border/70',
          )}
        >
          {repoLinks.length > 0 && (
            <div className="flex flex-wrap gap-1.5 px-1.5 pt-1.5">
              {repoLinks.map((repo) => (
                <a
                  key={repo.fullName}
                  href={repo.url}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="flex max-w-full items-center gap-1 rounded-lg border border-blue-500/25 bg-blue-500/8 px-2 py-1 text-[11px] font-medium text-blue-600 dark:text-blue-400"
                >
                  <Github className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate">{repo.fullName}</span>
                </a>
              ))}
            </div>
          )}

          {(attachments.length > 0 || uploading) && (
            <div className="flex flex-wrap gap-1.5 px-1.5 pt-1.5">
              {attachments.map((file) => {
                const isImage = file.type.startsWith('image');
                const Icon = attachmentIcon(file.type, file.name);
                const size = formatSize(file.size);

                if (isImage) {
                  return (
                    <div key={file.url} className="group relative h-14 w-14 overflow-hidden rounded-lg border bg-muted/30">
                      <img src={file.url} alt={file.name} className="h-full w-full object-cover" loading="lazy" />
                      <button
                        type="button"
                        onClick={() => onRemoveAttachment(file.url)}
                        className="absolute right-0.5 top-0.5 rounded-full bg-background/90 p-0.5 shadow"
                        aria-label={`${file.name} ni olib tashlash`}
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  );
                }

                return (
                  <div key={file.url} className="relative flex h-14 max-w-[220px] items-center gap-2 rounded-lg border bg-muted/25 py-1.5 pl-2 pr-7">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border bg-background">
                      <Icon className="h-4 w-4 text-muted-foreground" />
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-[11px] font-medium">{file.name}</span>
                      <span className="block truncate text-[9px] uppercase text-muted-foreground">
                        {[file.type, size].filter(Boolean).join(' · ')}
                      </span>
                    </span>
                    <button
                      type="button"
                      onClick={() => onRemoveAttachment(file.url)}
                      className="absolute right-1 top-1 rounded p-0.5 text-muted-foreground hover:bg-background hover:text-foreground"
                      aria-label={`${file.name} ni olib tashlash`}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                );
              })}
              {uploading && (
                <div className="flex h-14 w-14 items-center justify-center rounded-lg border border-dashed bg-muted/20">
                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                </div>
              )}
            </div>
          )}

          <Textarea
            ref={textareaRef}
            value={value}
            onChange={(event) => {
              onChange(event.target.value);
              setSlashOpen(event.target.value.trimStart().startsWith('/'));
            }}
            onKeyDown={(event) => {
              if (event.key === 'Escape') setSlashOpen(false);
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                if (slashMatches.length > 0) {
                  applyCommand(slashMatches[0].cmd);
                  return;
                }
                if (canSend) onSend();
              }
            }}
            placeholder={PLACEHOLDERS[placeholderIndex]}
            rows={1}
            className="max-h-[30vh] min-h-[30px] resize-none border-0 bg-transparent px-2.5 py-1.5 text-[14px] leading-[1.35] shadow-none focus-visible:ring-0 sm:text-sm"
            aria-label="AI ga xabar"
          />

          <div className="flex min-h-8 items-center gap-0.5 px-1 pb-0.5">
            <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
              <DropdownMenuTrigger asChild>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-8 w-8 shrink-0 rounded-full"
                  disabled={uploading}
                  aria-label="Qo‘shish"
                >
                  {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-60">
                <DropdownMenuItem asChild onSelect={(event) => event.preventDefault()}>
                  <label htmlFor={fileInputId} className="flex cursor-pointer items-center">
                    <Paperclip className="mr-2 h-4 w-4" /> Fayl yoki rasm qo‘shish
                  </label>
                </DropdownMenuItem>
                <DropdownMenuItem onClick={openGithub}>
                  <Github className="mr-2 h-4 w-4" /> GitHub’dan qo‘shish
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => onOpenConnectors?.()}>
                  <Plug className="mr-2 h-4 w-4" /> Konnektorlar
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => onOpenPlugins?.() ?? onOpenConnectors?.()}>
                  <Puzzle className="mr-2 h-4 w-4" /> Plaginlar
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onSelect={(event) => {
                    event.preventDefault();
                    toggleWeb();
                  }}
                  disabled={!toolGroups || !onToolGroupsChange}
                >
                  <Globe className="mr-2 h-4 w-4" />
                  <span className="flex-1">Veb qidiruv</span>
                  {webEnabled && <Check className="h-4 w-4 text-emerald-500" />}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            <Button asChild size="icon" variant="ghost" className="h-8 w-8 shrink-0 rounded-full sm:hidden">
              <label htmlFor={fileInputId} aria-label="Fayl biriktirish">
                <Paperclip className="h-4 w-4" />
              </label>
            </Button>

            <div className="min-w-0 flex-1" />

            <div className="min-w-0 shrink">
              <AIModelPicker value={model} onChange={onModelChange} activeModel={activeModel} />
            </div>

            <Button
              size="icon"
              variant="ghost"
              className={cn('h-8 w-8 shrink-0 rounded-full', voice.listening && 'bg-red-500/10 text-red-600')}
              onClick={handleMic}
              aria-label={voice.listening ? 'Ovozli kiritishni to‘xtatish' : 'Ovozli kiritish'}
            >
              {voice.listening ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
            </Button>

            {busy ? (
              <Button size="icon" variant="secondary" className="h-8 w-8 shrink-0 rounded-full" onClick={onStop} aria-label="To‘xtatish">
                <Square className="h-3.5 w-3.5" />
              </Button>
            ) : (
              <Button
                size="icon"
                className="h-8 w-8 shrink-0 rounded-full bg-foreground text-background hover:bg-foreground/90"
                onClick={onSend}
                disabled={!canSend}
                aria-label="Yuborish"
              >
                <ArrowUp className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>

        <p className="mt-1 text-center text-[9px] text-muted-foreground/75 sm:text-[10px]">
          Enter — yuborish, Shift+Enter — yangi qator. AI xato qilishi mumkin; muhim ma’lumotni tekshiring.
        </p>
      </div>
    </div>
  );
}

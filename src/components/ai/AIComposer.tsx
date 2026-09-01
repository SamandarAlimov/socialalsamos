import { useEffect, useId, useMemo, useRef, useState } from 'react';
import {
  ArrowUp,
  Check,
  FileText,
  Github,
  Globe,
  Image as ImageIcon,
  Loader2,
  Mic,
  MicOff,
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
  'Alsamos AI dan so\u2019rang\u2026',
  'Kod yozib bering yoki xatoni tuzatib bering\u2026',
  'Internetdan tekshirib, xulosa qilib bering\u2026',
  'Rasm yarating: «tog\u2019 ustida quyosh chiqishi»',
  'Bu haftaning rejasini tuzib bering\u2026',
];

type SlashCommand = { cmd: string; label: string; hint: string };

// Slash buyruqlar faqat "/" yozilganda ko'rinadi — interfeys toza qoladi.
const SLASH_COMMANDS: SlashCommand[] = [
  { cmd: '/image', label: 'Rasm yaratish', hint: 'Matn asosida rasm generatsiya qilish' },
  { cmd: '/video', label: 'Video yaratish', hint: 'Qisqa video navbatga qo\u2019yiladi' },
  { cmd: '/code', label: 'Kod yozish', hint: 'To\u2019liq, ishlaydigan kod fayli' },
  { cmd: '/run', label: 'Kodni ishga tushirish', hint: 'Sandbox\u2019da tekshirish' },
  { cmd: '/web', label: 'Internetdan qidirish', hint: 'Manbalar bilan javob' },
  { cmd: '/computer', label: 'Kompyuterda bajarish', hint: 'Alsamos Bridge orqali (tasdiq bilan)' },
];

export type ComposerAttachment = {
  url: string;
  name: string;
  type: string;
};

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
  /** Quyidagilar ixtiyoriy — UI sodda bo'lishi uchun endi ko'rsatilmaydi. */
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
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [placeholderIndex, setPlaceholderIndex] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [slashOpen, setSlashOpen] = useState(false);
  const [githubOpen, setGithubOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  // Har bir kompozer nusxasi uchun alohida id — <label for> ishonchli ishlashi uchun.
  const fileInputId = useId();

  const voice = useVoiceInput();
  const voiceBaseRef = useRef('');

  const webEnabled = toolGroups ? toolGroups.includes('web') : true;

  // Kompozerdagi matndan GitHub repolarini aniqlaymiz — ko'k chip bo'lib ko'rinadi.
  const repoLinks = useMemo(() => detectRepoLinks(value), [value]);

  const toggleWeb = () => {
    if (!toolGroups || !onToolGroupsChange) return;
    onToolGroupsChange(
      webEnabled ? toolGroups.filter((g) => g !== 'web') : [...toolGroups, 'web'],
    );
  };

  const openGithub = () => {
    if (onOpenGithub) onOpenGithub();
    else setGithubOpen(true);
  };

  const openPlugins = () => {
    if (onOpenPlugins) onOpenPlugins();
    else onOpenConnectors?.();
  };

  useEffect(() => {
    if (value) return;
    const timer = setInterval(
      () => setPlaceholderIndex((i) => (i + 1) % PLACEHOLDERS.length),
      4200,
    );
    return () => clearInterval(timer);
  }, [value]);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    // Mobilda balandlik ekranning uchdan biridan oshmasin.
    const max = Math.min(220, Math.round(window.innerHeight * 0.35));
    el.style.height = `${Math.min(el.scrollHeight, max)}px`;
  }, [value]);

  useEffect(() => {
    if (!voice.listening) return;
    const spoken = [voice.transcript, voice.interim].filter(Boolean).join(' ').trim();
    if (!spoken) return;
    const base = voiceBaseRef.current;
    onChange(base ? `${base} ${spoken}` : spoken);
  }, [voice.listening, voice.transcript, voice.interim, onChange]);

  useEffect(() => {
    if (voice.error) {
      toast({ title: 'Ovozli kiritish', description: voice.error, variant: 'destructive' });
    }
  }, [voice.error, toast]);

  const slashMatches = useMemo(() => {
    if (!slashOpen) return [];
    const query = value.trim().toLowerCase();
    if (!query.startsWith('/')) return [];
    return SLASH_COMMANDS.filter((c) => c.cmd.startsWith(query));
  }, [slashOpen, value]);

  const canSend = Boolean(value.trim()) && !busy && !uploading;

  const handleMic = () => {
    if (!voice.supported) {
      toast({
        title: "Qo'llab-quvvatlanmaydi",
        description:
          'Bu brauzerda ovozli kiritish mavjud emas. Chrome yoki Edge sinab ko\u2019ring.',
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
    <div className="px-2 pb-2 sm:px-4 sm:pb-4">
      <AIGithubDialog
        open={githubOpen}
        onOpenChange={setGithubOpen}
        onPickRepo={(repo) => {
          // To'liq havola qo'shamiz: chat ham shu havoladan repo'ni o'qiydi.
          const prefix = value.trim() ? `${value.trim()} ` : '';
          onChange(`${prefix}${githubRepoUrl(repo.fullName)} `);
          textareaRef.current?.focus();
        }}
      />

      {/*
        Fayl tanlash inputi menyudan TASHQARIDA turadi va `hidden` emas, `sr-only`.
        Sabab: `hidden` input'ni iOS Safari va ba'zi Android brauzerlari dasturiy
        `click()` bilan ocholmaydi, menyu yopilishi esa foydalanuvchi harakatini
        (user gesture) uzib qo'yadi — shuning uchun mobil qurilmada fayl umuman
        tanlanmayotgan edi. Endi menyu bandi oddiy <label> bo'lib, brauzer uni
        o'zi ochadi.
      */}
      <input
        ref={fileInputRef}
        id={fileInputId}
        type="file"
        multiple
        className="sr-only"
        tabIndex={-1}
        accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.txt,.md,.xlsx,.xls,.pptx,.ppt,.csv,.json,.zip,.rar,.7z"
        onChange={(e) => {
          onPickFiles(e.target.files);
          setMenuOpen(false);
          e.currentTarget.value = '';
        }}
      />

      <div className="mx-auto w-full max-w-3xl">
        {slashMatches.length > 0 && (
          <div className="mb-2 overflow-hidden rounded-2xl border border-border/60 bg-card shadow-lg">
            {slashMatches.map((command) => (
              <button
                key={command.cmd}
                type="button"
                onClick={() => applyCommand(command.cmd)}
                className="flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-muted/60"
              >
                <span className="font-mono text-xs text-alsamos-orange">{command.cmd}</span>
                <span className="flex-1">
                  <span className="block text-sm font-medium">{command.label}</span>
                  <span className="block text-[11px] text-muted-foreground">{command.hint}</span>
                </span>
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
            onDropFiles?.(e.dataTransfer?.files ?? null);
          }}
          className={cn(
            'rounded-3xl border bg-card/80 p-1.5 shadow-lg backdrop-blur-xl transition-colors sm:p-2',
            dragging ? 'border-alsamos-orange bg-alsamos-orange/5' : 'border-border/60',
          )}
        >
          {/* Aniqlangan GitHub repolari — ko'k chip + GitHub ikonkasi */}
          {repoLinks.length > 0 && (
            <div className="mb-2 flex flex-wrap gap-2 px-1">
              {repoLinks.map((repo) => (
                <a
                  key={repo.fullName}
                  href={repo.url}
                  target="_blank"
                  rel="noreferrer noopener"
                  title={repo.url}
                  className="flex max-w-full items-center gap-1.5 rounded-xl border border-blue-500/30 bg-blue-500/10 px-2 py-1 text-[11px] font-medium text-blue-600 transition-colors hover:bg-blue-500/20 dark:text-blue-400"
                >
                  <Github className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate">{repo.fullName}</span>
                </a>
              ))}
            </div>
          )}

          {attachments.length > 0 && (
            <div className="mb-2 flex flex-wrap gap-2 px-1">
              {attachments.map((file) => (
                <div
                  key={file.url}
                  className="group relative flex items-center gap-1.5 rounded-xl border border-border/60 bg-muted/50 px-2 py-1"
                >
                  {file.type.startsWith('image') ? (
                    <ImageIcon className="h-3.5 w-3.5 text-muted-foreground" />
                  ) : (
                    <FileText className="h-3.5 w-3.5 text-muted-foreground" />
                  )}
                  <span className="max-w-[120px] truncate text-[11px] sm:max-w-[160px]">
                    {file.name}
                  </span>
                  <button
                    type="button"
                    onClick={() => onRemoveAttachment(file.url)}
                    className="rounded-full p-0.5 hover:bg-background"
                    aria-label={`${file.name} ni olib tashlash`}
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ))}
            </div>
          )}

          <Textarea
            ref={textareaRef}
            value={value}
            onChange={(e) => {
              onChange(e.target.value);
              setSlashOpen(e.target.value.trimStart().startsWith('/'));
            }}
            onKeyDown={(e) => {
              if (e.key === 'Escape') setSlashOpen(false);
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                if (slashMatches.length > 0) {
                  applyCommand(slashMatches[0].cmd);
                  return;
                }
                if (canSend) onSend();
              }
            }}
            placeholder={PLACEHOLDERS[placeholderIndex]}
            rows={1}
            className="max-h-[35vh] min-h-[40px] resize-none border-0 bg-transparent px-2 py-2 text-[15px] shadow-none focus-visible:ring-0 sm:text-sm"
            aria-label="AI ga xabar"
          />

          <div className="flex items-center gap-1 px-1 pt-0.5 sm:gap-1.5 sm:pt-1">
            <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
              <DropdownMenuTrigger asChild>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-9 w-9 shrink-0 rounded-full sm:h-8 sm:w-8"
                  disabled={uploading}
                  aria-label="Qo'shish"
                >
                  {uploading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Plus className="h-4 w-4" />
                  )}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-60">
                {/* <label> — brauzerning o'z mexanizmi, mobil qurilmada ham ishonchli. */}
                <DropdownMenuItem asChild onSelect={(e) => e.preventDefault()}>
                  <label htmlFor={fileInputId} className="flex cursor-pointer items-center">
                    <Paperclip className="mr-2 h-4 w-4" />
                    {'Fayl yoki rasm qo\u2019shish'}
                  </label>
                </DropdownMenuItem>
                <DropdownMenuItem onClick={openGithub}>
                  <Github className="mr-2 h-4 w-4" />
                  {'GitHub\u2019dan qo\u2019shish'}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => onOpenConnectors?.()}>
                  <Plug className="mr-2 h-4 w-4" />
                  Konnektorlar
                </DropdownMenuItem>
                <DropdownMenuItem onClick={openPlugins}>
                  <Puzzle className="mr-2 h-4 w-4" />
                  {'Plaginlar qo\u2019shish'}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onSelect={(e) => {
                    e.preventDefault();
                    toggleWeb();
                  }}
                  disabled={!toolGroups || !onToolGroupsChange}
                >
                  <Globe className="mr-2 h-4 w-4" />
                  <span className="flex-1">Veb qidiruv</span>
                  {webEnabled && <Check className="h-4 w-4 text-alsamos-orange" />}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            {/* Mobilda tez kirish uchun alohida biriktirish tugmasi. */}
            <Button
              asChild
              size="icon"
              variant="ghost"
              className="h-9 w-9 shrink-0 rounded-full sm:hidden"
            >
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
              variant={voice.listening ? 'default' : 'ghost'}
              className={cn(
                'h-9 w-9 shrink-0 rounded-full sm:h-8 sm:w-8',
                voice.listening && 'bg-destructive text-white hover:bg-destructive/90',
              )}
              onClick={handleMic}
              aria-label={voice.listening ? "Ovozli kiritishni to'xtatish" : 'Ovozli kiritish'}
              aria-pressed={voice.listening}
            >
              {voice.listening ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
            </Button>

            {busy ? (
              <Button
                size="icon"
                variant="secondary"
                className="h-9 w-9 shrink-0 rounded-full"
                onClick={onStop}
                aria-label="To'xtatish"
              >
                <Square className="h-3.5 w-3.5" />
              </Button>
            ) : (
              <Button
                size="icon"
                className="h-9 w-9 shrink-0 rounded-full bg-gradient-to-br from-alsamos-orange to-alsamos-orange-dark text-white hover:opacity-90"
                onClick={onSend}
                disabled={!canSend}
                aria-label="Yuborish"
              >
                <ArrowUp className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>

        <p className="mt-1.5 text-center text-[10px] text-muted-foreground">
          {voice.listening ? (
            'Tinglanmoqda\u2026 gapiring'
          ) : (
            <>
              <span className="hidden sm:inline">
                {'Enter — yuborish, Shift+Enter — yangi qator. '}
              </span>
              {'AI xato qilishi mumkin, muhim ma\u2019lumotni tekshiring.'}
            </>
          )}
        </p>
      </div>
    </div>
  );
}

export default AIComposer;

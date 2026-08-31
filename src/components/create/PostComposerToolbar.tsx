import {
  BarChart3,
  CalendarClock,
  Eye,
  Loader2,
  MapPin,
  Music2,
  Paperclip,
  Save,
  Send,
  Sticker as StickerIcon,
  Users,
  type LucideIcon,
} from 'lucide-react';

import { cn } from '@/lib/utils';

/**
 * Create asboblari bitta manbada aniqlanadi, chunki ular ikki joyda
 * ko'rsatiladi: media yo'q holatdagi gorizontal panel va media ustidagi
 * doiraviy shisha rail (CreateToolRail).
 */
export interface ComposerToolsInput {
  /** Yana fayl qo'shish mumkinmi (limit to'lmaganmi). */
  canAddMore: boolean;
  hasAttachments: boolean;
  /** Stiker qo'yish uchun rasm yoki video bormi. */
  canAddStickers: boolean;
  stickerCount: number;
  hasPoll: boolean;
  hasLocation: boolean;
  hasMusic: boolean;
  collaboratorCount: number;
  hasSchedule: boolean;
  /** Jonli joylashuvli postni rejalashtirib bo'lmaydi. */
  isLiveLocation: boolean;
  canPreview: boolean;
  onPickFiles: () => void;
  onStickers: () => void;
  onPoll: () => void;
  onLocation: () => void;
  onMusic: () => void;
  onCollaborators: () => void;
  onSchedule: () => void;
  onPreview: () => void;
}

export interface ComposerTool {
  id: string;
  label: string;
  icon: LucideIcon;
  action: () => void;
  disabled: boolean;
  active: boolean;
}

export function buildComposerTools(input: ComposerToolsInput): ComposerTool[] {
  return [
    {
      id: 'file',
      label: 'Fayl',
      icon: Paperclip,
      action: input.onPickFiles,
      disabled: !input.canAddMore,
      active: input.hasAttachments,
    },
    {
      id: 'sticker',
      label: 'Stiker',
      icon: StickerIcon,
      action: input.onStickers,
      disabled: !input.canAddStickers,
      active: input.stickerCount > 0,
    },
    {
      id: 'poll',
      label: 'So‘rovnoma',
      icon: BarChart3,
      action: input.onPoll,
      disabled: false,
      active: input.hasPoll,
    },
    {
      id: 'location',
      label: 'Joylashuv',
      icon: MapPin,
      action: input.onLocation,
      disabled: false,
      active: input.hasLocation,
    },
    {
      id: 'music',
      label: 'Musiqa',
      icon: Music2,
      action: input.onMusic,
      disabled: false,
      active: input.hasMusic,
    },
    {
      id: 'collaborators',
      label: 'Hammuallif',
      icon: Users,
      action: input.onCollaborators,
      disabled: false,
      active: input.collaboratorCount > 0,
    },
    {
      id: 'schedule',
      label: 'Rejalashtirish',
      icon: CalendarClock,
      action: input.onSchedule,
      disabled: input.isLiveLocation,
      active: input.hasSchedule,
    },
    {
      id: 'preview',
      label: 'Ko‘rish',
      icon: Eye,
      action: input.onPreview,
      disabled: !input.canPreview,
      active: false,
    },
  ];
}

interface PostComposerToolbarProps {
  className?: string;
  tools: ComposerToolsInput;
  /** Sheet layoutda asboblar rail'da turadi, panelda faqat amallar qoladi. */
  showTools?: boolean;
  canSubmit: boolean;
  canSaveDraft: boolean;
  isBusy: boolean;
  draftSaved: boolean;
  hasSchedule: boolean;
  onSaveDraft: () => void;
  onSubmit: () => void;
}

/**
 * Create asboblar paneli: chapda vector ikonkalar, o'ngda qoralama va joylash.
 */
export function PostComposerToolbar({
  className,
  tools,
  showTools = true,
  canSubmit,
  canSaveDraft,
  isBusy,
  draftSaved,
  hasSchedule,
  onSaveDraft,
  onSubmit,
}: PostComposerToolbarProps) {
  const items = showTools ? buildComposerTools(tools) : [];

  return (
    <div
      className={cn(
        'flex items-center gap-1 border-t border-border/60 px-2 py-2 sm:px-3',
        className,
      )}
    >
      <div className="flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto">
        {items.map(({ id, label, icon: Icon, action, disabled, active }) => (
          <button
            key={id}
            type="button"
            title={label}
            aria-label={label}
            onClick={action}
            disabled={disabled}
            className={cn(
              'flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-muted-foreground transition hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-30',
              active && 'bg-primary/10 text-primary',
            )}
          >
            <Icon className="h-[18px] w-[18px]" />
          </button>
        ))}
      </div>

      <button
        type="button"
        onClick={onSaveDraft}
        disabled={!canSaveDraft}
        className={cn(
          'ml-1 flex h-9 shrink-0 items-center gap-1.5 rounded-full px-3 text-xs font-medium transition disabled:cursor-not-allowed disabled:opacity-30',
          draftSaved
            ? 'bg-muted text-foreground'
            : 'text-muted-foreground hover:bg-muted hover:text-foreground',
        )}
      >
        <Save className="h-4 w-4" />
        <span className="hidden sm:inline">Qoralama</span>
      </button>

      <button
        type="button"
        onClick={onSubmit}
        disabled={!canSubmit}
        className="ml-1 flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-full bg-primary px-4 text-xs font-semibold text-primary-foreground transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-45"
      >
        {isBusy ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : hasSchedule ? (
          <CalendarClock className="h-4 w-4" />
        ) : (
          <Send className="h-4 w-4" />
        )}
        <span className="hidden sm:inline">{hasSchedule ? 'Rejalashtirish' : 'Joylash'}</span>
      </button>
    </div>
  );
}

export default PostComposerToolbar;

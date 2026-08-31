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
} from 'lucide-react';

import { cn } from '@/lib/utils';

interface PostComposerToolbarProps {
  className?: string;
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
  canSubmit: boolean;
  canSaveDraft: boolean;
  isBusy: boolean;
  draftSaved: boolean;
  onPickFiles: () => void;
  onStickers: () => void;
  onPoll: () => void;
  onLocation: () => void;
  onMusic: () => void;
  onCollaborators: () => void;
  onSchedule: () => void;
  onPreview: () => void;
  onSaveDraft: () => void;
  onSubmit: () => void;
}

/**
 * Create asboblar paneli: chapda vector ikonkalar bilan qo'shimcha qo'shish
 * tugmalari, o'ngda qoralama va joylash tugmasi.
 */
export function PostComposerToolbar({
  className,
  canAddMore,
  hasAttachments,
  canAddStickers,
  stickerCount,
  hasPoll,
  hasLocation,
  hasMusic,
  collaboratorCount,
  hasSchedule,
  isLiveLocation,
  canSubmit,
  canSaveDraft,
  isBusy,
  draftSaved,
  onPickFiles,
  onStickers,
  onPoll,
  onLocation,
  onMusic,
  onCollaborators,
  onSchedule,
  onPreview,
  onSaveDraft,
  onSubmit,
}: PostComposerToolbarProps) {
  const tools = [
    {
      label: 'Fayl',
      icon: Paperclip,
      action: onPickFiles,
      disabled: !canAddMore,
      active: hasAttachments,
    },
    {
      label: 'Stiker',
      icon: StickerIcon,
      action: onStickers,
      disabled: !canAddStickers,
      active: stickerCount > 0,
    },
    {
      label: 'So‘rovnoma',
      icon: BarChart3,
      action: onPoll,
      disabled: false,
      active: hasPoll,
    },
    {
      label: 'Joylashuv',
      icon: MapPin,
      action: onLocation,
      disabled: false,
      active: hasLocation,
    },
    {
      label: 'Musiqa',
      icon: Music2,
      action: onMusic,
      disabled: false,
      active: hasMusic,
    },
    {
      label: 'Hammuallif',
      icon: Users,
      action: onCollaborators,
      disabled: false,
      active: collaboratorCount > 0,
    },
    {
      label: 'Rejalashtirish',
      icon: CalendarClock,
      action: onSchedule,
      disabled: isLiveLocation,
      active: hasSchedule,
    },
    {
      label: 'Ko‘rish',
      icon: Eye,
      action: onPreview,
      disabled: !canSubmit,
      active: false,
    },
  ];

  return (
    <div
      className={cn(
        'flex items-center gap-1 border-t border-border/60 px-2 py-2 sm:px-3',
        className,
      )}
    >
      <div className="flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto">
        {tools.map(({ label, icon: Icon, action, disabled, active }) => (
          <button
            key={label}
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

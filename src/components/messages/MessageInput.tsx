import { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import {
  Send,
  Paperclip,
  X,
  FileText,
  Film,
  Loader2,
  Type,
  ShieldAlert,
  Music2,
  BookOpen,
  Images,
} from 'lucide-react';
import { EmojiPicker } from '@/components/EmojiPicker';
import { TelegramMediaRecorder } from './TelegramMediaRecorder';
import { TelegramAttachSheet } from './TelegramAttachSheet';
import { ScheduleMessageDialog } from './ScheduleMessageDialog';
import { MentionAutocomplete } from '@/components/MentionAutocomplete';
import { FormatToolbar } from '@/components/chat/FormatToolbar';
import { ArticleComposer } from '@/components/chat/ArticleComposer';
import { useMentionInput } from '@/hooks/useMentionInput';
import { wrapSelection } from '@/lib/messageFormat';
import { ALBUM_MAX_ITEMS, AlbumItem, buildAlbumPayload } from '@/lib/mediaAlbum';
import { uploadMedia } from '@/lib/mediaUpload';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import { detectPII } from '@/hooks/useMessageSafety';

interface ReplyTo {
  id: string;
  content: string;
  sender_name: string;
}

interface MessageInputProps {
  onSend: (content: string, mediaUrl?: string, mediaType?: string) => Promise<any>;
  onSchedule?: (
    scheduledFor: Date,
    content: string,
    mediaUrl?: string,
    mediaType?: string
  ) => Promise<any>;
  onTyping: (isTyping: boolean) => void;
  replyTo?: ReplyTo | null;
  onCancelReply?: () => void;
  disabled?: boolean;
  onShareLocation?: (location: {
    latitude: number;
    longitude: number;
    address?: string;
  }) => void;
}

const MAX_FILE_MB = 50;

type MediaKind = 'image' | 'video' | 'audio' | 'document';

function detectKind(mimeType: string, fileName?: string): MediaKind {
  const mime = (mimeType || '').toLowerCase();
  if (mime.startsWith('image/')) return 'image';
  if (mime.startsWith('video/')) return 'video';
  if (mime.startsWith('audio/')) return 'audio';

  const ext = (fileName || '').split('.').pop()?.toLowerCase() || '';
  if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'heic', 'heif', 'avif', 'bmp'].includes(ext))
    return 'image';
  if (['mp4', 'mov', 'webm', 'mkv', 'avi', 'm4v', '3gp'].includes(ext)) return 'video';
  if (['mp3', 'wav', 'ogg', 'oga', 'm4a', 'aac', 'flac', 'opus'].includes(ext)) return 'audio';
  return 'document';
}

function formatSize(bytes: number) {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

interface PendingAttachment {
  url: string;
  /** Chatga yuboriladigan tur (media yoki document) */
  type: MediaKind;
  /** Faylning haqiqiy turi - "media sifatida" qaytarish uchun kerak */
  kind: MediaKind;
  name: string;
  size: number;
  /** Yuklashdan oldingi mahalliy ko'rinish (tez preview uchun) */
  localPreview?: string;
}

export function MessageInput({
  onSend,
  onSchedule,
  onTyping,
  replyTo,
  onCancelReply,
  disabled,
  onShareLocation,
}: MessageInputProps) {
  const { t } = useTranslation();
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState('');
  const [pendingAttachment, setPendingAttachment] = useState<PendingAttachment | null>(null);
  const [pendingAlbum, setPendingAlbum] = useState<AlbumItem[] | null>(null);
  const [showFormatting, setShowFormatting] = useState(false);
  const [showScheduleDialog, setShowScheduleDialog] = useState(false);
  const [showArticleComposer, setShowArticleComposer] = useState(false);
  const [attachmentOpen, setAttachmentOpen] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const localPreviewRef = useRef<string | null>(null);
  const {
    mentionState,
    handleInputChange: handleMentionChange,
    insertMention,
    closeMention,
  } = useMentionInput();

  useEffect(() => {
    if (replyTo) inputRef.current?.focus();
  }, [replyTo]);

  useEffect(() => {
    return () => {
      // Chatdan chiqilganda "yozmoqda" holati qotib qolmasligi uchun
      onTyping(false);
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      if (longPressTimeoutRef.current) clearTimeout(longPressTimeoutRef.current);
      if (localPreviewRef.current) URL.revokeObjectURL(localPreviewRef.current);
    };
  }, [onTyping]);

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value;
    const cursorPosition = e.target.selectionStart || 0;

    handleMentionChange(value, cursorPosition, setMessage);
    onTyping(true);

    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => onTyping(false), 2000);
  };

  const handleMentionSelect = (username: string) => {
    setMessage(insertMention(message, username, inputRef));
  };

  const clearAttachment = () => {
    if (localPreviewRef.current) {
      URL.revokeObjectURL(localPreviewRef.current);
      localPreviewRef.current = null;
    }
    setPendingAttachment(null);
  };

  const clearAlbum = () => setPendingAlbum(null);

  const handleSend = async () => {
    if (!message.trim() && !pendingAttachment && !pendingAlbum) return;

    // Albom: bir nechta rasm/video Telegramdek BITTA xabar bo'lib ketadi
    if (pendingAlbum && pendingAlbum.length > 0) {
      const payload = buildAlbumPayload({
        items: pendingAlbum,
        caption: message.trim() || undefined,
      });
      await onSend(payload);
      clearAlbum();
    }

    // Bitta biriktirma yoki oddiy matn
    if (pendingAttachment || (!pendingAlbum && message.trim())) {
      await onSend(message.trim(), pendingAttachment?.url, pendingAttachment?.type);
      clearAttachment();
    }

    setMessage('');
    onTyping(false);

    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    if (inputRef.current) inputRef.current.style.height = 'auto';
  };

  /** Maqola (article) xabarini yuborish */
  const handleSendArticle = async (payload: string) => {
    await onSend(payload);
    setMessage('');
    onTyping(false);
  };

  /** Telegramdek klaviatura qisqartmalari: Ctrl/Cmd + B / I / U / K */
  const applyShortcut = (marker: string, markerEnd?: string) => {
    const el = inputRef.current;
    if (!el) return;
    const result = wrapSelection(
      message,
      el.selectionStart ?? message.length,
      el.selectionEnd ?? message.length,
      marker,
      markerEnd
    );
    setMessage(result.value);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(result.selectionStart, result.selectionEnd);
    });
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.ctrlKey || e.metaKey) {
      const key = e.key.toLowerCase();
      if (key === 'b') {
        e.preventDefault();
        applyShortcut('**');
        return;
      }
      if (key === 'i') {
        e.preventDefault();
        applyShortcut('__');
        return;
      }
      if (key === 'u') {
        e.preventDefault();
        applyShortcut('++');
        return;
      }
      if (key === 'k') {
        e.preventDefault();
        applyShortcut('[', '](https://)');
        return;
      }
    }

    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void handleSend();
    }
  };

  /**
   * Faylni yuklaydi. `asDocument` true bo'lsa, rasm/video ham fayl (document)
   * sifatida yuboriladi - Telegramdagi "Send as file" bilan bir xil.
   */
  const uploadAndAttach = async (file: File, asDocument = false) => {
    if (file.size > MAX_FILE_MB * 1024 * 1024) {
      toast.error(`Fayl hajmi ${MAX_FILE_MB} MB dan kichik bo'lishi kerak`);
      return;
    }

    const kind = detectKind(file.type, file.name);

    // Tezkor mahalliy preview (yuklash tugashini kutmasdan)
    let localPreview: string | undefined;
    if (kind === 'image' || kind === 'video') {
      localPreview = URL.createObjectURL(file);
      if (localPreviewRef.current) URL.revokeObjectURL(localPreviewRef.current);
      localPreviewRef.current = localPreview;
    }

    setUploading(true);
    setAttachmentOpen(false);

    try {
      const uploaded = await uploadMedia(file, { type: 'chat', visibility: 'public' });
      setPendingAttachment({
        url: uploaded.url,
        type: asDocument ? 'document' : kind,
        kind,
        name: file.name,
        size: file.size,
        localPreview,
      });
    } catch (err) {
      // Aniq sababni ko'rsatamiz - "xatolik" degan umumiy matn foydasiz
      const reason = err instanceof Error ? err.message : 'Kutilmagan xatolik';
      toast.error(`Yuklab bo'lmadi: ${reason}`);
      if (localPreview) {
        URL.revokeObjectURL(localPreview);
        localPreviewRef.current = null;
      }
    } finally {
      setUploading(false);
    }
  };

  /** Qo'shimcha fayllarni darhol alohida xabar sifatida yuborish */
  const uploadAndSendNow = async (file: File, asDocument: boolean) => {
    if (file.size > MAX_FILE_MB * 1024 * 1024) {
      toast.error(`"${file.name}" ${MAX_FILE_MB} MB dan katta`);
      return;
    }
    const kind = detectKind(file.type, file.name);
    try {
      const uploaded = await uploadMedia(file, { type: 'chat', visibility: 'public' });
      await onSend('', uploaded.url, asDocument ? 'document' : kind);
    } catch (err) {
      const reason = err instanceof Error ? err.message : 'Kutilmagan xatolik';
      toast.error(`"${file.name}" yuborilmadi: ${reason}`);
    }
  };

  /**
   * Bir nechta rasm/videoni yuklab, albom (media group) sifatida tayyorlaydi.
   * Yuborishdan oldin caption yozish mumkin - Telegramdagi bilan bir xil.
   */
  const uploadAlbum = async (files: File[]) => {
    const accepted = files.slice(0, ALBUM_MAX_ITEMS).filter((file) => {
      if (file.size > MAX_FILE_MB * 1024 * 1024) {
        toast.error(`"${file.name}" ${MAX_FILE_MB} MB dan katta`);
        return false;
      }
      return true;
    });

    if (accepted.length === 0) return;
    if (files.length > ALBUM_MAX_ITEMS) {
      toast.info(`Bitta albomga ${ALBUM_MAX_ITEMS} tagacha media sig'adi`);
    }

    setUploading(true);
    setAttachmentOpen(false);

    const items: AlbumItem[] = [];
    for (const file of accepted) {
      try {
        const uploaded = await uploadMedia(file, { type: 'chat', visibility: 'public' });
        items.push({
          url: uploaded.url,
          type: detectKind(file.type, file.name) === 'video' ? 'video' : 'image',
          name: file.name,
          size: file.size,
        });
      } catch (err) {
        const reason = err instanceof Error ? err.message : 'Kutilmagan xatolik';
        toast.error(`"${file.name}" yuklanmadi: ${reason}`);
      }
    }

    setUploading(false);

    if (items.length === 0) return;
    setPendingAlbum((prev) =>
      prev ? [...prev, ...items].slice(0, ALBUM_MAX_ITEMS) : items
    );
  };

  /**
   * Biriktirish panelidan kelgan fayllar.
   * Bir nechta rasm/video tanlansa - albom, aks holda bitta biriktirma.
   */
  const handlePickedFiles = async (files: File[], asDocument: boolean) => {
    if (files.length === 0) return;

    if (asDocument) {
      const [first, ...rest] = files;
      await uploadAndAttach(first, true);
      if (rest.length === 0) return;
      setUploading(true);
      try {
        for (const file of rest) await uploadAndSendNow(file, true);
      } finally {
        setUploading(false);
      }
      return;
    }

    const mediaFiles = files.filter((file) => {
      const kind = detectKind(file.type, file.name);
      return kind === 'image' || kind === 'video';
    });
    const otherFiles = files.filter((file) => !mediaFiles.includes(file));

    if (mediaFiles.length > 1) {
      await uploadAlbum(mediaFiles);
    } else if (mediaFiles.length === 1) {
      await uploadAndAttach(mediaFiles[0], false);
    }

    if (otherFiles.length === 0) return;

    if (mediaFiles.length === 0) {
      const [first, ...rest] = otherFiles;
      await uploadAndAttach(first, false);
      if (rest.length === 0) return;
      setUploading(true);
      try {
        for (const file of rest) await uploadAndSendNow(file, false);
      } finally {
        setUploading(false);
      }
      return;
    }

    setUploading(true);
    try {
      for (const file of otherFiles) await uploadAndSendNow(file, false);
    } finally {
      setUploading(false);
    }
  };

  // Telegramdek: rasmni to'g'ridan-to'g'ri paste qilish
  const handlePaste = async (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const item = Array.from(e.clipboardData?.items || []).find((i) =>
      i.type.startsWith('image/')
    );
    if (!item) return;
    const file = item.getAsFile();
    if (!file) return;
    e.preventDefault();
    await uploadAndAttach(file);
  };

  // Drag & drop bilan fayl yuborish (bir nechta fayl ham qo'llab-quvvatlanadi)
  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const files = Array.from(e.dataTransfer?.files || []);
    if (files.length > 0) await handlePickedFiles(files, false);
  };

  const startLongPress = () => {
    if (!onSchedule) return;
    longPressTimeoutRef.current = setTimeout(() => setShowScheduleDialog(true), 500);
  };
  const cancelLongPress = () => {
    if (longPressTimeoutRef.current) clearTimeout(longPressTimeoutRef.current);
  };

  const pii = detectPII(message);
  const previewSrc = pendingAttachment?.localPreview || pendingAttachment?.url;
  const canToggleAsDocument =
    pendingAttachment && (pendingAttachment.kind === 'image' || pendingAttachment.kind === 'video');
  // Uzun matn yozilsa Telegramdek "maqola sifatida yuborish" taklif qilinadi
  const suggestArticle = message.trim().length > 600;
  const hasContent = Boolean(message.trim() || pendingAttachment || pendingAlbum);

  return (
    <div
      className={cn(
        'relative z-10 border-t border-border bg-card p-3 tg-transition',
        isDragging && 'bg-muted/60'
      )}
      onDragOver={(e) => {
        e.preventDefault();
        setIsDragging(true);
      }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={handleDrop}
    >
      {isDragging && (
        <div className="pointer-events-none absolute inset-2 z-20 flex items-center justify-center rounded-2xl border-2 border-dashed border-border bg-card/80 text-sm text-muted-foreground">
          Faylni yuborish uchun qo'yib yuboring
        </div>
      )}

      {/* Javob preview */}
      {replyTo && (
        <div className="mb-2 flex items-center gap-2 rounded-xl border-l-2 border-primary bg-muted/50 px-3 py-2">
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium text-primary">{replyTo.sender_name}</p>
            <p className="truncate text-sm text-muted-foreground">{replyTo.content}</p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 rounded-full"
            onClick={onCancelReply}
            aria-label="Javobni bekor qilish"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      )}

      {/* Uzun matn uchun maqola taklifi */}
      {suggestArticle && (
        <div className="mb-2 flex items-center gap-2 rounded-xl border border-primary/30 bg-primary/5 px-3 py-2 text-xs">
          <BookOpen className="h-4 w-4 shrink-0 text-primary" />
          <p className="min-w-0 flex-1 text-muted-foreground">
            Matn ancha uzun. Uni maqola ko'rinishida chiroyli formatlab yuborishingiz mumkin.
          </p>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-7 shrink-0"
            onClick={() => setShowArticleComposer(true)}
          >
            Maqola qilish
          </Button>
        </div>
      )}

      {/* Shaxsiy ma'lumot ogohlantirishi */}
      {pii && (
        <div className="mb-2 flex items-start gap-2 rounded-xl border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs">
          <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
          <div className="min-w-0">
            <p className="font-medium text-destructive">{pii.hint}</p>
            <p className="text-muted-foreground">
              Shaxsiy ma'lumotlarni chat orqali yubormang. Karta raqami, parol yoki tasdiqlash
              kodini hech qachon ulashmang.
            </p>
          </div>
        </div>
      )}

      {/* Yuklanmoqda holati */}
      {uploading && !pendingAttachment && !pendingAlbum && (
        <div className="mb-2 flex items-center gap-2 rounded-xl bg-muted/50 px-3 py-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Yuklanmoqda...
        </div>
      )}

      {/* Albom preview - bitta xabar bo'lib ketadi */}
      {pendingAlbum && pendingAlbum.length > 0 && (
        <div className="mb-2 rounded-2xl border border-border bg-muted/40 p-2">
          <div className="mb-2 flex items-center gap-2 px-1">
            <Images className="h-4 w-4 shrink-0 text-primary" />
            <p className="min-w-0 flex-1 text-xs text-muted-foreground">
              {pendingAlbum.length} ta media bitta albom bo'lib yuboriladi
              {uploading ? ' \u00b7 yuklanmoqda...' : ''}
            </p>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 shrink-0 rounded-full"
              onClick={clearAlbum}
              aria-label="Albomni bekor qilish"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
          <div className="flex gap-1.5 overflow-x-auto scrollbar-hide">
            {pendingAlbum.map((item, index) => (
              <div
                key={`${item.url}-${index}`}
                className="relative h-16 w-16 shrink-0 overflow-hidden rounded-xl bg-muted"
              >
                {item.type === 'video' ? (
                  <video
                    src={item.url}
                    className="h-full w-full object-cover"
                    muted
                    playsInline
                    preload="metadata"
                  />
                ) : (
                  <img src={item.url} alt="" className="h-full w-full object-cover no-drag" />
                )}
                <button
                  type="button"
                  onClick={() =>
                    setPendingAlbum((prev) => {
                      if (!prev) return prev;
                      const next = prev.filter((_, i) => i !== index);
                      return next.length > 0 ? next : null;
                    })
                  }
                  className="absolute right-0.5 top-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-black/60 text-white"
                  aria-label="O'chirish"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tanlangan fayl preview - Telegramdek kattaroq va tushunarli */}
      {pendingAttachment && (
        <div className="mb-2 flex items-center gap-3 rounded-2xl border border-border bg-muted/40 p-2">
          <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-xl bg-muted">
            {pendingAttachment.kind === 'image' && previewSrc ? (
              <img src={previewSrc} alt="" className="h-full w-full object-cover no-drag" />
            ) : pendingAttachment.kind === 'video' && previewSrc ? (
              <video
                src={previewSrc}
                className="h-full w-full object-cover"
                muted
                playsInline
                preload="metadata"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center">
                {pendingAttachment.kind === 'video' ? (
                  <Film className="h-6 w-6 text-muted-foreground" />
                ) : pendingAttachment.kind === 'audio' ? (
                  <Music2 className="h-6 w-6 text-muted-foreground" />
                ) : (
                  <FileText className="h-6 w-6 text-muted-foreground" />
                )}
              </div>
            )}
            {uploading && (
              <span className="absolute inset-0 flex items-center justify-center bg-black/40">
                <Loader2 className="h-5 w-5 animate-spin text-white" />
              </span>
            )}
          </div>

          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{pendingAttachment.name}</p>
            <p className="text-xs text-muted-foreground">
              {formatSize(pendingAttachment.size)}
              {pendingAttachment.type === 'document' && pendingAttachment.kind !== 'document'
                ? ' \u00b7 fayl sifatida'
                : ''}
            </p>
            {canToggleAsDocument && (
              <button
                type="button"
                onClick={() =>
                  setPendingAttachment((prev) =>
                    prev
                      ? {
                          ...prev,
                          type: prev.type === 'document' ? prev.kind : 'document',
                        }
                      : prev
                  )
                }
                className="mt-0.5 text-xs font-medium text-primary hover:underline"
              >
                {pendingAttachment.type === 'document'
                  ? pendingAttachment.kind === 'image'
                    ? 'Rasm sifatida yuborish'
                    : 'Video sifatida yuborish'
                  : 'Fayl sifatida yuborish'}
              </button>
            )}
          </div>

          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 shrink-0 rounded-full"
            onClick={clearAttachment}
            aria-label="Bekor qilish"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      )}

      <div className="flex items-end gap-2">
        {/* Fayl qo'shish - Telegram mobil uslubidagi panel */}
        <Button
          variant="ghost"
          size="icon"
          className="h-10 w-10 shrink-0 rounded-full text-muted-foreground tg-transition hover:bg-muted hover:text-foreground"
          disabled={uploading}
          aria-label="Fayl qo'shish"
          onClick={() => setAttachmentOpen(true)}
        >
          {uploading ? (
            <Loader2 className="h-5 w-5 animate-spin" />
          ) : (
            <Paperclip className="h-5 w-5" />
          )}
        </Button>

        {/* Matn maydoni */}
        <div className="relative flex-1">
          <textarea
            ref={inputRef}
            value={message}
            onChange={handleInputChange}
            onPaste={handlePaste}
            onKeyDown={(e) => {
              // Mention autocomplete ochiq bo'lsa navigatsiya klavishalari unga tegishli
              if (
                mentionState.isActive &&
                ['ArrowDown', 'ArrowUp', 'Enter', 'Tab'].includes(e.key)
              ) {
                return;
              }
              handleKeyDown(e);
            }}
            placeholder={
              pendingAlbum && pendingAlbum.length > 0
                ? 'Albomga izoh (caption) yozing...'
                : t('messages.writeMessage')
            }
            disabled={disabled}
            rows={1}
            className={cn(
              'chat-selectable w-full resize-none rounded-2xl border border-border bg-muted/50 px-4 py-2.5 pr-20 text-sm',
              'focus:outline-none focus:ring-2 focus:ring-primary/40',
              'min-h-[44px] max-h-[120px]',
              disabled && 'cursor-not-allowed opacity-50'
            )}
            style={{ height: 'auto' }}
            onInput={(e) => {
              const target = e.target as HTMLTextAreaElement;
              target.style.height = 'auto';
              target.style.height = Math.min(target.scrollHeight, 120) + 'px';
            }}
          />

          {mentionState.isActive && (
            <MentionAutocomplete
              query={mentionState.query}
              onSelect={handleMentionSelect}
              onClose={closeMention}
              className="bottom-full left-0 mb-1"
            />
          )}

          {/* Formatlash va emoji */}
          <div className="absolute right-2 top-1/2 flex -translate-y-1/2 items-center gap-0.5">
            <button
              type="button"
              onClick={() => setShowFormatting((v) => !v)}
              aria-label="Matnni formatlash"
              title="Matnni formatlash (Ctrl+B / Ctrl+I / Ctrl+U / Ctrl+K)"
              className={cn(
                'flex h-8 w-8 items-center justify-center rounded-full tg-transition',
                showFormatting
                  ? 'bg-muted text-foreground'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground'
              )}
            >
              <Type className="h-4 w-4" />
            </button>
            <EmojiPicker
              onSelect={(emoji) => setMessage((prev) => prev + emoji)}
              className="h-8 w-8 text-muted-foreground hover:text-foreground"
            />
          </div>
        </div>

        {/* Yuborish yoki bitta mic/video tugmasi */}
        {hasContent ? (
          <Button
            variant="default"
            size="icon"
            className="h-10 w-10 shrink-0 rounded-full tg-transition active:scale-95"
            onClick={handleSend}
            onMouseDown={startLongPress}
            onMouseUp={cancelLongPress}
            onMouseLeave={cancelLongPress}
            onTouchStart={startLongPress}
            onTouchEnd={cancelLongPress}
            disabled={disabled || uploading}
            aria-label="Yuborish"
            title={onSchedule ? 'Yuborish (uzoq bosilsa - rejalashtirish)' : 'Yuborish'}
          >
            <Send className="h-5 w-5" />
          </Button>
        ) : (
          <TelegramMediaRecorder
            onSend={(url, _duration, type) => {
              // Telegram ovozli / doiraviy video xabarlarni matnsiz yuboradi:
              // bubble o'zi pleyerni chizadi, shuning uchun placeholder matn saqlanmaydi.
              onSend('', url, type);
            }}
          />
        )}
      </div>

      {/* Telegram mobil uslubidagi biriktirish paneli */}
      <TelegramAttachSheet
        open={attachmentOpen}
        onOpenChange={setAttachmentOpen}
        maxFileMb={MAX_FILE_MB}
        onPickFiles={(files, asDocument) => {
          void handlePickedFiles(files, asDocument);
        }}
        onArticle={() => setShowArticleComposer(true)}
        onShareLocation={onShareLocation}
      />

      {/* Rejalashtirish dialogi */}
      {onSchedule && (
        <ScheduleMessageDialog
          open={showScheduleDialog}
          onOpenChange={setShowScheduleDialog}
          messagePreview={message || pendingAttachment?.name || ''}
          onSchedule={async (scheduledFor) => {
            await onSchedule(
              scheduledFor,
              message.trim(),
              pendingAttachment?.url,
              pendingAttachment?.type
            );
            setMessage('');
            clearAttachment();
          }}
        />
      )}

      {/* Maqola yozish oynasi */}
      <ArticleComposer
        open={showArticleComposer}
        onOpenChange={setShowArticleComposer}
        initialBody={message}
        onSubmit={(payload) => {
          void handleSendArticle(payload);
        }}
      />

      {/* Formatlash paneli */}
      {showFormatting && (
        <FormatToolbar
          targetRef={inputRef}
          value={message}
          onChange={setMessage}
          className="mt-2 px-1"
        />
      )}
    </div>
  );
}

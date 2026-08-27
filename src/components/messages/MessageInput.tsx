import { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import {
  Send,
  Paperclip,
  X,
  ImageIcon,
  FileText,
  Film,
  Loader2,
  Bold,
  Italic,
  Underline,
  Strikethrough,
  Code,
  Quote,
  EyeOff,
  Type,
  ShieldAlert,
} from 'lucide-react';
import { EmojiPicker } from '@/components/EmojiPicker';
import { TelegramMediaRecorder } from './TelegramMediaRecorder';
import { LocationShareButton } from './LocationShareButton';
import { ScheduleMessageDialog } from './ScheduleMessageDialog';
import { MentionAutocomplete } from '@/components/MentionAutocomplete';
import { useFileUpload } from '@/hooks/useFileUpload';
import { useMentionInput } from '@/hooks/useMentionInput';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
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

const MAX_FILE_MB = 20;

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
  const { uploadFile, uploading, getFileType } = useFileUpload();
  const [message, setMessage] = useState('');
  const [pendingAttachment, setPendingAttachment] = useState<{
    url: string;
    type: string;
    name: string;
  } | null>(null);
  const [showFormatting, setShowFormatting] = useState(false);
  const [showScheduleDialog, setShowScheduleDialog] = useState(false);
  const [attachmentOpen, setAttachmentOpen] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const imageVideoInputRef = useRef<HTMLInputElement>(null);
  const documentInputRef = useRef<HTMLInputElement>(null);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const {
    mentionState,
    handleInputChange: handleMentionChange,
    insertMention,
    closeMention,
  } = useMentionInput();

  useEffect(() => {
    if (replyTo) {
      inputRef.current?.focus();
    }

    return () => {
      // Chatdan chiqilganda "yozmoqda" holati qotib qolmasligi uchun
      onTyping(false);
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      if (longPressTimeoutRef.current) clearTimeout(longPressTimeoutRef.current);
    };
  }, [replyTo, onTyping]);

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value;
    const cursorPosition = e.target.selectionStart || 0;

    handleMentionChange(value, cursorPosition, setMessage);
    onTyping(true);

    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => onTyping(false), 2000);
  };

  const handleMentionSelect = (username: string) => {
    const newValue = insertMention(message, username, inputRef);
    setMessage(newValue);
  };

  const handleSend = async () => {
    if (!message.trim() && !pendingAttachment) return;

    // Telegramda media caption bo'sh bo'lishi mumkin - sun'iy "[fayl nomi]" matni yozilmaydi
    await onSend(message.trim(), pendingAttachment?.url, pendingAttachment?.type);

    setMessage('');
    setPendingAttachment(null);
    onTyping(false);

    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    if (inputRef.current) inputRef.current.style.height = 'auto';
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void handleSend();
    }
  };

  const handleFileUpload = (url: string, type: string, name: string) => {
    setPendingAttachment({ url, type, name });
  };

  const uploadAndAttach = async (file: File) => {
    if (file.size > MAX_FILE_MB * 1024 * 1024) {
      toast.error(`Fayl hajmi ${MAX_FILE_MB} MB dan kichik bo'lishi kerak`);
      return;
    }

    const result = await uploadFile(file);
    if (result) {
      handleFileUpload(result.url, getFileType(result.type), result.name);
      setAttachmentOpen(false);
    } else {
      toast.error('Faylni yuklashda xatolik');
    }
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    await uploadAndAttach(file);
    e.target.value = '';
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

  // Drag & drop bilan fayl yuborish
  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer?.files?.[0];
    if (file) await uploadAndAttach(file);
  };

  const insertFormatting = (format: string) => {
    const textarea = inputRef.current;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selectedText = message.substring(start, end);

    let formattedText = '';
    switch (format) {
      case 'bold':
        formattedText = `**${selectedText || 'matn'}**`;
        break;
      case 'italic':
        formattedText = `_${selectedText || 'matn'}_`;
        break;
      case 'underline':
        formattedText = `__${selectedText || 'matn'}__`;
        break;
      case 'strikethrough':
        formattedText = `~~${selectedText || 'matn'}~~`;
        break;
      case 'code':
        formattedText = `\`${selectedText || 'kod'}\``;
        break;
      case 'quote':
        formattedText = `> ${selectedText || 'iqtibos'}`;
        break;
      case 'spoiler':
        formattedText = `||${selectedText || 'spoyler'}||`;
        break;
      default:
        formattedText = selectedText;
    }

    const newMessage = message.substring(0, start) + formattedText + message.substring(end);
    setMessage(newMessage);

    setTimeout(() => {
      textarea.focus();
      textarea.selectionStart = start + formattedText.length;
      textarea.selectionEnd = start + formattedText.length;
    }, 0);
  };

  const startLongPress = () => {
    if (!onSchedule) return;
    longPressTimeoutRef.current = setTimeout(() => setShowScheduleDialog(true), 500);
  };
  const cancelLongPress = () => {
    if (longPressTimeoutRef.current) clearTimeout(longPressTimeoutRef.current);
  };

  const pii = detectPII(message);

  return (
    <div
      className={cn(
        'relative z-10 border-t border-border bg-card p-3 transition-colors',
        isDragging && 'bg-muted/60'
      )}
      onDragOver={(e) => {
        e.preventDefault();
        setIsDragging(true);
      }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={handleDrop}
    >
      {/* Yashirin fayl inputlari */}
      <input
        ref={imageVideoInputRef}
        type="file"
        accept="image/*,video/*"
        className="hidden"
        onChange={handleFileSelect}
      />
      <input
        ref={documentInputRef}
        type="file"
        accept=".pdf,.doc,.docx,.txt,.xlsx,.xls,.pptx,.ppt,.zip,.rar"
        className="hidden"
        onChange={handleFileSelect}
      />

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
          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={onCancelReply}>
            <X className="h-4 w-4" />
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

      {/* Tanlangan fayl preview */}
      {pendingAttachment && (
        <div className="mb-2 flex items-center gap-2 rounded-xl bg-muted/50 px-3 py-2">
          {pendingAttachment.type === 'image' ? (
            <img
              src={pendingAttachment.url}
              alt="Ko'rinish"
              className="h-12 w-12 rounded-lg object-cover"
            />
          ) : (
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-muted">
              {pendingAttachment.type === 'video' ? (
                <Film className="h-5 w-5 text-muted-foreground" />
              ) : (
                <FileText className="h-5 w-5 text-muted-foreground" />
              )}
            </div>
          )}
          <span className="min-w-0 flex-1 truncate text-sm">{pendingAttachment.name}</span>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => setPendingAttachment(null)}
            aria-label="Bekor qilish"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      )}

      <div className="flex items-end gap-2">
        {/* Fayl qo'shish */}
        <Popover open={attachmentOpen} onOpenChange={setAttachmentOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-10 w-10 shrink-0 rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
              disabled={uploading}
              aria-label="Fayl qo'shish"
            >
              {uploading ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <Paperclip className="h-5 w-5" />
              )}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-56 rounded-2xl p-2" align="start">
            <button
              onClick={() => imageVideoInputRef.current?.click()}
              className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left transition-colors hover:bg-muted"
            >
              <ImageIcon className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm">Rasm yoki video</span>
            </button>
            <button
              onClick={() => documentInputRef.current?.click()}
              className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left transition-colors hover:bg-muted"
            >
              <FileText className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm">Fayl</span>
            </button>
            {onShareLocation && <LocationShareButton onShareLocation={onShareLocation} />}
          </PopoverContent>
        </Popover>

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
            placeholder={t('messages.writeMessage')}
            disabled={disabled}
            rows={1}
            className={cn(
              'w-full resize-none rounded-2xl border border-border bg-muted/50 px-4 py-2.5 pr-20 text-sm',
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
              title="Matnni formatlash"
              className={cn(
                'flex h-8 w-8 items-center justify-center rounded-full transition-colors',
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
        {message.trim() || pendingAttachment ? (
          <Button
            variant="default"
            size="icon"
            className="h-10 w-10 shrink-0 rounded-full"
            onClick={handleSend}
            onMouseDown={startLongPress}
            onMouseUp={cancelLongPress}
            onMouseLeave={cancelLongPress}
            onTouchStart={startLongPress}
            onTouchEnd={cancelLongPress}
            disabled={disabled}
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
            setPendingAttachment(null);
          }}
        />
      )}

      {/* Formatlash paneli */}
      {showFormatting && (
        <div className="mt-2 flex items-center gap-1 px-1">
          {[
            { key: 'bold', icon: Bold, label: 'Qalin' },
            { key: 'italic', icon: Italic, label: 'Qiya' },
            { key: 'underline', icon: Underline, label: 'Tagi chizilgan' },
            { key: 'strikethrough', icon: Strikethrough, label: "O'chirilgan" },
            { key: 'code', icon: Code, label: 'Kod' },
            { key: 'quote', icon: Quote, label: 'Iqtibos' },
            { key: 'spoiler', icon: EyeOff, label: 'Spoyler' },
          ].map(({ key, icon: Icon, label }) => (
            <button
              key={key}
              type="button"
              onClick={() => insertFormatting(key)}
              aria-label={label}
              title={label}
              className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <Icon className="h-4 w-4" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

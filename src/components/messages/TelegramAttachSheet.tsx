import { useCallback, useEffect, useRef, useState } from 'react';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import {
  BarChart3,
  BookOpen,
  Camera,
  Check,
  File as FileIcon,
  Film,
  Images,
  MapPin,
  Music2,
  Plus,
  X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { LocationShareButton } from './LocationShareButton';

type AttachTab = 'gallery' | 'article' | 'location' | 'poll' | 'file';

interface PickedFile {
  file: File;
  preview?: string;
}

interface TelegramAttachSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Tanlangan fayllar. `asDocument` true bo'lsa fayl sifatida yuboriladi. */
  onPickFiles: (files: File[], asDocument: boolean) => void;
  /** "Maqola" bo'limi */
  onArticle: () => void;
  onShareLocation?: (location: {
    latitude: number;
    longitude: number;
    address?: string;
    liveDurationSeconds?: number;
  }) => void;
  onCreatePoll?: (poll: {
    question: string;
    options: string[];
    multiple: boolean;
    anonymous: boolean;
  }) => void | Promise<void>;
  maxFileMb?: number;
}

const TABS: Array<{ id: AttachTab; label: string; icon: typeof Images }> = [
  { id: 'gallery', label: 'Galereya', icon: Images },
  { id: 'article', label: 'Maqola', icon: BookOpen },
  { id: 'location', label: 'Joylashuv', icon: MapPin },
  { id: 'poll', label: "So'rovnoma", icon: BarChart3 },
  { id: 'file', label: 'Fayl', icon: FileIcon },
];

function isImage(file: File) {
  return file.type.toLowerCase().startsWith('image/');
}

function isVideo(file: File) {
  return file.type.toLowerCase().startsWith('video/');
}

function isAudio(file: File) {
  return file.type.toLowerCase().startsWith('audio/');
}

function formatSize(bytes: number) {
  if (!bytes) return '';
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(0) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

/**
 * Telegram mobil ilovasidagi biriktirish paneli.
 *
 * Pastdan chiqadigan sheet, pastida esa bo'limlar paneli:
 * Galereya / Maqola / Joylashuv / Fayl.
 *
 * Brauzerda qurilma galereyasini o'zicha o'qib bo'lmaydi (bunday API yo'q),
 * shuning uchun "Galereya" bo'limi tizim tanlagichini ochadi va tanlangan
 * rasm/videolar aynan Telegramdagidek katakli ko'rinishda, belgilangan
 * holatda ko'rsatiladi - bir vaqtda bir nechtasini yuborish mumkin.
 */
export function TelegramAttachSheet({
  open,
  onOpenChange,
  onPickFiles,
  onArticle,
  onShareLocation,
  onCreatePoll,
  maxFileMb = 50,
}: TelegramAttachSheetProps) {
  const [tab, setTab] = useState<AttachTab>('gallery');
  const [picked, setPicked] = useState<PickedFile[]>([]);
  const [pollQuestion, setPollQuestion] = useState('');
  const [pollOptions, setPollOptions] = useState(['', '']);
  const [pollMultiple, setPollMultiple] = useState(false);
  const [pollAnonymous, setPollAnonymous] = useState(false);
  const [pollSending, setPollSending] = useState(false);
  const mediaInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const clearPicked = useCallback(() => {
    setPicked((current) => {
      current.forEach((item) => {
        if (item.preview) URL.revokeObjectURL(item.preview);
      });
      return [];
    });
  }, []);

  // Panel yopilganda tanlovni tozalaymiz
  useEffect(() => {
    if (!open) {
      clearPicked();
      setTab('gallery');
      setPollQuestion('');
      setPollOptions(['', '']);
      setPollMultiple(false);
      setPollAnonymous(false);
      setPollSending(false);
    }
  }, [open, clearPicked]);

  useEffect(() => clearPicked, [clearPicked]);

  const addFiles = (list: FileList | null) => {
    if (!list || list.length === 0) return;
    const accepted: PickedFile[] = [];

    Array.from(list).forEach((file) => {
      if (file.size > maxFileMb * 1024 * 1024) return;
      accepted.push({
        file,
        preview: isImage(file) || isVideo(file) ? URL.createObjectURL(file) : undefined,
      });
    });

    if (accepted.length > 0) setPicked((current) => [...current, ...accepted]);
  };

  const removeAt = (index: number) => {
    setPicked((current) => {
      const item = current[index];
      if (item?.preview) URL.revokeObjectURL(item.preview);
      return current.filter((_, i) => i !== index);
    });
  };

  const send = (asDocument: boolean) => {
    if (picked.length === 0) return;
    onPickFiles(
      picked.map((item) => item.file),
      asDocument
    );
    // Fayllar endi yuqoriga uzatildi: preview URL'larni bekor qilmaymiz,
    // faqat ro'yxatni bo'shatamiz (yuklovchi o'z preview'ini yaratadi).
    setPicked([]);
    onOpenChange(false);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="mx-auto max-h-[85vh] w-full max-w-lg rounded-t-3xl border-border p-0 pb-safe"
      >
        {/* Yashirin inputlar */}
        <input
          ref={mediaInputRef}
          type="file"
          accept="image/*,video/*"
          multiple
          className="hidden"
          onChange={(e) => {
            addFiles(e.target.files);
            e.target.value = '';
          }}
        />
        <input
          ref={cameraInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={(e) => {
            addFiles(e.target.files);
            e.target.value = '';
          }}
        />
        <input
          ref={fileInputRef}
          type="file"
          multiple
          className="hidden"
          onChange={(e) => {
            const files = e.target.files;
            if (files && files.length > 0) {
              onPickFiles(Array.from(files), true);
              onOpenChange(false);
            }
            e.target.value = '';
          }}
        />

        {/* Tepadagi "sudralish" chizig'i */}
        <div className="flex items-center justify-center pt-3">
          <span className="h-1 w-10 rounded-full bg-muted-foreground/40" />
        </div>

        <div className="min-h-[220px] px-4 pt-3">
          {tab === 'gallery' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium">
                  {picked.length > 0 ? picked.length + ' ta tanlandi' : 'Rasm va video'}
                </p>
                {picked.length > 0 && (
                  <button
                    type="button"
                    onClick={clearPicked}
                    className="text-xs font-medium text-muted-foreground hover:text-foreground"
                  >
                    Tozalash
                  </button>
                )}
              </div>

              <div className="grid max-h-[46vh] grid-cols-3 gap-1 overflow-y-auto scrollbar-hide">
                <button
                  type="button"
                  onClick={() => mediaInputRef.current?.click()}
                  className="flex aspect-square flex-col items-center justify-center gap-1 rounded-lg bg-muted text-muted-foreground tg-transition hover:bg-muted/70"
                >
                  <Plus className="h-6 w-6" />
                  <span className="text-[11px]">Tanlash</span>
                </button>
                <button
                  type="button"
                  onClick={() => cameraInputRef.current?.click()}
                  className="flex aspect-square flex-col items-center justify-center gap-1 rounded-lg bg-muted text-muted-foreground tg-transition hover:bg-muted/70"
                >
                  <Camera className="h-6 w-6" />
                  <span className="text-[11px]">Kamera</span>
                </button>

                {picked.map((item, index) => (
                  <div
                    key={item.file.name + index}
                    className="relative aspect-square overflow-hidden rounded-lg bg-muted"
                  >
                    {item.preview && isImage(item.file) ? (
                      <img
                        src={item.preview}
                        alt=""
                        className="h-full w-full object-cover no-drag"
                      />
                    ) : item.preview && isVideo(item.file) ? (
                      <video
                        src={item.preview}
                        className="h-full w-full object-cover"
                        muted
                        playsInline
                        preload="metadata"
                      />
                    ) : (
                      <div className="flex h-full w-full flex-col items-center justify-center gap-1 p-1 text-muted-foreground">
                        {isAudio(item.file) ? (
                          <Music2 className="h-5 w-5" />
                        ) : isVideo(item.file) ? (
                          <Film className="h-5 w-5" />
                        ) : (
                          <FileIcon className="h-5 w-5" />
                        )}
                        <span className="line-clamp-2 text-center text-[10px] leading-tight">
                          {item.file.name}
                        </span>
                      </div>
                    )}

                    <span className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-foreground text-background">
                      <Check className="h-3 w-3" />
                    </span>
                    <button
                      type="button"
                      onClick={() => removeAt(index)}
                      aria-label="Olib tashlash"
                      className="absolute bottom-1 left-1 flex h-5 w-5 items-center justify-center rounded-full bg-black/50 text-white"
                    >
                      <X className="h-3 w-3" />
                    </button>
                    <span className="absolute bottom-1 right-1 rounded bg-black/50 px-1 text-[9px] text-white">
                      {formatSize(item.file.size)}
                    </span>
                  </div>
                ))}
              </div>

              {picked.length > 0 && (
                <div className="flex items-center gap-2">
                  <Button className="flex-1 rounded-xl" onClick={() => send(false)}>
                    Yuborish ({picked.length})
                  </Button>
                  <Button
                    variant="outline"
                    className="rounded-xl"
                    onClick={() => send(true)}
                    title="Sifatini saqlab, fayl sifatida yuborish"
                  >
                    Fayl sifatida
                  </Button>
                </div>
              )}

              <p className="pb-1 text-[11px] text-muted-foreground">
                Bir vaqtda bir nechta rasm/video tanlash mumkin. Har bir fayl {maxFileMb} MB
                dan kichik bo'lishi kerak.
              </p>
            </div>
          )}

          {tab === 'article' && (
            <div className="space-y-3 py-2">
              <div className="flex items-start gap-3 rounded-2xl bg-muted/50 p-3">
                <BookOpen className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" />
                <div className="min-w-0">
                  <p className="text-sm font-medium">Maqola yozish</p>
                  <p className="text-xs text-muted-foreground">
                    Sarlavha, muqova rasmi va formatlangan uzun matn. Chatda chiroyli karta
                    ko'rinishida chiqadi va to'liq holda o'qish oynasida ochiladi.
                  </p>
                </div>
              </div>
              <Button
                className="w-full rounded-xl"
                onClick={() => {
                  onOpenChange(false);
                  onArticle();
                }}
              >
                Maqola yozishni boshlash
              </Button>
            </div>
          )}

          {tab === 'location' && (
            <div className="space-y-3 py-2">
              <div className="flex items-start gap-3 rounded-2xl bg-muted/50 p-3">
                <MapPin className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" />
                <div className="min-w-0">
                  <p className="text-sm font-medium">Joylashuvni ulashish</p>
                  <p className="text-xs text-muted-foreground">
                    Hozirgi joylashuvingiz xaritali xabar sifatida yuboriladi.
                  </p>
                </div>
              </div>
              {onShareLocation ? (
                <div className="rounded-xl border border-border p-1">
                  <LocationShareButton
                    onShareLocation={(location) => {
                      onShareLocation(location);
                      onOpenChange(false);
                    }}
                  />
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Bu chatda joylashuv ulashish mavjud emas.
                </p>
              )}
            </div>
          )}

          {tab === 'poll' && (
            <div className="space-y-3 py-2">
              <div className="flex items-start gap-3 rounded-2xl bg-muted/50 p-3">
                <BarChart3 className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" />
                <div className="min-w-0">
                  <p className="text-sm font-medium">So'rovnoma yaratish</p>
                  <p className="text-xs text-muted-foreground">
                    Variantlar ikkala Alsamos mijozida ham interaktiv ko'rinadi va ovozlar sinxronlanadi.
                  </p>
                </div>
              </div>

              <input
                value={pollQuestion}
                onChange={(event) => setPollQuestion(event.target.value)}
                placeholder="Savol"
                maxLength={300}
                className="h-10 w-full rounded-xl border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
              />

              <div className="space-y-2">
                {pollOptions.map((option, index) => (
                  <div key={index} className="flex items-center gap-2">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-border text-[11px] text-muted-foreground">
                      {index + 1}
                    </span>
                    <input
                      value={option}
                      onChange={(event) =>
                        setPollOptions((current) =>
                          current.map((value, optionIndex) =>
                            optionIndex === index ? event.target.value : value
                          )
                        )
                      }
                      placeholder={`Variant ${index + 1}`}
                      maxLength={150}
                      className="h-9 min-w-0 flex-1 rounded-xl border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
                    />
                    {pollOptions.length > 2 && (
                      <button
                        type="button"
                        onClick={() =>
                          setPollOptions((current) => current.filter((_, optionIndex) => optionIndex !== index))
                        }
                        className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
                        aria-label="Variantni o'chirish"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                ))}
              </div>

              {pollOptions.length < 10 && (
                <Button
                  type="button"
                  variant="ghost"
                  className="h-9 w-full rounded-xl"
                  onClick={() => setPollOptions((current) => [...current, ''])}
                >
                  <Plus className="mr-2 h-4 w-4" />
                  Variant qo'shish
                </Button>
              )}

              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setPollMultiple((value) => !value)}
                  className={cn(
                    'rounded-xl border px-3 py-2 text-left text-xs tg-transition',
                    pollMultiple ? 'border-foreground/20 bg-muted text-foreground' : 'border-border bg-background'
                  )}
                >
                  <span className="block font-medium">Ko'p tanlov</span>
                  <span className="text-[10px] opacity-70">Bir nechta variant</span>
                </button>
                <button
                  type="button"
                  onClick={() => setPollAnonymous((value) => !value)}
                  className={cn(
                    'rounded-xl border px-3 py-2 text-left text-xs tg-transition',
                    pollAnonymous ? 'border-foreground/20 bg-muted text-foreground' : 'border-border bg-background'
                  )}
                >
                  <span className="block font-medium">Anonim</span>
                  <span className="text-[10px] opacity-70">Kim ovoz bergani yashirin</span>
                </button>
              </div>

              <Button
                className="w-full rounded-xl"
                disabled={
                  pollSending ||
                  !onCreatePoll ||
                  !pollQuestion.trim() ||
                  pollOptions.filter((option) => option.trim()).length < 2
                }
                onClick={async () => {
                  if (!onCreatePoll) return;
                  setPollSending(true);
                  try {
                    await onCreatePoll({
                      question: pollQuestion.trim(),
                      options: pollOptions.map((option) => option.trim()).filter(Boolean),
                      multiple: pollMultiple,
                      anonymous: pollAnonymous,
                    });
                    onOpenChange(false);
                  } finally {
                    setPollSending(false);
                  }
                }}
              >
                {pollSending ? 'Yuborilmoqda...' : "So'rovnomani yuborish"}
              </Button>
            </div>
          )}

          {tab === 'file' && (
            <div className="space-y-3 py-2">
              <div className="flex items-start gap-3 rounded-2xl bg-muted/50 p-3">
                <FileIcon className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" />
                <div className="min-w-0">
                  <p className="text-sm font-medium">Fayl yuborish</p>
                  <p className="text-xs text-muted-foreground">
                    Hujjat, arxiv, musiqa yoki boshqa har qanday fayl. Rasm/video ham
                    sifatini yo'qotmasdan fayl sifatida yuboriladi.
                  </p>
                </div>
              </div>
              <Button
                className="w-full rounded-xl"
                onClick={() => fileInputRef.current?.click()}
              >
                Qurilmadan fayl tanlash
              </Button>
            </div>
          )}
        </div>

        {/* Pastdagi bo'limlar paneli - Telegram mobildagidek */}
        <div className="mt-3 flex items-stretch justify-around border-t border-border bg-card/80 px-2 py-2">
          {TABS.map(({ id, label, icon: Icon }) => {
            const active = tab === id;
            return (
              <button
                key={id}
                type="button"
                onClick={() => setTab(id)}
                className={cn(
                  'flex min-w-0 flex-1 flex-col items-center gap-1 rounded-xl px-1 py-1.5 tg-transition',
                  active
                    ? 'text-muted-foreground'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                )}
              >
                <span
                  className={cn(
                    'flex h-9 w-9 items-center justify-center rounded-xl tg-transition',
                    active ? 'bg-foreground/10' : 'bg-muted'
                  )}
                >
                  <Icon className="h-5 w-5" />
                </span>
                <span className="truncate text-[11px] font-medium">{label}</span>
              </button>
            );
          })}
        </div>
      </SheetContent>
    </Sheet>
  );
}

export default TelegramAttachSheet;

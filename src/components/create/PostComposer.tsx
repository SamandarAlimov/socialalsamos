import { useCallback, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  BarChart3,
  Globe2,
  Loader2,
  Lock,
  MapPin,
  Music2,
  Paperclip,
  Send,
  Sticker as StickerIcon,
  Trash2,
  Users,
  UsersRound,
  X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { usePosts, type PostVisibility } from '@/hooks/usePosts';
import { usePostAttachments } from '@/hooks/usePostAttachments';
import { ACCEPT_ANY_FILE, MAX_COLLABORATORS, MAX_FILES_PER_POST } from '@/lib/postComposer';
import type { PollInput } from '@/lib/polls';
import type { PostLocationInput, PostMusicInput } from '@/lib/postMeta';
import type { StickerPlacement } from '@/lib/stickers';
import { AttachmentGrid } from '@/components/create/AttachmentGrid';
import { FormatToolbar } from '@/components/create/FormatToolbar';
import { PollComposer } from '@/components/create/PollComposer';
import { LocationPicker } from '@/components/create/LocationPicker';
import { MusicPicker } from '@/components/create/MusicPicker';
import { MentionCollaborator } from '@/components/create/MentionCollaborator';
import { StickerMediaEditor } from '@/components/create/StickerMediaEditor';
import { HashtagSuggestions } from '@/components/HashtagSuggestions';

/** MentionCollaborator ichidagi Profile bilan bir xil shakl. */
interface CollaboratorProfile {
  id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
  is_verified?: boolean;
}

const VISIBILITIES: Array<{
  id: PostVisibility;
  label: string;
  icon: typeof Globe2;
}> = [
  { id: 'public', label: 'Hamma', icon: Globe2 },
  { id: 'friends', label: 'Do‘stlar', icon: UsersRound },
  { id: 'private', label: 'Faqat men', icon: Lock },
];

/**
 * Kursor turgan joydagi hashtag so‘rovini aniqlaydi.
 * `null` — kursor hashtag ustida emas.
 */
function hashtagQueryAt(text: string, cursor: number): string | null {
  const before = text.slice(0, cursor);
  const match = before.match(/#([\p{L}\p{N}_]*)$/u);
  return match ? match[1] : null;
}

/**
 * Yangi post yaratish oynasi.
 *
 * Eski `CreatePage` ning asosiy muammolari shu yerda hal qilingan:
 *  - faqat rasm/video qabul qilinardi → endi har qanday fayl
 *  - so‘rovnoma, joylashuv, musiqa post matniga marker sifatida yozilardi
 *    → endi alohida jadvallarga yoziladi
 *  - maxfiylik tanlovi saqlanmasdi → endi saqlanadi
 *  - hammuallif 5 ta bilan cheklangandi → endi 10 ta
 *  - stikerlar matnga emoji sifatida qo‘shilardi → endi media ustiga
 *    haqiqiy qatlam sifatida qo‘yiladi
 */
export function PostComposer() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { createPost } = usePosts();

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [content, setContent] = useState('');
  const [visibility, setVisibility] = useState<PostVisibility>('public');
  const [poll, setPoll] = useState<PollInput | null>(null);
  const [location, setLocation] = useState<PostLocationInput | null>(null);
  const [music, setMusic] = useState<PostMusicInput | null>(null);
  const [collaborators, setCollaborators] = useState<CollaboratorProfile[]>([]);
  const [hashtagQuery, setHashtagQuery] = useState<string | null>(null);
  const [isPosting, setIsPosting] = useState(false);

  const [showPoll, setShowPoll] = useState(false);
  const [showLocation, setShowLocation] = useState(false);
  const [showMusic, setShowMusic] = useState(false);
  const [showCollaborators, setShowCollaborators] = useState(false);

  /** Stiker tahriri: qaysi fayl ustida ishlanmoqda. */
  const [stickerTargetId, setStickerTargetId] = useState<string | null>(null);
  /** Fayl id -> stiker joylashuvlari. */
  const [stickerDrafts, setStickerDrafts] = useState<Record<string, StickerPlacement[]>>({});

  const {
    attachments,
    isUploading,
    canAddMore,
    remainingSlots,
    addFiles,
    removeAttachment,
    clearAttachments,
    reorderAttachments,
    retryAttachment,
    setEditState,
    uploadAll,
  } = usePostAttachments({ visibility });

  const canSubmit = useMemo(
    () =>
      !isPosting &&
      !isUploading &&
      (content.trim().length > 0 || attachments.length > 0 || Boolean(poll) || Boolean(location)),
    [isPosting, isUploading, content, attachments.length, poll, location],
  );

  /** Stiker qo‘yish mumkin bo‘lgan fayllar (faqat rasm va video). */
  const stickerableAttachments = useMemo(
    () => attachments.filter((item) => item.kind === 'image' || item.kind === 'video'),
    [attachments],
  );

  const stickerTarget = useMemo(
    () => attachments.find((item) => item.id === stickerTargetId) ?? null,
    [attachments, stickerTargetId],
  );

  const totalStickers = useMemo(
    () =>
      Object.entries(stickerDrafts).reduce(
        (sum, [id, list]) => (attachments.some((item) => item.id === id) ? sum + list.length : sum),
        0,
      ),
    [stickerDrafts, attachments],
  );

  const handleContentChange = useCallback((value: string) => {
    setContent(value);
    const element = textareaRef.current;
    const cursor = element ? element.selectionStart : value.length;
    setHashtagQuery(hashtagQueryAt(value, cursor));
  }, []);

  /** Tanlangan hashtagni kursor turgan joyga qo‘yadi. */
  const insertHashtag = useCallback(
    (tag: string) => {
      const element = textareaRef.current;
      const cursor = element ? element.selectionStart : content.length;
      const before = content.slice(0, cursor).replace(/#([\p{L}\p{N}_]*)$/u, '#' + tag + ' ');
      const after = content.slice(cursor);

      setContent(before + after);
      setHashtagQuery(null);

      requestAnimationFrame(() => {
        if (!element) return;
        element.focus();
        element.setSelectionRange(before.length, before.length);
      });
    },
    [content],
  );

  const handleFilesSelected = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(event.target.files ?? []);
      event.target.value = '';
      if (files.length > 0) await addFiles(files);
    },
    [addFiles],
  );

  /** Stiker tahririni ochish. Media bo‘lmasa tushunarli ogohlantirish. */
  const openStickerEditor = useCallback(
    (attachment?: { id: string } | string) => {
      const attachmentId = typeof attachment === 'string' ? attachment : attachment?.id;
      const target = attachmentId
        ? attachments.find((item) => item.id === attachmentId)
        : stickerableAttachments[0];

      if (!target) {
        toast({
          title: 'Avval rasm yoki video qo‘shing',
          description: 'Stikerlar media ustiga qo‘yiladi.',
        });
        return;
      }

      if (target.kind !== 'image' && target.kind !== 'video') {
        toast({
          title: 'Bu faylga stiker qo‘yilmaydi',
          description: 'Stiker faqat rasm va videoga qo‘yiladi.',
        });
        return;
      }

      setStickerTargetId(target.id);
    },
    [attachments, stickerableAttachments, toast],
  );

  /** Stikerlarni faylning tahrir holatiga yozamiz — keyin post_media ga tushadi. */
  const handleStickersSaved = useCallback(
    (placements: StickerPlacement[]) => {
      const targetId = stickerTargetId;
      if (!targetId) return;

      setStickerDrafts((current) => ({ ...current, [targetId]: placements }));

      const target = attachments.find((item) => item.id === targetId);
      const nextEditState = { ...(target?.editState ?? {}) } as Record<string, unknown>;

      if (placements.length > 0) {
        nextEditState.stickers = placements;
      } else {
        delete nextEditState.stickers;
      }

      setEditState(
        targetId,
        Object.keys(nextEditState).length > 0 ? nextEditState : undefined,
      );
    },
    [attachments, setEditState, stickerTargetId],
  );

  const handleSubmit = useCallback(async () => {
    if (!canSubmit) return;

    setIsPosting(true);
    try {
      // 1. Fayllarni yuklaymiz (har birida alohida progress ko‘rinadi)
      const { media, failed } = await uploadAll();

      if (failed.length > 0) {
        toast({
          title: 'Ba‘zi fayllar yuklanmadi',
          description:
            failed.length + ' fayl yuklanmadi. Qayta urinib ko‘ring yoki ularni o‘chirib yuboring.',
          variant: 'destructive',
        });
        return;
      }

      // 2. Postni yaratamiz — barcha meta jadvallarga ham yoziladi
      // Legacy media_urls faqat public postlarda qoladi.
      // Friends/private postlarda URL/reference sizib chiqmasligi uchun bo‘sh massiv yoziladi.
      const mediaUrls = visibility === 'public' ? media.map((item) => item.storageUrl) : [];
      const primaryKind = media[0]?.kind ?? 'text';

      const created = await createPost(content.trim(), mediaUrls, primaryKind, collaborators.map((item) => item.id), {
        visibility,
        postKind: poll ? 'poll' : 'post',
        media,
        poll,
        location,
        music,
      });

      if (!created) return;

      // 3. Tozalaymiz va lentaga qaytamiz
      clearAttachments();
      setContent('');
      setPoll(null);
      setLocation(null);
      setMusic(null);
      setCollaborators([]);
      setStickerDrafts({});
      navigate('/home');
    } finally {
      setIsPosting(false);
    }
  }, [
    canSubmit,
    uploadAll,
    toast,
    createPost,
    content,
    collaborators,
    visibility,
    poll,
    location,
    music,
    clearAttachments,
    navigate,
  ]);

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-4 px-4 pb-32 pt-4">
      {/* Maxfiylik */}
      <div className="flex gap-2">
        {VISIBILITIES.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => setVisibility(id)}
            className={cn(
              'flex flex-1 items-center justify-center gap-1.5 rounded-xl border px-2 py-2 text-xs font-medium transition',
              visibility === id
                ? 'border-primary bg-primary/10 text-primary'
                : 'border-border/60 text-muted-foreground hover:bg-muted',
            )}
          >
            <Icon className="h-3.5 w-3.5" /> {label}
          </button>
        ))}
      </div>

      {/* Matn + formatlash */}
      <div className="rounded-2xl border border-border/60 bg-muted/20 p-3">
        <FormatToolbar
          textareaRef={textareaRef}
          value={content}
          onChange={handleContentChange}
          className="mb-2"
        />

        <textarea
          ref={textareaRef}
          value={content}
          onChange={(event) => handleContentChange(event.target.value)}
          onBlur={() => setTimeout(() => setHashtagQuery(null), 150)}
          placeholder="Nima yangilik? #hashtag ishlatib ko‘ring..."
          rows={5}
          className="w-full resize-none bg-transparent text-sm outline-none placeholder:text-muted-foreground"
        />

        {hashtagQuery !== null && (
          <HashtagSuggestions query={hashtagQuery} onSelect={insertHashtag} className="mt-2" />
        )}
      </div>

      {/* Fayllar — rasm/videoni bosib stiker qo‘yish mumkin */}
      <AttachmentGrid
        attachments={attachments}
        onRemove={removeAttachment}
        onRetry={retryAttachment}
        onReorder={reorderAttachments}
        onEditImage={openStickerEditor}
        onEditVideo={openStickerEditor}
      />

      {/* Stiker xulosasi */}
      {totalStickers > 0 && (
        <div className="flex items-center gap-3 rounded-2xl border border-border/60 bg-muted/20 p-3">
          <StickerIcon className="h-5 w-5 shrink-0 text-primary" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium">{totalStickers} stiker qo‘yildi</p>
            <p className="text-xs text-muted-foreground">
              Media ustidagi joylashuv postda ham aynan shunday ko‘rinadi
            </p>
          </div>
          <button
            type="button"
            onClick={() => openStickerEditor()}
            className="shrink-0 text-xs font-medium text-primary"
          >
            Tahrirlash
          </button>
        </div>
      )}

      {/* So‘rovnoma xulosasi */}
      {poll && (
        <div className="flex items-start gap-3 rounded-2xl border border-border/60 bg-muted/20 p-3">
          <BarChart3 className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{poll.question}</p>
            <p className="text-xs text-muted-foreground">
              {poll.options.length} variant
              {poll.quizMode ? ' · viktorina' : ''}
              {poll.allowMultiple ? ' · ko‘p tanlov' : ''}
              {poll.isAnonymous ? ' · anonim' : ''}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowPoll(true)}
            className="shrink-0 text-xs font-medium text-primary"
          >
            Tahrirlash
          </button>
          <button
            type="button"
            onClick={() => setPoll(null)}
            aria-label="So‘rovnomani o‘chirish"
            className="shrink-0 text-muted-foreground transition hover:text-destructive"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Joylashuv xulosasi */}
      {location && (
        <div className="flex items-center gap-3 rounded-2xl border border-border/60 bg-muted/20 p-3">
          <MapPin className="h-5 w-5 shrink-0 text-primary" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">
              {location.place?.name ?? location.label ?? 'Joylashuv'}
            </p>
            <p className="truncate text-xs text-muted-foreground">
              {location.mode === 'live'
                ? 'Real vaqtli ulashish'
                : (location.place?.address ??
                  location.latitude.toFixed(4) + ', ' + location.longitude.toFixed(4))}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setLocation(null)}
            aria-label="Joylashuvni o‘chirish"
            className="shrink-0 text-muted-foreground transition hover:text-destructive"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Musiqa xulosasi */}
      {music && (
        <div className="flex items-center gap-3 rounded-2xl border border-border/60 bg-muted/20 p-3">
          <Music2 className="h-5 w-5 shrink-0 text-primary" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">
              {music.track?.title ?? 'Tanlangan musiqa'}
            </p>
            <p className="truncate text-xs text-muted-foreground">
              {music.track?.artist ?? 'Katalog treki'}
              {' · '}
              {Math.round((music.volume ?? 1) * 100)}%
              {music.startSeconds ? ' · ' + Math.round(music.startSeconds) + 's dan' : ''}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowMusic(true)}
            className="shrink-0 text-xs font-medium text-primary"
          >
            Tahrirlash
          </button>
          <button
            type="button"
            onClick={() => setMusic(null)}
            aria-label="Musiqani o‘chirish"
            className="shrink-0 text-muted-foreground transition hover:text-destructive"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Hammualliflar */}
      {collaborators.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-border/60 bg-muted/20 p-3">
          <Users className="h-4 w-4 shrink-0 text-primary" />
          {collaborators.map((collaborator) => (
            <span
              key={collaborator.id}
              className="inline-flex items-center gap-1 rounded-full bg-background px-2 py-1 text-xs"
            >
              @{collaborator.username}
              <button
                type="button"
                onClick={() =>
                  setCollaborators((current) =>
                    current.filter((item) => item.id !== collaborator.id),
                  )
                }
                aria-label="Olib tashlash"
                className="text-muted-foreground transition hover:text-destructive"
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
          <span className="text-xs text-muted-foreground">
            {collaborators.length}/{MAX_COLLABORATORS}
          </span>
        </div>
      )}

      {/* Asboblar paneli */}
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={!canAddMore}
          className="flex items-center gap-1.5 rounded-xl border border-border/60 px-3 py-2 text-xs font-medium transition hover:bg-muted disabled:opacity-50"
        >
          <Paperclip className="h-4 w-4" /> Fayl
          <span className="text-muted-foreground">
            ({attachments.length}/{MAX_FILES_PER_POST})
          </span>
        </button>

        <button
          type="button"
          onClick={() => openStickerEditor()}
          className="flex items-center gap-1.5 rounded-xl border border-border/60 px-3 py-2 text-xs font-medium transition hover:bg-muted"
        >
          <StickerIcon className="h-4 w-4" /> Stiker
        </button>

        <button
          type="button"
          onClick={() => setShowPoll(true)}
          className="flex items-center gap-1.5 rounded-xl border border-border/60 px-3 py-2 text-xs font-medium transition hover:bg-muted"
        >
          <BarChart3 className="h-4 w-4" /> So‘rovnoma
        </button>

        <button
          type="button"
          onClick={() => setShowLocation(true)}
          className="flex items-center gap-1.5 rounded-xl border border-border/60 px-3 py-2 text-xs font-medium transition hover:bg-muted"
        >
          <MapPin className="h-4 w-4" /> Joylashuv
        </button>

        <button
          type="button"
          onClick={() => setShowMusic(true)}
          className="flex items-center gap-1.5 rounded-xl border border-border/60 px-3 py-2 text-xs font-medium transition hover:bg-muted"
        >
          <Music2 className="h-4 w-4" /> Musiqa
        </button>

        <button
          type="button"
          onClick={() => setShowCollaborators(true)}
          className="flex items-center gap-1.5 rounded-xl border border-border/60 px-3 py-2 text-xs font-medium transition hover:bg-muted"
        >
          <Users className="h-4 w-4" /> Hammuallif
        </button>

        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept={ACCEPT_ANY_FILE}
          onChange={handleFilesSelected}
          className="hidden"
        />
      </div>

      {!canAddMore && (
        <p className="text-xs text-muted-foreground">
          Bitta postga {MAX_FILES_PER_POST} tagacha fayl qo‘shish mumkin.
        </p>
      )}
      {canAddMore && attachments.length > 0 && (
        <p className="text-xs text-muted-foreground">Yana {remainingSlots} fayl qo‘shsa bo‘ladi.</p>
      )}

      {/* Joylash tugmasi */}
      <button
        type="button"
        onClick={handleSubmit}
        disabled={!canSubmit}
        className="flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-primary text-sm font-semibold text-primary-foreground transition disabled:opacity-50"
      >
        {isPosting || isUploading ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Send className="h-4 w-4" />
        )}
        {isUploading ? 'Fayllar yuklanmoqda...' : isPosting ? 'Joylanmoqda...' : 'Joylash'}
      </button>

      {/* Oynalar */}
      <PollComposer
        open={showPoll}
        onClose={() => setShowPoll(false)}
        onSave={setPoll}
        initialPoll={poll}
      />

      <LocationPicker
        open={showLocation}
        onClose={() => setShowLocation(false)}
        onSelect={setLocation}
      />

      <MusicPicker
        open={showMusic}
        onOpenChange={setShowMusic}
        currentMusic={music}
        onSelectMusic={setMusic}
        visibility={visibility}
      />

      <StickerMediaEditor
        open={Boolean(stickerTarget)}
        onOpenChange={(next) => {
          if (!next) setStickerTargetId(null);
        }}
        attachment={stickerTarget}
        initialPlacements={stickerTargetId ? (stickerDrafts[stickerTargetId] ?? []) : []}
        onSave={handleStickersSaved}
      />

      <MentionCollaborator
        open={showCollaborators}
        onOpenChange={setShowCollaborators}
        mode="collaborate"
        maxUsers={MAX_COLLABORATORS}
        selectedUsers={collaborators}
        onSelectUser={(user) =>
          setCollaborators((current) =>
            current.length >= MAX_COLLABORATORS || current.some((item) => item.id === user.id)
              ? current
              : [...current, user],
          )
        }
        onRemoveUser={(userId) =>
          setCollaborators((current) => current.filter((item) => item.id !== userId))
        }
      />
    </div>
  );
}

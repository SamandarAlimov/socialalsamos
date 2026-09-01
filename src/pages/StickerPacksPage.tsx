import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import {
  BadgeCheck,
  Clock,
  Copy,
  Globe2,
  ImagePlus,
  Loader2,
  Lock,
  PackagePlus,
  Sparkles,
  Trash2,
  UserRound,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { db } from '@/lib/db';
import { useAuth } from '@/contexts/AuthContext';
import { useUserStickers } from '@/hooks/useUserStickers';
import { StickerUploadDialog } from '@/components/create/StickerUploadDialog';
import { StickerView } from '@/components/stickers/StickerView';
import { stickerFromUrl, type StickerItem } from '@/lib/stickers';

type ReviewStatus = 'approved' | 'pending' | 'rejected';

interface PackRow {
  id: string;
  slug: string;
  name: string;
  owner_id: string | null;
  is_public: boolean;
  review_status: ReviewStatus;
  install_count: number | null;
  sticker_count: number | null;
}

/**
 * Stiker paketlari sahifasi (Bosqich C yakuni).
 *
 * Ikki rejim:
 * 1. `/stickers` — o‘z shaxsiy paketini boshqarish (yuklash, o‘chirish,
 *    ulashish havolasi, ommaga ochish so‘rovi).
 * 2. `/stickers/:slug` — havola orqali kelgan begona paketni ko‘rish va
 *    o‘ziga qo‘shish.
 */
export default function StickerPacksPage() {
  const { slug } = useParams<{ slug?: string }>();
  const { user } = useAuth();
  const { toast } = useToast();
  const mine = useUserStickers();

  const [pack, setPack] = useState<PackRow | null>(null);
  const [isLoadingPack, setIsLoadingPack] = useState(true);
  const [showUpload, setShowUpload] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Havola bilan kelgan paketning stikerlari (o‘z paketi bo‘lmasa).
  const [guestStickers, setGuestStickers] = useState<StickerItem[]>([]);
  const [isInstalling, setIsInstalling] = useState(false);

  const loadPack = useCallback(async () => {
    setIsLoadingPack(true);
    try {
      const query = db
        .from('sticker_packs')
        .select('id, slug, name, owner_id, is_public, review_status, install_count, sticker_count');

      const { data, error } = slug
        ? await query.eq('slug', slug).maybeSingle()
        : await query
            .eq('owner_id', user?.id ?? '')
            .eq('source', 'user')
            .order('created_at', { ascending: true })
            .limit(1)
            .maybeSingle();

      if (error) throw error;
      setPack((data as PackRow) ?? null);
    } catch (error) {
      console.warn('Paketni yuklab bo\u2018lmadi:', error);
      setPack(null);
    } finally {
      setIsLoadingPack(false);
    }
  }, [slug, user?.id]);

  useEffect(() => {
    void loadPack();
  }, [loadPack]);

  const isOwnPack = Boolean(pack && user && pack.owner_id === user.id);

  // Begona paket stikerlarini alohida yuklaymiz — RLS faqat tasdiqlangan
  // ommaviy paketlarni ko‘rsatadi, ya’ni qo‘shimcha tekshiruv kerak emas.
  useEffect(() => {
    if (!pack || isOwnPack) {
      setGuestStickers([]);
      return;
    }

    let cancelled = false;

    (async () => {
      const { data, error } = await db
        .from('stickers')
        .select('id, pack_id, kind, name, preview_url, full_url')
        .eq('pack_id', pack.id)
        .order('created_at', { ascending: false })
        .limit(120);

      if (cancelled || error) return;

      setGuestStickers(
        (data ?? []).map((row: Record<string, unknown>) =>
          stickerFromUrl(
            ((row.full_url as string) ?? (row.preview_url as string) ?? ''),
            {
              kind: (row.kind as StickerItem['kind']) ?? 'image',
              previewUrl: (row.preview_url as string) ?? (row.full_url as string) ?? '',
              name: (row.name as string) ?? 'Stiker',
              packId: pack.id,
              stickerId: row.id as string,
            },
          ),
        ),
      );
    })();

    return () => {
      cancelled = true;
    };
  }, [pack, isOwnPack]);

  const shareUrl = useMemo(() => {
    if (!pack) return '';
    const origin = typeof window === 'undefined' ? '' : window.location.origin;
    return origin + '/stickers/' + pack.slug;
  }, [pack]);

  const copyShareUrl = useCallback(async () => {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      toast({ title: 'Havola nusxalandi' });
    } catch {
      toast({ title: 'Havolani nusxalab bo\u2018lmadi', variant: 'destructive' });
    }
  }, [shareUrl, toast]);

  const requestPublic = useCallback(async () => {
    if (!pack) return;
    setIsSubmitting(true);
    try {
      const { error } = await db.rpc('request_public_sticker_pack', { p_pack_id: pack.id });
      if (error) throw error;

      setPack((prev) => (prev ? { ...prev, review_status: 'pending' } : prev));
      toast({
        title: 'So\u2018rov yuborildi',
        description: 'Paket moderatsiyadan o\u2018tgach ommaga ochiladi.',
      });
    } catch (error) {
      toast({
        title: 'So\u2018rovni yuborib bo\u2018lmadi',
        description: error instanceof Error ? error.message : undefined,
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  }, [pack, toast]);

  const installPack = useCallback(async () => {
    if (!pack) return;
    setIsInstalling(true);
    try {
      const { error } = await db.rpc('add_sticker_pack_by_slug', { p_slug: pack.slug });
      if (error) throw error;
      toast({ title: 'Paket to\u2018plamlaringizga qo\u2018shildi' });
    } catch (error) {
      toast({
        title: 'Paketni qo\u2018shib bo\u2018lmadi',
        description: error instanceof Error ? error.message : undefined,
        variant: 'destructive',
      });
    } finally {
      setIsInstalling(false);
    }
  }, [pack, toast]);

  const statusChip = useMemo(() => {
    if (!pack) return null;

    if (pack.is_public && pack.review_status === 'approved') {
      return { Icon: Globe2, label: 'Ommaviy', tone: 'text-emerald-600' };
    }
    if (pack.review_status === 'pending') {
      return { Icon: Clock, label: 'Moderatsiyada', tone: 'text-amber-600' };
    }
    if (pack.review_status === 'rejected') {
      return { Icon: Lock, label: 'Rad etilgan', tone: 'text-destructive' };
    }
    return { Icon: Lock, label: 'Faqat menda', tone: 'text-muted-foreground' };
  }, [pack]);

  if (isLoadingPack) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // Havola noto‘g‘ri yoki paket hali tasdiqlanmagan.
  if (slug && !pack) {
    return (
      <div className="mx-auto flex max-w-md flex-col items-center gap-3 px-4 py-16 text-center">
        <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
          <Lock className="h-5 w-5" />
        </span>
        <h1 className="text-lg font-semibold">Paket topilmadi</h1>
        <p className="text-sm text-muted-foreground">
          Havola eskirgan bo‘lishi yoki paket hali moderatsiyadan o‘tmagan bo‘lishi mumkin.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-5 px-4 py-5">
      <header className="space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
              {isOwnPack ? <UserRound className="h-5 w-5" /> : <Sparkles className="h-5 w-5" />}
            </span>
            <div className="min-w-0">
              <h1 className="truncate text-lg font-semibold">
                {pack?.name ?? 'Mening stikerlarim'}
              </h1>
              <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                {statusChip && (
                  <>
                    <statusChip.Icon className={cn('h-3.5 w-3.5', statusChip.tone)} />
                    <span>{statusChip.label}</span>
                    <span aria-hidden>·</span>
                  </>
                )}
                <span>
                  {(isOwnPack ? mine.stickers.length : guestStickers.length) + ' ta stiker'}
                </span>
                {pack?.install_count ? (
                  <>
                    <span aria-hidden>·</span>
                    <span>{pack.install_count} marta qo‘shilgan</span>
                  </>
                ) : null}
              </p>
            </div>
          </div>

          {isOwnPack ? (
            <Button type="button" onClick={() => setShowUpload(true)} className="shrink-0">
              <ImagePlus className="mr-1.5 h-4 w-4" />
              Yangi stiker
            </Button>
          ) : (
            <Button
              type="button"
              onClick={() => void installPack()}
              disabled={isInstalling}
              className="shrink-0"
            >
              {isInstalling ? (
                <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
              ) : (
                <PackagePlus className="mr-1.5 h-4 w-4" />
              )}
              Paketni qo‘shish
            </Button>
          )}
        </div>

        {isOwnPack && (
          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" variant="secondary" size="sm" onClick={() => void copyShareUrl()}>
              <Copy className="mr-1.5 h-3.5 w-3.5" />
              Ulashish havolasi
            </Button>

            {pack?.review_status === 'approved' && !pack.is_public && (
              <Button
                type="button"
                variant="secondary"
                size="sm"
                disabled={isSubmitting || mine.stickers.length < 3}
                onClick={() => void requestPublic()}
              >
                {isSubmitting ? (
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Globe2 className="mr-1.5 h-3.5 w-3.5" />
                )}
                Ommaga ochish so‘rovi
              </Button>
            )}

            {pack?.review_status === 'pending' && (
              <span className="flex items-center gap-1.5 rounded-full bg-amber-500/10 px-3 py-1 text-xs text-amber-600">
                <Clock className="h-3.5 w-3.5" />
                Moderatsiya javobini kutmoqda
              </span>
            )}

            {pack?.is_public && pack.review_status === 'approved' && (
              <span className="flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-3 py-1 text-xs text-emerald-600">
                <BadgeCheck className="h-3.5 w-3.5" />
                Ommaga ochilgan
              </span>
            )}

            <span className="ml-auto text-xs text-muted-foreground">
              Bugun {mine.remainingToday} / {mine.dailyLimit} yuklash
            </span>
          </div>
        )}

        {isOwnPack && mine.stickers.length < 3 && (
          <p className="rounded-xl bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
            Paketni ommaga ochish uchun kamida 3 ta stiker kerak. Hozir {mine.stickers.length} ta.
          </p>
        )}
      </header>

      {/* Stikerlar to‘ri */}
      {isOwnPack ? (
        mine.isLoading && mine.stickers.length === 0 ? (
          <div className="flex justify-center py-14">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : mine.stickers.length === 0 ? (
          <EmptyPack onUpload={() => setShowUpload(true)} />
        ) : (
          <div className="grid grid-cols-3 gap-3 sm:grid-cols-5 md:grid-cols-6">
            {mine.stickers.map((entry) => (
              <div key={entry.id} className="group relative">
                <div className="flex aspect-square items-center justify-center rounded-2xl bg-muted/40 p-2">
                  <StickerView sticker={entry.stickerItem} size={72} />
                </div>
                <button
                  type="button"
                  aria-label="Stikerni o‘chirish"
                  onClick={async () => {
                    try {
                      await mine.remove(entry);
                      toast({ title: 'Stiker o\u2018chirildi' });
                    } catch {
                      toast({
                        title: 'Stikerni o\u2018chirib bo\u2018lmadi',
                        variant: 'destructive',
                      });
                    }
                  }}
                  className="absolute -right-1.5 -top-1.5 flex h-7 w-7 items-center justify-center rounded-full bg-destructive text-destructive-foreground opacity-0 shadow transition-opacity focus-visible:opacity-100 group-hover:opacity-100"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        )
      ) : guestStickers.length === 0 ? (
        <div className="py-14 text-center text-sm text-muted-foreground">
          Bu paketda hali stiker yo‘q
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-3 sm:grid-cols-5 md:grid-cols-6">
          {guestStickers.map((sticker) => (
            <div
              key={sticker.key}
              className="flex aspect-square items-center justify-center rounded-2xl bg-muted/40 p-2"
            >
              <StickerView sticker={sticker} size={72} />
            </div>
          ))}
        </div>
      )}

      <StickerUploadDialog
        open={showUpload}
        onOpenChange={setShowUpload}
        upload={mine.upload}
        stage={mine.stage}
        remainingToday={mine.remainingToday}
        dailyLimit={mine.dailyLimit}
        onUploaded={() => void loadPack()}
      />
    </div>
  );
}

function EmptyPack({ onUpload }: { onUpload: () => void }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-2xl border-2 border-dashed border-border py-14 text-center">
      <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
        <ImagePlus className="h-5 w-5" />
      </span>
      <div>
        <p className="text-sm font-medium">Paket hali bo‘sh</p>
        <p className="text-xs text-muted-foreground">
          Rasm yuklang — fon avtomatik o‘chiriladi va 512×512 stiker tayyorlanadi
        </p>
      </div>
      <Button type="button" onClick={onUpload}>
        <ImagePlus className="mr-1.5 h-4 w-4" />
        Birinchi stikerni yuklash
      </Button>
    </div>
  );
}

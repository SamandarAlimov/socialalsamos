import { useEffect, useMemo, useState } from 'react';
import { Bookmark, FolderPlus, Loader2, Plus, Settings2, Trash2, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { ProfilePostsGrid } from '@/components/profile/ProfilePostsGrid';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import { useSavedPostPlaylists } from '@/hooks/useSavedPostPlaylists';

interface SavedPostsPanelProps {
  isOwnProfile: boolean;
  profile: {
    id: string;
    username: string | null;
    avatar_url: string | null;
    display_name: string | null;
    is_verified?: boolean | null;
  };
}

const PLAYLIST_NAME_SUGGESTIONS = ['G‘oyalar', 'Marketing', 'Keyin ko‘raman'];

function getErrorMessage(error: unknown, fallback: string) {
  const value = error as { code?: string; message?: string } | null;
  if (value?.code === '23505') return 'Bu nomdagi playlist allaqachon mavjud.';
  if (value?.code === '23514') return '“Saved” nomi default playlist uchun band.';
  return value?.message || fallback;
}

export function SavedPostsPanel({ isOwnProfile, profile }: SavedPostsPanelProps) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const {
    playlists,
    defaultPlaylist,
    allSavedPosts,
    playlistPostIds,
    isLoading,
    error,
    refresh,
    createPlaylist,
    deletePlaylist,
    updatePlaylistPosts,
  } = useSavedPostPlaylists();

  const [selectedPlaylistId, setSelectedPlaylistId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [manageOpen, setManageOpen] = useState(false);
  const [newPlaylistName, setNewPlaylistName] = useState('');
  const [draftPostIds, setDraftPostIds] = useState<Set<string>>(() => new Set());
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (playlists.length === 0) {
      setSelectedPlaylistId(null);
      return;
    }

    setSelectedPlaylistId((current) => {
      if (current && playlists.some((playlist) => playlist.id === current)) return current;
      return defaultPlaylist?.id ?? playlists[0].id;
    });
  }, [defaultPlaylist?.id, playlists]);

  const selectedPlaylist = useMemo(
    () => playlists.find((playlist) => playlist.id === selectedPlaylistId) ?? defaultPlaylist,
    [defaultPlaylist, playlists, selectedPlaylistId],
  );

  const visiblePosts = useMemo(() => {
    if (!selectedPlaylist || selectedPlaylist.is_default) return allSavedPosts;
    const ids = new Set(playlistPostIds[selectedPlaylist.id] ?? []);
    return allSavedPosts.filter((post) => ids.has(post.id));
  }, [allSavedPosts, playlistPostIds, selectedPlaylist]);

  const trimmedPlaylistName = newPlaylistName.trim();
  const isReservedPlaylistName = trimmedPlaylistName.toLocaleLowerCase() === 'saved';
  const canCreatePlaylist = Boolean(trimmedPlaylistName && !isReservedPlaylistName && !saving);

  const playlistNameSuggestions = useMemo(
    () =>
      PLAYLIST_NAME_SUGGESTIONS.filter(
        (suggestion) =>
          !playlists.some(
            (playlist) => playlist.name.trim().toLocaleLowerCase() === suggestion.toLocaleLowerCase(),
          ),
      ),
    [playlists],
  );

  const openManageDialog = () => {
    if (!selectedPlaylist || selectedPlaylist.is_default) return;
    setDraftPostIds(new Set(playlistPostIds[selectedPlaylist.id] ?? []));
    setManageOpen(true);
  };

  const handleCreateOpenChange = (open: boolean) => {
    if (!open && saving) return;
    setCreateOpen(open);
    if (!open) setNewPlaylistName('');
  };

  const handleCreatePlaylist = async () => {
    const name = newPlaylistName.trim();
    if (!name || name.toLocaleLowerCase() === 'saved') return;

    setSaving(true);
    try {
      const playlist = await createPlaylist(name);
      setNewPlaylistName('');
      setCreateOpen(false);
      setSelectedPlaylistId(playlist.id);
      toast({
        title: t('common.success', { defaultValue: 'Tayyor' }),
        description: 'Yangi saved playlist yaratildi.',
      });
    } catch (createError) {
      toast({
        title: t('common.error', { defaultValue: 'Xatolik' }),
        description: getErrorMessage(createError, 'Playlist yaratib bo‘lmadi.'),
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  const handleSavePlaylistPosts = async () => {
    if (!selectedPlaylist || selectedPlaylist.is_default) return;

    setSaving(true);
    try {
      await updatePlaylistPosts(selectedPlaylist.id, Array.from(draftPostIds));
      setManageOpen(false);
      toast({
        title: t('common.success', { defaultValue: 'Tayyor' }),
        description: 'Playlist postlari yangilandi.',
      });
    } catch (saveError) {
      toast({
        title: t('common.error', { defaultValue: 'Xatolik' }),
        description: getErrorMessage(saveError, 'Playlistni yangilab bo‘lmadi.'),
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  const handleDeletePlaylist = async () => {
    if (!selectedPlaylist || selectedPlaylist.is_default) return;
    const shouldDelete = window.confirm(`“${selectedPlaylist.name}” playlistini o‘chirasizmi? Saved postlarning o‘zi o‘chmaydi.`);
    if (!shouldDelete) return;

    setSaving(true);
    try {
      await deletePlaylist(selectedPlaylist.id);
      setSelectedPlaylistId(defaultPlaylist?.id ?? null);
      toast({
        title: t('common.success', { defaultValue: 'Tayyor' }),
        description: 'Playlist o‘chirildi. Postlar Saved bo‘limida saqlanib qoldi.',
      });
    } catch (deleteError) {
      toast({
        title: t('common.error', { defaultValue: 'Xatolik' }),
        description: getErrorMessage(deleteError, 'Playlistni o‘chirib bo‘lmadi.'),
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  if (!isOwnProfile) return null;

  if (isLoading) {
    return (
      <div className="mt-4 space-y-4">
        <div className="flex gap-2 overflow-hidden">
          <Skeleton className="h-9 w-24 rounded-full" />
          <Skeleton className="h-9 w-28 rounded-full" />
          <Skeleton className="h-9 w-10 rounded-full" />
        </div>
        {[0, 1].map((item) => (
          <Skeleton key={item} className="h-64 rounded-2xl" />
        ))}
      </div>
    );
  }

  return (
    <div className="mt-4">
      <div className="mb-4 flex items-center gap-2">
        <div className="min-w-0 flex-1 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <div className="flex w-max items-center gap-2">
            {playlists.map((playlist) => {
              const active = playlist.id === selectedPlaylist?.id;
              const count = playlist.is_default
                ? allSavedPosts.length
                : (playlistPostIds[playlist.id] ?? []).length;

              return (
                <button
                  key={playlist.id}
                  type="button"
                  onClick={() => setSelectedPlaylistId(playlist.id)}
                  className={`rounded-full border px-3 py-1.5 text-sm font-medium transition-colors ${
                    active
                      ? 'border-foreground bg-foreground text-background'
                      : 'border-border bg-card text-foreground hover:bg-muted'
                  }`}
                >
                  {playlist.is_default ? t('profile.tabs.saved', { defaultValue: 'Saved' }) : playlist.name}
                  <span className="ml-1.5 opacity-70">{count}</span>
                </button>
              );
            })}

            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-9 rounded-full px-3"
              onClick={() => {
                setNewPlaylistName('');
                setCreateOpen(true);
              }}
            >
              <Plus className="mr-1.5 h-4 w-4" />
              Playlist
            </Button>
          </div>
        </div>

        {selectedPlaylist && !selectedPlaylist.is_default ? (
          <div className="flex shrink-0 items-center gap-1">
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="h-9 w-9 rounded-full"
              aria-label="Playlist postlarini boshqarish"
              onClick={openManageDialog}
            >
              <Settings2 className="h-4 w-4" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-9 w-9 rounded-full text-muted-foreground hover:text-destructive"
              aria-label="Playlistni o‘chirish"
              onClick={handleDeletePlaylist}
              disabled={saving}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        ) : null}
      </div>

      {error ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-destructive/20 bg-destructive/5 px-4 py-10 text-center">
          <Bookmark className="mb-3 h-10 w-10 text-destructive/70" />
          <p className="font-medium">Saved postlarni yuklab bo‘lmadi.</p>
          <Button variant="outline" size="sm" className="mt-4 rounded-full" onClick={() => void refresh()}>
            Qayta urinish
          </Button>
        </div>
      ) : visiblePosts.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center text-muted-foreground">
          {selectedPlaylist && !selectedPlaylist.is_default ? (
            <FolderPlus className="mb-4 h-16 w-16 opacity-50" />
          ) : (
            <Bookmark className="mb-4 h-16 w-16 opacity-50" />
          )}
          <p className="text-lg font-medium">
            {selectedPlaylist && !selectedPlaylist.is_default
              ? 'Bu playlist hozircha bo‘sh'
              : 'Saved postlar hozircha yo‘q'}
          </p>
          <p className="mt-1 max-w-sm text-sm">
            {selectedPlaylist && !selectedPlaylist.is_default
              ? 'Sozlash tugmasi orqali Saved postlardan ushbu playlistga qo‘shing.'
              : 'Postdagi bookmark tugmasini bossangiz, u avtomatik Saved playlistga tushadi.'}
          </p>
          {selectedPlaylist && !selectedPlaylist.is_default && allSavedPosts.length > 0 ? (
            <Button variant="outline" size="sm" className="mt-4 rounded-full" onClick={openManageDialog}>
              <Plus className="mr-1.5 h-4 w-4" />
              Post qo‘shish
            </Button>
          ) : null}
        </div>
      ) : (
        <ProfilePostsGrid
          posts={visiblePosts}
          isOwnProfile={isOwnProfile}
          profile={profile}
          layout="feed"
        />
      )}

      <Sheet open={createOpen} onOpenChange={handleCreateOpenChange}>
        <SheetContent
          side="bottom"
          hideDefaultClose
          overlayClassName="bg-black/60 backdrop-blur-[2px]"
          className="mx-auto w-full max-w-lg gap-0 rounded-t-[30px] border-x border-t border-border/60 bg-background p-0 pb-safe shadow-2xl sm:bottom-5 sm:rounded-[28px] sm:border"
        >
          <div className="mx-auto mt-2.5 h-1.5 w-10 rounded-full bg-muted-foreground/20 sm:hidden" />

          <div className="px-5 pb-5 pt-4 sm:px-6 sm:pb-6 sm:pt-6">
            <SheetHeader className="relative pr-11 text-left">
              <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                <FolderPlus className="h-5 w-5" />
              </div>
              <SheetTitle className="text-[22px] font-semibold tracking-tight">Yangi playlist</SheetTitle>
              <SheetDescription className="max-w-md text-sm leading-6">
                Saved postlaringizni mavzu yoki maqsad bo‘yicha tartiblang.
              </SheetDescription>

              <button
                type="button"
                aria-label="Yopish"
                onClick={() => handleCreateOpenChange(false)}
                disabled={saving}
                className="absolute right-0 top-0 flex h-9 w-9 items-center justify-center rounded-full bg-muted/70 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-50"
              >
                <X className="h-4.5 w-4.5" />
              </button>
            </SheetHeader>

            <div className="mt-6 space-y-4">
              <div>
                <div className="mb-2 flex items-center justify-between gap-3">
                  <label htmlFor="saved-playlist-name" className="text-sm font-medium text-foreground">
                    Playlist nomi
                  </label>
                  <span className="text-xs tabular-nums text-muted-foreground">{newPlaylistName.length}/80</span>
                </div>
                <Input
                  id="saved-playlist-name"
                  value={newPlaylistName}
                  onChange={(event) => setNewPlaylistName(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' && canCreatePlaylist) void handleCreatePlaylist();
                  }}
                  maxLength={80}
                  placeholder="Masalan: Marketing g‘oyalari"
                  aria-invalid={isReservedPlaylistName}
                  className="h-12 rounded-2xl border-border/70 bg-muted/30 px-4 text-base shadow-none focus-visible:ring-2 focus-visible:ring-primary/20"
                />
                {isReservedPlaylistName ? (
                  <p className="mt-2 text-xs font-medium text-destructive">
                    “Saved” nomi asosiy playlist uchun band.
                  </p>
                ) : (
                  <p className="mt-2 text-xs leading-5 text-muted-foreground">
                    Qisqa va esda qoladigan nom tanlang. Keyin postlarni qo‘shishingiz mumkin.
                  </p>
                )}
              </div>

              {playlistNameSuggestions.length > 0 ? (
                <div>
                  <p className="mb-2 text-xs font-medium text-muted-foreground">Tezkor variantlar</p>
                  <div className="flex flex-wrap gap-2">
                    {playlistNameSuggestions.map((suggestion) => {
                      const selected = trimmedPlaylistName.toLocaleLowerCase() === suggestion.toLocaleLowerCase();
                      return (
                        <button
                          key={suggestion}
                          type="button"
                          onClick={() => setNewPlaylistName(suggestion)}
                          className={`rounded-full border px-3.5 py-2 text-sm font-medium transition-colors ${
                            selected
                              ? 'border-primary/40 bg-primary/10 text-primary'
                              : 'border-border/70 bg-background text-foreground hover:bg-muted/60'
                          }`}
                        >
                          {suggestion}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ) : null}
            </div>

            <Button
              type="button"
              onClick={() => void handleCreatePlaylist()}
              disabled={!canCreatePlaylist}
              className="mt-6 h-12 w-full rounded-2xl text-[15px] font-semibold shadow-sm"
            >
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FolderPlus className="mr-2 h-4 w-4" />}
              {saving ? 'Yaratilmoqda…' : 'Playlist yaratish'}
            </Button>
          </div>
        </SheetContent>
      </Sheet>

      <Dialog open={manageOpen} onOpenChange={setManageOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{selectedPlaylist?.name ?? 'Playlist'} postlari</DialogTitle>
            <DialogDescription>
              Ushbu playlistga qo‘shiladigan Saved postlarni belgilang. Default Saved playlist o‘zgarmaydi.
            </DialogDescription>
          </DialogHeader>

          <div className="max-h-[55vh] space-y-2 overflow-y-auto pr-1">
            {allSavedPosts.length === 0 ? (
              <div className="py-8 text-center text-sm text-muted-foreground">
                Avval kamida bitta postni Saved qiling.
              </div>
            ) : (
              allSavedPosts.map((post) => {
                const checked = draftPostIds.has(post.id);
                const thumbnail = post.media_urls?.[0] ?? null;
                const title = post.content?.trim() || 'Media post';
                const author = post.profile?.display_name || post.profile?.username || 'Alsamos user';

                return (
                  <label
                    key={post.id}
                    className="flex cursor-pointer items-center gap-3 rounded-2xl border border-border p-2.5 transition-colors hover:bg-muted/60"
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => {
                        setDraftPostIds((current) => {
                          const next = new Set(current);
                          if (checked) next.delete(post.id);
                          else next.add(post.id);
                          return next;
                        });
                      }}
                      className="h-4 w-4 rounded border-border"
                    />
                    <div className="h-12 w-12 shrink-0 overflow-hidden rounded-xl bg-muted">
                      {thumbnail ? (
                        <img src={thumbnail} alt="" className="h-full w-full object-cover" />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center">
                          <Bookmark className="h-5 w-5 text-muted-foreground" />
                        </div>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{title}</p>
                      <p className="truncate text-xs text-muted-foreground">{author}</p>
                    </div>
                  </label>
                );
              })
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setManageOpen(false)} disabled={saving}>
              Bekor qilish
            </Button>
            <Button onClick={() => void handleSavePlaylistPosts()} disabled={saving}>
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Saqlash
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

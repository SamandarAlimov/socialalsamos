import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import { ArrowLeft, Check, ImagePlus, Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';

import { ProfileCoverSurface } from '@/components/profile/ProfileCoverSurface';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuth } from '@/contexts/AuthContext';
import { useUserProfile } from '@/hooks/useUserProfile';
import { useToast } from '@/hooks/use-toast';
import { db } from '@/lib/db';
import { uploadMedia } from '@/lib/mediaUpload';
import {
  DEFAULT_PROFILE_COVER_PRESET,
  PROFILE_COVER_PRESETS,
  type ProfileCoverPresetId,
  isProfileCoverPresetId,
} from '@/lib/profileCovers';
import { cn } from '@/lib/utils';

export default function ProfileCoverPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();
  const { profile, isLoading, refresh } = useUserProfile();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [selectedPreset, setSelectedPreset] = useState<ProfileCoverPresetId | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  const currentPreset: ProfileCoverPresetId | null = profile?.cover_url
    ? null
    : isProfileCoverPresetId(profile?.cover_preset)
      ? profile.cover_preset
      : DEFAULT_PROFILE_COVER_PRESET;

  useEffect(() => {
    if (!profile) return;
    setSelectedPreset(currentPreset);
  }, [profile?.cover_preset, profile?.cover_url]);

  const handleUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !user) return;

    setUploading(true);
    try {
      const uploaded = await uploadMedia(file, { type: 'avatar', visibility: 'public' });
      const { error } = await db
        .from('profiles')
        .update({ cover_url: uploaded.url, cover_preset: null })
        .eq('id', user.id);
      if (error) throw error;

      refresh?.();
      toast({
        title: t('common.success'),
        description: t('profile.coverUpdated', { defaultValue: 'Muqova yangilandi' }),
      });
      navigate('/profile', { replace: true });
    } catch (error: any) {
      toast({
        title: t('common.error'),
        description: error?.message || t('profile.coverUploadFailed'),
        variant: 'destructive',
      });
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleSave = async () => {
    if (!user || !selectedPreset || selectedPreset === currentPreset) return;

    setSaving(true);
    try {
      const { error } = await db
        .from('profiles')
        .update({
          cover_url: null,
          cover_preset: selectedPreset === DEFAULT_PROFILE_COVER_PRESET ? null : selectedPreset,
        })
        .eq('id', user.id);
      if (error) throw error;

      refresh?.();
      toast({
        title: t('common.success'),
        description: t('profile.coverPicker.applied', { defaultValue: 'Muqova dizayni qo‘llandi' }),
      });
      navigate('/profile', { replace: true });
    } catch (error: any) {
      toast({
        title: t('common.error'),
        description: error?.message || t('profile.coverPicker.applyFailed', { defaultValue: 'Muqovani yangilab bo‘lmadi' }),
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  const isWorking = saving || uploading;
  const hasChanges = Boolean(selectedPreset && selectedPreset !== currentPreset);
  const premiumPresets = PROFILE_COVER_PRESETS.filter(
    (preset) => preset.id !== DEFAULT_PROFILE_COVER_PRESET,
  );

  if (isLoading || !profile) {
    return (
      <div className="min-h-[100dvh] bg-background">
        <div className="border-b border-border/60 px-4 py-4">
          <Skeleton className="h-8 w-32 rounded-lg" />
        </div>
        <div className="mx-auto max-w-4xl space-y-5 px-4 py-5">
          <div className="grid grid-cols-2 gap-3">
            <Skeleton className="aspect-[1.25/1] rounded-[24px]" />
            <Skeleton className="aspect-[1.25/1] rounded-[24px]" />
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {Array.from({ length: 6 }).map((_, index) => (
              <Skeleton key={index} className="aspect-[1.35/1] rounded-[22px]" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[100dvh] bg-background text-foreground">
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleUpload}
      />

      <header className="sticky top-0 z-30 border-b border-border/55 bg-background/92 backdrop-blur-2xl supports-[backdrop-filter]:bg-background/82">
        <div className="mx-auto flex h-16 max-w-4xl items-center gap-3 px-3 sm:px-4">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-10 w-10 shrink-0 rounded-full"
            onClick={() => navigate('/profile')}
            aria-label={t('common.back', { defaultValue: 'Orqaga' })}
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <h1 className="text-lg font-semibold tracking-[-0.02em] sm:text-xl">
            {t('profile.coverPicker.pageTitle', { defaultValue: 'Muqova' })}
          </h1>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-4 pb-[calc(112px+env(safe-area-inset-bottom))] pt-5 sm:px-5 sm:pt-7">
        <section className="grid grid-cols-2 gap-3 sm:gap-4">
          <button
            type="button"
            disabled={isWorking}
            onClick={() => fileInputRef.current?.click()}
            className={cn(
              'group overflow-hidden rounded-[24px] border bg-card text-left shadow-sm transition duration-200 active:scale-[0.985] disabled:pointer-events-none disabled:opacity-55',
              currentPreset === null && selectedPreset === null
                ? 'border-foreground/80 ring-1 ring-foreground/10'
                : 'border-border/70 hover:border-foreground/25',
            )}
          >
            <div className="relative aspect-[1.75/1] overflow-hidden bg-gradient-to-br from-zinc-950 via-zinc-800 to-zinc-600">
              {profile.cover_url ? (
                <img
                  src={profile.cover_url}
                  alt=""
                  className="absolute inset-0 h-full w-full object-cover"
                />
              ) : null}
              <div className="absolute inset-0 bg-gradient-to-t from-black/35 via-black/5 to-white/5" />
              <span className="absolute left-1/2 top-1/2 flex h-11 w-11 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-white/20 bg-black/35 text-white shadow-xl backdrop-blur-xl transition group-hover:scale-105">
                {uploading ? <Loader2 className="h-5 w-5 animate-spin" /> : <ImagePlus className="h-5 w-5" />}
              </span>
              {currentPreset === null && selectedPreset === null ? (
                <span className="absolute right-2.5 top-2.5 flex h-7 w-7 items-center justify-center rounded-full bg-white text-black shadow-lg">
                  <Check className="h-4 w-4" strokeWidth={2.5} />
                </span>
              ) : null}
            </div>
            <div className="px-3.5 py-3 sm:px-4">
              <p className="truncate text-sm font-semibold tracking-[-0.01em] sm:text-base">
                {t('profile.coverPicker.gallery', { defaultValue: 'Galereyadan' })}
              </p>
            </div>
          </button>

          <button
            type="button"
            disabled={isWorking}
            onClick={() => setSelectedPreset(DEFAULT_PROFILE_COVER_PRESET)}
            className={cn(
              'group overflow-hidden rounded-[24px] border bg-card text-left shadow-sm transition duration-200 active:scale-[0.985] disabled:pointer-events-none disabled:opacity-55',
              selectedPreset === DEFAULT_PROFILE_COVER_PRESET
                ? 'border-foreground/80 ring-1 ring-foreground/10'
                : 'border-border/70 hover:border-foreground/25',
            )}
          >
            <div className="relative aspect-[1.75/1] overflow-hidden">
              <ProfileCoverSurface presetId={DEFAULT_PROFILE_COVER_PRESET} />
              {selectedPreset === DEFAULT_PROFILE_COVER_PRESET ? (
                <span className="absolute right-2.5 top-2.5 flex h-7 w-7 items-center justify-center rounded-full bg-background text-foreground shadow-lg ring-1 ring-black/10">
                  <Check className="h-4 w-4" strokeWidth={2.5} />
                </span>
              ) : null}
            </div>
            <div className="px-3.5 py-3 sm:px-4">
              <p className="truncate text-sm font-semibold tracking-[-0.01em] sm:text-base">
                {t('profile.coverPicker.default', { defaultValue: 'Default' })}
              </p>
            </div>
          </button>
        </section>

        <section className="mt-8 sm:mt-10">
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground sm:mb-4">
            {t('profile.coverPicker.collection', { defaultValue: 'Alsamos kolleksiyasi' })}
          </h2>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4">
            {premiumPresets.map((preset) => {
              const selected = selectedPreset === preset.id;
              return (
                <button
                  key={preset.id}
                  type="button"
                  disabled={isWorking}
                  onClick={() => setSelectedPreset(preset.id)}
                  aria-pressed={selected}
                  className={cn(
                    'group overflow-hidden rounded-[22px] border bg-card text-left shadow-sm transition duration-200 active:scale-[0.985] disabled:pointer-events-none disabled:opacity-55',
                    selected
                      ? 'border-foreground/80 ring-1 ring-foreground/10'
                      : 'border-border/70 hover:border-foreground/25 hover:shadow-md',
                  )}
                >
                  <div className="relative aspect-[2.05/1] overflow-hidden">
                    <ProfileCoverSurface presetId={preset.id} />
                    {selected ? (
                      <span className="absolute right-2.5 top-2.5 flex h-7 w-7 items-center justify-center rounded-full bg-background text-foreground shadow-lg ring-1 ring-black/10">
                        <Check className="h-4 w-4" strokeWidth={2.5} />
                      </span>
                    ) : null}
                  </div>
                  <div className="px-3.5 py-3">
                    <p className="truncate text-sm font-medium tracking-[-0.01em] sm:text-[15px]">
                      {preset.name}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>
        </section>
      </main>

      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-border/55 bg-background/90 px-4 pb-[calc(12px+env(safe-area-inset-bottom))] pt-3 backdrop-blur-2xl supports-[backdrop-filter]:bg-background/80">
        <div className="mx-auto max-w-4xl">
          <Button
            type="button"
            onClick={handleSave}
            disabled={!hasChanges || isWorking}
            className="h-12 w-full rounded-2xl bg-foreground text-sm font-semibold text-background shadow-lg hover:bg-foreground/90 disabled:opacity-40 sm:h-11 sm:w-auto sm:min-w-36 sm:px-8"
          >
            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            {t('common.save', { defaultValue: 'Saqlash' })}
          </Button>
        </div>
      </div>
    </div>
  );
}

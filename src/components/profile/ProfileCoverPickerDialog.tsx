import { useEffect, useState } from 'react';
import { Check, ImagePlus, Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { ProfileCoverSurface } from '@/components/profile/ProfileCoverSurface';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  DEFAULT_PROFILE_COVER_PRESET,
  PROFILE_COVER_PRESETS,
  type ProfileCoverPresetId,
  isProfileCoverPresetId,
} from '@/lib/profileCovers';
import { cn } from '@/lib/utils';

interface ProfileCoverPickerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  coverUrl?: string | null;
  coverPreset?: string | null;
  saving?: boolean;
  uploading?: boolean;
  onApplyPreset: (presetId: ProfileCoverPresetId) => Promise<void> | void;
  onUploadClick: () => void;
}

export function ProfileCoverPickerDialog({
  open,
  onOpenChange,
  coverUrl,
  coverPreset,
  saving = false,
  uploading = false,
  onApplyPreset,
  onUploadClick,
}: ProfileCoverPickerDialogProps) {
  const { t } = useTranslation();
  const [selectedPreset, setSelectedPreset] = useState<ProfileCoverPresetId>(
    isProfileCoverPresetId(coverPreset) ? coverPreset : DEFAULT_PROFILE_COVER_PRESET,
  );

  useEffect(() => {
    if (!open) return;
    setSelectedPreset(
      isProfileCoverPresetId(coverPreset) ? coverPreset : DEFAULT_PROFILE_COVER_PRESET,
    );
  }, [coverPreset, open]);

  const isWorking = saving || uploading;

  const applyPreset = async () => {
    await onApplyPreset(selectedPreset);
  };

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => !isWorking && onOpenChange(nextOpen)}>
      <DialogContent className="max-h-[min(84dvh,760px)] w-[calc(100vw-24px)] max-w-2xl overflow-hidden rounded-[28px] border-border/70 bg-background p-0 shadow-2xl sm:w-full">
        <DialogHeader className="border-b border-border/70 px-5 pb-4 pt-5 text-left sm:px-6 sm:pt-6">
          <DialogTitle className="text-xl font-semibold tracking-[-0.02em] sm:text-2xl">
            {t('profile.coverPicker.title', { defaultValue: 'Muqovani tanlang' })}
          </DialogTitle>
          <DialogDescription className="max-w-xl text-sm leading-relaxed">
            {t('profile.coverPicker.description', {
              defaultValue: 'Alsamos dizaynlaridan birini tanlang yoki o‘zingizning rasmingizni yuklang.',
            })}
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 overflow-y-auto px-5 py-5 sm:px-6">
          {coverUrl ? (
            <div className="mb-5">
              <div className="mb-2 flex items-center justify-between gap-3">
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                  {t('profile.coverPicker.currentPhoto', { defaultValue: 'Hozirgi rasm' })}
                </p>
                <span className="rounded-full border border-border bg-muted/55 px-2.5 py-1 text-[11px] font-medium text-muted-foreground">
                  {t('profile.coverPicker.custom', { defaultValue: 'Shaxsiy' })}
                </span>
              </div>
              <div className="relative aspect-[3.4/1] overflow-hidden rounded-2xl border border-border/70 bg-muted">
                <ProfileCoverSurface coverUrl={coverUrl} />
              </div>
            </div>
          ) : null}

          <div className="mb-2 flex items-center justify-between gap-3">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
              {t('profile.coverPicker.collection', { defaultValue: 'Alsamos kolleksiyasi' })}
            </p>
            <span className="text-xs text-muted-foreground">
              {PROFILE_COVER_PRESETS.length} {t('profile.coverPicker.designs', { defaultValue: 'dizayn' })}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {PROFILE_COVER_PRESETS.map((preset) => {
              const selected = selectedPreset === preset.id;
              const isDefault = preset.id === DEFAULT_PROFILE_COVER_PRESET;

              return (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => setSelectedPreset(preset.id)}
                  disabled={isWorking}
                  aria-pressed={selected}
                  className={cn(
                    'group min-w-0 rounded-2xl border p-1.5 text-left transition duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-55',
                    selected
                      ? 'border-foreground bg-muted/55 shadow-sm'
                      : 'border-border/70 bg-background hover:border-foreground/35 hover:bg-muted/35',
                  )}
                >
                  <div className="relative aspect-[2.3/1] overflow-hidden rounded-xl bg-muted">
                    <ProfileCoverSurface presetId={preset.id} />
                    {selected ? (
                      <span className="absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-full bg-background text-foreground shadow-md ring-1 ring-black/10">
                        <Check className="h-3.5 w-3.5" strokeWidth={2.5} />
                      </span>
                    ) : null}
                    {isDefault ? (
                      <span className={cn(
                        'absolute bottom-2 left-2 rounded-full px-2 py-0.5 text-[10px] font-semibold backdrop-blur-md',
                        preset.tone === 'dark' ? 'bg-white/15 text-white' : 'bg-black/10 text-black/70',
                      )}>
                        {t('profile.coverPicker.default', { defaultValue: 'Default' })}
                      </span>
                    ) : null}
                  </div>
                  <p className="truncate px-1 pb-0.5 pt-2 text-xs font-medium text-foreground sm:text-sm">
                    {preset.name}
                  </p>
                </button>
              );
            })}
          </div>
        </div>

        <DialogFooter className="flex-row items-center justify-between gap-2 border-t border-border/70 bg-background/95 px-5 py-4 sm:px-6">
          <Button
            type="button"
            variant="outline"
            className="h-10 rounded-xl px-3 sm:px-4"
            onClick={onUploadClick}
            disabled={isWorking}
          >
            {uploading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ImagePlus className="mr-2 h-4 w-4" />}
            {t('profile.coverPicker.upload', { defaultValue: 'Rasm yuklash' })}
          </Button>
          <Button
            type="button"
            className="h-10 rounded-xl bg-foreground px-5 text-background hover:bg-foreground/90"
            onClick={applyPreset}
            disabled={isWorking}
          >
            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            {t('profile.coverPicker.apply', { defaultValue: 'Qo‘llash' })}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

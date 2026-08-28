import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { Button } from '@/components/ui/button';
import { FileText, Film, Gauge, ImageIcon, Mic, RotateCcw, Wifi } from 'lucide-react';
import { useMediaAutoDownload } from '@/hooks/useMediaAutoDownload';
import {
  AUTO_DOWNLOAD_MODE_LABELS,
  AutoDownloadMode,
  CONNECTION_LABELS,
  MAX_FILE_MB_MAX,
  MAX_FILE_MB_MIN,
  MAX_VIDEO_MB_MAX,
  MAX_VIDEO_MB_MIN,
  MEDIA_CATEGORY_LABELS,
  MediaCategory,
} from '@/lib/mediaAutoDownload';
import { cn } from '@/lib/utils';

const MODES: AutoDownloadMode[] = ['always', 'wifi', 'never'];

const CATEGORY_ICONS: Record<MediaCategory, typeof ImageIcon> = {
  photo: ImageIcon,
  video: Film,
  file: FileText,
  voice: Mic,
  gif: Film,
};

const CATEGORIES: MediaCategory[] = ['photo', 'video', 'file', 'voice', 'gif'];

interface MediaAutoDownloadEditorProps {
  className?: string;
}

/**
 * Telegramdagi "Ma'lumotlar va xotira" bo'limi.
 * Har bir media turi uchun avtomatik yuklash rejimi, hajm chegaralari
 * va avtomatik o'ynatish sozlamalari.
 */
export function MediaAutoDownloadEditor({ className }: MediaAutoDownloadEditorProps) {
  const { settings, connection, isDefault, setMode, update, reset } = useMediaAutoDownload();

  return (
    <div className={cn('space-y-5', className)}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold">Media avtomatik yuklab olish</h3>
          <p className="text-xs text-muted-foreground">
            Qaysi fayllar o'zi yuklanishini boshqaring. Mobil internetni tejash uchun
            "Faqat Wi-Fi" yoki "Hech qachon" ni tanlang.
          </p>
        </div>
        {!isDefault && (
          <Button
            variant="ghost"
            size="sm"
            className="shrink-0 gap-1.5"
            onClick={reset}
            title="Standart holatga qaytarish"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Tiklash
          </Button>
        )}
      </div>

      <div className="flex items-center gap-2 rounded-xl bg-muted/50 px-3 py-2 text-xs">
        <Wifi className="h-4 w-4 shrink-0 text-primary" />
        <span className="text-muted-foreground">
          Hozirgi ulanish: <span className="font-medium text-foreground">{CONNECTION_LABELS[connection]}</span>
        </span>
      </div>

      {/* Ma'lumot tejash */}
      <div className="flex items-center justify-between gap-3 rounded-xl border border-border p-3">
        <div className="flex min-w-0 items-start gap-3">
          <Gauge className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
          <div className="min-w-0">
            <p className="text-sm font-medium">Ma'lumot tejash</p>
            <p className="text-xs text-muted-foreground">
              Yoqilganda hech qanday media avtomatik yuklanmaydi.
            </p>
          </div>
        </div>
        <Switch
          checked={settings.dataSaver}
          onCheckedChange={(checked) => update({ dataSaver: checked })}
          aria-label="Ma'lumot tejash"
        />
      </div>

      <Separator />

      {/* Har bir tur uchun rejim */}
      <div className="space-y-2">
        {CATEGORIES.map((category) => {
          const Icon = CATEGORY_ICONS[category];
          return (
            <div
              key={category}
              className={cn(
                'flex items-center justify-between gap-3 rounded-xl px-1 py-2',
                settings.dataSaver && 'opacity-50'
              )}
            >
              <div className="flex min-w-0 items-center gap-3">
                <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                <span className="truncate text-sm">{MEDIA_CATEGORY_LABELS[category]}</span>
              </div>
              <Select
                value={settings[category]}
                onValueChange={(value) => setMode(category, value as AutoDownloadMode)}
                disabled={settings.dataSaver}
              >
                <SelectTrigger className="h-9 w-[150px] shrink-0 rounded-xl">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MODES.map((mode) => (
                    <SelectItem key={mode} value={mode}>
                      {AUTO_DOWNLOAD_MODE_LABELS[mode]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          );
        })}
      </div>

      <Separator />

      {/* Hajm chegaralari */}
      <div className="space-y-4">
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span>Video uchun chegara</span>
            <span className="font-medium text-muted-foreground">{settings.maxVideoMb} MB</span>
          </div>
          <Slider
            value={[settings.maxVideoMb]}
            min={MAX_VIDEO_MB_MIN}
            max={MAX_VIDEO_MB_MAX}
            step={1}
            onValueChange={([value]) => update({ maxVideoMb: value })}
            aria-label="Video hajmi chegarasi"
          />
          <p className="text-xs text-muted-foreground">
            Bundan katta videolar faqat siz bosganda yuklanadi.
          </p>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span>Fayl uchun chegara</span>
            <span className="font-medium text-muted-foreground">{settings.maxFileMb} MB</span>
          </div>
          <Slider
            value={[settings.maxFileMb]}
            min={MAX_FILE_MB_MIN}
            max={MAX_FILE_MB_MAX}
            step={1}
            onValueChange={([value]) => update({ maxFileMb: value })}
            aria-label="Fayl hajmi chegarasi"
          />
        </div>
      </div>

      <Separator />

      {/* Avtomatik o'ynatish */}
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-3 rounded-xl px-1 py-2">
          <div className="min-w-0">
            <p className="text-sm">Videolarni avtomatik o'ynatish</p>
            <p className="text-xs text-muted-foreground">Chatda ovozsiz holda o'ynaydi.</p>
          </div>
          <Switch
            checked={settings.autoplayVideo}
            onCheckedChange={(checked) => update({ autoplayVideo: checked })}
            aria-label="Videolarni avtomatik o'ynatish"
          />
        </div>
        <div className="flex items-center justify-between gap-3 rounded-xl px-1 py-2">
          <div className="min-w-0">
            <p className="text-sm">GIF va animatsiyalarni o'ynatish</p>
            <p className="text-xs text-muted-foreground">
              O'chirilsa, animatsiyalar bosilganda ishga tushadi.
            </p>
          </div>
          <Switch
            checked={settings.autoplayGif}
            onCheckedChange={(checked) => update({ autoplayGif: checked })}
            aria-label="GIF avtomatik o'ynatish"
          />
        </div>
      </div>
    </div>
  );
}

export default MediaAutoDownloadEditor;

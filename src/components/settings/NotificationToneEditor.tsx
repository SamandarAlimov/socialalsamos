import { Bell, BellOff, Moon, Play, RotateCcw, Volume2, Vibrate, Eye, AtSign } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { useNotificationSettings } from '@/hooks/useNotificationSettings';
import {
  NotificationTone,
  TONE_LABELS,
  TONE_ORDER,
} from '@/lib/notificationSettings';

type ToneRowProps = {
  title: string;
  description: string;
  value: NotificationTone;
  onChange: (tone: NotificationTone) => void;
  onPreview: (tone: NotificationTone) => void;
};

function ToneRow({ title, description, value, onChange, onPreview }: ToneRowProps) {
  return (
    <div className="space-y-2">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium">{title}</p>
          <p className="text-xs text-muted-foreground">{description}</p>
        </div>
        <Button
          type="button"
          size="icon"
          variant="ghost"
          className="h-8 w-8 shrink-0"
          onClick={() => onPreview(value)}
          aria-label="Tovushni eshitish"
        >
          <Play className="h-4 w-4" />
        </Button>
      </div>
      <div className="flex flex-wrap gap-2">
        {TONE_ORDER.map((tone) => (
          <button
            key={tone}
            type="button"
            onClick={() => {
              onChange(tone);
              onPreview(tone);
            }}
            className={cn(
              'rounded-full border px-3 py-1.5 text-xs font-medium transition-colors',
              value === tone
                ? 'border-primary bg-primary/10 text-primary'
                : 'border-border text-muted-foreground hover:bg-muted'
            )}
          >
            {TONE_LABELS[tone]}
          </button>
        ))}
      </div>
    </div>
  );
}

type SwitchRowProps = {
  icon: React.ReactNode;
  title: string;
  description: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
};

function SwitchRow({ icon, title, description, checked, onCheckedChange }: SwitchRowProps) {
  return (
    <div className="flex items-center justify-between gap-3 py-2">
      <div className="flex min-w-0 items-start gap-3">
        <span className="mt-0.5 text-muted-foreground">{icon}</span>
        <div className="min-w-0">
          <p className="text-sm font-medium">{title}</p>
          <p className="text-xs text-muted-foreground">{description}</p>
        </div>
      </div>
      <Switch checked={checked} onCheckedChange={onCheckedChange} />
    </div>
  );
}

/**
 * Telegramdek bildirishnoma tovushlari, tungi jimlik jadvali va
 * ko'rinish sozlamalari. Tovushlar brauzerda sintez qilinadi.
 */
export function NotificationToneEditor({ className }: { className?: string }) {
  const { settings, update, reset, preview, isDefault, inQuietHours } = useNotificationSettings();

  return (
    <div className={cn('space-y-5', className)}>
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Bell className="h-4 w-4 text-primary" />
          <p className="text-sm font-semibold">Bildirishnoma tovushlari</p>
        </div>
        {!isDefault && (
          <Button type="button" variant="ghost" size="sm" className="h-8 gap-1 text-xs" onClick={reset}>
            <RotateCcw className="h-3.5 w-3.5" />
            Tiklash
          </Button>
        )}
      </div>

      {inQuietHours && (
        <div className="flex items-center gap-2 rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground">
          <BellOff className="h-3.5 w-3.5" />
          Hozir tungi jimlik vaqti \u2014 tovushlar o\u2018chirilgan.
        </div>
      )}

      <div className="space-y-5 rounded-xl border border-border/60 p-4">
        <ToneRow
          title="Shaxsiy xabarlar"
          description="Bir kishidan kelgan xabar tovushi"
          value={settings.messageTone}
          onChange={(tone) => update({ messageTone: tone })}
          onPreview={preview}
        />
        <ToneRow
          title="Guruh va kanallar"
          description="Guruh yoki kanal xabarlari tovushi"
          value={settings.groupTone}
          onChange={(tone) => update({ groupTone: tone })}
          onPreview={preview}
        />
        <ToneRow
          title="Yuborilgan xabar"
          description="Siz xabar yuborganda eshitiladi"
          value={settings.sentTone}
          onChange={(tone) => update({ sentTone: tone })}
          onPreview={preview}
        />
      </div>

      <div className="space-y-3 rounded-xl border border-border/60 p-4">
        <div className="flex items-center gap-2">
          <Volume2 className="h-4 w-4 text-muted-foreground" />
          <Label className="text-sm font-medium">Tovush balandligi</Label>
          <span className="ml-auto text-xs text-muted-foreground">{Math.round(settings.volume * 100)}%</span>
        </div>
        <Slider
          value={[Math.round(settings.volume * 100)]}
          min={0}
          max={100}
          step={5}
          onValueChange={(value) => update({ volume: (value[0] ?? 0) / 100 })}
        />
      </div>

      <div className="rounded-xl border border-border/60 p-4">
        <SwitchRow
          icon={<Volume2 className="h-4 w-4" />}
          title="Ilova ichidagi tovushlar"
          description="Chat ochiq bo'lganda ham tovush chiqadi"
          checked={settings.inAppSounds}
          onCheckedChange={(checked) => update({ inAppSounds: checked })}
        />
        <SwitchRow
          icon={<Vibrate className="h-4 w-4" />}
          title="Tebranish"
          description="Mobil qurilmada yengil tebranish"
          checked={settings.vibrate}
          onCheckedChange={(checked) => update({ vibrate: checked })}
        />
        <SwitchRow
          icon={<Eye className="h-4 w-4" />}
          title="Xabar matnini ko'rsatish"
          description="Bildirishnomada xabar mazmuni ko'rinadi"
          checked={settings.showPreview}
          onCheckedChange={(checked) => update({ showPreview: checked })}
        />
        <SwitchRow
          icon={<AtSign className="h-4 w-4" />}
          title="Faqat eslatmalar"
          description="Guruhlarda faqat sizni eslatganda bildiriladi"
          checked={settings.mentionsOnly}
          onCheckedChange={(checked) => update({ mentionsOnly: checked })}
        />
      </div>

      <div className="space-y-3 rounded-xl border border-border/60 p-4">
        <SwitchRow
          icon={<Moon className="h-4 w-4" />}
          title="Tungi jimlik"
          description="Belgilangan vaqt oralig'ida tovushlar o'chadi"
          checked={settings.quietHoursEnabled}
          onCheckedChange={(checked) => update({ quietHoursEnabled: checked })}
        />
        {settings.quietHoursEnabled && (
          <div className="grid grid-cols-2 gap-3 pt-1">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Boshlanishi</Label>
              <Input
                type="time"
                value={settings.quietFrom}
                onChange={(e) => update({ quietFrom: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Tugashi</Label>
              <Input
                type="time"
                value={settings.quietTo}
                onChange={(e) => update({ quietTo: e.target.value })}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default NotificationToneEditor;

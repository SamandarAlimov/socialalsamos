import { BatteryCharging, RotateCcw, Type } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { useChatAppearance } from '@/hooks/useChatAppearance';
import {
  CORNERS_MAX,
  CORNERS_MIN,
  FONT_SIZE_MAX,
  FONT_SIZE_MIN,
  bubblePreviewStyle,
} from '@/lib/chatAppearance';

interface ChatAppearanceEditorProps {
  className?: string;
}

/** Xabar matni o'lchami, puffak burchaklari va energiya tejash sozlamalari */
export function ChatAppearanceEditor({ className }: ChatAppearanceEditorProps) {
  const { appearance, isDefault, setFontSize, setCorners, setEnergySaver, reset } = useChatAppearance();
  const preview = bubblePreviewStyle(appearance);

  return (
    <div className={'space-y-6 ' + (className || '')}>
      {/* Ko'rinish namunasi */}
      <div className="space-y-2 rounded-2xl border border-border bg-muted/40 p-4">
        <div
          className="max-w-[75%] bg-card px-3 py-2 text-card-foreground shadow-sm"
          style={preview}
        >
          Xabar matni shunday ko'rinadi
        </div>
        <div
          className="ml-auto max-w-[75%] bg-primary px-3 py-2 text-primary-foreground shadow-sm"
          style={preview}
        >
          Sizning javobingiz
        </div>
      </div>

      {/* Matn o'lchami */}
      <div className="space-y-2">
        <div className="flex items-center justify-between text-sm">
          <span className="flex items-center gap-2 font-medium text-foreground">
            <Type className="h-4 w-4" />
            Xabar matni o'lchami
          </span>
          <span className="text-muted-foreground">{appearance.fontSize}px</span>
        </div>
        <Slider
          value={[appearance.fontSize]}
          min={FONT_SIZE_MIN}
          max={FONT_SIZE_MAX}
          step={1}
          onValueChange={(value) => setFontSize(value[0] ?? FONT_SIZE_MIN)}
        />
      </div>

      {/* Burchaklar */}
      <div className="space-y-2">
        <div className="flex items-center justify-between text-sm">
          <span className="font-medium text-foreground">Xabar burchaklari</span>
          <span className="text-muted-foreground">{appearance.corners}px</span>
        </div>
        <Slider
          value={[appearance.corners]}
          min={CORNERS_MIN}
          max={CORNERS_MAX}
          step={1}
          onValueChange={(value) => setCorners(value[0] ?? CORNERS_MIN)}
        />
      </div>

      {/* Energiya tejash */}
      <div className="flex items-center justify-between gap-4 rounded-xl border border-border p-3">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-500/10 text-amber-500">
            <BatteryCharging className="h-[18px] w-[18px]" />
          </span>
          <div>
            <p className="text-sm font-medium text-foreground">Energiya tejash</p>
            <p className="text-xs text-muted-foreground">
              Animatsiya va o'tishlar cheklanadi, batareya kamroq sarflanadi
            </p>
          </div>
        </div>
        <Switch checked={appearance.energySaver} onCheckedChange={setEnergySaver} />
      </div>

      <Button variant="ghost" className="w-full gap-2" onClick={reset} disabled={isDefault}>
        <RotateCcw className="h-4 w-4" />
        Standart ko'rinishga qaytarish
      </Button>
    </div>
  );
}

export default ChatAppearanceEditor;

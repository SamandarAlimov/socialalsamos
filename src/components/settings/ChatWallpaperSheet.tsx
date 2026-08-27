import { useRef } from 'react';
import { Check, ImagePlus, Loader2, RotateCcw } from 'lucide-react';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useToast } from '@/hooks/use-toast';
import { useFileUpload } from '@/hooks/useFileUpload';
import { useChatWallpaper } from '@/hooks/useChatWallpaper';
import {
  CHAT_WALLPAPER_PRESETS,
  wallpaperPreviewStyle,
} from '@/lib/chatWallpaper';

interface ChatWallpaperSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** Telegramdagidek chat foni tanlash oynasi */
export function ChatWallpaperSheet({ open, onOpenChange }: ChatWallpaperSheetProps) {
  const { wallpaper, setPreset, setCustomImage, update, reset } = useChatWallpaper();
  const { uploadFile, uploading } = useFileUpload();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handlePickImage = async (file: File | undefined) => {
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      toast({
        title: 'Faqat rasm',
        description: 'Fon uchun rasm faylini tanlang',
        variant: 'destructive',
      });
      return;
    }

    const uploaded = await uploadFile(file);
    if (!uploaded) {
      toast({
        title: 'Yuklanmadi',
        description: 'Rasmni yuklashda xatolik yuz berdi',
        variant: 'destructive',
      });
      return;
    }

    setCustomImage(uploaded.url);
    toast({ title: 'Fon o\u2018zgartirildi' });
  };

  const previewStyle = wallpaperPreviewStyle(wallpaper);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-md p-0 flex flex-col">
        <SheetHeader className="px-4 pt-4 pb-2 text-left">
          <SheetTitle>Chat foni</SheetTitle>
          <SheetDescription>
            Fonni tanlang yoki o\u2018z rasmingizni yuklang. Tanlov shu qurilmada saqlanadi.
          </SheetDescription>
        </SheetHeader>

        <ScrollArea className="flex-1">
          <div className="px-4 pb-6 space-y-6">
            {/* Jonli ko'rinish */}
            <div
              className="relative overflow-hidden rounded-2xl border border-border"
              style={previewStyle}
            >
              <div
                className="absolute inset-0"
                style={{ backgroundColor: 'rgba(0,0,0,' + wallpaper.dim + ')' }}
              />
              <div className="relative space-y-2 p-4">
                <div className="max-w-[75%] rounded-2xl rounded-bl-md bg-card px-3 py-2 text-sm text-card-foreground shadow-sm">
                  Salom! Yangi fon qanday?
                </div>
                <div className="ml-auto max-w-[75%] rounded-2xl rounded-br-md bg-primary px-3 py-2 text-sm text-primary-foreground shadow-sm">
                  Juda chiroyli ✨
                </div>
              </div>
            </div>

            {/* Tayyor fonlar */}
            <div className="space-y-3">
              <p className="text-sm font-medium text-foreground">Tayyor fonlar</p>
              <div className="grid grid-cols-4 gap-2">
                {CHAT_WALLPAPER_PRESETS.map((preset) => {
                  const selected = wallpaper.id === preset.id;
                  return (
                    <button
                      key={preset.id}
                      type="button"
                      onClick={() => setPreset(preset)}
                      className={
                        'relative aspect-[3/4] overflow-hidden rounded-xl border transition-transform active:scale-95 ' +
                        (selected ? 'border-primary ring-2 ring-primary/40' : 'border-border')
                      }
                      style={wallpaperPreviewStyle(preset)}
                      aria-label={preset.name}
                      title={preset.name}
                    >
                      {preset.kind === 'none' && (
                        <span className="absolute inset-0 flex items-center justify-center bg-muted text-[10px] text-muted-foreground">
                          Standart
                        </span>
                      )}
                      {selected && (
                        <span className="absolute right-1 top-1 rounded-full bg-primary p-0.5 text-primary-foreground">
                          <Check className="h-3 w-3" />
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* O'z rasmi */}
            <div className="space-y-2">
              <p className="text-sm font-medium text-foreground">O\u2018z rasmingiz</p>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(event) => {
                  handlePickImage(event.target.files?.[0]);
                  event.target.value = '';
                }}
              />
              <Button
                variant="outline"
                className="w-full justify-start gap-2"
                disabled={uploading}
                onClick={() => fileInputRef.current?.click()}
              >
                {uploading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <ImagePlus className="h-4 w-4" />
                )}
                {uploading ? 'Yuklanmoqda...' : 'Galereyadan rasm tanlash'}
              </Button>
            </div>

            {/* Sozlashlar */}
            <div className="space-y-5">
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium text-foreground">Qoraytirish</span>
                  <span className="text-muted-foreground">
                    {Math.round(wallpaper.dim * 100)}%
                  </span>
                </div>
                <Slider
                  value={[Math.round(wallpaper.dim * 100)]}
                  min={0}
                  max={80}
                  step={5}
                  onValueChange={(value) => update({ dim: (value[0] ?? 0) / 100 })}
                />
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium text-foreground">Xiralashtirish (blur)</span>
                  <span className="text-muted-foreground">{wallpaper.blur}px</span>
                </div>
                <Slider
                  value={[wallpaper.blur]}
                  min={0}
                  max={24}
                  step={1}
                  onValueChange={(value) => update({ blur: value[0] ?? 0 })}
                />
              </div>
            </div>

            <Button variant="ghost" className="w-full gap-2" onClick={reset}>
              <RotateCcw className="h-4 w-4" />
              Standart fonga qaytarish
            </Button>
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}

export default ChatWallpaperSheet;

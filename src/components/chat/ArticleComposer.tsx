import { useRef, useState } from 'react';
import { Eye, ImagePlus, Loader2, Pencil, Send, Trash2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useToast } from '@/hooks/use-toast';
import { useFileUpload } from '@/hooks/useFileUpload';
import { buildArticlePayload, estimateReadingMinutes } from '@/lib/messageFormat';
import { FormatToolbar } from './FormatToolbar';
import { FormattedBlocks } from './FormattedBlocks';

interface ArticleComposerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Tayyor maqola payload'ini yuboradi */
  onSubmit: (payload: string) => void;
  initialTitle?: string;
  initialBody?: string;
}

/** Uzun matnni "maqola" sifatida yozish oynasi */
export function ArticleComposer({
  open,
  onOpenChange,
  onSubmit,
  initialTitle,
  initialBody,
}: ArticleComposerProps) {
  const [title, setTitle] = useState(initialTitle || '');
  const [body, setBody] = useState(initialBody || '');
  const [cover, setCover] = useState<string | null>(null);
  const [preview, setPreview] = useState(false);

  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const { uploadFile, uploading } = useFileUpload();
  const { toast } = useToast();

  const readingMinutes = estimateReadingMinutes(body);
  const canSend = title.trim().length > 0 && body.trim().length > 0;

  const handleCover = async (file: File | undefined) => {
    if (!file) return;

    const uploaded = await uploadFile(file);
    if (!uploaded) {
      toast({ title: 'Yuklanmadi', description: 'Muqova rasmini yuklab bo\u2018lmadi', variant: 'destructive' });
      return;
    }

    setCover(uploaded.url);
  };

  const handleSubmit = () => {
    if (!canSend) return;

    onSubmit(buildArticlePayload({ title, body, cover }));
    setTitle('');
    setBody('');
    setCover(null);
    setPreview(false);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[92vh] w-[96vw] max-w-2xl flex-col gap-3 p-0 sm:w-full">
        <DialogHeader className="px-4 pt-4 text-left">
          <DialogTitle>Maqola yozish</DialogTitle>
          <DialogDescription>
            Uzun matnni formatlab, maqola ko'rinishida yuboring. Sarlavha, iqtibos, ro'yxat va kod
            bloklari qo'llab-quvvatlanadi.
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center justify-between gap-2 px-4">
          <div className="text-xs text-muted-foreground">
            {body.trim() ? readingMinutes + ' daqiqalik o\u2018qish' : 'Matn kiriting'}
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="gap-2"
            onClick={() => setPreview((value) => !value)}
          >
            {preview ? <Pencil className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            {preview ? 'Tahrirlash' : "Ko'rish"}
          </Button>
        </div>

        <ScrollArea className="max-h-[62vh] flex-1">
          <div className="space-y-3 px-4 pb-2">
            {preview ? (
              <div className="rounded-2xl border border-border p-4">
                {cover && (
                  <img
                    src={cover}
                    alt={title}
                    className="mb-3 max-h-56 w-full rounded-xl object-cover"
                  />
                )}
                <h1 className="mb-3 text-2xl font-bold text-foreground">{title || 'Sarlavhasiz'}</h1>
                <FormattedBlocks text={body} />
              </div>
            ) : (
              <>
                <Input
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  placeholder="Maqola sarlavhasi"
                  className="text-base font-semibold"
                />

                {cover ? (
                  <div className="relative">
                    <img src={cover} alt="Muqova" className="max-h-48 w-full rounded-xl object-cover" />
                    <Button
                      type="button"
                      variant="secondary"
                      size="icon"
                      className="absolute right-2 top-2 h-8 w-8"
                      onClick={() => setCover(null)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ) : (
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full justify-start gap-2"
                    disabled={uploading}
                    onClick={() => fileRef.current?.click()}
                  >
                    {uploading ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <ImagePlus className="h-4 w-4" />
                    )}
                    Muqova rasmi (ixtiyoriy)
                  </Button>
                )}

                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(event) => {
                    handleCover(event.target.files?.[0]);
                    event.target.value = '';
                  }}
                />

                <div className="rounded-xl border border-border">
                  <FormatToolbar
                    targetRef={bodyRef}
                    value={body}
                    onChange={setBody}
                    extended
                    className="border-b border-border px-1 py-1"
                  />
                  <Textarea
                    ref={bodyRef}
                    value={body}
                    onChange={(event) => setBody(event.target.value)}
                    placeholder={'Maqola matni...\n\n## Sarlavha\n> iqtibos\n- ro\u2018yxat'}
                    className="min-h-[240px] resize-y border-0 focus-visible:ring-0"
                  />
                </div>
              </>
            )}
          </div>
        </ScrollArea>

        <div className="flex items-center justify-end gap-2 border-t border-border px-4 py-3">
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            Bekor qilish
          </Button>
          <Button type="button" className="gap-2" disabled={!canSend} onClick={handleSubmit}>
            <Send className="h-4 w-4" />
            Yuborish
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default ArticleComposer;

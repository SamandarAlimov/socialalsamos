import { useEffect, useMemo, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { db } from '@/lib/db';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { RichTextComposer } from '@/components/create/RichTextComposer';
import type { PostVisibility } from '@/hooks/usePosts';
import {
  normalizeAlsamosRichTextDocument,
  richTextDocumentFromLegacyContent,
  richTextDocumentToPlainText,
  type AlsamosRichTextDocument,
} from '@/lib/richTextDocument';

interface EditPostDialogProps {
  postId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialContent?: string;
  onUpdated?: (content: string) => void;
}

const MAX_POST_TEXT_LENGTH = 5000;

export function EditPostDialog({
  postId,
  open,
  onOpenChange,
  initialContent = '',
  onUpdated,
}: EditPostDialogProps) {
  const { user } = useAuth();
  const [content, setContent] = useState(initialContent);
  const [formattedContent, setFormattedContent] = useState<AlsamosRichTextDocument | null>(null);
  const [visibility, setVisibility] = useState<PostVisibility>('public');
  const [editorVersion, setEditorVersion] = useState(0);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;

    let cancelled = false;
    setLoading(true);

    void db
      .from('posts')
      .select('content, visibility, formatted_content')
      .eq('id', postId)
      .maybeSingle()
      .then(({ data, error }: { data: any; error: any }) => {
        if (cancelled) return;

        if (error) {
          console.error('Post edit yuklash xatosi:', error);
          toast.error("Postni yuklab bo‘lmadi");
          setLoading(false);
          return;
        }

        const storedContent = String(data?.content ?? initialContent ?? '');
        const structured =
          normalizeAlsamosRichTextDocument(data?.formatted_content) ??
          richTextDocumentFromLegacyContent(storedContent);

        setFormattedContent(structured);
        setContent(richTextDocumentToPlainText(structured));
        setVisibility(
          data?.visibility === 'friends' || data?.visibility === 'private'
            ? data.visibility
            : 'public',
        );
        setEditorVersion((current) => current + 1);
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [initialContent, open, postId]);

  const overLimit = content.length > MAX_POST_TEXT_LENGTH;
  const canSave = useMemo(
    () => Boolean(user) && !loading && !saving && !overLimit,
    [loading, overLimit, saving, user],
  );

  const handleSave = async () => {
    if (!user || !canSave) return;

    setSaving(true);
    try {
      const document =
        formattedContent ?? richTextDocumentFromLegacyContent(content);

      const { error } = await db
        .from('posts')
        .update({
          content,
          formatted_content: document,
          visibility,
          updated_at: new Date().toISOString(),
        })
        .eq('id', postId)
        .eq('user_id', user.id);

      if (error) throw error;

      toast.success('Post yangilandi');
      onUpdated?.(content);
      onOpenChange(false);
    } catch (error) {
      console.error('Postni yangilash xatosi:', error);
      toast.error("Postni yangilab bo‘lmadi");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !saving && onOpenChange(next)}>
      <DialogContent className="flex max-h-[92dvh] max-w-2xl flex-col overflow-hidden p-0">
        <DialogHeader className="shrink-0 border-b border-border/60 px-5 pb-4 pt-5">
          <DialogTitle>Postni tahrirlash</DialogTitle>
          <DialogDescription>
            Matn formatlari va post ko‘rinishini professional tarzda yangilang.
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-4">
          {loading ? (
            <div className="flex items-center justify-center py-14">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="space-y-5">
              <div className="space-y-2">
                <Label>Matn</Label>
                <RichTextComposer
                  key={`${postId}-${editorVersion}`}
                  value={formattedContent}
                  onChange={({ plainText, formattedContent: document }) => {
                    setContent(plainText);
                    setFormattedContent(document);
                  }}
                  placeholder="Post matnini tahrirlang..."
                />
                <div className="flex justify-end">
                  <p
                    className={
                      overLimit
                        ? 'text-xs font-medium text-destructive'
                        : 'text-xs text-muted-foreground'
                    }
                  >
                    {content.length}/{MAX_POST_TEXT_LENGTH}
                  </p>
                </div>
              </div>

              <div className="space-y-2">
                <Label>Kim ko‘radi</Label>
                <Select
                  value={visibility}
                  onValueChange={(value) => setVisibility(value as PostVisibility)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="z-[10000]">
                    <SelectItem value="public">Hamma</SelectItem>
                    <SelectItem value="friends">Do‘stlar</SelectItem>
                    <SelectItem value="private">Faqat men</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="shrink-0 gap-2 border-t border-border/60 px-5 py-4">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={saving}
          >
            Bekor qilish
          </Button>
          <Button type="button" onClick={() => void handleSave()} disabled={!canSave}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Saqlash
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

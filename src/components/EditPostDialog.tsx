import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
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

interface EditPostDialogProps {
  postId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialContent?: string;
  onUpdated?: (content: string) => void;
}

const extractHashtags = (text: string) =>
  Array.from(new Set((text.match(/#[\p{L}0-9_]+/gu) || []).map((t) => t.slice(1).toLowerCase())));

export function EditPostDialog({
  postId,
  open,
  onOpenChange,
  initialContent = '',
  onUpdated,
}: EditPostDialogProps) {
  const { user } = useAuth();
  const [content, setContent] = useState(initialContent);
  const [visibility, setVisibility] = useState<string>('public');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    supabase
      .from('posts')
      .select('content, visibility')
      .eq('id', postId)
      .maybeSingle()
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) {
          toast.error("Postni yuklab bo'lmadi");
        } else if (data) {
          setContent(data.content ?? initialContent ?? '');
          setVisibility(data.visibility ?? 'public');
        }
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, postId]);

  const handleSave = async () => {
    if (!user) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from('posts')
        .update({
          content,
          hashtags: extractHashtags(content),
          visibility,
          updated_at: new Date().toISOString(),
        })
        .eq('id', postId)
        .eq('user_id', user.id);

      if (error) throw error;

      toast.success('Post yangilandi');
      onUpdated?.(content);
      onOpenChange(false);
    } catch (e) {
      console.error('Error updating post:', e);
      toast.error("Postni yangilab bo'lmadi");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Postni tahrirlash</DialogTitle>
          <DialogDescription>Matn va ko'rinish sozlamalarini o'zgartiring.</DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-10">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="edit-post-content">Matn</Label>
              <Textarea
                id="edit-post-content"
                value={content}
                onChange={(e) => setContent(e.target.value)}
                rows={6}
                maxLength={5000}
                placeholder="Nima haqida o'ylayapsiz?"
                className="resize-none"
              />
              <p className="text-xs text-muted-foreground text-right">{content.length}/5000</p>
            </div>

            <div className="space-y-2">
              <Label>Ko'rinish</Label>
              <Select value={visibility} onValueChange={setVisibility}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="z-[10000]">
                  <SelectItem value="public">Hamma</SelectItem>
                  <SelectItem value="followers">Obunachilar</SelectItem>
                  <SelectItem value="private">Faqat men</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Bekor qilish
          </Button>
          <Button onClick={handleSave} disabled={saving || loading}>
            {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Saqlash
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

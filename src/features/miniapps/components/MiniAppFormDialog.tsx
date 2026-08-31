import { useEffect, useState } from 'react';
import { Loader2, ShieldCheck } from 'lucide-react';

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
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { uploadMedia } from '@/lib/mediaUpload';

import { createMiniApp, deleteMiniApp, updateMiniApp } from '../api';
import { normalizeMiniAppUrl } from '../openStrategy';
import type { MiniApp, MiniAppCategory, MiniAppType } from '../types';
import { MINI_APP_TYPE_LABELS } from '../types';

interface MiniAppFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userId: string | null;
  categories: MiniAppCategory[];
  app?: MiniApp | null;
  onSaved: () => void;
}

const URL_ERRORS: Record<string, string> = {
  empty: 'Manzil kiritilmagan',
  malformed: 'Manzil formati noto’g’ri',
  scheme_not_allowed: 'Faqat https manzillar qabul qilinadi',
  private_host: 'Ichki tarmoq manzillari qabul qilinmaydi',
  no_host: 'Domen aniqlanmadi',
};

export function MiniAppFormDialog({
  open,
  onOpenChange,
  userId,
  categories,
  app,
  onSaved,
}: MiniAppFormDialogProps) {
  const { toast } = useToast();
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [shortDescription, setShortDescription] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('other');
  const [appType, setAppType] = useState<MiniAppType>('link');
  const [iconUrl, setIconUrl] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [urlError, setUrlError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setName(app?.name ?? '');
    setUrl(app?.url ?? '');
    setShortDescription(app?.shortDescription ?? '');
    setDescription(app?.description ?? '');
    setCategory(app?.category ?? categories[0]?.id ?? 'other');
    setAppType(app?.appType ?? 'link');
    setIconUrl(app?.iconUrl ?? null);
    setUrlError(null);
  }, [app, categories, open]);

  const handleIcon = async (file: File | null) => {
    if (!file) return;
    setUploading(true);
    try {
      const result = (await uploadMedia(file, {
        type: 'miniapp',
        visibility: 'public',
      })) as unknown as { url?: string; publicUrl?: string } | string;
      const uploaded =
        typeof result === 'string' ? result : result?.url ?? result?.publicUrl ?? null;
      if (!uploaded) throw new Error('Ikonka yuklanmadi');
      setIconUrl(uploaded);
    } catch (error) {
      toast({
        title: 'Ikonka yuklanmadi',
        description: error instanceof Error ? error.message : 'Xatolik',
        variant: 'destructive',
      });
    } finally {
      setUploading(false);
    }
  };

  const handleSubmit = async () => {
    if (!name.trim()) {
      toast({ title: 'Nom kiriting', variant: 'destructive' });
      return;
    }

    const normalized = normalizeMiniAppUrl(url);
    if (!normalized.ok) {
      setUrlError(URL_ERRORS[normalized.reason] ?? 'Manzil qabul qilinmadi');
      return;
    }
    setUrlError(null);

    setSaving(true);
    try {
      const draft = {
        name,
        url: normalized.url,
        shortDescription: shortDescription.trim() || null,
        description: description.trim() || null,
        category,
        appType,
        iconUrl,
      };

      if (app) {
        await updateMiniApp(app.id, draft);
      } else {
        if (!userId) throw new Error('Avval tizimga kiring');
        await createMiniApp(userId, draft);
      }

      toast({
        title: app ? 'Saqlandi' : 'Yuborildi',
        description: 'Ilova moderatsiyadan so’ng ro’yxatda ko’rinadi.',
      });
      onOpenChange(false);
      onSaved();
    } catch (error) {
      toast({
        title: 'Saqlanmadi',
        description: error instanceof Error ? error.message : 'Xatolik',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!app) return;
    setSaving(true);
    try {
      await deleteMiniApp(app.id);
      toast({ title: 'O’chirildi' });
      onOpenChange(false);
      onSaved();
    } catch (error) {
      toast({
        title: 'O’chirilmadi',
        description: error instanceof Error ? error.message : 'Xatolik',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{app ? 'Ilovani tahrirlash' : 'Mini app qo’shish'}</DialogTitle>
          <DialogDescription>
            Havola turi uchun API talab qilinmaydi — saytingiz manzilini kiritsangiz kifoya.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Ilova turi</Label>
            <Select value={appType} onValueChange={(value) => setAppType(value as MiniAppType)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(['link', 'webapp', 'bot'] as MiniAppType[]).map((type) => (
                  <SelectItem key={type} value={type}>
                    {MINI_APP_TYPE_LABELS[type]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              {appType === 'link' && 'Sayt yoki portfolio havolasi. Eng oson yo’l.'}
              {appType === 'webapp' && 'Alsamos SDK bilan ishlaydigan to’liq web ilova.'}
              {appType === 'bot' && 'Bot orqali ishlaydigan ilova (Telegram uslubida).'}
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="mini-app-name">Nomi *</Label>
            <Input
              id="mini-app-name"
              value={name}
              maxLength={64}
              onChange={(event) => setName(event.target.value)}
              placeholder="Masalan: Islom.uz"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="mini-app-url">Manzil (https) *</Label>
            <Input
              id="mini-app-url"
              value={url}
              onChange={(event) => {
                setUrl(event.target.value);
                setUrlError(null);
              }}
              placeholder="islom.uz"
              inputMode="url"
            />
            {urlError && <p className="text-xs text-destructive">{urlError}</p>}
          </div>

          <div className="space-y-2">
            <Label htmlFor="mini-app-short">Qisqa tavsif</Label>
            <Input
              id="mini-app-short"
              value={shortDescription}
              maxLength={120}
              onChange={(event) => setShortDescription(event.target.value)}
              placeholder="Bir qatorda ilova nima qiladi"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="mini-app-description">To’liq tavsif</Label>
            <Textarea
              id="mini-app-description"
              value={description}
              rows={4}
              maxLength={4000}
              onChange={(event) => setDescription(event.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label>Kategoriya</Label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {categories.map((item) => (
                  <SelectItem key={item.id} value={item.id}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="mini-app-icon">Ikonka</Label>
            <div className="flex items-center gap-3">
              {iconUrl && (
                <img
                  src={iconUrl}
                  alt="Ikonka"
                  className="h-12 w-12 rounded-xl border object-cover"
                />
              )}
              <Input
                id="mini-app-icon"
                type="file"
                accept="image/*"
                disabled={uploading}
                onChange={(event) => void handleIcon(event.target.files?.[0] ?? null)}
              />
            </div>
          </div>

          <div className="flex items-start gap-2 rounded-lg bg-muted/50 p-3 text-xs text-muted-foreground">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
            Yangi yoki manzili o’zgargan ilovalar moderatsiyaga tushadi. Kompaniya nomidan e’lon
            qilish uchun publisher profilini tasdiqlash talab qilinadi.
          </div>
        </div>

        <DialogFooter className="gap-2 sm:justify-between">
          {app ? (
            <Button variant="destructive" disabled={saving} onClick={() => void handleDelete()}>
              O’chirish
            </Button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
              Bekor qilish
            </Button>
            <Button onClick={() => void handleSubmit()} disabled={saving || uploading}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {app ? 'Saqlash' : 'Yuborish'}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

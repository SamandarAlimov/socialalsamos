import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Bot, Globe, Link2, Loader2, ShieldCheck, Trash2 } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { uploadMedia } from '@/lib/mediaUpload';

import {
  createMiniApp,
  deleteMiniApp,
  fetchMiniAppCategories,
  updateMiniApp,
} from '@/features/miniapps/api';
import { MiniAppApiPanel } from '@/features/miniapps/components/MiniAppApiPanel';
import { fetchMiniAppForEdit } from '@/features/miniapps/manage/api';
import { normalizeMiniAppUrl } from '@/features/miniapps/openStrategy';
import {
  MINI_APP_TYPE_LABELS,
  type MiniAppCategory,
  type MiniAppType,
} from '@/features/miniapps/types';

const URL_ERRORS: Record<string, string> = {
  empty: 'Manzil kiritilmagan',
  malformed: 'Manzil formati noto’g’ri',
  scheme_not_allowed: 'Faqat https manzillar qabul qilinadi',
  private_host: 'Ichki tarmoq manzillari qabul qilinmaydi',
  no_host: 'Domen aniqlanmadi',
};

const FALLBACK_CATEGORIES: MiniAppCategory[] = [
  { id: 'religion', sortOrder: 10, icon: null, label: 'Diniy' },
  { id: 'education', sortOrder: 20, icon: null, label: 'Ta’lim' },
  { id: 'tools', sortOrder: 30, icon: null, label: 'Asboblar' },
  { id: 'other', sortOrder: 999, icon: null, label: 'Boshqa' },
];

const TYPE_OPTIONS: Array<{ id: MiniAppType; icon: typeof Link2 }> = [
  { id: 'link', icon: Link2 },
  { id: 'webapp', icon: Globe },
  { id: 'bot', icon: Bot },
];

/**
 * Mini app qo’shish/tahrirlash — alohida sahifa.
 * Tur tanlash bosiladigan kartalar orqali: dialog ichidagi Select ochilmaslik
 * muammosi butunlay yo’qoladi.
 */
export default function MiniAppSubmitPage() {
  const { appId } = useParams<{ appId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();

  const isEditing = Boolean(appId);

  const [categories, setCategories] = useState<MiniAppCategory[]>(FALLBACK_CATEGORIES);
  const [loading, setLoading] = useState(isEditing);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  const [appType, setAppType] = useState<MiniAppType>('link');
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [shortDescription, setShortDescription] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('other');
  const [iconUrl, setIconUrl] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [urlError, setUrlError] = useState<string | null>(null);

  useEffect(() => {
    fetchMiniAppCategories('uz')
      .then((items) => {
        if (items.length > 0) setCategories(items);
      })
      .catch(() => {
        // Kategoriyalar yuklanmasa ham forma ishlashi kerak.
      });
  }, []);

  const loadApp = useCallback(async () => {
    if (!appId) return;
    setLoading(true);
    try {
      const app = await fetchMiniAppForEdit(appId);
      if (!app) {
        toast({ title: 'Ilova topilmadi', variant: 'destructive' });
        navigate('/mini-apps', { replace: true });
        return;
      }
      setAppType(app.appType);
      setName(app.name);
      setUrl(app.url);
      setShortDescription(app.shortDescription ?? '');
      setDescription(app.description ?? '');
      setCategory(app.category);
      setIconUrl(app.iconUrl);
      setStatus(app.status);
    } catch (error) {
      toast({
        title: 'Ilova yuklanmadi',
        description: error instanceof Error ? error.message : 'Xatolik',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }, [appId, navigate, toast]);

  useEffect(() => {
    void loadApp();
  }, [loadApp]);

  const categoryLabel = useMemo(
    () => categories.find((item) => item.id === category)?.label ?? category,
    [categories, category],
  );

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

      if (appId) {
        await updateMiniApp(appId, draft);
        toast({ title: 'Saqlandi' });
        navigate('/mini-apps');
        return;
      }

      if (!user?.id) throw new Error('Avval tizimga kiring');
      const createdId = await createMiniApp(user.id, draft);
      toast({
        title: 'Yuborildi',
        description: 'Ilova moderatsiyadan so’ng ro’yxatda ko’rinadi.',
      });

      // To’liq ilova (webapp/bot) uchun API kalitlari kerak — shu sahifada davom etadi.
      if (appType !== 'link' && createdId) {
        navigate('/mini-apps/' + createdId + '/edit', { replace: true });
      } else {
        navigate('/mini-apps');
      }
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
    if (!appId) return;
    setSaving(true);
    try {
      await deleteMiniApp(appId);
      toast({ title: 'O’chirildi' });
      navigate('/mini-apps');
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

  if (loading) {
    return (
      <div className="mx-auto w-full max-w-3xl px-4 pb-24 pt-6">
        <div className="h-8 w-40 animate-pulse rounded bg-muted" />
        <div className="mt-6 space-y-3">
          {Array.from({ length: 5 }).map((_, index) => (
            <div key={index} className="h-14 animate-pulse rounded-xl bg-muted/60" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-3xl px-4 pb-32 pt-4">
      <header className="mb-6 flex items-start gap-3">
        <Button
          variant="ghost"
          size="icon"
          className="mt-0.5 shrink-0"
          onClick={() => navigate('/mini-apps')}
          aria-label="Orqaga"
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight">
            {isEditing ? 'Ilovani tahrirlash' : 'Mini app qo’shish'}
          </h1>
          <p className="text-sm text-muted-foreground">
            {isEditing
              ? 'O’zgarishlar saqlangach ilova qayta moderatsiyaga tushishi mumkin.'
              : 'Bosqichlarni to’ldiring — ilova moderatsiyadan keyin katalogda ko’rinadi.'}
          </p>
          {status && (
            <Badge variant="secondary" className="mt-2 font-normal">
              Holat: {status}
            </Badge>
          )}
        </div>
      </header>

      <section className="space-y-3">
        <div className="flex items-baseline gap-2">
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
            1
          </span>
          <h2 className="text-base font-medium">Ilova turi</h2>
        </div>

        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          {TYPE_OPTIONS.map((option) => {
            const Icon = option.icon;
            const active = appType === option.id;
            return (
              <button
                key={option.id}
                type="button"
                onClick={() => setAppType(option.id)}
                aria-pressed={active}
                className={cn(
                  'flex items-center gap-2 rounded-xl border p-3 text-left text-sm transition',
                  active
                    ? 'border-primary bg-primary/5 font-medium text-foreground'
                    : 'hover:border-primary/40 hover:bg-muted/40',
                )}
              >
                <Icon className="h-4 w-4 shrink-0" />
                {MINI_APP_TYPE_LABELS[option.id]}
              </button>
            );
          })}
        </div>
      </section>

      <section className="mt-8 space-y-4">
        <div className="flex items-baseline gap-2">
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
            2
          </span>
          <h2 className="text-base font-medium">Asosiy ma’lumot</h2>
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
            rows={5}
            maxLength={4000}
            onChange={(event) => setDescription(event.target.value)}
          />
        </div>
      </section>

      <section className="mt-8 space-y-4">
        <div className="flex items-baseline gap-2">
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
            3
          </span>
          <h2 className="text-base font-medium">Ko’rinish</h2>
        </div>

        <div className="space-y-2">
          <Label>Kategoriya</Label>
          <div className="flex flex-wrap gap-1.5">
            {categories.map((item) => (
              <Badge
                key={item.id}
                variant={category === item.id ? 'default' : 'secondary'}
                className="cursor-pointer whitespace-nowrap px-2.5 py-1 font-normal"
                onClick={() => setCategory(item.id)}
              >
                {item.label}
              </Badge>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">Tanlangan: {categoryLabel}</p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="mini-app-icon">Ikonka</Label>
          <div className="flex items-center gap-3">
            {iconUrl && (
              <img
                src={iconUrl}
                alt="Ikonka"
                className="h-14 w-14 rounded-xl border object-cover"
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
      </section>

      {appType !== 'link' && (
        <section className="mt-8 space-y-3">
          <div className="flex items-baseline gap-2">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
              4
            </span>
            <h2 className="text-base font-medium">API ulanishi</h2>
          </div>
          <MiniAppApiPanel appId={appId ?? null} />
        </section>
      )}

      <div className="mt-8 flex items-start gap-2 rounded-lg bg-muted/50 p-3 text-xs text-muted-foreground">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
        Yangi yoki manzili o’zgargan ilovalar moderatsiyaga tushadi. Kompaniya nomidan e’lon
        qilish uchun publisher profilini tasdiqlash talab qilinadi.
      </div>

      <div className="sticky bottom-0 mt-6 flex flex-wrap items-center justify-between gap-2 border-t bg-background/95 py-3 backdrop-blur">
        {isEditing ? (
          <Button
            variant="ghost"
            className="text-destructive"
            disabled={saving}
            onClick={() => void handleDelete()}
          >
            <Trash2 className="mr-1 h-4 w-4" />
            O’chirish
          </Button>
        ) : (
          <span />
        )}

        <div className="flex gap-2">
          <Button variant="outline" disabled={saving} onClick={() => navigate('/mini-apps')}>
            Bekor qilish
          </Button>
          <Button disabled={saving || uploading} onClick={() => void handleSubmit()}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {isEditing ? 'Saqlash' : 'Yuborish'}
          </Button>
        </div>
      </div>
    </div>
  );
}

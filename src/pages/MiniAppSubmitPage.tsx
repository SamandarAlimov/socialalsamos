import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  Bot,
  Building2,
  Check,
  Globe,
  ImagePlus,
  Link2,
  Loader2,
  ShieldCheck,
  Star,
  Trash2,
  Users,
  X,
} from 'lucide-react';

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
import { checkHandleAvailability, fetchMiniAppForEdit } from '@/features/miniapps/manage/api';
import { probeFramability, type FrameProbeResult } from '@/features/miniapps/manage/frameProbe';
import { normalizeMiniAppUrl } from '@/features/miniapps/openStrategy';
import { listMyPublishers } from '@/features/miniapps/publishers/api';
import {
  MINI_APP_PERMISSION_LABELS,
  MINI_APP_PRICE_LABELS,
  MINI_APP_TYPE_LABELS,
  PUBLISHER_VERIFICATION_LABELS,
  type MiniAppCategory,
  type MiniAppPermission,
  type MiniAppPriceModel,
  type MiniAppType,
  type PublisherVerification,
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

const PRICE_MODELS: MiniAppPriceModel[] = ['free', 'freemium', 'paid'];

const PERMISSIONS: MiniAppPermission[] = [
  'profile',
  'notifications',
  'payments',
  'contacts',
  'location',
  'camera',
  'microphone',
  'clipboard',
  'storage',
];

const MAX_SCREENSHOTS = 6;

type PublisherOption = {
  id: string;
  name: string;
  handle: string | null;
  verification: PublisherVerification;
};

function slugifyHandleInput(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+/, '')
    .slice(0, 32);
}

/**
 * Mini app qo'shish/tahrirlash — professional yuborish oqimi.
 * Chapda forma, o'ngda jonli preview kartasi va tayyorlik ro'yxati.
 */
export default function MiniAppSubmitPage() {
  const { appId } = useParams<{ appId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();

  const isEditing = Boolean(appId);

  const [categories, setCategories] = useState<MiniAppCategory[]>(FALLBACK_CATEGORIES);
  const [publishers, setPublishers] = useState<PublisherOption[]>([]);
  const [loading, setLoading] = useState(isEditing);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadingShots, setUploadingShots] = useState(false);

  const [appType, setAppType] = useState<MiniAppType>('link');
  const [name, setName] = useState('');
  const [handle, setHandle] = useState('');
  const [handleTouched, setHandleTouched] = useState(false);
  const [handleState, setHandleState] = useState<'idle' | 'checking' | 'free' | 'taken' | 'invalid'>(
    'idle',
  );
  const [url, setUrl] = useState('');
  const [shortDescription, setShortDescription] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('other');
  const [priceModel, setPriceModel] = useState<MiniAppPriceModel>('free');
  const [permissions, setPermissions] = useState<MiniAppPermission[]>([]);
  const [iconUrl, setIconUrl] = useState<string | null>(null);
  const [screenshots, setScreenshots] = useState<string[]>([]);
  const [publisherId, setPublisherId] = useState<string | null>(null);
  const [privacyUrl, setPrivacyUrl] = useState('');
  const [supportUrl, setSupportUrl] = useState('');
  const [status, setStatus] = useState<string | null>(null);
  const [urlError, setUrlError] = useState<string | null>(null);
  const [probe, setProbe] = useState<FrameProbeResult | null>(null);
  const [probing, setProbing] = useState(false);

  const handleCheckToken = useRef(0);

  useEffect(() => {
    fetchMiniAppCategories('uz')
      .then((items) => {
        if (items.length > 0) setCategories(items);
      })
      .catch(() => {
        // Kategoriyalar yuklanmasa ham forma ishlashi kerak.
      });
  }, []);

  useEffect(() => {
    listMyPublishers()
      .then((items) => {
        const rows = items as unknown as Array<Record<string, unknown>>;
        setPublishers(
          rows.map((row) => ({
            id: String(row.id ?? ''),
            name: String(row.name ?? row.handle ?? 'Nashriyot'),
            handle: (row.handle as string | null) ?? null,
            verification: String(row.verification ?? 'unverified') as PublisherVerification,
          })),
        );
      })
      .catch(() => {
        // Publisher yo'q bo'lsa shaxsiy nomdan e'lon qilinadi.
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
      setHandle(app.handle ?? '');
      setUrl(app.url);
      setShortDescription(app.shortDescription ?? '');
      setDescription(app.description ?? '');
      setCategory(app.category);
      setPriceModel(app.priceModel);
      setPermissions(app.permissions);
      setIconUrl(app.iconUrl);
      setScreenshots(app.screenshots);
      setPublisherId(app.publisherId);
      setPrivacyUrl(app.privacyUrl ?? '');
      setSupportUrl(app.supportUrl ?? '');
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

  // @nom bandligini serverda tekshiramiz (debounce).
  useEffect(() => {
    if (!handleTouched) return;
    const candidate = handle.trim();
    if (!candidate) {
      setHandleState('idle');
      return;
    }
    if (candidate.length < 3) {
      setHandleState('invalid');
      return;
    }

    const token = ++handleCheckToken.current;
    setHandleState('checking');
    const timer = window.setTimeout(() => {
      checkHandleAvailability(candidate)
        .then((result) => {
          if (token !== handleCheckToken.current) return;
          if (result.available) {
            setHandleState('free');
            return;
          }
          setHandleState(result.reason === 'TAKEN' ? 'taken' : 'invalid');
        })
        .catch(() => {
          if (token === handleCheckToken.current) setHandleState('idle');
        });
    }, 450);

    return () => window.clearTimeout(timer);
  }, [handle, handleTouched]);

  const categoryLabel = useMemo(
    () => categories.find((item) => item.id === category)?.label ?? category,
    [categories, category],
  );

  const selectedPublisher = publishers.find((item) => item.id === publisherId) ?? null;

  const togglePermission = (permission: MiniAppPermission) => {
    setPermissions((current) =>
      current.includes(permission)
        ? current.filter((item) => item !== permission)
        : [...current, permission],
    );
  };

  const uploadOne = async (file: File): Promise<string> => {
    const result = (await uploadMedia(file, {
      type: 'miniapp',
      visibility: 'public',
    })) as unknown as { url?: string; publicUrl?: string } | string;
    const uploaded = typeof result === 'string' ? result : result?.url ?? result?.publicUrl ?? null;
    if (!uploaded) throw new Error('Fayl yuklanmadi');
    return uploaded;
  };

  const handleIcon = async (file: File | null) => {
    if (!file) return;
    setUploading(true);
    try {
      const uploaded = await uploadOne(file);
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

  const handleScreenshots = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const room = MAX_SCREENSHOTS - screenshots.length;
    if (room <= 0) {
      toast({ title: 'Limit', description: 'Ko’pi bilan 6 ta rasm.', variant: 'destructive' });
      return;
    }

    setUploadingShots(true);
    try {
      const selected = Array.from(files).slice(0, room);
      const uploaded: string[] = [];
      for (const file of selected) {
        uploaded.push(await uploadOne(file));
      }
      setScreenshots((current) => [...current, ...uploaded]);
    } catch (error) {
      toast({
        title: 'Rasmlar yuklanmadi',
        description: error instanceof Error ? error.message : 'Xatolik',
        variant: 'destructive',
      });
    } finally {
      setUploadingShots(false);
    }
  };

  const runProbe = async (): Promise<FrameProbeResult | null> => {
    const normalized = normalizeMiniAppUrl(url);
    if (!normalized.ok) {
      setUrlError(URL_ERRORS[normalized.reason] ?? 'Manzil qabul qilinmadi');
      return null;
    }
    setUrlError(null);
    setProbing(true);
    try {
      const result = await probeFramability(normalized.url);
      setProbe(result);
      return result;
    } finally {
      setProbing(false);
    }
  };

  const handleSubmit = async () => {
    if (!name.trim()) {
      toast({ title: 'Nom kiriting', variant: 'destructive' });
      return;
    }
    if (handleState === 'taken') {
      toast({ title: '@nom band', description: 'Boshqa nom tanlang.', variant: 'destructive' });
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
      // Saqlashdan oldin real tekshiruv: ichkarida ochiladimi yoki proksi kerakmi.
      const checked = probe ?? (await probeFramability(normalized.url));
      setProbe(checked);

      const draft = {
        name,
        handle: handle.trim() || null,
        url: normalized.url,
        shortDescription: shortDescription.trim() || null,
        description: description.trim() || null,
        category,
        appType,
        displayMode: checked.displayMode,
        priceModel,
        permissions,
        screenshots,
        publisherId,
        iconUrl,
        privacyUrl: privacyUrl.trim() || null,
        supportUrl: supportUrl.trim() || null,
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

  const checklist = [
    { label: 'Nom kiritildi', done: name.trim().length > 0 },
    { label: 'https manzil to’g’ri', done: normalizeMiniAppUrl(url).ok },
    { label: 'Qisqa tavsif', done: shortDescription.trim().length > 0 },
    { label: 'Ikonka', done: Boolean(iconUrl) },
    { label: 'Kamida 1 rasm', done: screenshots.length > 0 },
    { label: 'Manzil tekshirildi', done: Boolean(probe) },
  ];
  const readyCount = checklist.filter((item) => item.done).length;

  if (loading) {
    return (
      <div className="mx-auto w-full max-w-6xl px-4 pb-24 pt-6">
        <div className="h-8 w-40 animate-pulse rounded bg-muted" />
        <div className="mt-6 space-y-3">
          {Array.from({ length: 6 }).map((_, index) => (
            <div key={index} className="h-14 animate-pulse rounded-xl bg-muted/60" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-6xl px-4 pb-32 pt-4">
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
              : 'Bosqichlarni to’ldiring — o’ngda ilova qanday ko’rinishini darhol ko’rasiz.'}
          </p>
          {status && (
            <Badge variant="secondary" className="mt-2 font-normal">
              Holat: {status}
            </Badge>
          )}
        </div>
      </header>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="min-w-0">
          <section className="space-y-3">
            <SectionTitle index={1} title="Ilova turi" />
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
                        ? 'border-foreground/20 bg-muted font-medium text-foreground'
                        : 'hover:border-foreground/20 hover:bg-muted/40',
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
            <SectionTitle index={2} title={'Asosiy ma’lumot'} />

            <div className="space-y-2">
              <Label htmlFor="mini-app-name">Nomi *</Label>
              <Input
                id="mini-app-name"
                value={name}
                maxLength={64}
                onChange={(event) => {
                  setName(event.target.value);
                  if (!handleTouched && !isEditing) {
                    setHandle(slugifyHandleInput(event.target.value));
                  }
                }}
                placeholder="Masalan: Islom.uz"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="mini-app-handle">Qisqa nom (@nom)</Label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                  @
                </span>
                <Input
                  id="mini-app-handle"
                  value={handle}
                  className="pl-7 pr-9"
                  onChange={(event) => {
                    setHandleTouched(true);
                    setHandle(slugifyHandleInput(event.target.value));
                  }}
                  placeholder="islom_uz"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2">
                  {handleState === 'checking' && (
                    <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                  )}
                  {handleState === 'free' && <Check className="h-4 w-4 text-emerald-600" />}
                  {(handleState === 'taken' || handleState === 'invalid') && (
                    <X className="h-4 w-4 text-destructive" />
                  )}
                </span>
              </div>
              <p
                className={cn(
                  'text-xs',
                  handleState === 'free' && 'text-emerald-600',
                  (handleState === 'taken' || handleState === 'invalid') && 'text-destructive',
                  (handleState === 'idle' || handleState === 'checking') && 'text-muted-foreground',
                )}
              >
                {handleState === 'free' && 'Bo’sh — band qilish mumkin'}
                {handleState === 'taken' && 'Bu nom allaqachon band'}
                {handleState === 'invalid' &&
                  '3–32 belgi, harf bilan boshlanadi, faqat a–z, 0–9 va _'}
                {(handleState === 'idle' || handleState === 'checking') &&
                  'Katalogdagi manzil: alsamos.com/mini-apps/@' + (handle || 'nom')}
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="mini-app-url">Manzil (https) *</Label>
              <div className="flex gap-2">
                <Input
                  id="mini-app-url"
                  value={url}
                  onChange={(event) => {
                    setUrl(event.target.value);
                    setUrlError(null);
                    setProbe(null);
                  }}
                  placeholder="islom.uz"
                  inputMode="url"
                />
                <Button
                  type="button"
                  variant="outline"
                  className="shrink-0"
                  disabled={probing || !url.trim()}
                  onClick={() => void runProbe()}
                >
                  {probing && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
                  Tekshirish
                </Button>
              </div>
              {urlError && <p className="text-xs text-destructive">{urlError}</p>}
              {probe && (
                <div
                  className={cn(
                    'rounded-lg border p-2 text-xs',
                    probe.embeddable
                      ? 'border-emerald-500/40 bg-emerald-500/5 text-emerald-700'
                      : 'border-amber-500/40 bg-amber-500/5 text-amber-700',
                  )}
                >
                  {probe.embeddable
                    ? 'Sayt Alsamos ichida to’g’ridan-to’g’ri ochiladi.'
                    : 'Sayt iframe’ni bloklaydi — ilova ichki proksi orqali ochiladi. Tashqi brauzer kerak emas.'}
                </div>
              )}
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
              <Label htmlFor="mini-app-description">{'To’liq tavsif'}</Label>
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
            <SectionTitle index={3} title={'Ko’rinish va galereya'} />

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

            <div className="space-y-2">
              <Label htmlFor="mini-app-shots">Ekran rasmlari ({screenshots.length}/6)</Label>
              {screenshots.length > 0 && (
                <div className="flex gap-2 overflow-x-auto pb-1">
                  {screenshots.map((shot) => (
                    <div key={shot} className="relative shrink-0">
                      <img
                        src={shot}
                        alt="Ekran rasmi"
                        className="h-28 w-44 rounded-lg border object-cover"
                      />
                      <button
                        type="button"
                        aria-label={'O’chirish'}
                        onClick={() =>
                          setScreenshots((current) => current.filter((item) => item !== shot))
                        }
                        className="absolute right-1 top-1 rounded-full bg-background/90 p-1 shadow"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <div className="flex items-center gap-2">
                <ImagePlus className="h-4 w-4 text-muted-foreground" />
                <Input
                  id="mini-app-shots"
                  type="file"
                  accept="image/*"
                  multiple
                  disabled={uploadingShots || screenshots.length >= MAX_SCREENSHOTS}
                  onChange={(event) => void handleScreenshots(event.target.files)}
                />
              </div>
            </div>
          </section>

          <section className="mt-8 space-y-4">
            <SectionTitle index={4} title={'Kim nomidan e’lon qilinadi'} />
            <div className="flex flex-wrap gap-1.5">
              <Button
                size="sm"
                variant={publisherId === null ? 'default' : 'outline'}
                className="h-8 gap-1 px-3 text-xs"
                onClick={() => setPublisherId(null)}
              >
                <Users className="h-3.5 w-3.5" />
                Shaxsiy profilim
              </Button>
              {publishers.map((item) => (
                <Button
                  key={item.id}
                  size="sm"
                  variant={publisherId === item.id ? 'default' : 'outline'}
                  className="h-8 gap-1 px-3 text-xs"
                  onClick={() => setPublisherId(item.id)}
                >
                  <Building2 className="h-3.5 w-3.5" />
                  {item.name}
                </Button>
              ))}
            </div>
            {selectedPublisher && (
              <p className="text-xs text-muted-foreground">
                Tasdiq darajasi: {PUBLISHER_VERIFICATION_LABELS[selectedPublisher.verification]}
                {selectedPublisher.verification !== 'official' &&
                  selectedPublisher.verification !== 'domain_verified' &&
                  ' — domenni tasdiqlang, shunda ilova “Rasmiy” bo’limiga tushadi.'}
              </p>
            )}
            <Button
              variant="link"
              size="sm"
              className="h-auto p-0 text-xs"
              onClick={() => navigate('/mini-apps/publisher')}
            >
              Kompaniya profili yaratish / domenni tasdiqlash
            </Button>
          </section>

          <section className="mt-8 space-y-4">
            <SectionTitle index={5} title="Ruxsatlar va narx modeli" />

            <div className="space-y-2">
              <Label>{'Ilova so’raydigan ruxsatlar'}</Label>
              <div className="flex flex-wrap gap-1.5">
                {PERMISSIONS.map((item) => (
                  <Badge
                    key={item}
                    variant={permissions.includes(item) ? 'default' : 'secondary'}
                    className="cursor-pointer whitespace-nowrap px-2.5 py-1 font-normal"
                    onClick={() => togglePermission(item)}
                  >
                    {MINI_APP_PERMISSION_LABELS[item]}
                  </Badge>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">
                {'Faqat kerakli ruxsatlarni belgilang — moderatsiyada shu ro’yxat tekshiriladi.'}
              </p>
            </div>

            <div className="space-y-2">
              <Label>Narx modeli</Label>
              <div className="flex flex-wrap gap-1.5">
                {PRICE_MODELS.map((item) => (
                  <Button
                    key={item}
                    size="sm"
                    variant={priceModel === item ? 'default' : 'outline'}
                    className="h-8 px-3 text-xs"
                    onClick={() => setPriceModel(item)}
                  >
                    {MINI_APP_PRICE_LABELS[item]}
                  </Button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="mini-app-privacy">Maxfiylik siyosati (ixtiyoriy)</Label>
                <Input
                  id="mini-app-privacy"
                  value={privacyUrl}
                  onChange={(event) => setPrivacyUrl(event.target.value)}
                  placeholder="https://"
                  inputMode="url"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="mini-app-support">Yordam sahifasi (ixtiyoriy)</Label>
                <Input
                  id="mini-app-support"
                  value={supportUrl}
                  onChange={(event) => setSupportUrl(event.target.value)}
                  placeholder="https://"
                  inputMode="url"
                />
              </div>
            </div>
          </section>

          {appType !== 'link' && (
            <section className="mt-8 space-y-3">
              <SectionTitle index={6} title="API ulanishi" />
              <MiniAppApiPanel appId={appId ?? null} />
            </section>
          )}

          <div className="mt-8 flex items-start gap-2 rounded-lg bg-muted/50 p-3 text-xs text-muted-foreground">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
            {'Yangi yoki manzili o’zgargan ilovalar moderatsiyaga tushadi. Kompaniya nomidan e’lon qilish uchun domen tasdiqlanishi talab qilinadi.'}
          </div>
        </div>

        <aside className="lg:sticky lg:top-4 lg:h-fit">
          <p className="mb-2 text-xs font-medium text-muted-foreground">{'Jonli ko’rinish'}</p>

          <div className="rounded-2xl border p-4">
            <div className="flex items-start gap-3">
              {iconUrl ? (
                <img
                  src={iconUrl}
                  alt=""
                  className="h-12 w-12 shrink-0 rounded-xl border object-cover"
                />
              ) : (
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border bg-muted text-sm font-semibold">
                  {(name.trim() || 'A').slice(0, 1).toUpperCase()}
                </div>
              )}
              <div className="min-w-0">
                <p className="truncate font-semibold">{name.trim() || 'Ilova nomi'}</p>
                <p className="truncate text-xs text-muted-foreground">
                  @{handle || 'nom'}
                  {selectedPublisher ? ' · ' + selectedPublisher.name : ''}
                </p>
              </div>
            </div>

            <p className="mt-3 line-clamp-2 text-sm text-muted-foreground">
              {shortDescription.trim() || 'Qisqa tavsif shu yerda ko’rinadi.'}
            </p>

            <div className="mt-3 flex flex-wrap gap-1.5">
              <Badge variant="secondary" className="font-normal">
                {categoryLabel}
              </Badge>
              <Badge variant="secondary" className="font-normal">
                {MINI_APP_TYPE_LABELS[appType]}
              </Badge>
              {priceModel !== 'free' && (
                <Badge variant="secondary" className="font-normal">
                  {MINI_APP_PRICE_LABELS[priceModel]}
                </Badge>
              )}
              {selectedPublisher &&
                (selectedPublisher.verification === 'official' ||
                  selectedPublisher.verification === 'domain_verified') && (
                  <Badge className="gap-1 font-normal">
                    <ShieldCheck className="h-3 w-3" />
                    Tasdiqlangan
                  </Badge>
                )}
            </div>

            <div className="mt-3 flex items-center gap-3 text-xs text-muted-foreground">
              <span className="flex items-center gap-1">
                <Star className="h-3.5 w-3.5" />
                Yangi
              </span>
              <span className="flex items-center gap-1">
                <Users className="h-3.5 w-3.5" />0
              </span>
            </div>

            {screenshots.length > 0 && (
              <div className="mt-3 flex gap-2 overflow-x-auto">
                {screenshots.map((shot) => (
                  <img
                    key={shot}
                    src={shot}
                    alt=""
                    className="h-20 w-32 shrink-0 rounded-md border object-cover"
                  />
                ))}
              </div>
            )}

            <Button className="mt-4 w-full" disabled>
              Ochish
            </Button>
          </div>

          <div className="mt-4 rounded-2xl border p-4">
            <p className="text-xs font-medium">
              Tayyorlik: {readyCount}/{checklist.length}
            </p>
            <ul className="mt-2 space-y-1.5">
              {checklist.map((item) => (
                <li key={item.label} className="flex items-center gap-2 text-xs">
                  {item.done ? (
                    <Check className="h-3.5 w-3.5 text-emerald-600" />
                  ) : (
                    <X className="h-3.5 w-3.5 text-muted-foreground" />
                  )}
                  <span className={item.done ? '' : 'text-muted-foreground'}>{item.label}</span>
                </li>
              ))}
            </ul>
          </div>
        </aside>
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
            {'O’chirish'}
          </Button>
        ) : (
          <span />
        )}

        <div className="flex gap-2">
          <Button variant="outline" disabled={saving} onClick={() => navigate('/mini-apps')}>
            Bekor qilish
          </Button>
          <Button
            disabled={saving || uploading || uploadingShots}
            onClick={() => void handleSubmit()}
          >
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {isEditing ? 'Saqlash' : 'Yuborish'}
          </Button>
        </div>
      </div>
    </div>
  );
}

function SectionTitle({ index, title }: { index: number; title: string }) {
  return (
    <div className="flex items-baseline gap-2">
      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-muted text-xs font-semibold text-foreground">
        {index}
      </span>
      <h2 className="text-base font-medium">{title}</h2>
    </div>
  );
}

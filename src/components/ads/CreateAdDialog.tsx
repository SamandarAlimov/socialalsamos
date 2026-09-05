import { useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Film,
  Image as ImageIcon,
  Loader2,
  Megaphone,
  Upload,
  X,
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { uploadMedia } from '@/lib/mediaUpload';
import { useUserAds, type AdCreateInput } from '@/hooks/useAds';
import { toast } from 'sonner';

interface CreateAdDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type Step = 'creative' | 'audience' | 'budget';

const STEPS: Array<{ id: Step; label: string }> = [
  { id: 'creative', label: 'Kreativ' },
  { id: 'audience', label: 'Auditoriya' },
  { id: 'budget', label: 'Byudjet' },
];

const CTA_OPTIONS = [
  'Batafsil',
  'Ko‘rish',
  'Xarid qilish',
  'Ro‘yxatdan o‘tish',
  'Yuklab olish',
  'Bog‘lanish',
  'Kanalni ko‘rish',
];

function splitValues(value: string) {
  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

export function CreateAdDialog({ open, onOpenChange }: CreateAdDialogProps) {
  const { createAd } = useUserAds();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<Step>('creative');
  const [isUploading, setIsUploading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [mediaUrl, setMediaUrl] = useState('');
  const [mediaPreview, setMediaPreview] = useState('');
  const [mediaType, setMediaType] = useState<'image' | 'video'>('image');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [destinationUrl, setDestinationUrl] = useState('');
  const [cta, setCta] = useState('Batafsil');
  const [adType, setAdType] = useState<'feed' | 'story' | 'both'>('feed');
  const [billingType, setBillingType] = useState<'cpm' | 'cpc'>('cpm');
  const [budget, setBudget] = useState('10');
  const [dailyBudget, setDailyBudget] = useState('');
  const [gender, setGender] = useState('all');
  const [ageMin, setAgeMin] = useState('13');
  const [ageMax, setAgeMax] = useState('65');
  const [countries, setCountries] = useState('');
  const [interests, setInterests] = useState('');

  const stepIndex = STEPS.findIndex((item) => item.id === step);
  const numericBudget = Number(budget || 0);
  const numericDailyBudget = Number(dailyBudget || 0);

  const canContinue = useMemo(() => {
    if (step === 'creative') {
      if (!mediaUrl || title.trim().length < 3) return false;
      if (destinationUrl.trim()) {
        try {
          new URL(destinationUrl.trim());
        } catch {
          return false;
        }
      }
      return true;
    }
    if (step === 'audience') {
      const min = Number(ageMin || 13);
      const max = Number(ageMax || 65);
      return min >= 13 && max >= min && max <= 100;
    }
    return numericBudget >= 1 && (!dailyBudget || numericDailyBudget > 0);
  }, [ageMax, ageMin, dailyBudget, destinationUrl, mediaUrl, numericBudget, numericDailyBudget, step, title]);

  const reset = () => {
    setStep('creative');
    setMediaUrl('');
    setMediaPreview('');
    setMediaType('image');
    setTitle('');
    setDescription('');
    setDestinationUrl('');
    setCta('Batafsil');
    setAdType('feed');
    setBillingType('cpm');
    setBudget('10');
    setDailyBudget('');
    setGender('all');
    setAgeMin('13');
    setAgeMax('65');
    setCountries('');
    setInterests('');
  };

  const handleOpenChange = (next: boolean) => {
    if (!next && !isSubmitting && !isUploading) reset();
    onOpenChange(next);
  };

  const handleFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const type: 'image' | 'video' = file.type.startsWith('video/') ? 'video' : 'image';
    const preview = URL.createObjectURL(file);
    setMediaType(type);
    setMediaPreview(preview);
    setIsUploading(true);

    try {
      const uploaded = await uploadMedia(file, { type: 'post', visibility: 'public' });
      setMediaUrl(uploaded.url);
      toast.success('Kreativ yuklandi');
    } catch (error) {
      console.error('Ad creative upload failed:', error);
      setMediaPreview('');
      setMediaUrl('');
      toast.error('Kreativni yuklab bo‘lmadi');
    } finally {
      setIsUploading(false);
    }
  };

  const nextStep = () => {
    if (!canContinue) return;
    const next = STEPS[stepIndex + 1];
    if (next) setStep(next.id);
  };

  const previousStep = () => {
    const previous = STEPS[stepIndex - 1];
    if (previous) setStep(previous.id);
  };

  const submit = async () => {
    if (!canContinue || !mediaUrl || isSubmitting) return;
    setIsSubmitting(true);

    const payload: AdCreateInput = {
      title: title.trim(),
      description: description.trim() || undefined,
      media_url: mediaUrl,
      media_type: mediaType,
      destination_url: destinationUrl.trim() || undefined,
      call_to_action: cta,
      ad_type: adType,
      budget: numericBudget,
      daily_budget: dailyBudget ? numericDailyBudget : undefined,
      billing_type: billingType,
      target_gender: gender,
      target_age_min: Number(ageMin || 13),
      target_age_max: Number(ageMax || 65),
      target_countries: splitValues(countries),
      target_interests: splitValues(interests),
    };

    try {
      const created = await createAd(payload);
      if (!created) return;
      reset();
      onOpenChange(false);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-h-[92dvh] max-w-2xl overflow-y-auto rounded-3xl border-border/70 p-0 sm:max-h-[88vh]">
        <DialogHeader className="border-b border-border/60 px-5 py-5 sm:px-6">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-border bg-muted/35">
              <Megaphone className="h-4 w-4" />
            </span>
            <div>
              <DialogTitle className="text-lg">Yangi kampaniya</DialogTitle>
              <DialogDescription className="mt-1">Kreativ, auditoriya va byudjetni uch bosqichda sozlang.</DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="px-5 pt-5 sm:px-6">
          <div className="grid grid-cols-3 gap-2 rounded-2xl bg-muted/45 p-1">
            {STEPS.map((item, index) => {
              const active = item.id === step;
              const complete = index < stepIndex;
              return (
                <div
                  key={item.id}
                  className={cn(
                    'flex items-center justify-center gap-2 rounded-xl px-2 py-2.5 text-xs font-semibold',
                    active ? 'bg-background text-foreground shadow-sm ring-1 ring-border/60' : 'text-muted-foreground',
                  )}
                >
                  <span className={cn('flex h-5 w-5 items-center justify-center rounded-full border text-[10px]', complete && 'border-foreground bg-foreground text-background')}>
                    {complete ? <Check className="h-3 w-3" /> : index + 1}
                  </span>
                  <span className="hidden sm:inline">{item.label}</span>
                </div>
              );
            })}
          </div>
        </div>

        <div className="space-y-5 px-5 py-5 sm:px-6">
          {step === 'creative' && (
            <>
              <div>
                <Label>Kreativ *</Label>
                <input ref={fileInputRef} type="file" accept="image/*,video/*" onChange={handleFile} className="hidden" />
                {mediaPreview ? (
                  <div className="relative mt-2 aspect-[16/10] overflow-hidden rounded-2xl bg-neutral-950">
                    {mediaType === 'video' ? (
                      <video src={mediaPreview} controls playsInline className="h-full w-full object-contain" />
                    ) : (
                      <img src={mediaPreview} alt="Reklama preview" className="h-full w-full object-contain" />
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        setMediaPreview('');
                        setMediaUrl('');
                      }}
                      className="absolute right-3 top-3 flex h-9 w-9 items-center justify-center rounded-full bg-black/70 text-white backdrop-blur"
                    >
                      <X className="h-4 w-4" />
                    </button>
                    {isUploading && <div className="absolute inset-0 flex items-center justify-center bg-black/55"><Loader2 className="h-7 w-7 animate-spin text-white" /></div>}
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="mt-2 flex aspect-[16/9] w-full flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-muted/15 transition hover:bg-muted/30"
                  >
                    <div className="flex gap-2">
                      <span className="flex h-11 w-11 items-center justify-center rounded-xl border border-border bg-background"><ImageIcon className="h-5 w-5" /></span>
                      <span className="flex h-11 w-11 items-center justify-center rounded-xl border border-border bg-background"><Film className="h-5 w-5" /></span>
                    </div>
                    <p className="mt-3 text-sm font-semibold">Rasm yoki video yuklang</p>
                    <p className="mt-1 text-xs text-muted-foreground">Media external Alsamos media serverga yuklanadi.</p>
                    <span className="mt-3 inline-flex items-center gap-2 rounded-xl border border-border bg-background px-3 py-2 text-xs font-medium"><Upload className="h-3.5 w-3.5" />Fayl tanlash</span>
                  </button>
                )}
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="sm:col-span-2"><Label htmlFor="ad-title">Sarlavha *</Label><Input id="ad-title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={100} className="mt-1.5" placeholder="Qisqa va aniq sarlavha" /></div>
                <div className="sm:col-span-2"><Label htmlFor="ad-description">Tavsif</Label><Textarea id="ad-description" value={description} onChange={(e) => setDescription(e.target.value)} maxLength={500} className="mt-1.5 min-h-24 resize-none" placeholder="Foydalanuvchi uchun qiymatni tushuntiring" /></div>
                <div><Label htmlFor="ad-url">Manzil URL</Label><Input id="ad-url" value={destinationUrl} onChange={(e) => setDestinationUrl(e.target.value)} className="mt-1.5" placeholder="https://..." inputMode="url" /></div>
                <div><Label>CTA</Label><Select value={cta} onValueChange={setCta}><SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger><SelectContent>{CTA_OPTIONS.map((item) => <SelectItem key={item} value={item}>{item}</SelectItem>)}</SelectContent></Select></div>
              </div>
            </>
          )}

          {step === 'audience' && (
            <>
              <div className="rounded-2xl border border-border/70 bg-muted/15 p-4"><p className="text-sm font-semibold">Auditoriya</p><p className="mt-1 text-xs leading-relaxed text-muted-foreground">Haddan tashqari tor targeting o‘rniga sifatli, yetarli reach beradigan segment tanlang.</p></div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div><Label>Jins</Label><Select value={gender} onValueChange={setGender}><SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">Hammasi</SelectItem><SelectItem value="male">Erkaklar</SelectItem><SelectItem value="female">Ayollar</SelectItem></SelectContent></Select></div>
                <div className="grid grid-cols-2 gap-2"><div><Label htmlFor="age-min">Min yosh</Label><Input id="age-min" type="number" min={13} max={100} value={ageMin} onChange={(e) => setAgeMin(e.target.value)} className="mt-1.5" /></div><div><Label htmlFor="age-max">Max yosh</Label><Input id="age-max" type="number" min={13} max={100} value={ageMax} onChange={(e) => setAgeMax(e.target.value)} className="mt-1.5" /></div></div>
                <div className="sm:col-span-2"><Label htmlFor="countries">Davlatlar</Label><Input id="countries" value={countries} onChange={(e) => setCountries(e.target.value)} className="mt-1.5" placeholder="Uzbekistan, Kazakhstan — bo‘sh qoldirilsa global" /><p className="mt-1.5 text-[11px] text-muted-foreground">Vergul bilan ajrating.</p></div>
                <div className="sm:col-span-2"><Label htmlFor="interests">Qiziqishlar</Label><Input id="interests" value={interests} onChange={(e) => setInterests(e.target.value)} className="mt-1.5" placeholder="technology, education, business" /><p className="mt-1.5 text-[11px] text-muted-foreground">Vergul bilan ajrating.</p></div>
              </div>
            </>
          )}

          {step === 'budget' && (
            <>
              <div className="grid gap-4 sm:grid-cols-2">
                <div><Label>Joylashuv</Label><Select value={adType} onValueChange={(value: 'feed' | 'story' | 'both') => setAdType(value)}><SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="feed">Home + Discover + Videos</SelectItem><SelectItem value="story">Stories</SelectItem><SelectItem value="both">Barcha mos joylashuvlar</SelectItem></SelectContent></Select></div>
                <div><Label>Hisoblash</Label><Select value={billingType} onValueChange={(value: 'cpm' | 'cpc') => setBillingType(value)}><SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="cpm">CPM — 1000 ko‘rsatish</SelectItem><SelectItem value="cpc">CPC — klik uchun</SelectItem></SelectContent></Select></div>
                <div><Label htmlFor="budget">Umumiy byudjet (USD) *</Label><Input id="budget" type="number" min={1} step="0.01" value={budget} onChange={(e) => setBudget(e.target.value)} className="mt-1.5" /></div>
                <div><Label htmlFor="daily-budget">Kunlik limit (USD)</Label><Input id="daily-budget" type="number" min={0.01} step="0.01" value={dailyBudget} onChange={(e) => setDailyBudget(e.target.value)} className="mt-1.5" placeholder="Ixtiyoriy" /></div>
              </div>

              <div className="rounded-2xl border border-border/70 bg-card p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Yakuniy tekshiruv</p>
                <div className="mt-3 space-y-2 text-sm">
                  <div className="flex justify-between gap-4"><span className="text-muted-foreground">Kampaniya</span><span className="truncate font-medium">{title || '—'}</span></div>
                  <div className="flex justify-between gap-4"><span className="text-muted-foreground">Joylashuv</span><span className="font-medium">{adType === 'feed' ? 'Home / Discover / Videos' : adType === 'story' ? 'Stories' : 'Barchasi'}</span></div>
                  <div className="flex justify-between gap-4"><span className="text-muted-foreground">Byudjet</span><span className="font-semibold tabular-nums">${numericBudget.toFixed(2)}</span></div>
                  <div className="flex justify-between gap-4"><span className="text-muted-foreground">Moderatsiya</span><span className="font-medium">Yuborilgandan keyin tekshiriladi</span></div>
                </div>
              </div>
            </>
          )}
        </div>

        <div className="flex items-center gap-2 border-t border-border/60 px-5 py-4 sm:px-6">
          {stepIndex > 0 ? (
            <Button variant="ghost" onClick={previousStep} disabled={isSubmitting || isUploading} className="rounded-xl"><ArrowLeft className="mr-2 h-4 w-4" />Orqaga</Button>
          ) : (
            <Button variant="ghost" onClick={() => handleOpenChange(false)} disabled={isSubmitting || isUploading} className="rounded-xl">Bekor qilish</Button>
          )}
          <div className="flex-1" />
          {step !== 'budget' ? (
            <Button onClick={nextStep} disabled={!canContinue || isUploading} className="rounded-xl bg-foreground text-background hover:bg-foreground/90">Davom etish<ArrowRight className="ml-2 h-4 w-4" /></Button>
          ) : (
            <Button onClick={() => void submit()} disabled={!canContinue || isSubmitting} className="rounded-xl bg-foreground text-background hover:bg-foreground/90">{isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Megaphone className="mr-2 h-4 w-4" />}Moderatsiyaga yuborish</Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

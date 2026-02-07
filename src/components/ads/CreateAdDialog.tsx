import { useState, useRef } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  FormDescription,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  Upload, 
  Image as ImageIcon, 
  Film, 
  Target, 
  DollarSign,
  Calendar,
  Loader2,
  X,
  Eye
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useUserAds, AdCreateInput } from '@/hooks/useAds';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

const formSchema = z.object({
  title: z.string().min(3, 'Kamida 3 ta belgi').max(100),
  description: z.string().max(500).optional(),
  destination_url: z.string().url('To\'g\'ri URL kiriting').optional().or(z.literal('')),
  call_to_action: z.string().max(30).optional(),
  ad_type: z.enum(['feed', 'story', 'both']),
  budget: z.number().min(1, 'Kamida $1'),
  daily_budget: z.number().optional(),
  billing_type: z.enum(['cpm', 'cpc']),
  target_gender: z.string().optional(),
  target_age_min: z.number().min(13).max(100).optional(),
  target_age_max: z.number().min(13).max(100).optional(),
});

type FormValues = z.infer<typeof formSchema>;

interface CreateAdDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const CTA_OPTIONS = [
  'Learn More',
  'Shop Now', 
  'Sign Up',
  'Download',
  'Get Offer',
  'Book Now',
  'Contact Us',
  'Watch More',
  'Apply Now',
  'Get Started'
];

export function CreateAdDialog({ open, onOpenChange }: CreateAdDialogProps) {
  const { createAd } = useUserAds();
  const [step, setStep] = useState<'media' | 'details' | 'targeting' | 'budget'>('media');
  const [isUploading, setIsUploading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [mediaUrl, setMediaUrl] = useState<string | null>(null);
  const [mediaType, setMediaType] = useState<'image' | 'video'>('image');
  const [mediaPreview, setMediaPreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      title: '',
      description: '',
      destination_url: '',
      call_to_action: 'Learn More',
      ad_type: 'feed',
      budget: 10,
      billing_type: 'cpm',
      target_gender: 'all',
    }
  });

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const isVideo = file.type.startsWith('video/');
    setMediaType(isVideo ? 'video' : 'image');

    // Preview
    const url = URL.createObjectURL(file);
    setMediaPreview(url);

    // Upload
    setIsUploading(true);
    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `${Date.now()}.${fileExt}`;
      const filePath = `ads/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('message-attachments')
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('message-attachments')
        .getPublicUrl(filePath);

      setMediaUrl(publicUrl);
      toast.success('Media yuklandi');
    } catch (error) {
      console.error('Upload error:', error);
      toast.error('Yuklashda xatolik');
      setMediaPreview(null);
    } finally {
      setIsUploading(false);
    }
  };

  const onSubmit = async (values: FormValues) => {
    if (!mediaUrl) {
      toast.error('Media yuklang');
      return;
    }

    setIsSubmitting(true);
    try {
      const adData: AdCreateInput = {
        title: values.title,
        description: values.description,
        destination_url: values.destination_url,
        call_to_action: values.call_to_action,
        ad_type: values.ad_type,
        budget: values.budget,
        daily_budget: values.daily_budget,
        billing_type: values.billing_type,
        target_gender: values.target_gender,
        target_age_min: values.target_age_min,
        target_age_max: values.target_age_max,
        media_url: mediaUrl,
        media_type: mediaType,
      };

      const result = await createAd(adData);
      if (result) {
        onOpenChange(false);
        form.reset();
        setMediaUrl(null);
        setMediaPreview(null);
        setStep('media');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const canProceed = () => {
    switch (step) {
      case 'media': return !!mediaUrl;
      case 'details': return form.getValues('title').length >= 3;
      case 'targeting': return true;
      case 'budget': return form.getValues('budget') >= 1;
    }
  };

  const nextStep = () => {
    const steps: typeof step[] = ['media', 'details', 'targeting', 'budget'];
    const currentIndex = steps.indexOf(step);
    if (currentIndex < steps.length - 1) {
      setStep(steps[currentIndex + 1]);
    }
  };

  const prevStep = () => {
    const steps: typeof step[] = ['media', 'details', 'targeting', 'budget'];
    const currentIndex = steps.indexOf(step);
    if (currentIndex > 0) {
      setStep(steps[currentIndex - 1]);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] p-0 overflow-hidden">
        <DialogHeader className="p-4 pb-0">
          <DialogTitle className="flex items-center gap-2">
            <Target className="h-5 w-5 text-primary" />
            Reklama yaratish
          </DialogTitle>
        </DialogHeader>

        {/* Step indicator */}
        <div className="px-4 py-2">
          <div className="flex gap-1">
            {['media', 'details', 'targeting', 'budget'].map((s, i) => (
              <div
                key={s}
                className={cn(
                  "flex-1 h-1 rounded-full transition-colors",
                  step === s ? "bg-primary" : 
                  ['media', 'details', 'targeting', 'budget'].indexOf(step) > i 
                    ? "bg-primary/50" 
                    : "bg-muted"
                )}
              />
            ))}
          </div>
        </div>

        <ScrollArea className="max-h-[60vh]">
          <Form {...form}>
            <form className="p-4 space-y-4">
              {/* Step 1: Media */}
              {step === 'media' && (
                <div className="space-y-4">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*,video/*"
                    onChange={handleFileSelect}
                    className="hidden"
                  />

                  {mediaPreview ? (
                    <div className="relative aspect-video rounded-xl overflow-hidden bg-secondary">
                      {mediaType === 'video' ? (
                        <video
                          src={mediaPreview}
                          className="w-full h-full object-cover"
                          controls
                        />
                      ) : (
                        <img
                          src={mediaPreview}
                          alt="Preview"
                          className="w-full h-full object-cover"
                        />
                      )}
                      <Button
                        variant="secondary"
                        size="icon"
                        className="absolute top-2 right-2"
                        onClick={() => {
                          setMediaPreview(null);
                          setMediaUrl(null);
                        }}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                      {isUploading && (
                        <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                          <Loader2 className="h-8 w-8 animate-spin text-white" />
                        </div>
                      )}
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="w-full aspect-video rounded-xl border-2 border-dashed border-border hover:border-primary transition-colors flex flex-col items-center justify-center gap-3"
                    >
                      <div className="flex gap-3">
                        <div className="p-3 rounded-xl bg-secondary">
                          <ImageIcon className="h-6 w-6 text-muted-foreground" />
                        </div>
                        <div className="p-3 rounded-xl bg-secondary">
                          <Film className="h-6 w-6 text-muted-foreground" />
                        </div>
                      </div>
                      <div className="text-center">
                        <p className="font-medium">Rasm yoki video yuklang</p>
                        <p className="text-sm text-muted-foreground">
                          Drag & drop yoki bosing
                        </p>
                      </div>
                    </button>
                  )}

                  <FormField
                    control={form.control}
                    name="ad_type"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Reklama joylashuvi</FormLabel>
                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="feed">📰 Feed</SelectItem>
                            <SelectItem value="story">📸 Stories</SelectItem>
                            <SelectItem value="both">✨ Hammasi</SelectItem>
                          </SelectContent>
                        </Select>
                      </FormItem>
                    )}
                  />
                </div>
              )}

              {/* Step 2: Details */}
              {step === 'details' && (
                <div className="space-y-4">
                  <FormField
                    control={form.control}
                    name="title"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Sarlavha *</FormLabel>
                        <FormControl>
                          <Input placeholder="Reklama sarlavhasi" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="description"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Tavsif</FormLabel>
                        <FormControl>
                          <Textarea
                            placeholder="Qisqa tavsif..."
                            className="resize-none"
                            rows={3}
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="destination_url"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Havola URL</FormLabel>
                        <FormControl>
                          <Input placeholder="https://example.com" {...field} />
                        </FormControl>
                        <FormDescription>
                          Foydalanuvchi bosganida ochiladi
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="call_to_action"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Call to Action</FormLabel>
                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {CTA_OPTIONS.map(cta => (
                              <SelectItem key={cta} value={cta}>{cta}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </FormItem>
                    )}
                  />
                </div>
              )}

              {/* Step 3: Targeting */}
              {step === 'targeting' && (
                <div className="space-y-4">
                  <div className="p-4 rounded-xl bg-secondary/50 text-center">
                    <Target className="h-8 w-8 mx-auto mb-2 text-primary" />
                    <p className="font-medium">Auditoriya sozlamalari</p>
                    <p className="text-sm text-muted-foreground">
                      Reklamangiz kimga ko'rsatilishini tanlang
                    </p>
                  </div>

                  <FormField
                    control={form.control}
                    name="target_gender"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Jins</FormLabel>
                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="all">Hammasi</SelectItem>
                            <SelectItem value="male">Erkaklar</SelectItem>
                            <SelectItem value="female">Ayollar</SelectItem>
                          </SelectContent>
                        </Select>
                      </FormItem>
                    )}
                  />

                  <div className="grid grid-cols-2 gap-3">
                    <FormField
                      control={form.control}
                      name="target_age_min"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Min yosh</FormLabel>
                          <FormControl>
                            <Input
                              type="number"
                              min={13}
                              max={100}
                              placeholder="13"
                              {...field}
                              onChange={e => field.onChange(e.target.value ? parseInt(e.target.value) : undefined)}
                            />
                          </FormControl>
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="target_age_max"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Max yosh</FormLabel>
                          <FormControl>
                            <Input
                              type="number"
                              min={13}
                              max={100}
                              placeholder="65"
                              {...field}
                              onChange={e => field.onChange(e.target.value ? parseInt(e.target.value) : undefined)}
                            />
                          </FormControl>
                        </FormItem>
                      )}
                    />
                  </div>
                </div>
              )}

              {/* Step 4: Budget */}
              {step === 'budget' && (
                <div className="space-y-4">
                  <div className="p-4 rounded-xl bg-secondary/50 text-center">
                    <DollarSign className="h-8 w-8 mx-auto mb-2 text-primary" />
                    <p className="font-medium">Byudjet sozlamalari</p>
                    <p className="text-sm text-muted-foreground">
                      Qancha sarflashni xohlaysiz?
                    </p>
                  </div>

                  <FormField
                    control={form.control}
                    name="billing_type"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>To'lov turi</FormLabel>
                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="cpm">CPM (1000 ta ko'rish)</SelectItem>
                            <SelectItem value="cpc">CPC (Har bir bosish)</SelectItem>
                          </SelectContent>
                        </Select>
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="budget"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Umumiy byudjet (USD)</FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            min={1}
                            {...field}
                            onChange={e => field.onChange(parseFloat(e.target.value) || 0)}
                          />
                        </FormControl>
                        <FormDescription>
                          Minimum: $1
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="daily_budget"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Kunlik limit (ixtiyoriy)</FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            min={1}
                            placeholder="Limit yo'q"
                            {...field}
                            onChange={e => field.onChange(e.target.value ? parseFloat(e.target.value) : undefined)}
                          />
                        </FormControl>
                      </FormItem>
                    )}
                  />

                  {/* Summary */}
                  <div className="p-4 rounded-xl bg-primary/10 space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">To'lov turi:</span>
                      <span className="font-medium">
                        {form.watch('billing_type') === 'cpm' ? 'CPM' : 'CPC'}
                      </span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Umumiy byudjet:</span>
                      <span className="font-medium">${form.watch('budget')}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Taxminiy ko'rishlar:</span>
                      <span className="font-medium">
                        ~{Math.round(form.watch('budget') * 1000).toLocaleString()}
                      </span>
                    </div>
                  </div>
                </div>
              )}
            </form>
          </Form>
        </ScrollArea>

        {/* Navigation */}
        <div className="p-4 border-t border-border flex gap-2">
          {step !== 'media' && (
            <Button variant="outline" onClick={prevStep} className="flex-1">
              Orqaga
            </Button>
          )}
          
          {step === 'budget' ? (
            <Button
              onClick={form.handleSubmit(onSubmit)}
              disabled={!canProceed() || isSubmitting}
              className="flex-1"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Yaratilmoqda...
                </>
              ) : (
                <>
                  <Eye className="h-4 w-4 mr-2" />
                  Reklamani yuborish
                </>
              )}
            </Button>
          ) : (
            <Button
              onClick={nextStep}
              disabled={!canProceed()}
              className="flex-1"
            >
              Keyingi
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

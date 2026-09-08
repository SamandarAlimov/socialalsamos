import { useState } from 'react';
import { Store, Building2, User, Briefcase, ArrowRight, Check, Landmark, UtensilsCrossed } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { useProductActions } from '@/hooks/useMarketplace';
import { marketplaceUz } from '@/i18n/marketplace';

interface BecomeSellerProps {
  onSuccess: () => void;
}

const copy = marketplaceUz.seller;
const businessTypes = [
  {
    id: 'individual',
    ...copy.types.individual,
    icon: User,
  },
  {
    id: 'business',
    ...copy.types.business,
    icon: Store,
  },
  {
    id: 'restaurant',
    title: 'Restoran / kafe',
    description: 'Taomlar menyusi, kelgan buyurtmalar va tayyorlash jarayonini Marketplace ichida boshqaring.',
    icon: UtensilsCrossed,
  },
  {
    id: 'enterprise',
    ...copy.types.enterprise,
    icon: Building2,
  },
  {
    id: 'government',
    ...copy.types.government,
    icon: Landmark,
  },
];

export function BecomeSeller({ onSuccess }: BecomeSellerProps) {
  const { createSeller } = useProductActions();
  const [step, setStep] = useState(1);
  const [businessType, setBusinessType] = useState('individual');
  const [businessName, setBusinessName] = useState('');
  const [description, setDescription] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async () => {
    if (!businessName.trim()) return;

    setIsLoading(true);
    const result = await createSeller(businessName, businessType, description || undefined);
    setIsLoading(false);

    if (result) onSuccess();
  };

  return (
    <div className="mx-auto max-w-lg p-6">
      {step === 1 && (
        <div className="space-y-6">
          <div className="space-y-2 text-center">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-foreground/10">
              <Briefcase className="h-8 w-8 text-foreground" />
            </div>
            <h2 className="text-2xl font-bold">{copy.startSelling}</h2>
            <p className="text-muted-foreground">{copy.startSellingDescription}</p>
          </div>

          <div className="space-y-3">
            <Label>{copy.sellerTypeQuestion}</Label>
            {businessTypes.map(type => (
              <Card
                key={type.id}
                className={cn(
                  'cursor-pointer p-4 transition-all hover:border-foreground',
                  businessType === type.id && 'border-foreground bg-foreground/5',
                )}
                onClick={() => setBusinessType(type.id)}
              >
                <div className="flex items-center gap-4">
                  <div className={cn(
                    'flex h-12 w-12 items-center justify-center rounded-xl',
                    businessType === type.id ? 'bg-foreground text-background' : 'bg-muted',
                  )}>
                    <type.icon className="h-6 w-6" />
                  </div>
                  <div className="flex-1">
                    <h3 className="font-semibold">{type.title}</h3>
                    <p className="text-sm text-muted-foreground">{type.description}</p>
                  </div>
                  {businessType === type.id && <Check className="h-5 w-5 text-foreground" />}
                </div>
              </Card>
            ))}
          </div>

          {businessType === 'restaurant' && (
            <div className="rounded-2xl border border-orange-500/20 bg-orange-500/5 p-3 text-xs leading-relaxed text-muted-foreground">
              Restoran profili yaratilgach, Sotuvchi markazidagi Buyurtmalar oynasi avtomatik ravishda “Yangi → Tayyorlanmoqda → Tayyor / yo‘lda” rejimiga o‘tadi.
            </div>
          )}

          <Button className="w-full" size="lg" onClick={() => setStep(2)}>
            {copy.continue}
            <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        </div>
      )}

      {step === 2 && (
        <div className="space-y-6">
          <div className="space-y-2 text-center">
            <h2 className="text-2xl font-bold">{businessType === 'restaurant' ? 'Restoran ma’lumotlari' : copy.shopDetails}</h2>
            <p className="text-muted-foreground">
              {businessType === 'restaurant' ? 'Restoran yoki kafe nomi va xaridorlarga ko‘rinadigan qisqa tavsifni kiriting.' : copy.shopDetailsDescription}
            </p>
          </div>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="businessName">{businessType === 'restaurant' ? 'Restoran nomi' : copy.shopName}</Label>
              <Input
                id="businessName"
                placeholder={businessType === 'restaurant' ? 'Masalan, Alsamos Kitchen' : copy.shopNamePlaceholder}
                value={businessName}
                onChange={event => setBusinessName(event.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">{copy.descriptionOptional}</Label>
              <Textarea
                id="description"
                placeholder={businessType === 'restaurant' ? 'Oshxona turi, xizmat, halol menyu va boshqa muhim ma’lumotlar…' : copy.descriptionPlaceholder}
                value={description}
                onChange={event => setDescription(event.target.value)}
                rows={4}
              />
            </div>
          </div>

          <div className="flex gap-3">
            <Button variant="outline" className="flex-1" onClick={() => setStep(1)}>{copy.back}</Button>
            <Button className="flex-1" onClick={handleSubmit} disabled={!businessName.trim() || isLoading}>
              {isLoading ? copy.creating : copy.createShop}
            </Button>
          </div>

          <p className="text-center text-xs text-muted-foreground">{copy.terms}</p>
        </div>
      )}
    </div>
  );
}

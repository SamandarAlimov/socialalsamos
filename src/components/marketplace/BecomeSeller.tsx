import { useState } from 'react';
import { Store, Building2, User, Briefcase, ArrowRight, Check, Landmark } from 'lucide-react';
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
    <div className="max-w-lg mx-auto p-6">
      {step === 1 && (
        <div className="space-y-6">
          <div className="text-center space-y-2">
            <div className="w-16 h-16 rounded-full bg-foreground/10 flex items-center justify-center mx-auto mb-4">
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
                  'p-4 cursor-pointer transition-all hover:border-foreground',
                  businessType === type.id && 'border-foreground bg-foreground/5',
                )}
                onClick={() => setBusinessType(type.id)}
              >
                <div className="flex items-center gap-4">
                  <div className={cn(
                    'w-12 h-12 rounded-xl flex items-center justify-center',
                    businessType === type.id
                      ? 'bg-foreground text-background'
                      : 'bg-muted',
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

          <Button className="w-full" size="lg" onClick={() => setStep(2)}>
            {copy.continue}
            <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        </div>
      )}

      {step === 2 && (
        <div className="space-y-6">
          <div className="text-center space-y-2">
            <h2 className="text-2xl font-bold">{copy.shopDetails}</h2>
            <p className="text-muted-foreground">{copy.shopDetailsDescription}</p>
          </div>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="businessName">{copy.shopName}</Label>
              <Input
                id="businessName"
                placeholder={copy.shopNamePlaceholder}
                value={businessName}
                onChange={event => setBusinessName(event.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">{copy.descriptionOptional}</Label>
              <Textarea
                id="description"
                placeholder={copy.descriptionPlaceholder}
                value={description}
                onChange={event => setDescription(event.target.value)}
                rows={4}
              />
            </div>
          </div>

          <div className="flex gap-3">
            <Button variant="outline" className="flex-1" onClick={() => setStep(1)}>
              {copy.back}
            </Button>
            <Button
              className="flex-1"
              onClick={handleSubmit}
              disabled={!businessName.trim() || isLoading}
            >
              {isLoading ? copy.creating : copy.createShop}
            </Button>
          </div>

          <p className="text-xs text-center text-muted-foreground">{copy.terms}</p>
        </div>
      )}
    </div>
  );
}

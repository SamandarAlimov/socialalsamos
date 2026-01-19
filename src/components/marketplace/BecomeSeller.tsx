import { useState } from 'react';
import { Store, Building2, User, Briefcase, ArrowRight, Check, Landmark } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { useProductActions } from '@/hooks/useMarketplace';

interface BecomeSellerProps {
  onSuccess: () => void;
}

const businessTypes = [
  {
    id: 'individual',
    title: 'Individual',
    description: 'Sell personal items (C2C)',
    icon: User,
  },
  {
    id: 'business',
    title: 'Small Business',
    description: 'Local business (B2C)',
    icon: Store,
  },
  {
    id: 'enterprise',
    title: 'Enterprise',
    description: 'Wholesale & B2B',
    icon: Building2,
  },
  {
    id: 'government',
    title: 'Government',
    description: 'Government supplier (B2G)',
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

    if (result) {
      onSuccess();
    }
  };

  return (
    <div className="max-w-lg mx-auto p-6">
      {step === 1 && (
        <div className="space-y-6">
          <div className="text-center space-y-2">
            <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
              <Briefcase className="h-8 w-8 text-primary" />
            </div>
            <h2 className="text-2xl font-bold">Start Selling</h2>
            <p className="text-muted-foreground">
              Join thousands of sellers. It takes less than 2 minutes.
            </p>
          </div>

          <div className="space-y-3">
            <Label>What type of seller are you?</Label>
            {businessTypes.map((type) => (
              <Card
                key={type.id}
                className={cn(
                  "p-4 cursor-pointer transition-all hover:border-primary",
                  businessType === type.id && "border-primary bg-primary/5"
                )}
                onClick={() => setBusinessType(type.id)}
              >
                <div className="flex items-center gap-4">
                  <div className={cn(
                    "w-12 h-12 rounded-xl flex items-center justify-center",
                    businessType === type.id 
                      ? "bg-primary text-primary-foreground" 
                      : "bg-muted"
                  )}>
                    <type.icon className="h-6 w-6" />
                  </div>
                  <div className="flex-1">
                    <h3 className="font-semibold">{type.title}</h3>
                    <p className="text-sm text-muted-foreground">{type.description}</p>
                  </div>
                  {businessType === type.id && (
                    <Check className="h-5 w-5 text-primary" />
                  )}
                </div>
              </Card>
            ))}
          </div>

          <Button className="w-full" size="lg" onClick={() => setStep(2)}>
            Continue
            <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        </div>
      )}

      {step === 2 && (
        <div className="space-y-6">
          <div className="text-center space-y-2">
            <h2 className="text-2xl font-bold">Your Shop Details</h2>
            <p className="text-muted-foreground">
              Tell buyers about your shop
            </p>
          </div>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="businessName">Shop Name *</Label>
              <Input
                id="businessName"
                placeholder="My Awesome Shop"
                value={businessName}
                onChange={(e) => setBusinessName(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Description (optional)</Label>
              <Textarea
                id="description"
                placeholder="Tell buyers what you sell..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={4}
              />
            </div>
          </div>

          <div className="flex gap-3">
            <Button variant="outline" className="flex-1" onClick={() => setStep(1)}>
              Back
            </Button>
            <Button 
              className="flex-1" 
              onClick={handleSubmit}
              disabled={!businessName.trim() || isLoading}
            >
              {isLoading ? 'Creating...' : 'Create Shop'}
            </Button>
          </div>

          <p className="text-xs text-center text-muted-foreground">
            By creating a shop, you agree to our Seller Terms of Service
          </p>
        </div>
      )}
    </div>
  );
}

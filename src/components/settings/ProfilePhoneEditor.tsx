import { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Loader2, Phone, Save } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';

interface ProfilePhoneEditorProps {
  className?: string;
}

function phoneErrorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : String((error as any)?.message ?? error ?? '');
  const normalized = message.toLowerCase();

  if (normalized.includes('phone_taken') || normalized.includes('duplicate')) {
    return 'Bu telefon raqami boshqa hisobda ishlatilgan.';
  }
  if (normalized.includes('invalid_phone')) {
    return 'Telefon raqamini xalqaro formatda kiriting. Masalan: +998901234567.';
  }
  if (normalized.includes('identity_not_found')) {
    return 'Hisob identifikatsiyasi topilmadi. Sahifani yangilab qayta urinib ko‘ring.';
  }
  return message || 'Telefon raqamini saqlab bo‘lmadi.';
}

export function ProfilePhoneEditor({ className }: ProfilePhoneEditorProps) {
  const { toast } = useToast();
  const [phone, setPhone] = useState('');
  const [savedPhone, setSavedPhone] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let active = true;

    const loadPhone = async () => {
      setLoading(true);
      try {
        const { data, error } = await (supabase.rpc as any)('get_my_identity_phone');
        if (error) throw error;
        if (!active) return;

        const row = Array.isArray(data) ? data[0] : data;
        const currentPhone = typeof row?.phone === 'string' ? row.phone : '';
        setPhone(currentPhone);
        setSavedPhone(currentPhone);
      } catch (error) {
        if (!active) return;
        toast({
          title: 'Telefon raqamini yuklab bo‘lmadi',
          description: phoneErrorMessage(error),
          variant: 'destructive',
        });
      } finally {
        if (active) setLoading(false);
      }
    };

    void loadPhone();
    return () => {
      active = false;
    };
  }, [toast]);

  const dirty = useMemo(() => phone.trim() !== savedPhone, [phone, savedPhone]);

  const savePhone = async () => {
    setSaving(true);
    try {
      const { data, error } = await (supabase.rpc as any)('update_my_identity_phone', {
        p_phone: phone.trim() || null,
      });
      if (error) throw error;

      const row = Array.isArray(data) ? data[0] : data;
      const normalizedPhone = typeof row?.phone === 'string' ? row.phone : '';
      setPhone(normalizedPhone);
      setSavedPhone(normalizedPhone);
      toast({
        title: 'Telefon raqami saqlandi',
        description: normalizedPhone
          ? 'Telefon raqamingiz profil identifikatsiyasiga biriktirildi.'
          : 'Telefon raqami profilingizdan olib tashlandi.',
      });
    } catch (error) {
      toast({
        title: 'Telefon raqamini saqlab bo‘lmadi',
        description: phoneErrorMessage(error),
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={cn('min-w-0 w-full max-w-full overflow-hidden border-t border-border/70 pt-4', className)}>
      <div className="flex min-w-0 w-full max-w-full flex-col gap-3 sm:flex-row sm:items-end">
        <div className="min-w-0 w-full max-w-full flex-1">
          <Label htmlFor="profile_phone" className="flex min-w-0 items-center gap-2">
            <Phone className="h-3.5 w-3.5 shrink-0" />
            <span className="min-w-0 truncate">Telefon raqami</span>
          </Label>
          <Input
            id="profile_phone"
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            value={phone}
            disabled={loading || saving}
            onChange={(event) => setPhone(event.target.value)}
            className="mt-1.5 min-w-0 w-full max-w-full"
            placeholder="+998 90 123 45 67"
          />
          <p className="mt-1.5 max-w-full break-words text-[11px] leading-relaxed text-muted-foreground">
            Xalqaro formatdan foydalaning. Raqam o‘zgartirilsa, avvalgi tasdiqlash holati bekor qilinadi.
          </p>
        </div>
        <Button
          type="button"
          variant={dirty ? 'default' : 'outline'}
          disabled={loading || saving || !dirty}
          onClick={savePhone}
          className="max-w-full shrink-0 self-start sm:self-auto"
        >
          {loading || saving ? (
            <Loader2 className="mr-2 h-4 w-4 shrink-0 animate-spin" />
          ) : dirty ? (
            <Save className="mr-2 h-4 w-4 shrink-0" />
          ) : (
            <CheckCircle2 className="mr-2 h-4 w-4 shrink-0" />
          )}
          <span className="truncate">{saving ? 'Saqlanmoqda…' : dirty ? 'Telefonni saqlash' : 'Saqlandi'}</span>
        </Button>
      </div>
    </div>
  );
}

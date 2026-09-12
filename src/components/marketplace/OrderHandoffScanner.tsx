import { Keyboard, Loader2, ScanLine } from 'lucide-react';
import { useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { db } from '@/lib/db';
import { toast } from 'sonner';

const HANDOFF_ERRORS: Record<string, string> = {
  not_authenticated: 'Iltimos, tizimga qayta kiring.',
  invalid_code: 'Kod bo‘sh yoki noto‘g‘ri.',
  code_not_found: 'Bu topshirish kodi topilmadi.',
  not_authorized: 'Bu buyurtma sizning savdo nuqtangizga tegishli emas.',
  already_verified: 'Bu kod avval ishlatilgan.',
  not_ready: 'Buyurtma hali “Tayyor / yo‘lda” holatiga o‘tkazilmagan.',
};

function errorCode(message?: string | null) {
  if (!message) return '';
  const match = message.match(/marketplace_handoff:([a-z_]+)/i);
  return match?.[1] || '';
}

export function OrderHandoffScanner({ onVerified }: { onVerified?: () => void | Promise<void> }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [code, setCode] = useState('');
  const [isVerifying, setIsVerifying] = useState(false);

  const verify = async () => {
    if (isVerifying) return;
    const normalized = code.replace(/\s+/g, '').trim().toUpperCase();
    if (!normalized) {
      toast.error('Topshirish kodini kiriting yoki barcode’ni skaner qiling.');
      inputRef.current?.focus();
      return;
    }

    setIsVerifying(true);
    try {
      const { data, error } = await db.rpc('marketplace_verify_order_handoff', { _code: normalized });
      if (error) {
        const key = errorCode(error.message);
        toast.error(HANDOFF_ERRORS[key] || error.message || 'Kod tasdiqlanmadi.');
        return;
      }

      const payload = (data ?? {}) as { order_number?: string };
      toast.success(
        payload.order_number
          ? `Buyurtma ${payload.order_number} topshirildi.`
          : 'Buyurtma muvaffaqiyatli topshirildi.',
      );
      setCode('');
      await onVerified?.();
    } catch (error: any) {
      toast.error(error?.message || 'Kod tasdiqlanmadi.');
    } finally {
      setIsVerifying(false);
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  };

  return (
    <div className="space-y-3 rounded-2xl border border-foreground/15 bg-card p-4 shadow-sm">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-foreground text-background">
          <ScanLine className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-bold">Buyurtmani kod bilan topshirish</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Handheld Barcode Scanner keyboard sifatida kodni yozadi. Scan tugaganda Enter yuborilsa avtomatik tasdiqlanadi.
          </p>
        </div>
      </div>

      <div className="flex gap-2">
        <div className="relative min-w-0 flex-1">
          <Keyboard className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            ref={inputRef}
            value={code}
            onChange={event => setCode(event.target.value.toUpperCase())}
            onKeyDown={event => {
              if (event.key === 'Enter') {
                event.preventDefault();
                void verify();
              }
            }}
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            inputMode="text"
            placeholder="Masalan: A7F3C921"
            className="h-11 rounded-xl pl-9 font-mono tracking-widest uppercase"
            aria-label="Topshirish kodi yoki barcode scanner input"
          />
        </div>
        <Button type="button" className="h-11 rounded-xl" disabled={isVerifying || !code.trim()} onClick={() => void verify()}>
          {isVerifying ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Tasdiqlash'}
        </Button>
      </div>

      <p className="text-[11px] text-muted-foreground">
        Qo‘lda kiritish ham ishlaydi: kodni yozing va Enter bosing. Kod faqat bir marta ishlatiladi.
      </p>
    </div>
  );
}

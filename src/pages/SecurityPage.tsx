import { Link } from 'react-router-dom';
import { ChevronLeft, ShieldCheck } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { TwoFactorCard } from '@/components/security/TwoFactorCard';
import { ActiveDevicesCard } from '@/components/security/ActiveDevicesCard';

/**
 * Security centre: second factor and active sessions.
 *
 * Both cards talk to the account-2fa / account-devices edge functions, which
 * enforce identity ownership server side.
 */
export default function SecurityPage() {
  return (
    <div className="max-w-3xl mx-auto py-4 md:py-8 px-3 md:px-4 pb-24 md:pb-8 space-y-6">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" asChild>
          <Link to="/settings" aria-label="Sozlamalarga qaytish">
            <ChevronLeft className="h-5 w-5" />
          </Link>
        </Button>
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-5 w-5 text-muted-foreground" />
          <h1 className="text-xl md:text-2xl font-bold">Xavfsizlik</h1>
        </div>
      </div>

      <p className="text-sm text-muted-foreground">
        Ikki qadamli tasdiqlash, zaxira kodlar va sizning identifikatoringizga bog’langan
        barcha akkauntlarning faol sessiyalari.
      </p>

      <TwoFactorCard />
      <ActiveDevicesCard />

      <div className="rounded-xl border border-border bg-card/40 p-4 text-xs text-muted-foreground">
        Zaxira kodlar serverda faqat SHA-256 xesh ko’rinishida saqlanadi, shuning uchun ular
        bazadan o’qib olinishi mumkin emas. Qurilmani uzish o’sha akkauntning refresh
        tokenlarini ham bekor qiladi.
      </div>
    </div>
  );
}

import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import CreatePage from '@/pages/CreatePage';
import ComposePage from '@/pages/ComposePage';

type CreateMode = 'checking' | 'modular' | 'legacy';

const READINESS_TIMEOUT_MS = 4000;

/**
 * Deployment-safe Create entry.
 *
 * Frontend va DB migration bir vaqtda deploy bo'lmasligi mumkin. P0 marker
 * RPC mavjud bo'lsa yangi modular composer ochiladi; aks holda eski Create
 * vaqtinchalik fallback bo'lib qoladi. Shu bilan main deploy yarim ishlaydigan
 * yangi Create sahifasini foydalanuvchiga chiqarmaydi.
 */
export default function CreateEntryPage() {
  const [mode, setMode] = useState<CreateMode>('checking');

  useEffect(() => {
    let active = true;

    const timeoutResult = new Promise<{ data: false; error: Error }>((resolve) => {
      window.setTimeout(
        () => resolve({ data: false, error: new Error('Create readiness timeout') }),
        READINESS_TIMEOUT_MS,
      );
    });

    const check = async () => {
      try {
        const result = await Promise.race([
          (supabase as any).rpc('create_foundation_ready'),
          timeoutResult,
        ]);

        if (!active) return;
        setMode(!result?.error && result?.data === true ? 'modular' : 'legacy');
      } catch (error) {
        console.warn('Create foundation readiness tekshiruvi ishlamadi:', error);
        if (active) setMode('legacy');
      }
    };

    void check();

    return () => {
      active = false;
    };
  }, []);

  if (mode === 'modular') return <ComposePage />;
  if (mode === 'legacy') return <CreatePage />;

  return (
    <div className="flex h-[100dvh] items-center justify-center bg-background">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Create tayyorlanmoqda...
      </div>
    </div>
  );
}

import { useCallback, useEffect, useState } from 'react';
import { Copy, KeyRound, Loader2, Plug, RefreshCw, Trash2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';

import {
  createCredential,
  listCredentials,
  miniAppApiCurlExample,
  miniAppApiEndpoint,
  revokeCredential,
  rotateCredential,
  setCredentialWebhook,
  type IssuedCredential,
  type MiniAppCredential,
} from '../developer/api';

interface MiniAppApiPanelProps {
  appId: string | null;
}

/**
 * Mini app uchun API ulanish paneli: client_id + secret, webhook, statistika.
 * Bot talab qilinmaydi — ilova bevosita ulanadi.
 */
export function MiniAppApiPanel({ appId }: MiniAppApiPanelProps) {
  const { toast } = useToast();
  const [credentials, setCredentials] = useState<MiniAppCredential[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [issued, setIssued] = useState<IssuedCredential | null>(null);
  const [webhookDrafts, setWebhookDrafts] = useState<Record<string, string>>({});

  const endpoint = miniAppApiEndpoint();

  const load = useCallback(async () => {
    if (!appId) return;
    setLoading(true);
    try {
      const list = await listCredentials(appId);
      setCredentials(list);
      setWebhookDrafts(
        list.reduce<Record<string, string>>((accumulator, item) => {
          accumulator[item.credentialId] = item.webhookUrl ?? '';
          return accumulator;
        }, {}),
      );
    } catch (error) {
      toast({
        title: 'API kalitlari yuklanmadi',
        description: error instanceof Error ? error.message : 'Xatolik',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }, [appId, toast]);

  useEffect(() => {
    void load();
  }, [load]);

  const copy = async (value: string, title: string) => {
    try {
      await navigator.clipboard.writeText(value);
      toast({ title });
    } catch {
      toast({ title: 'Nusxalanmadi', variant: 'destructive' });
    }
  };

  const handleCreate = async (environment: 'live' | 'test') => {
    if (!appId) return;
    setBusy(true);
    try {
      const created = await createCredential(appId, environment === 'test' ? 'test' : 'production', environment);
      setIssued(created);
      await load();
      toast({
        title: 'API kaliti yaratildi',
        description: 'Secretni hoziroq saqlab qo’ying — u boshqa ko’rsatilmaydi.',
      });
    } catch (error) {
      toast({
        title: 'Kalit yaratilmadi',
        description: error instanceof Error ? error.message : 'Xatolik',
        variant: 'destructive',
      });
    } finally {
      setBusy(false);
    }
  };

  const handleRotate = async (credentialId: string) => {
    setBusy(true);
    try {
      const rotated = await rotateCredential(credentialId);
      setIssued(rotated);
      await load();
      toast({ title: 'Yangi secret berildi', description: 'Eski secret endi ishlamaydi.' });
    } catch (error) {
      toast({
        title: 'Secret almashtirilmadi',
        description: error instanceof Error ? error.message : 'Xatolik',
        variant: 'destructive',
      });
    } finally {
      setBusy(false);
    }
  };

  const handleRevoke = async (credentialId: string) => {
    setBusy(true);
    try {
      await revokeCredential(credentialId);
      await load();
      toast({ title: 'Kalit o’chirildi' });
    } catch (error) {
      toast({
        title: 'Kalit o’chirilmadi',
        description: error instanceof Error ? error.message : 'Xatolik',
        variant: 'destructive',
      });
    } finally {
      setBusy(false);
    }
  };

  const handleWebhook = async (credentialId: string) => {
    setBusy(true);
    try {
      const value = (webhookDrafts[credentialId] ?? '').trim();
      await setCredentialWebhook(credentialId, value || null);
      await load();
      toast({ title: value ? 'Webhook saqlandi' : 'Webhook o’chirildi' });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Xatolik';
      toast({
        title: 'Webhook saqlanmadi',
        description:
          message === 'HTTPS_REQUIRED' ? 'Webhook manzili https bo’lishi kerak.' : message,
        variant: 'destructive',
      });
    } finally {
      setBusy(false);
    }
  };

  if (!appId) {
    return (
      <div className="rounded-lg border border-dashed p-3 text-xs text-muted-foreground">
        Ilovani saqlaganingizdan keyin shu yerda API kalitlari (client_id va secret),
        webhook va statistika paydo bo’ladi.
      </div>
    );
  }

  return (
    <div className="space-y-3 rounded-lg border border-primary/30 bg-primary/[0.03] p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm font-medium">
          <Plug className="h-4 w-4" />
          API ulanishi
        </div>
        {loading && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
      </div>

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          size="sm"
          variant="secondary"
          disabled={busy}
          onClick={() => void handleCreate('live')}
        >
          <KeyRound className="mr-1 h-3 w-3" />
          Live kalit
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={busy}
          onClick={() => void handleCreate('test')}
        >
          <KeyRound className="mr-1 h-3 w-3" />
          Test kalit
        </Button>
      </div>

      {issued && (
        <div className="space-y-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-2">
          <p className="text-xs font-medium text-amber-700 dark:text-amber-400">
            Secret faqat hozir ko’rsatiladi. Nusxalab, serveringizda saqlang.
          </p>
          <code className="block break-all rounded bg-background/70 p-2 text-xs">
            {issued.clientId}
          </code>
          <code className="block break-all rounded bg-background/70 p-2 text-xs">
            {issued.secret}
          </code>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => void copy(issued.clientId + ':' + issued.secret, 'Kalit nusxalandi')}
            >
              <Copy className="mr-1 h-3 w-3" />
              Kalitni nusxalash
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() =>
                void copy(
                  miniAppApiCurlExample(issued.clientId, issued.secret),
                  'Namuna nusxalandi',
                )
              }
            >
              <Copy className="mr-1 h-3 w-3" />
              curl namunasi
            </Button>
          </div>
        </div>
      )}

      {credentials.length === 0 && !loading && (
        <p className="text-xs text-muted-foreground">
          Hali kalit yaratilmagan. To’liq mini app (SDK, update, bildirishnoma, to’lov) uchun
          kalit kerak.
        </p>
      )}

      {credentials.map((item) => (
        <div key={item.credentialId} className="space-y-2 rounded-md border bg-background/60 p-2">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <code className="break-all rounded bg-muted px-1.5 py-0.5">{item.clientId}</code>
            <span className="rounded bg-muted px-1.5 py-0.5">{item.environment}</span>
            {!item.isActive && (
              <span className="rounded bg-destructive/10 px-1.5 py-0.5 text-destructive">
                o’chirilgan
              </span>
            )}
            <span className="text-muted-foreground">{item.requestsTotal} so’rov</span>
          </div>

          <div className="space-y-1">
            <Label htmlFor={'webhook-' + item.credentialId} className="text-xs">
              Webhook (https)
            </Label>
            <div className="flex gap-2">
              <Input
                id={'webhook-' + item.credentialId}
                value={webhookDrafts[item.credentialId] ?? ''}
                onChange={(event) =>
                  setWebhookDrafts((previous) => ({
                    ...previous,
                    [item.credentialId]: event.target.value,
                  }))
                }
                placeholder="https://server.example.com/alsamos/webhook"
                inputMode="url"
              />
              <Button
                type="button"
                variant="secondary"
                disabled={busy}
                onClick={() => void handleWebhook(item.credentialId)}
              >
                Saqlash
              </Button>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={busy}
              onClick={() => void handleRotate(item.credentialId)}
            >
              <RefreshCw className="mr-1 h-3 w-3" />
              Secretni almashtirish
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="text-destructive"
              disabled={busy}
              onClick={() => void handleRevoke(item.credentialId)}
            >
              <Trash2 className="mr-1 h-3 w-3" />
              O’chirish
            </Button>
          </div>
        </div>
      ))}

      {endpoint && (
        <p className="break-all text-xs text-muted-foreground">
          API: <code>{endpoint + '/app.get'}</code> — sarlavha:{' '}
          <code>Authorization: Bearer client_id:secret</code>
        </p>
      )}
    </div>
  );
}

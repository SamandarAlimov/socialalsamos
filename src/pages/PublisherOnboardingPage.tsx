// Publisher kabineti: publisher yaratish, domen qo'shish va TXT orqali tasdiqlash.

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

import {
  addPublisherDomain,
  createPublisher,
  isValidHandle,
  listMyPublishers,
  listPublisherDomains,
  normalizeDomain,
  verifyPublisherDomain,
  type Publisher,
  type PublisherDomain,
  type PublisherType,
} from '@/features/miniapps/publishers/api';

const TYPE_LABELS: Record<PublisherType, string> = {
  individual: 'Jismoniy shaxs',
  company: 'Kompaniya',
  government: 'Davlat tashkiloti',
  non_profit: 'Notijorat tashkilot',
};

export default function PublisherOnboardingPage() {
  const [publishers, setPublishers] = useState<Publisher[]>([]);
  const [domains, setDomains] = useState<Record<string, PublisherDomain[]>>({});
  const [handle, setHandle] = useState('');
  const [name, setName] = useState('');
  const [type, setType] = useState<PublisherType>('individual');
  const [domainInput, setDomainInput] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  const loadDomains = useCallback(async (publisherId: string) => {
    const rows = await listPublisherDomains(publisherId);
    setDomains((current) => ({ ...current, [publisherId]: rows }));
  }, []);

  const load = useCallback(async () => {
    const rows = await listMyPublishers();
    setPublishers(rows);
    await Promise.all(rows.map((row) => loadDomains(row.id)));
  }, [loadDomains]);

  useEffect(() => {
    void load();
  }, [load]);

  const onCreate = async () => {
    const normalizedHandle = handle.trim().toLowerCase();
    if (!isValidHandle(normalizedHandle)) {
      toast.error('Handle 3-32 belgi: kichik harf, raqam va _');
      return;
    }
    if (name.trim().length < 2) {
      toast.error('Nomni toliq kiriting');
      return;
    }

    setBusy(true);
    try {
      await createPublisher(normalizedHandle, name.trim(), type);
      setHandle('');
      setName('');
      toast.success('Publisher yaratildi');
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Yaratilmadi');
    } finally {
      setBusy(false);
    }
  };

  const onAddDomain = async (publisher: Publisher) => {
    const normalized = normalizeDomain(domainInput[publisher.id] ?? '');
    if (!normalized) {
      toast.error('Domenni togri kiriting, masalan: islom.uz');
      return;
    }

    setBusy(true);
    try {
      const { token } = await addPublisherDomain(publisher.id, normalized);
      setDomainInput((current) => ({ ...current, [publisher.id]: '' }));
      await loadDomains(publisher.id);
      toast.success('TXT yozuvi: ' + token, { duration: 12000 });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Domen qoshilmadi');
    } finally {
      setBusy(false);
    }
  };

  const onVerify = async (domain: PublisherDomain) => {
    setBusy(true);
    try {
      const { verified, hint } = await verifyPublisherDomain(domain.id);
      if (verified) {
        toast.success('Domen tasdiqlandi');
      } else {
        toast.error(hint ?? 'TXT yozuvi topilmadi');
      }
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Tekshirilmadi');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto w-full max-w-3xl p-4">
      <header className="mb-6">
        <h1 className="text-xl font-semibold">Publisher kabineti</h1>
        <p className="text-sm text-muted-foreground">
          Kompaniya yoki shaxsiy profil yarating, domeningizni tasdiqlang va mini
          ilovalaringizni rasmiy nom bilan chiqaring.
        </p>
      </header>

      <section className="mb-8 rounded-xl border p-4">
        <h2 className="mb-3 font-medium">Yangi publisher</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <Input
            value={handle}
            onChange={(event) => setHandle(event.target.value)}
            placeholder="handle (masalan: islomuz)"
          />
          <Input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Ko’rinadigan nom"
          />
          <select
            className="h-10 rounded-md border bg-background px-3 text-sm"
            value={type}
            onChange={(event) => setType(event.target.value as PublisherType)}
          >
            {Object.entries(TYPE_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
          <Button disabled={busy} onClick={onCreate}>
            Yaratish
          </Button>
        </div>
      </section>

      <section>
        <h2 className="mb-3 font-medium">Mening publisherlarim</h2>
        {publishers.length === 0 ? (
          <p className="text-sm text-muted-foreground">Hozircha publisher yo’q.</p>
        ) : (
          <ul className="space-y-4">
            {publishers.map((publisher) => (
              <li key={publisher.id} className="rounded-xl border p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{publisher.name}</span>
                  <span className="text-sm text-muted-foreground">
                    @{publisher.handle}
                  </span>
                  <Badge variant="secondary">{TYPE_LABELS[publisher.type]}</Badge>
                  <Badge
                    variant={
                      publisher.verification === 'unverified' ? 'outline' : 'default'
                    }
                  >
                    {publisher.verification}
                  </Badge>
                </div>

                <div className="mt-3 flex gap-2">
                  <Input
                    value={domainInput[publisher.id] ?? ''}
                    onChange={(event) =>
                      setDomainInput((current) => ({
                        ...current,
                        [publisher.id]: event.target.value,
                      }))
                    }
                    placeholder="islom.uz"
                  />
                  <Button
                    variant="outline"
                    disabled={busy}
                    onClick={() => onAddDomain(publisher)}
                  >
                    Domen qo’shish
                  </Button>
                </div>

                <ul className="mt-3 space-y-2">
                  {(domains[publisher.id] ?? []).map((domain) => (
                    <li
                      key={domain.id}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-muted/50 p-2 text-sm"
                    >
                      <div className="min-w-0">
                        <div className="font-medium">{domain.domain}</div>
                        <div className="text-xs text-muted-foreground">
                          {domain.verified_at
                            ? 'Tasdiqlangan'
                            : 'TXT: ' + (domain.verification_token ?? '—')}
                        </div>
                        {domain.check_error && !domain.verified_at && (
                          <div className="text-xs text-destructive">
                            {domain.check_error}
                          </div>
                        )}
                      </div>
                      {domain.verified_at ? (
                        <Badge>OK</Badge>
                      ) : (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={busy}
                          onClick={() => onVerify(domain)}
                        >
                          Tekshirish
                        </Button>
                      )}
                    </li>
                  ))}
                </ul>

                <p className="mt-3 text-xs text-muted-foreground">
                  TXT yozuvini domen ildiziga yoki <code>_alsamos.domen</code> ga
                  qo’ying. DNS tarqalishi 24 soatgacha davom etishi mumkin.
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

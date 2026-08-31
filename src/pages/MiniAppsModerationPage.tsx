// Mini Apps moderatsiya navbati (admin).
//
// RPC lar `service_role` talab qilgani uchun barcha amallar `mini-app-admin`
// edge funksiyasi orqali o'tadi. Admin bo'lmagan foydalanuvchi 403 oladi.

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';

import {
  fetchModerationQueue,
  setMiniAppStatus,
  type ModerationQueueItem,
} from '@/features/miniapps/admin/api';
import type { MiniAppStatus } from '@/features/miniapps/types';

const TABS: Array<{ value: MiniAppStatus; label: string }> = [
  { value: 'pending_review', label: 'Ko\u2019rib chiqilmoqda' },
  { value: 'approved', label: 'Tasdiqlangan' },
  { value: 'suspended', label: 'To\u2019xtatilgan' },
  { value: 'rejected', label: 'Rad etilgan' },
];

export default function MiniAppsModerationPage() {
  const [status, setStatus] = useState<MiniAppStatus>('pending_review');
  const [items, setItems] = useState<ModerationQueueItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [forbidden, setForbidden] = useState(false);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async (nextStatus: MiniAppStatus) => {
    setIsLoading(true);
    try {
      const queue = await fetchModerationQueue(nextStatus);
      setItems(queue);
      setForbidden(false);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'UNKNOWN';
      if (message === 'FORBIDDEN') {
        setForbidden(true);
      } else {
        toast.error('Navbat yuklanmadi: ' + message);
      }
      setItems([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(status);
  }, [load, status]);

  const applyStatus = async (item: ModerationQueueItem, next: MiniAppStatus) => {
    setBusyId(item.app_id);
    try {
      await setMiniAppStatus(item.app_id, next, notes[item.app_id]);
      toast.success(item.name + ' \u2014 holat yangilandi');
      setItems((current) => current.filter((row) => row.app_id !== item.app_id));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Amal bajarilmadi');
    } finally {
      setBusyId(null);
    }
  };

  if (forbidden) {
    return (
      <div className="mx-auto max-w-2xl p-8 text-center">
        <h1 className="text-xl font-semibold">Ruxsat yo\u2019q</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Bu sahifa faqat moderatorlar uchun.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-4xl p-4">
      <header className="mb-4">
        <h1 className="text-xl font-semibold">Mini Apps moderatsiyasi</h1>
        <p className="text-sm text-muted-foreground">
          Yangi ilovalarni tekshiring, shikoyat kelganlarini to\u2019xtating.
        </p>
      </header>

      <div className="mb-4 flex flex-wrap gap-2">
        {TABS.map((tab) => (
          <Button
            key={tab.value}
            size="sm"
            variant={status === tab.value ? 'default' : 'outline'}
            onClick={() => setStatus(tab.value)}
          >
            {tab.label}
          </Button>
        ))}
      </div>

      {isLoading ? (
        <p className="py-12 text-center text-sm text-muted-foreground">Yuklanmoqda\u2026</p>
      ) : items.length === 0 ? (
        <p className="py-12 text-center text-sm text-muted-foreground">
          Bu bo\u2019limda ilova yo\u2019q.
        </p>
      ) : (
        <ul className="space-y-3">
          {items.map((item) => (
            <li key={item.app_id} className="rounded-xl border p-4">
              <div className="flex items-start gap-3">
                {item.icon_url ? (
                  <img
                    src={item.icon_url}
                    alt=""
                    className="h-12 w-12 rounded-xl object-cover"
                    loading="lazy"
                  />
                ) : (
                  <div className="h-12 w-12 rounded-xl bg-muted" />
                )}

                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{item.name}</span>
                    <Badge variant="secondary">{item.app_type}</Badge>
                    {item.publisher_verification === 'official' && (
                      <Badge>Rasmiy</Badge>
                    )}
                    {item.open_reports > 0 && (
                      <Badge variant="destructive">
                        {item.open_reports} shikoyat
                      </Badge>
                    )}
                  </div>

                  <p className="truncate text-sm text-muted-foreground">
                    {item.publisher_name ?? 'Publisher yo\u2019q'}
                    {item.publisher_handle ? ' \u00b7 @' + item.publisher_handle : ''}
                  </p>

                  {item.url && (
                    <a
                      href={item.url}
                      target="_blank"
                      rel="noopener noreferrer nofollow"
                      className="break-all text-xs text-primary underline"
                    >
                      {item.url}
                    </a>
                  )}

                  <Textarea
                    className="mt-3"
                    rows={2}
                    placeholder="Moderator izohi (rad etishda majburiy emas, lekin tavsiya etiladi)"
                    value={notes[item.app_id] ?? ''}
                    onChange={(event) =>
                      setNotes((current) => ({
                        ...current,
                        [item.app_id]: event.target.value,
                      }))
                    }
                  />

                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      disabled={busyId === item.app_id}
                      onClick={() => applyStatus(item, 'approved')}
                    >
                      Tasdiqlash
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busyId === item.app_id}
                      onClick={() => applyStatus(item, 'rejected')}
                    >
                      Rad etish
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      disabled={busyId === item.app_id}
                      onClick={() => applyStatus(item, 'suspended')}
                    >
                      To\u2019xtatish
                    </Button>
                  </div>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

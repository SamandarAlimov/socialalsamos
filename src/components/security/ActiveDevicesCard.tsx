import { useEffect, useState } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { Loader2, LogOut, Monitor, RefreshCw, Smartphone, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import {
  ActiveDevice,
  AlsamosAuthError,
  listActiveDevices,
  revokeDevice,
  revokeOtherDevices,
} from '@/lib/alsamosAuth';

function errorMessage(e: unknown): string {
  return e instanceof AlsamosAuthError ? e.message : 'Kutilmagan xatolik yuz berdi.';
}

function isMobileAgent(userAgent: string | null): boolean {
  return /Android|iPhone|iPad|Mobile/i.test(userAgent ?? '');
}

export function ActiveDevicesCard() {
  const [devices, setDevices] = useState<ActiveDevice[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [revokingOthers, setRevokingOthers] = useState(false);

  const load = async () => {
    try {
      const result = await listActiveDevices();
      setDevices(result.devices);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const handleRevoke = async (device: ActiveDevice) => {
    setBusyId(device.id);
    try {
      await revokeDevice(device.id);
      toast.success('Qurilma uzildi va sessiyalari bekor qilindi.');
      await load();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusyId(null);
    }
  };

  const handleRevokeOthers = async () => {
    setRevokingOthers(true);
    try {
      const result = await revokeOtherDevices();
      toast.success(`${result.revoked_devices} qurilma uzildi.`);
      await load();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setRevokingOthers(false);
    }
  };

  return (
    <div className="bg-card rounded-xl border border-border overflow-hidden">
      <div className="p-4 border-b border-border flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="font-semibold">Faol qurilmalar</h2>
          <p className="text-xs text-muted-foreground">
            Identifikatoringizga bog’langan barcha akkauntlarning sessiyalari
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="ghost" size="icon" onClick={load} aria-label="Yangilash">
            <RefreshCw className="h-4 w-4" />
          </Button>
          {devices.length > 1 && (
            <Button
              variant="outline"
              size="sm"
              disabled={revokingOthers}
              onClick={handleRevokeOthers}
            >
              {revokingOthers ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <LogOut className="mr-2 h-4 w-4" />
              )}
              Boshqalarini uzish
            </Button>
          )}
        </div>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 p-4 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Yuklanmoqda...
        </div>
      ) : devices.length === 0 ? (
        <p className="p-4 text-sm text-muted-foreground">
          Faol qurilma topilmadi. Keyingi kirishdan so’ng bu ro’yxat to’ladi.
        </p>
      ) : (
        <div className="divide-y divide-border">
          {devices.map((device) => {
            const DeviceIcon = isMobileAgent(device.user_agent) ? Smartphone : Monitor;
            return (
              <div key={device.id} className="p-4 flex items-center justify-between gap-3">
                <div className="flex min-w-0 items-center gap-3">
                  <span className="h-11 w-11 shrink-0 rounded-full bg-muted flex items-center justify-center">
                    <DeviceIcon className="h-5 w-5 text-muted-foreground" />
                  </span>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="truncate text-sm font-medium">{device.label}</p>
                      {device.is_current_device && (
                        <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary">
                          Shu qurilma
                        </span>
                      )}
                      {device.is_current_account && (
                        <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                          Joriy akkaunt
                        </span>
                      )}
                    </div>
                    <p className="truncate text-xs text-muted-foreground">
                      Slot {device.slot_no}
                      {device.ip ? ` · ${device.ip}` : ''}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Oxirgi faollik:{' '}
                      {formatDistanceToNow(new Date(device.last_seen_at), { addSuffix: true })}
                    </p>
                  </div>
                </div>

                <Button
                  variant="ghost"
                  size="icon"
                  disabled={busyId === device.id}
                  onClick={() => handleRevoke(device)}
                  aria-label="Qurilmani uzish"
                >
                  {busyId === device.id ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Trash2 className="h-4 w-4 text-destructive" />
                  )}
                </Button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default ActiveDevicesCard;

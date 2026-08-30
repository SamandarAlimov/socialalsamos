import { useEffect, useMemo, useState } from 'react';
import { Camera, Loader2, Mic, Settings2, Volume2 } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';

interface CallDeviceSettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  localStream: MediaStream | null;
  outputDeviceId: string;
  onOutputDeviceChange: (deviceId: string) => void;
  onCameraChange?: (deviceId: string) => Promise<boolean> | boolean;
  onMicrophoneChange?: (deviceId: string) => Promise<boolean> | boolean;
}

function deviceLabel(device: MediaDeviceInfo, fallback: string, index: number) {
  return device.label || `${fallback} ${index + 1}`;
}

export function CallDeviceSettingsDialog({
  open,
  onOpenChange,
  localStream,
  outputDeviceId,
  onOutputDeviceChange,
  onCameraChange,
  onMicrophoneChange,
}: CallDeviceSettingsDialogProps) {
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [busy, setBusy] = useState<'camera' | 'microphone' | null>(null);

  const cameraId = localStream?.getVideoTracks()[0]?.getSettings().deviceId || '';
  const microphoneId = localStream?.getAudioTracks()[0]?.getSettings().deviceId || '';

  const cameras = useMemo(
    () => devices.filter((device) => device.kind === 'videoinput'),
    [devices]
  );
  const microphones = useMemo(
    () => devices.filter((device) => device.kind === 'audioinput'),
    [devices]
  );
  const outputs = useMemo(
    () => devices.filter((device) => device.kind === 'audiooutput'),
    [devices]
  );

  const supportsOutputSelection =
    typeof HTMLMediaElement !== 'undefined' &&
    typeof (HTMLMediaElement.prototype as HTMLMediaElement & {
      setSinkId?: (deviceId: string) => Promise<void>;
    }).setSinkId === 'function';

  useEffect(() => {
    if (!open || !navigator.mediaDevices?.enumerateDevices) return;

    let cancelled = false;
    const load = async () => {
      try {
        const next = await navigator.mediaDevices.enumerateDevices();
        if (!cancelled) setDevices(next);
      } catch {
        if (!cancelled) setDevices([]);
      }
    };

    void load();
    navigator.mediaDevices.addEventListener?.('devicechange', load);
    return () => {
      cancelled = true;
      navigator.mediaDevices.removeEventListener?.('devicechange', load);
    };
  }, [open]);

  const applyCamera = async (deviceId: string) => {
    if (!onCameraChange || !deviceId || deviceId === cameraId) return;
    setBusy('camera');
    try {
      await onCameraChange(deviceId);
    } finally {
      setBusy(null);
    }
  };

  const applyMicrophone = async (deviceId: string) => {
    if (!onMicrophoneChange || !deviceId || deviceId === microphoneId) return;
    setBusy('microphone');
    try {
      await onMicrophoneChange(deviceId);
    } finally {
      setBusy(null);
    }
  };

  const selectClass =
    'h-11 w-full rounded-xl border border-white/10 bg-white/5 px-3 text-sm text-white outline-none transition focus:border-white/25 focus:ring-2 focus:ring-white/10 disabled:opacity-50';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[calc(100vw-1.5rem)] max-w-md gap-0 overflow-hidden rounded-3xl border-white/10 bg-[#11161d]/95 p-0 text-white shadow-2xl backdrop-blur-2xl">
        <div className="border-b border-white/10 px-5 py-4">
          <div className="flex items-center gap-2">
            <Settings2 className="h-5 w-5 text-white/70" />
            <DialogTitle className="text-base">Qo‘ng‘iroq qurilmalari</DialogTitle>
          </div>
          <DialogDescription className="mt-1 text-xs text-white/45">
            Kamera, mikrofon va ovoz chiqishini qo‘ng‘iroqni uzmasdan almashtiring.
          </DialogDescription>
        </div>

        <div className="space-y-5 p-5">
          <label className="block space-y-2">
            <span className="flex items-center gap-2 text-xs font-medium text-white/65">
              <Camera className="h-4 w-4" />
              Kamera
              {busy === 'camera' && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            </span>
            <select
              className={selectClass}
              value={cameraId}
              disabled={!onCameraChange || busy === 'camera'}
              onChange={(event) => void applyCamera(event.target.value)}
            >
              {cameras.length === 0 && <option value="">Kamera topilmadi</option>}
              {cameras.map((device, index) => (
                <option key={device.deviceId} value={device.deviceId} className="bg-neutral-900">
                  {deviceLabel(device, 'Kamera', index)}
                </option>
              ))}
            </select>
          </label>

          <label className="block space-y-2">
            <span className="flex items-center gap-2 text-xs font-medium text-white/65">
              <Mic className="h-4 w-4" />
              Mikrofon
              {busy === 'microphone' && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            </span>
            <select
              className={selectClass}
              value={microphoneId}
              disabled={!onMicrophoneChange || busy === 'microphone'}
              onChange={(event) => void applyMicrophone(event.target.value)}
            >
              {microphones.length === 0 && <option value="">Mikrofon topilmadi</option>}
              {microphones.map((device, index) => (
                <option key={device.deviceId} value={device.deviceId} className="bg-neutral-900">
                  {deviceLabel(device, 'Mikrofon', index)}
                </option>
              ))}
            </select>
          </label>

          <label className="block space-y-2">
            <span className="flex items-center gap-2 text-xs font-medium text-white/65">
              <Volume2 className="h-4 w-4" />
              Ovoz chiqishi
            </span>
            <select
              className={selectClass}
              value={outputDeviceId}
              disabled={!supportsOutputSelection}
              onChange={(event) => onOutputDeviceChange(event.target.value)}
            >
              <option value="" className="bg-neutral-900">
                Tizim qurilmasi
              </option>
              {outputs.map((device, index) => (
                <option key={device.deviceId} value={device.deviceId} className="bg-neutral-900">
                  {deviceLabel(device, 'Karnay', index)}
                </option>
              ))}
            </select>
            {!supportsOutputSelection && (
              <p className="text-[11px] leading-relaxed text-white/35">
                Bu brauzer ovoz chiqish qurilmasini ilova ichidan almashtirishni qo‘llamaydi.
              </p>
            )}
          </label>
        </div>
      </DialogContent>
    </Dialog>
  );
}

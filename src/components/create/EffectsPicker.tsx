import { CameraVideoRecorder } from '@/components/create/CameraVideoRecorder';

interface EffectsPickerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCapture: (file: File, url: string) => void;
  mode?: 'photo' | 'video';
}

/**
 * Legacy entry point kept for callers that still open EffectsPicker.
 * All capture now goes through the same real CameraVideoRecorder pipeline so
 * preview filters and the saved file cannot diverge.
 */
export function EffectsPicker({
  open,
  onOpenChange,
  onCapture,
  mode = 'photo',
}: EffectsPickerProps) {
  if (!open) return null;

  return (
    <CameraVideoRecorder
      mode={mode}
      aspectRatio="9:16"
      onClose={() => onOpenChange(false)}
      onCapture={(file, type, url) => {
        if (type !== mode) return;
        onCapture(file, url);
        onOpenChange(false);
      }}
    />
  );
}

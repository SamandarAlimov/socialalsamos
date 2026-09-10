import { useEffect, useRef } from 'react';

interface CallPreflightDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  peerName: string;
  peerAvatar?: string;
  initialType: 'audio' | 'video';
  onStart: (type: 'audio' | 'video') => Promise<void> | void;
}

/**
 * Compatibility boundary for the old call preflight flow.
 *
 * The chat header already expresses the user's intent: tapping the phone starts
 * an audio call and tapping the camera starts a video call. Asking the same
 * question again in a modal added friction and, for video calls, caused an
 * unnecessary camera preview capture before the real WebRTC capture.
 *
 * Keep this component temporarily so call sites do not need a broad page-level
 * refactor, but make it dispatch the selected mode immediately and render no
 * UI. This also means audio calls never touch the camera permission path.
 */
export function CallPreflightDialog({
  open,
  onOpenChange,
  initialType,
  onStart,
}: CallPreflightDialogProps) {
  const startedRef = useRef(false);

  useEffect(() => {
    if (!open) {
      startedRef.current = false;
      return;
    }
    if (startedRef.current) return;

    startedRef.current = true;
    void Promise.resolve(onStart(initialType)).finally(() => {
      onOpenChange(false);
    });
  }, [initialType, onOpenChange, onStart, open]);

  return null;
}

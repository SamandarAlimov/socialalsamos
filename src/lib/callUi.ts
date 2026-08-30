export type CallUiPhase =
  | 'ringing'
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'failed';

export interface CallUiStateInput {
  isConnected: boolean;
  isConnecting?: boolean;
  isReconnecting?: boolean;
  participantCount: number;
  callStartedAt?: string | null;
  error?: string | null;
}

export function deriveCallUiPhase(input: CallUiStateInput): CallUiPhase {
  if (input.error && !input.isConnected) return 'failed';
  if (input.isReconnecting) return 'reconnecting';
  if (input.isConnected) return 'connected';

  // A created call with nobody else in the WebRTC room yet is ringing. Once a
  // peer appears, SDP/ICE negotiation is in progress.
  if (input.participantCount === 0 && !input.callStartedAt) return 'ringing';
  return 'connecting';
}

export function formatCallDuration(seconds: number): string {
  const safe = Math.max(0, Math.floor(Number.isFinite(seconds) ? seconds : 0));
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const secs = safe % 60;

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }
  return `${minutes}:${String(secs).padStart(2, '0')}`;
}

export function callPhaseLabel(phase: CallUiPhase): string {
  switch (phase) {
    case 'ringing':
      return 'Javob kutilmoqda...';
    case 'connecting':
      return 'Ulanmoqda...';
    case 'reconnecting':
      return 'Qayta ulanmoqda...';
    case 'failed':
      return 'Ulanishda xatolik';
    case 'connected':
      return 'Ulangan';
  }
}

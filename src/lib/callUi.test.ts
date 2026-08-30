import { describe, expect, it } from 'vitest';
import { callPhaseLabel, deriveCallUiPhase, formatCallDuration } from './callUi';

describe('call UI state', () => {
  it('keeps an unanswered outgoing call in ringing state', () => {
    expect(
      deriveCallUiPhase({
        isConnected: false,
        participantCount: 0,
        callStartedAt: null,
      })
    ).toBe('ringing');
  });

  it('distinguishes negotiation and reconnection', () => {
    expect(
      deriveCallUiPhase({
        isConnected: false,
        participantCount: 1,
        callStartedAt: null,
      })
    ).toBe('connecting');

    expect(
      deriveCallUiPhase({
        isConnected: true,
        isReconnecting: true,
        participantCount: 1,
        callStartedAt: '2026-08-30T10:00:00.000Z',
      })
    ).toBe('reconnecting');
  });

  it('surfaces hard failures before connected state', () => {
    const phase = deriveCallUiPhase({
      isConnected: false,
      participantCount: 0,
      error: 'Signaling connection error',
    });
    expect(phase).toBe('failed');
    expect(callPhaseLabel(phase)).toBe('Ulanishda xatolik');
  });

  it('formats duration consistently for short and long calls', () => {
    expect(formatCallDuration(5)).toBe('0:05');
    expect(formatCallDuration(65)).toBe('1:05');
    expect(formatCallDuration(3661)).toBe('1:01:01');
  });
});

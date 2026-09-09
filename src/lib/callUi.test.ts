import { describe, expect, it } from 'vitest';
import {
  callPhaseLabel,
  deriveCallUiPhase,
  formatCallDuration,
  resolveCallDisplayName,
} from './callUi';

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

  it('never labels a context-less 1:1 call as a group call', () => {
    expect(
      resolveCallDisplayName({
        participantCount: 0,
        peerName: "Guruh qo'ng'irog'i",
      }),
    ).toBe('Suhbatdosh');

    expect(
      resolveCallDisplayName({
        participantCount: 1,
        participantName: 'Samandar',
        peerName: "Guruh qo'ng'irog'i",
      }),
    ).toBe('Samandar');
  });

  it('keeps a real group call label when group controls are available', () => {
    expect(
      resolveCallDisplayName({
        participantCount: 0,
        groupControlsAvailable: true,
        peerName: "Guruh qo'ng'irog'i",
      }),
    ).toBe("Guruh qo'ng'irog'i");
  });

  it('formats duration consistently for short and long calls', () => {
    expect(formatCallDuration(5)).toBe('0:05');
    expect(formatCallDuration(65)).toBe('1:05');
    expect(formatCallDuration(3661)).toBe('1:01:01');
  });
});

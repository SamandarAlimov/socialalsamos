import { describe, expect, it } from 'vitest';
import {
  SIGNAL_FRESHNESS_GRACE_MS,
  isFreshNativeSignal,
  shouldInitiateNativePeer,
} from './webrtcSignalPolicy';

describe('native WebRTC signaling policy', () => {
  it('assigns exactly one deterministic initiator in mesh calls', () => {
    const a = '11111111-1111-4111-8111-111111111111';
    const b = '22222222-2222-4222-8222-222222222222';

    expect(shouldInitiateNativePeer(a, b, 'mesh')).toBe(true);
    expect(shouldInitiateNativePeer(b, a, 'mesh')).toBe(false);
  });

  it('lets only the broadcaster initiate in broadcast topology', () => {
    const host = '11111111-1111-4111-8111-111111111111';
    const viewer = '22222222-2222-4222-8222-222222222222';

    expect(shouldInitiateNativePeer(host, viewer, 'broadcast', host)).toBe(true);
    expect(shouldInitiateNativePeer(viewer, host, 'broadcast', host)).toBe(false);
  });

  it('rejects persisted SDP/ICE from an older browser session', () => {
    const joinedAt = 1_000_000;
    const staleSentAt = joinedAt - SIGNAL_FRESHNESS_GRACE_MS - 1;
    const freshSentAt = joinedAt - SIGNAL_FRESHNESS_GRACE_MS + 1;

    expect(isFreshNativeSignal(joinedAt, staleSentAt)).toBe(false);
    expect(isFreshNativeSignal(joinedAt, freshSentAt)).toBe(true);
  });

  it('uses database created_at as a freshness fallback', () => {
    const joinedAt = Date.parse('2026-09-09T06:00:00.000Z');

    expect(
      isFreshNativeSignal(joinedAt, undefined, '2026-09-09T05:59:30.000Z'),
    ).toBe(false);
    expect(
      isFreshNativeSignal(joinedAt, undefined, '2026-09-09T05:59:55.000Z'),
    ).toBe(true);
  });

  it('accepts live realtime frames without a persistence timestamp', () => {
    expect(isFreshNativeSignal(Date.now())).toBe(true);
  });
});

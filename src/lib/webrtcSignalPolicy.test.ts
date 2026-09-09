import { describe, expect, it } from 'vitest';
import {
  SIGNAL_FRESHNESS_GRACE_MS,
  isFreshNativeSignal,
  shouldInitiateNativePeer,
} from './webrtcSignalPolicy';
import {
  decidePeerSession,
  expandIceServersForReliability,
  iceRestartDelayMs,
  negotiationMatches,
} from './webrtcReliability';

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

  it('never applies a stale or id-less answer/candidate to an established ICE generation', () => {
    expect(negotiationMatches('offer-2', 'offer-2')).toBe(true);
    expect(negotiationMatches('offer-2', 'offer-1')).toBe(false);
    expect(negotiationMatches('offer-2', undefined)).toBe(false);

    // Before any local/remote generation exists, an early legacy candidate may
    // still be queued. Once the generation is known, id-less frames are stale.
    expect(negotiationMatches(undefined, undefined)).toBe(true);
    expect(negotiationMatches(undefined, 'offer-1')).toBe(true);
  });

  it('only lets an authoritative newer ready frame replace a browser session', () => {
    expect(decidePeerSession('session-a', 2000, 'session-b', 2100, false)).toBe('reject');
    expect(decidePeerSession('session-a', 2000, 'session-b', 1900, true)).toBe('reject');
    expect(decidePeerSession('session-a', 2000, 'session-b', 2100, true)).toBe('replace');
  });

  it('adds explicit TCP fallback to plain TURN URLs without changing STUN', () => {
    const expanded = expandIceServersForReliability([
      { urls: 'stun:stun.example.com:3478' },
      {
        urls: 'turn:turn.example.com:3478',
        username: 'user',
        credential: 'secret',
      },
    ]);
    const urls = expanded.flatMap((server) =>
      (Array.isArray(server.urls) ? server.urls : [server.urls]).map(String),
    );

    expect(urls).toContain('stun:stun.example.com:3478');
    expect(urls).toContain('turn:turn.example.com:3478?transport=udp');
    expect(urls).toContain('turn:turn.example.com:3478?transport=tcp');
  });

  it('waits before restarting transient disconnected ICE', () => {
    expect(iceRestartDelayMs(0, 'disconnected')).toBeGreaterThanOrEqual(3000);
    expect(iceRestartDelayMs(0, 'failed')).toBeLessThan(iceRestartDelayMs(0, 'disconnected'));
  });
});

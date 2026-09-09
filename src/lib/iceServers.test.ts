import { describe, expect, it } from 'vitest';
import {
  applyRelayPolicy,
  ensureTurnFallback,
  getIceServers,
  hasTurnRelay,
  urlsOfIceServer,
} from './iceServers';

describe('native WebRTC ICE policy', () => {
  it('keeps STUN discovery and a TURN fallback in the default configuration', () => {
    const servers = getIceServers();
    const urls = servers.flatMap(urlsOfIceServer);

    expect(urls.some((url) => url.startsWith('stun:'))).toBe(true);
    expect(hasTurnRelay(servers)).toBe(true);
  });

  it('keeps dedicated TURN candidates when relay fallback is enabled', () => {
    const servers: RTCIceServer[] = [
      { urls: 'stun:stun.example.com:3478' },
      {
        urls: ['turn:turn.example.com:3478?transport=udp', 'turns:turn.example.com:5349'],
        username: 'user',
        credential: 'secret',
      },
    ];

    const result = ensureTurnFallback(servers, true);
    const urls = result.flatMap(urlsOfIceServer);

    expect(hasTurnRelay(result)).toBe(true);
    expect(urls).toContain('turns:turn.example.com:5349');
    expect(urls.some((url) => url.includes('openrelay.metered.ca'))).toBe(false);
  });

  it('adds emergency TURN when no dedicated relay is configured', () => {
    const result = ensureTurnFallback(
      [{ urls: 'stun:stun.example.com:3478' }],
      true,
    );
    const urls = result.flatMap(urlsOfIceServer);

    expect(hasTurnRelay(result)).toBe(true);
    expect(urls.some((url) => url.includes('openrelay.metered.ca'))).toBe(true);
  });

  it('strips TURN only when relay has been explicitly disabled', () => {
    const servers: RTCIceServer[] = [
      {
        urls: ['stun:stun.example.com:3478', 'turn:turn.example.com:3478'],
        username: 'user',
        credential: 'secret',
      },
    ];

    const result = applyRelayPolicy(servers, false);
    const urls = result.flatMap(urlsOfIceServer);

    expect(urls).toEqual(['stun:stun.example.com:3478']);
    expect(hasTurnRelay(result)).toBe(false);
  });
});

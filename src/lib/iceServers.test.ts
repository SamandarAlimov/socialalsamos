import { describe, expect, it } from 'vitest';
import {
  applyRelayPolicy,
  getIceServers,
  hasTurnRelay,
  urlsOfIceServer,
} from './iceServers';

describe('native WebRTC ICE policy', () => {
  it('always keeps STUN discovery in the default configuration', () => {
    const urls = getIceServers().flatMap(urlsOfIceServer);
    expect(urls.some((url) => url.startsWith('stun:'))).toBe(true);
  });

  it('keeps TURN candidates when relay fallback is enabled', () => {
    const servers: RTCIceServer[] = [
      { urls: 'stun:stun.example.com:3478' },
      {
        urls: ['turn:turn.example.com:3478?transport=udp', 'turns:turn.example.com:5349'],
        username: 'user',
        credential: 'secret',
      },
    ];

    const result = applyRelayPolicy(servers, true);
    expect(hasTurnRelay(result)).toBe(true);
    expect(result.flatMap(urlsOfIceServer)).toContain('turns:turn.example.com:5349');
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

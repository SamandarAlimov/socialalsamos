import { describe, expect, it } from 'vitest';
import {
  applyRelayPolicy,
  getIceServers,
  getTurnIceServers,
  hasTurnRelay,
  mergeIceServerSources,
  urlsOfIceServer,
} from './iceServers';

describe('native WebRTC ICE policy', () => {
  it('always keeps STUN discovery in the default configuration', () => {
    const urls = getIceServers().flatMap(urlsOfIceServer);
    expect(urls.some((url) => url.startsWith('stun:'))).toBe(true);
  });

  it('keeps configured TURN candidates when relay fallback is enabled', () => {
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

  it('merges environment and remote TURN sources instead of replacing either source', () => {
    const environmentServers: RTCIceServer[] = [
      { urls: 'stun:stun.example.com:3478' },
      {
        urls: 'turn:env-turn.example.com:3478?transport=udp',
        username: 'env-user',
        credential: 'env-secret',
      },
    ];
    const remoteServers: RTCIceServer[] = [
      {
        urls: 'turn:remote-turn.example.com:3478?transport=tcp',
        username: 'remote-user',
        credential: 'remote-secret',
      },
    ];

    const result = mergeIceServerSources(environmentServers, remoteServers);
    const urls = result.flatMap(urlsOfIceServer);

    expect(urls).toContain('turn:env-turn.example.com:3478?transport=udp');
    expect(urls).toContain('turn:remote-turn.example.com:3478?transport=tcp');
  });

  it('keeps rotated credentials for the same TURN endpoint as independent fallbacks', () => {
    const result = mergeIceServerSources(
      [
        {
          urls: 'turn:turn.example.com:3478',
          username: 'user',
          credential: 'old-secret',
        },
      ],
      [
        {
          urls: 'turn:turn.example.com:3478',
          username: 'user',
          credential: 'new-secret',
        },
      ],
    );

    expect(result).toHaveLength(2);
  });

  it('extracts only TURN URLs for the relay-only operational probe', () => {
    const result = getTurnIceServers([
      {
        urls: [
          'stun:stun.example.com:3478',
          'turn:turn.example.com:3478?transport=udp',
          'turns:turn.example.com:5349',
        ],
        username: 'user',
        credential: 'secret',
      },
    ]);

    expect(result).toHaveLength(1);
    expect(result.flatMap(urlsOfIceServer)).toEqual([
      'turn:turn.example.com:3478?transport=udp',
      'turns:turn.example.com:5349',
    ]);
    expect(result[0]?.username).toBe('user');
    expect(result[0]?.credential).toBe('secret');
  });
});
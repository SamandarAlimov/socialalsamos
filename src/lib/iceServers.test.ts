import { describe, expect, it } from 'vitest';
import { getIceServers } from './iceServers';

function urlsOf(server: RTCIceServer): string[] {
  return (Array.isArray(server.urls) ? server.urls : [server.urls]).map(String);
}

describe('native WebRTC ICE policy', () => {
  it('keeps NAT discovery but does not use a TURN relay by default', () => {
    const urls = getIceServers().flatMap(urlsOf);

    expect(urls.some((url) => url.startsWith('stun:'))).toBe(true);
    expect(urls.some((url) => url.startsWith('turn:') || url.startsWith('turns:'))).toBe(false);
  });
});

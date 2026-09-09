export const WEBRTC_PRESENCE_LEAVE_GRACE_MS = 6000;
export const WEBRTC_PEER_CONNECTION_TIMEOUT_MS = 25000;

export type PeerSessionDecision = 'accept' | 'replace' | 'reject';

function urlsOf(server: RTCIceServer): string[] {
  return (Array.isArray(server.urls) ? server.urls : [server.urls])
    .map((url) => String(url || '').trim())
    .filter(Boolean);
}

function isTurnUrl(url: string): boolean {
  const normalized = url.toLowerCase();
  return normalized.startsWith('turn:') || normalized.startsWith('turns:');
}

function withTransport(url: string, transport: 'udp' | 'tcp'): string {
  if (/([?&])transport=/i.test(url)) return url;
  return `${url}${url.includes('?') ? '&' : '?'}transport=${transport}`;
}

export function expandIceServersForReliability(servers: RTCIceServer[]): RTCIceServer[] {
  const seen = new Set<string>();
  const result: RTCIceServer[] = [];

  for (const server of servers) {
    const expandedUrls: string[] = [];
    for (const url of urlsOf(server)) {
      const normalized = url.toLowerCase();
      if (!isTurnUrl(url) || /([?&])transport=/i.test(url)) {
        expandedUrls.push(url);
      } else if (normalized.startsWith('turns:')) {
        expandedUrls.push(withTransport(url, 'tcp'));
      } else {
        expandedUrls.push(withTransport(url, 'udp'));
        expandedUrls.push(withTransport(url, 'tcp'));
      }
    }

    const uniqueUrls = expandedUrls.filter((url) => {
      const key = `${url}|${server.username ?? ''}|${String(server.credential ?? '')}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    if (uniqueUrls.length === 0) continue;
    result.push({
      ...server,
      urls: Array.isArray(server.urls) ? uniqueUrls : uniqueUrls.length === 1 ? uniqueUrls[0] : uniqueUrls,
    });
  }

  return result;
}

export function hasConfiguredTurnRelay(servers: RTCIceServer[]): boolean {
  return servers.some((server) => urlsOf(server).some(isTurnUrl));
}

export function negotiationMatches(
  expectedNegotiationId?: string | null,
  incomingNegotiationId?: string | null,
): boolean {
  if (!expectedNegotiationId) return true;
  if (!incomingNegotiationId) return false;
  return expectedNegotiationId === incomingNegotiationId;
}

export function decidePeerSession(
  previousSessionId: string | null | undefined,
  previousSeenAt: number | null | undefined,
  incomingSessionId: string | null | undefined,
  incomingSentAt: number | null | undefined,
  authoritative: boolean,
): PeerSessionDecision {
  if (!incomingSessionId) return 'accept';
  if (!previousSessionId) return 'replace';
  if (previousSessionId === incomingSessionId) return 'accept';
  if (!authoritative) return 'reject';
  if (
    typeof incomingSentAt === 'number' &&
    Number.isFinite(incomingSentAt) &&
    typeof previousSeenAt === 'number' &&
    Number.isFinite(previousSeenAt) &&
    incomingSentAt < previousSeenAt
  ) {
    return 'reject';
  }
  return 'replace';
}

export function iceRestartDelayMs(
  attempt: number,
  reason: 'failed' | 'disconnected' | 'timeout' | 'remote-request',
): number {
  if (reason === 'disconnected') return Math.min(3000 + attempt * 1500, 8000);
  return Math.min(900 * 2 ** Math.max(0, attempt), 8000);
}

export const WEBRTC_PRESENCE_LEAVE_GRACE_MS = 6_000;
export const WEBRTC_PEER_CONNECTION_TIMEOUT_MS = 25_000;

export function expandIceServersForReliability(
  servers: RTCIceServer[],
): RTCIceServer[] {
  const seen = new Set<string>();
  const expanded: RTCIceServer[] = [];

  for (const server of servers) {
    const urls = Array.isArray(server.urls) ? server.urls : [server.urls];
    const nextUrls: string[] = [];

    for (const raw of urls) {
      if (!raw) continue;
      const url = String(raw).trim();
      if (!url) continue;
      if (!seen.has(url)) {
        seen.add(url);
        nextUrls.push(url);
      }

      const lower = url.toLowerCase();
      if (lower.startsWith('turn:') && !/[?&]transport=/i.test(url)) {
        const tcp = `${url}${url.includes('?') ? '&' : '?'}transport=tcp`;
        if (!seen.has(tcp)) {
          seen.add(tcp);
          nextUrls.push(tcp);
        }
      }
    }

    if (nextUrls.length === 0) continue;
    expanded.push({
      ...server,
      urls: Array.isArray(server.urls) ? nextUrls : nextUrls[0],
    });
  }

  return expanded;
}

export function hasConfiguredTurnRelay(servers: RTCIceServer[]): boolean {
  return servers.some((server) => {
    const urls = Array.isArray(server.urls) ? server.urls : [server.urls];
    return urls.some((url) => /^(turn|turns):/i.test(String(url ?? '').trim()));
  });
}

/**
 * SDP/ICE belongs to exactly one negotiation generation once a local or remote
 * generation has been established. Older clients/persisted frames may omit the
 * id; those are safe only before a generation exists. Accepting an id-less ICE
 * candidate after an ICE restart can mix ufrags from different generations and
 * poison an otherwise valid reconnect.
 */
export function negotiationMatches(
  expectedNegotiationId?: string,
  incomingNegotiationId?: string,
): boolean {
  if (!expectedNegotiationId) return true;
  if (!incomingNegotiationId) return false;
  return expectedNegotiationId === incomingNegotiationId;
}

export type PeerSessionDecision = 'accept' | 'replace' | 'reject';

export function decidePeerSession(
  currentSessionId?: string,
  currentSeenAt?: number,
  incomingSessionId?: string,
  incomingSentAt?: number,
  authoritative = false,
): PeerSessionDecision {
  if (!incomingSessionId) return 'accept';
  if (!currentSessionId) return 'replace';
  if (currentSessionId === incomingSessionId) return 'accept';

  // Presence/ready frames are authoritative because they describe the browser
  // session that is currently online in the room. Persisted SDP/ICE frames are
  // not authoritative and must not resurrect a superseded browser session.
  if (authoritative) return 'replace';

  if (
    typeof incomingSentAt === 'number' &&
    Number.isFinite(incomingSentAt) &&
    typeof currentSeenAt === 'number' &&
    Number.isFinite(currentSeenAt) &&
    incomingSentAt > currentSeenAt
  ) {
    return 'replace';
  }

  return 'reject';
}

export type IceRestartReason = 'failed' | 'disconnected' | 'timeout' | 'remote-request';

export function iceRestartDelayMs(
  attempt: number,
  reason: IceRestartReason,
): number {
  if (reason === 'disconnected') return Math.min(4_000, 1_200 + attempt * 900);
  if (reason === 'remote-request') return Math.min(1_200, 200 + attempt * 250);
  return Math.min(2_500, 400 + attempt * 650);
}

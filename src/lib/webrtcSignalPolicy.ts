export type NativeWebRTCTopology = "mesh" | "broadcast";

/**
 * Persisted SDP/ICE is only a fallback. A newly joined browser must not consume
 * signaling from an older browser session of the same call because old offers,
 * candidates and leave frames can close or poison a fresh peer connection.
 */
export const SIGNAL_FRESHNESS_GRACE_MS = 15_000;

export function shouldInitiateNativePeer(
  localUserId: string,
  peerUserId: string,
  topology: NativeWebRTCTopology,
  hostId?: string | null,
): boolean {
  if (!localUserId || !peerUserId || localUserId === peerUserId) return false;
  if (topology === "broadcast") return !!hostId && localUserId === hostId;
  return localUserId.localeCompare(peerUserId) < 0;
}

export function isFreshNativeSignal(
  joinedAtMs: number,
  sentAtMs?: number | null,
  createdAt?: string | null,
): boolean {
  const threshold = joinedAtMs - SIGNAL_FRESHNESS_GRACE_MS;

  if (typeof sentAtMs === "number" && Number.isFinite(sentAtMs)) {
    return sentAtMs >= threshold;
  }

  if (createdAt) {
    const createdAtMs = Date.parse(createdAt);
    if (Number.isFinite(createdAtMs)) return createdAtMs >= threshold;
  }

  // Live Realtime broadcast frames do not need a database timestamp. They are
  // fresh by definition because the client only receives them while subscribed.
  return true;
}

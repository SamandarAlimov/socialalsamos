/**
 * Centralised ICE server configuration for Alsamos native WebRTC.
 *
 * Reliable internet calling needs two paths:
 *   1) direct P2P (host/srflx candidates) whenever NAT traversal succeeds;
 *   2) TURN relay as a fallback when CGNAT, symmetric NAT, corporate Wi-Fi,
 *      mobile carrier NAT, VPNs or firewalls block the direct path.
 *
 * Browsers still prefer the best/direct candidate pair automatically. Merely
 * providing TURN does NOT force every call through a relay; it only makes a
 * relay candidate available when direct connectivity cannot be established.
 *
 * Preferred production TURN configuration:
 *   VITE_TURN_URLS="turn:turn.example.com:3478,turns:turn.example.com:5349"
 *   VITE_TURN_USERNAME
 *   VITE_TURN_CREDENTIAL
 *
 * The existing public.call_webrtc_config(key='ice_servers') record is also read
 * so credentials/endpoints can be rotated without rebuilding the web client.
 *
 * If neither environment nor remote config supplies TURN, Alsamos temporarily
 * falls back to the same OpenRelay endpoints historically used by this project.
 * This keeps calls functional on restrictive networks while a dedicated TURN
 * deployment is provisioned. A dedicated Alsamos-controlled TURN remains the
 * recommended production target.
 *
 * Emergency/debug opt-out only:
 *   VITE_WEBRTC_ALLOW_TURN_RELAY=false
 */

const STUN_SERVERS: RTCIceServer[] = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
  { urls: "stun:stun2.l.google.com:19302" },
  { urls: "stun:stun3.l.google.com:19302" },
  { urls: "stun:stun4.l.google.com:19302" },
];

const EMERGENCY_TURN_SERVERS: RTCIceServer[] = [
  {
    urls: "turn:openrelay.metered.ca:80",
    username: "openrelayproject",
    credential: "openrelayproject",
  },
  {
    urls: "turn:openrelay.metered.ca:443",
    username: "openrelayproject",
    credential: "openrelayproject",
  },
  {
    urls: "turn:openrelay.metered.ca:443?transport=tcp",
    username: "openrelayproject",
    credential: "openrelayproject",
  },
];

// Reliability is the production default. Setting the flag explicitly to false
// is the only way to strip TURN from the candidate set.
const TURN_RELAY_ENABLED =
  String(import.meta.env.VITE_WEBRTC_ALLOW_TURN_RELAY ?? "true")
    .trim()
    .toLowerCase() !== "false";

let warnedTurnDisabled = false;
let warnedEmergencyTurn = false;
let loggedTurnAvailable = false;

export function urlsOfIceServer(server: RTCIceServer): string[] {
  return (Array.isArray(server.urls) ? server.urls : [server.urls])
    .map((url) => String(url).trim())
    .filter(Boolean);
}

export function isTurnUrl(url: string): boolean {
  const normalized = url.trim().toLowerCase();
  return normalized.startsWith("turn:") || normalized.startsWith("turns:");
}

export function hasTurnRelay(servers: RTCIceServer[]): boolean {
  return servers.some((server) => urlsOfIceServer(server).some(isTurnUrl));
}

/**
 * Relay policy is exported for deterministic regression testing. Production
 * callers use TURN unless it has been explicitly disabled by environment.
 */
export function applyRelayPolicy(
  servers: RTCIceServer[],
  relayEnabled = TURN_RELAY_ENABLED,
): RTCIceServer[] {
  if (relayEnabled) return servers;

  let removedTurn = false;
  const directOnly: RTCIceServer[] = [];

  for (const server of servers) {
    const urls = urlsOfIceServer(server);
    const allowedUrls = urls.filter((url) => {
      if (isTurnUrl(url)) {
        removedTurn = true;
        return false;
      }
      return true;
    });

    if (allowedUrls.length === 0) continue;

    directOnly.push({
      ...server,
      urls: Array.isArray(server.urls) ? allowedUrls : allowedUrls[0],
    });
  }

  if (removedTurn && !warnedTurnDisabled) {
    warnedTurnDisabled = true;
    console.warn(
      "[ICE] TURN relay was explicitly disabled. Calls may fail behind restrictive NAT/firewalls.",
    );
  }

  return directOnly;
}

function dedupeIceServers(servers: RTCIceServer[]): RTCIceServer[] {
  const seen = new Set<string>();
  const result: RTCIceServer[] = [];

  for (const server of servers) {
    const uniqueUrls = urlsOfIceServer(server).filter((url) => {
      const key = `${url}|${server.username ?? ""}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    if (uniqueUrls.length === 0) continue;
    result.push({
      ...server,
      urls: Array.isArray(server.urls) ? uniqueUrls : uniqueUrls[0],
    });
  }

  return result;
}

export function ensureTurnFallback(
  servers: RTCIceServer[],
  relayEnabled = TURN_RELAY_ENABLED,
): RTCIceServer[] {
  const filtered = dedupeIceServers(applyRelayPolicy(servers, relayEnabled));
  if (!relayEnabled || hasTurnRelay(filtered)) return filtered;

  if (!warnedEmergencyTurn) {
    warnedEmergencyTurn = true;
    console.warn(
      "[ICE] Dedicated TURN is not configured; using emergency OpenRelay fallback. Configure Alsamos TURN for production SLA.",
    );
  }

  return dedupeIceServers([...filtered, ...EMERGENCY_TURN_SERVERS]);
}

function reportRelayAvailability(servers: RTCIceServer[]) {
  if (!TURN_RELAY_ENABLED || !hasTurnRelay(servers)) return;
  if (!loggedTurnAvailable) {
    loggedTurnAvailable = true;
    console.info(
      "[ICE] TURN relay fallback is available; direct P2P remains preferred when reachable.",
    );
  }
}

export function getIceServers(): RTCIceServer[] {
  const urls = (import.meta.env.VITE_TURN_URLS as string | undefined)?.trim();
  const username = import.meta.env.VITE_TURN_USERNAME as string | undefined;
  const credential = import.meta.env.VITE_TURN_CREDENTIAL as string | undefined;

  const configured: RTCIceServer[] = [...STUN_SERVERS];

  if (urls) {
    configured.push({
      urls: urls.split(",").map((url) => url.trim()).filter(Boolean),
      ...(username ? { username } : {}),
      ...(credential ? { credential } : {}),
    });
  }

  return ensureTurnFallback(configured);
}

export const ICE_SERVERS = getIceServers();

let cachedRemote: RTCIceServer[] | null = null;
let inflight: Promise<RTCIceServer[]> | null = null;

/**
 * Load rotatable production ICE configuration. STUN defaults are always kept,
 * while configured TURN servers are preserved so the browser can fall back to
 * relay when direct ICE candidate pairs fail.
 */
export async function loadIceServers(): Promise<RTCIceServer[]> {
  if (cachedRemote) return cachedRemote;
  if (inflight) return inflight;

  inflight = (async () => {
    try {
      const { supabase } = await import("@/integrations/supabase/client");
      const { data, error } = await supabase
        .from("call_webrtc_config")
        .select("value")
        .eq("key", "ice_servers")
        .maybeSingle();

      if (error) throw error;

      const value = (data as { value?: unknown } | null)?.value;
      if (Array.isArray(value) && value.length > 0) {
        cachedRemote = ensureTurnFallback([
          ...STUN_SERVERS,
          ...(value as RTCIceServer[]),
        ]);
        reportRelayAvailability(cachedRemote);
        return cachedRemote;
      }
    } catch (error) {
      console.warn("[ICE] remote ICE config unavailable, using environment/defaults", error);
    }

    cachedRemote = getIceServers();
    reportRelayAvailability(cachedRemote);
    return cachedRemote;
  })();

  return inflight;
}

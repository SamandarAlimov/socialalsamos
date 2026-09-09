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
 * TURN may be configured either through Vite environment variables:
 *   VITE_TURN_URLS="turn:turn.example.com:3478,turns:turn.example.com:5349"
 *   VITE_TURN_USERNAME
 *   VITE_TURN_CREDENTIAL
 *
 * or through public.call_webrtc_config(key='ice_servers'), which is the existing
 * rotatable production configuration path.
 *
 * Both sources are intentionally kept. A stale database value must never hide
 * a valid deployment-time TURN fallback (and vice versa).
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

const TURN_RELAY_ENABLED =
  String(import.meta.env.VITE_WEBRTC_ALLOW_TURN_RELAY ?? "true")
    .trim()
    .toLowerCase() !== "false";

/**
 * Remote TURN credentials are deliberately short cached. Production providers
 * commonly rotate ephemeral credentials; keeping them for the lifetime of the
 * SPA makes later calls fail even though call_webrtc_config already contains a
 * replacement credential.
 */
export const REMOTE_ICE_CACHE_TTL_MS = 60_000;
export const RELAY_PROBE_TTL_MS = 60_000;

let warnedTurnDisabled = false;
let warnedTurnMissing = false;
let loggedTurnConfigured = false;
let relayProbePromise: Promise<TurnRelayProbeResult> | null = null;
let relayProbeAt = 0;
let relayProbeConfigKey = "";
let cachedRemote: RTCIceServer[] | null = null;
let cachedRemoteAt = 0;
let inflight: Promise<RTCIceServer[]> | null = null;

export interface TurnRelayProbeResult {
  configured: boolean;
  relayCandidateGathered: boolean;
  error?: string;
}

export interface LoadIceServersOptions {
  /** Bypass a still-fresh remote cache. Concurrent refreshes are still deduped. */
  forceRefresh?: boolean;
}

export function isIceServerCacheFresh(
  cachedAt: number,
  now = Date.now(),
  ttlMs = REMOTE_ICE_CACHE_TTL_MS,
): boolean {
  return cachedAt > 0 && now >= cachedAt && now - cachedAt < ttlMs;
}

export function urlsOfIceServer(server: RTCIceServer): string[] {
  const rawUrls = server?.urls;
  if (!rawUrls) return [];

  return (Array.isArray(rawUrls) ? rawUrls : [rawUrls])
    .filter((url): url is string => typeof url === "string")
    .map((url) => url.trim())
    .filter(Boolean);
}

export function isTurnUrl(url: string): boolean {
  const normalized = url.trim().toLowerCase();
  return normalized.startsWith("turn:") || normalized.startsWith("turns:");
}

export function hasTurnRelay(servers: RTCIceServer[]): boolean {
  return servers.some((server) => urlsOfIceServer(server).some(isTurnUrl));
}

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

function iceServerCredentialKey(server: RTCIceServer): string {
  const credential =
    typeof server.credential === "string" ? server.credential : "";
  return `${server.username ?? ""}|${credential}`;
}

function dedupeIceServers(servers: RTCIceServer[]): RTCIceServer[] {
  const seen = new Set<string>();
  const result: RTCIceServer[] = [];

  for (const server of servers) {
    const credentialKey = iceServerCredentialKey(server);
    const uniqueUrls = urlsOfIceServer(server).filter((url) => {
      const key = `${url}|${credentialKey}`;
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

export function mergeIceServerSources(
  ...sources: Array<RTCIceServer[] | null | undefined>
): RTCIceServer[] {
  return dedupeIceServers(
    sources.flatMap((source) => (Array.isArray(source) ? source : [])),
  );
}

export function getTurnIceServers(servers: RTCIceServer[]): RTCIceServer[] {
  return servers.flatMap((server) => {
    const turnUrls = urlsOfIceServer(server).filter(isTurnUrl);
    if (turnUrls.length === 0) return [];

    return [
      {
        ...server,
        urls: Array.isArray(server.urls) ? turnUrls : turnUrls[0],
      },
    ];
  });
}

function reportRelayConfiguration(servers: RTCIceServer[]) {
  if (!TURN_RELAY_ENABLED) return;

  if (hasTurnRelay(servers)) {
    if (!loggedTurnConfigured) {
      loggedTurnConfigured = true;
      console.info(
        "[ICE] TURN relay fallback is configured; operational relay gathering will be verified separately.",
      );
    }
    return;
  }

  if (!warnedTurnMissing) {
    warnedTurnMissing = true;
    console.warn(
      "[ICE] No TURN relay is configured. Direct calls can fail on CGNAT/symmetric NAT/restrictive firewalls.",
    );
  }
}

function getEnvironmentIceServers(): RTCIceServer[] {
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

  return configured;
}

export function getIceServers(): RTCIceServer[] {
  return mergeIceServerSources(applyRelayPolicy(getEnvironmentIceServers()));
}

export const ICE_SERVERS = getIceServers();

export async function probeTurnRelay(
  servers: RTCIceServer[],
  timeoutMs = 8_000,
): Promise<TurnRelayProbeResult> {
  const turnServers = getTurnIceServers(servers);
  if (turnServers.length === 0) {
    return { configured: false, relayCandidateGathered: false };
  }

  if (typeof RTCPeerConnection === "undefined") {
    return {
      configured: true,
      relayCandidateGathered: false,
      error: "RTCPeerConnection is unavailable in this runtime",
    };
  }

  let pc: RTCPeerConnection | null = null;
  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  try {
    pc = new RTCPeerConnection({
      iceServers: turnServers,
      iceTransportPolicy: "relay",
      bundlePolicy: "max-bundle",
      rtcpMuxPolicy: "require",
    });

    pc.createDataChannel("turn-relay-probe");

    const relayGathered = new Promise<boolean>((resolve) => {
      let settled = false;
      const settle = (value: boolean) => {
        if (settled) return;
        settled = true;
        resolve(value);
      };

      pc!.onicecandidate = (event) => {
        if (event.candidate?.type === "relay") {
          settle(true);
          return;
        }
        if (!event.candidate) settle(false);
      };

      pc!.onicecandidateerror = (event) => {
        const detail = event as Event & {
          errorCode?: number;
          errorText?: string;
          url?: string;
          address?: string;
          port?: number;
        };
        console.warn("[ICE] TURN candidate gathering error", {
          errorCode: detail.errorCode,
          errorText: detail.errorText,
          url: detail.url,
          address: detail.address,
          port: detail.port,
        });
      };

      timeoutId = setTimeout(() => settle(false), timeoutMs);
    });

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    const relayCandidateGathered = await relayGathered;

    return {
      configured: true,
      relayCandidateGathered,
      ...(!relayCandidateGathered
        ? {
            error:
              "TURN is configured but this browser could not gather a relay candidate",
          }
        : {}),
    };
  } catch (error) {
    return {
      configured: true,
      relayCandidateGathered: false,
      error: error instanceof Error ? error.message : String(error),
    };
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
    if (pc) {
      pc.onicecandidate = null;
      pc.onicecandidateerror = null;
      pc.close();
    }
  }
}

function relayConfigFingerprint(servers: RTCIceServer[]) {
  // Never log this value: credentials deliberately participate so credential
  // rotation triggers a new operational probe.
  return getTurnIceServers(servers)
    .map((server) => `${urlsOfIceServer(server).join(",")}|${iceServerCredentialKey(server)}`)
    .sort()
    .join(";");
}

function invalidateCachedRemoteIceServers() {
  cachedRemoteAt = 0;
}

function verifyRelayOperationally(servers: RTCIceServer[]) {
  if (!TURN_RELAY_ENABLED || !hasTurnRelay(servers)) return;

  const now = Date.now();
  const configKey = relayConfigFingerprint(servers);
  if (
    relayProbePromise ||
    (relayProbeConfigKey === configKey &&
      isIceServerCacheFresh(relayProbeAt, now, RELAY_PROBE_TTL_MS))
  ) {
    return;
  }

  relayProbeConfigKey = configKey;
  relayProbeAt = now;
  relayProbePromise = probeTurnRelay(servers)
    .then((result) => {
      if (result.relayCandidateGathered) {
        console.info(
          "[ICE] TURN relay operational check passed: a relay candidate was gathered.",
        );
      } else {
        // Do not keep a potentially expired remote credential for the rest of
        // the SPA lifetime. The next call/recovery gets a fresh DB value.
        invalidateCachedRemoteIceServers();
        console.error(
          "[ICE] TURN relay operational check FAILED: configured TURN did not produce a relay candidate.",
          result.error ?? "Unknown TURN allocation failure",
        );
      }
      return result;
    })
    .catch((error) => {
      invalidateCachedRemoteIceServers();
      const result: TurnRelayProbeResult = {
        configured: true,
        relayCandidateGathered: false,
        error: error instanceof Error ? error.message : String(error),
      };
      console.error("[ICE] TURN relay operational check failed", result.error);
      return result;
    })
    .finally(() => {
      relayProbePromise = null;
    });
}

/**
 * Load rotatable production ICE configuration.
 *
 * Remote TURN credentials are cached only briefly. `inflight` is request
 * deduplication, not a permanent cache: it MUST be cleared after resolution.
 */
export async function loadIceServers(
  options: LoadIceServersOptions = {},
): Promise<RTCIceServer[]> {
  const now = Date.now();
  if (
    !options.forceRefresh &&
    cachedRemote &&
    isIceServerCacheFresh(cachedRemoteAt, now)
  ) {
    return cachedRemote;
  }
  if (inflight) return inflight;

  const request = (async () => {
    const environmentServers = getEnvironmentIceServers();
    let remoteServers: RTCIceServer[] = [];

    try {
      const { supabase } = await import("@/integrations/supabase/client");
      const { data, error } = await supabase
        .from("call_webrtc_config")
        .select("value")
        .eq("key", "ice_servers")
        .maybeSingle();

      if (error) throw error;

      const value = (data as { value?: unknown } | null)?.value;
      if (Array.isArray(value)) {
        remoteServers = value.filter(
          (entry): entry is RTCIceServer =>
            Boolean(entry) &&
            typeof entry === "object" &&
            urlsOfIceServer(entry as RTCIceServer).length > 0,
        );
      }
    } catch (error) {
      console.warn(
        "[ICE] remote ICE config unavailable, using environment/defaults",
        error,
      );
    }

    const merged = mergeIceServerSources(
      applyRelayPolicy(environmentServers),
      applyRelayPolicy(remoteServers),
    );
    cachedRemote = merged;
    cachedRemoteAt = Date.now();
    reportRelayConfiguration(merged);
    verifyRelayOperationally(merged);
    return merged;
  })();

  inflight = request;
  try {
    return await request;
  } finally {
    if (inflight === request) inflight = null;
  }
}

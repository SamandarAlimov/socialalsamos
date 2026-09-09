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

// Reliability is the production default. Setting the flag explicitly to false
// is the only way to strip TURN from the candidate set.
const TURN_RELAY_ENABLED =
  String(import.meta.env.VITE_WEBRTC_ALLOW_TURN_RELAY ?? "true")
    .trim()
    .toLowerCase() !== "false";

let warnedTurnDisabled = false;
let warnedTurnMissing = false;
let loggedTurnConfigured = false;
let relayProbePromise: Promise<TurnRelayProbeResult> | null = null;

export interface TurnRelayProbeResult {
  configured: boolean;
  relayCandidateGathered: boolean;
  error?: string;
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

function iceServerCredentialKey(server: RTCIceServer): string {
  const credential =
    typeof server.credential === "string" ? server.credential : "";
  return `${server.username ?? ""}|${credential}|${server.credentialType ?? ""}`;
}

function dedupeIceServers(servers: RTCIceServer[]): RTCIceServer[] {
  const seen = new Set<string>();
  const result: RTCIceServer[] = [];

  for (const server of servers) {
    const credentialKey = iceServerCredentialKey(server);
    const uniqueUrls = urlsOfIceServer(server).filter((url) => {
      // Credentials are part of the key on purpose. During TURN credential
      // rotation the same endpoint may temporarily exist with old and new
      // credentials. Keeping both is safer than allowing one source to hide
      // the other.
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

/**
 * Merge independent ICE sources without allowing one source to replace the
 * others. This is especially important in production where database TURN
 * credentials can rotate independently from deployment environment values.
 */
export function mergeIceServerSources(
  ...sources: Array<RTCIceServer[] | null | undefined>
): RTCIceServer[] {
  return dedupeIceServers(
    sources.flatMap((source) => (Array.isArray(source) ? source : [])),
  );
}

/**
 * Keep only TURN/TURNS URLs while preserving the credentials belonging to the
 * original RTCIceServer entry. Used by the relay-only operational probe.
 */
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

/**
 * Prove that the browser can actually allocate a TURN relay candidate.
 *
 * This deliberately uses iceTransportPolicy='relay': a host or srflx candidate
 * cannot produce a false positive. No microphone/camera permission is needed;
 * a data channel is enough to trigger ICE gathering. The probe is diagnostic
 * and never forces the real call to use TURN when direct P2P works.
 */
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

        // A null candidate marks completion of ICE gathering. If no relay was
        // observed before this point, the configured TURN service did not
        // produce an allocation for this browser/network.
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

function verifyRelayOperationally(servers: RTCIceServer[]) {
  if (!TURN_RELAY_ENABLED || !hasTurnRelay(servers) || relayProbePromise) return;

  relayProbePromise = probeTurnRelay(servers)
    .then((result) => {
      if (result.relayCandidateGathered) {
        console.info(
          "[ICE] TURN relay operational check passed: a relay candidate was gathered.",
        );
      } else {
        console.error(
          "[ICE] TURN relay operational check FAILED: configured TURN did not produce a relay candidate.",
          result.error ?? "Unknown TURN allocation failure",
        );
      }
      return result;
    })
    .catch((error) => {
      const result: TurnRelayProbeResult = {
        configured: true,
        relayCandidateGathered: false,
        error: error instanceof Error ? error.message : String(error),
      };
      console.error("[ICE] TURN relay operational check failed", result.error);
      return result;
    });
}

let cachedRemote: RTCIceServer[] | null = null;
let inflight: Promise<RTCIceServer[]> | null = null;

/**
 * Load rotatable production ICE configuration.
 *
 * Critical reliability rule: the remote database source is additive, not a
 * replacement. A broken/stale remote TURN entry must not suppress a valid
 * deployment environment fallback, and a missing deployment value must not
 * suppress remotely rotated credentials.
 */
export async function loadIceServers(): Promise<RTCIceServer[]> {
  if (cachedRemote) return cachedRemote;
  if (inflight) return inflight;

  inflight = (async () => {
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
        // The table is remotely editable, so defensively ignore malformed
        // entries instead of handing invalid URLs to RTCPeerConnection.
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

    cachedRemote = mergeIceServerSources(
      applyRelayPolicy(environmentServers),
      applyRelayPolicy(remoteServers),
    );
    reportRelayConfiguration(cachedRemote);
    verifyRelayOperationally(cachedRemote);
    return cachedRemote;
  })();

  return inflight;
}
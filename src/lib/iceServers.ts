/**
 * Centralised ICE server configuration for Alsamos native WebRTC.
 *
 * The production default is direct peer-to-peer media. STUN is used only for
 * NAT candidate discovery; media is never relayed through the public demo TURN
 * services that used to be configured here.
 *
 * TURN can be enabled deliberately later (for an Alsamos-controlled relay) via:
 *   VITE_WEBRTC_ALLOW_TURN_RELAY=true
 *   VITE_TURN_URLS="turn:alsamos.com:3478,turns:alsamos.com:5349"
 *   VITE_TURN_USERNAME
 *   VITE_TURN_CREDENTIAL
 *
 * Keeping TURN opt-in is important: a stale database/env value must not silently
 * move call media through a third-party relay when Alsamos is in native mode.
 */

const STUN_SERVERS: RTCIceServer[] = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
  { urls: "stun:stun2.l.google.com:19302" },
  { urls: "stun:stun3.l.google.com:19302" },
  { urls: "stun:stun4.l.google.com:19302" },
];

const TURN_RELAY_ENABLED =
  String(import.meta.env.VITE_WEBRTC_ALLOW_TURN_RELAY ?? "")
    .trim()
    .toLowerCase() === "true";

let warnedTurnDisabled = false;

function urlsOf(server: RTCIceServer): string[] {
  return (Array.isArray(server.urls) ? server.urls : [server.urls])
    .map((url) => String(url).trim())
    .filter(Boolean);
}

function isTurnUrl(url: string): boolean {
  return url.startsWith("turn:") || url.startsWith("turns:");
}

/**
 * Remove TURN endpoints while native direct-media mode is active. A server may
 * contain a mixed URL array, so keep any STUN entries instead of dropping the
 * whole object.
 */
function applyRelayPolicy(servers: RTCIceServer[]): RTCIceServer[] {
  if (TURN_RELAY_ENABLED) return servers;

  let removedTurn = false;
  const directOnly: RTCIceServer[] = [];

  for (const server of servers) {
    const urls = urlsOf(server);
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
    console.info(
      "[ICE] TURN relay is disabled in native Alsamos mode; call media stays peer-to-peer.",
    );
  }

  return directOnly;
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

  return applyRelayPolicy(configured);
}

export const ICE_SERVERS = getIceServers();

let cachedRemote: RTCIceServer[] | null = null;
let inflight: Promise<RTCIceServer[]> | null = null;

/**
 * Load rotatable ICE configuration from the existing Alsamos/Supabase config
 * table. The same direct-media relay policy is applied to remote values, so an
 * old OpenRelay/third-party TURN entry cannot silently become the media path.
 */
export async function loadIceServers(): Promise<RTCIceServer[]> {
  if (cachedRemote) return cachedRemote;
  if (inflight) return inflight;

  inflight = (async () => {
    try {
      const { supabase } = await import("@/integrations/supabase/client");
      const { data } = await supabase
        .from("call_webrtc_config")
        .select("value")
        .eq("key", "ice_servers")
        .maybeSingle();

      const value = (data as { value?: unknown } | null)?.value;
      if (Array.isArray(value) && value.length > 0) {
        const servers = applyRelayPolicy(value as RTCIceServer[]);
        const hasStun = servers.some((server) =>
          urlsOf(server).some((url) => url.startsWith("stun:")),
        );

        cachedRemote = hasStun
          ? servers
          : [...STUN_SERVERS, ...servers];
        return cachedRemote;
      }
    } catch (error) {
      console.warn("[ICE] remote config unavailable, using direct-media defaults", error);
    }

    cachedRemote = getIceServers();
    return cachedRemote;
  })();

  return inflight;
}

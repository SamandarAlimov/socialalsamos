/**
 * Centralised ICE server configuration.
 *
 * TURN credentials are environment-configurable so the public/demo relay can be
 * swapped for a production TURN deployment without touching call code.
 *
 * Env vars (optional):
 *   VITE_TURN_URLS       comma separated, e.g. "turn:turn.example.com:3478,turns:turn.example.com:5349"
 *   VITE_TURN_USERNAME
 *   VITE_TURN_CREDENTIAL
 *
 * WARNING: when no VITE_TURN_* vars are provided we fall back to the public
 * OpenRelay demo TURN service. That is best-effort only and is NOT production
 * viable (no SLA, rate limited, shared credentials).
 */

const STUN_SERVERS: RTCIceServer[] = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
  { urls: "stun:stun2.l.google.com:19302" },
  { urls: "stun:stun3.l.google.com:19302" },
  { urls: "stun:stun4.l.google.com:19302" },
];

const FALLBACK_TURN: RTCIceServer[] = [
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

let warned = false;

export function getIceServers(): RTCIceServer[] {
  const urls = (import.meta.env.VITE_TURN_URLS as string | undefined)?.trim();
  const username = import.meta.env.VITE_TURN_USERNAME as string | undefined;
  const credential = import.meta.env.VITE_TURN_CREDENTIAL as string | undefined;

  if (urls) {
    return [
      ...STUN_SERVERS,
      {
        urls: urls.split(",").map((u) => u.trim()).filter(Boolean),
        ...(username ? { username } : {}),
        ...(credential ? { credential } : {}),
      },
    ];
  }

  if (!warned) {
    warned = true;
    console.warn(
      "[ICE] Using public demo TURN (OpenRelay). Not production viable — set VITE_TURN_URLS / VITE_TURN_USERNAME / VITE_TURN_CREDENTIAL.",
    );
  }

  return [...STUN_SERVERS, ...FALLBACK_TURN];
}

export const ICE_SERVERS = getIceServers();

let cachedRemote: RTCIceServer[] | null = null;
let inflight: Promise<RTCIceServer[]> | null = null;

/**
 * Production ICE configuration. TURN credentials are stored server-side in
 * `public.call_webrtc_config` so they can be rotated without a redeploy, and
 * they are shared with the Flutter client. Falls back to the static config.
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
        const servers = value as RTCIceServer[];
        const hasStun = servers.some((s) =>
          (Array.isArray(s.urls) ? s.urls : [s.urls]).some((u) => String(u).startsWith("stun:")),
        );
        cachedRemote = hasStun ? servers : [...STUN_SERVERS, ...servers];
        return cachedRemote;
      }
    } catch (e) {
      console.warn("[ICE] remote config unavailable, using defaults", e);
    }

    cachedRemote = getIceServers();
    return cachedRemote;
  })();

  return inflight;
}

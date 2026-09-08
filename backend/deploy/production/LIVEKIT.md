# Alsamos LiveKit SFU production deployment

This directory contains the media-plane configuration for Alsamos realtime calls.

## What runs where

- **Vercel**: the web app and `/api/call-token`. It authenticates the Supabase user,
  verifies active call membership, and signs a short-lived LiveKit join token.
- **Supabase**: call lifecycle, invites, membership, history and UI state.
- **LiveKit**: realtime WebRTC SFU media transport for direct calls, conferences,
  group audio/video, and subscribe-only channel broadcasts.
- **Redis**: LiveKit routing/state backend.

The SFU must run on a VM/bare-metal/Kubernetes node with direct UDP/TCP networking.
Do not run LiveKit itself as a Vercel/serverless function.

## Required secrets

Generate a strong LiveKit API key/secret pair on the media host and configure the
same values in both places:

Media host:

```bash
export LIVEKIT_API_KEY='...'
export LIVEKIT_API_SECRET='...'
docker compose -f docker-compose.livekit.yml up -d
```

Vercel server environment (server-only, never `VITE_`):

```text
LIVEKIT_URL=wss://<your-livekit-domain>
LIVEKIT_API_KEY=...
LIVEKIT_API_SECRET=...
```

`SUPABASE_URL` / `SUPABASE_ANON_KEY` may also be supplied server-side. The token
endpoint falls back to the already-used `VITE_SUPABASE_URL` and
`VITE_SUPABASE_PUBLISHABLE_KEY` names when necessary.

## Network and TLS

The LiveKit signal endpoint on port 7880 must be behind trusted HTTPS/WSS TLS.
Open the media host firewall for:

- `7881/TCP` — ICE/TCP fallback
- `3478/UDP` — embedded TURN/UDP
- `50000-60000/UDP` — WebRTC ICE/UDP
- the TLS reverse-proxy port (`443/TCP`) for the public `wss://` endpoint

For the widest corporate/VPN connectivity, also configure embedded TURN/TLS
with a certificate and a dedicated TURN domain. The commented fields in
`livekit.yaml` show the expected configuration.

## Call semantics

`20260908212000_sfu_call_modes.sql` classifies calls as:

- `direct`: 1:1, maximum 2
- `conference`: interactive multi-party call, default maximum 64
- `group`: interactive group audio/video, default maximum 500
- `broadcast`: channel stream, default maximum 3000; token endpoint gives the
  host publish permission and viewers subscribe-only permission

The database limits are policy ceilings, not a promise that one machine can
serve that many publishers. Capacity depends on CPU, NIC bandwidth, codec,
resolution and simulcast settings; scale LiveKit nodes/Redis accordingly.

## Rollback

The pre-SFU mesh hook is retained at `src/hooks/useLegacyWebRTC.ts`. It is not
used by the normal call path and exists only as an emergency rollback reference.
Do not silently fall back to the public demo TURN path in production, because
that can make the database call look active while real media is not connected.

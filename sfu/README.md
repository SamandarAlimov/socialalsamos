# Alsamos self-hosted SFU

This service is the realtime media plane for large group calls and channel livestreams. It runs mediasoup as a long-lived Node process; it is **not** a Vercel serverless function.

## Media routing

- 1:1 call: existing direct WebRTC P2P path.
- Group / conference call: browser -> SFU -> other participants.
- Channel livestream: broadcaster -> SFU once, SFU fans out to viewers.
- Supabase remains the identity/call/live-state authority. The SFU validates the caller's Supabase access token and room membership before creating media transports.

## Required network

Run this container on a VM/container host with a stable public IP or DNS name. Terminate TLS at a reverse proxy and forward `wss://sfu.alsamos.com/ws` to port `8088`. Open **UDP 40000** and **TCP 40000** directly to the container/host. Set `SFU_ANNOUNCED_ADDRESS` to the public address that clients can reach.

Do not put `SUPABASE_SERVICE_ROLE_KEY` in Vercel/browser variables. It belongs only on the SFU host.

## Start

```bash
cd sfu
cp .env.example .env
# fill secrets/public address
npm install
node server.mjs
```

Health check: `GET /healthz`.

## Frontend

Set the frontend deployment variable:

```bash
VITE_SFU_URL=wss://sfu.alsamos.com/ws
```

When this variable is absent, existing P2P live/group behavior remains available as a rollback path. When present, `is_group_call=true` calls and livestreams use the SFU while 1:1 calls remain P2P.

## Current single-node capacity model

Defaults are 64 peers per group room and 500 websocket peers per live room. Those are safety caps, not a promise that every VM size can sustain that load. Size the machine from actual CPU/egress metrics, then add multiple workers/nodes and room placement when traffic grows.

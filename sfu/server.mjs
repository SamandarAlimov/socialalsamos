import http from 'node:http';
import process from 'node:process';
import crypto from 'node:crypto';
import * as mediasoup from 'mediasoup';
import { WebSocketServer, WebSocket } from 'ws';
import { createClient } from '@supabase/supabase-js';

const PORT = Number(process.env.PORT || 8088);
const LISTEN_IP = process.env.SFU_LISTEN_IP || '0.0.0.0';
const ANNOUNCED_ADDRESS = process.env.SFU_ANNOUNCED_ADDRESS || '';
const RTC_PORT = Number(process.env.SFU_RTC_PORT || 40000);
const MAX_CALL_PEERS = Number(process.env.SFU_MAX_CALL_PEERS || 64);
const MAX_LIVE_PEERS = Number(process.env.SFU_MAX_LIVE_PEERS || 500);
const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const ALLOWED_ORIGINS = new Set((process.env.SFU_ALLOWED_ORIGINS || '').split(',').map((v) => v.trim()).filter(Boolean));
if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required');
if (!ANNOUNCED_ADDRESS) throw new Error('SFU_ANNOUNCED_ADDRESS is required');

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const mediaCodecs = [
  { kind: 'audio', mimeType: 'audio/opus', clockRate: 48000, channels: 2 },
  { kind: 'video', mimeType: 'video/VP8', clockRate: 90000, parameters: { 'x-google-start-bitrate': 900 } },
  { kind: 'video', mimeType: 'video/H264', clockRate: 90000, parameters: { 'packetization-mode': 1, 'level-asymmetry-allowed': 1, 'profile-level-id': '42e01f' } },
];
const worker = await mediasoup.createWorker({ logLevel: process.env.SFU_LOG_LEVEL || 'warn' });
worker.on('died', () => setTimeout(() => process.exit(1), 1000).unref());
const webRtcServer = await worker.createWebRtcServer({
  listenInfos: [
    { protocol: 'udp', ip: LISTEN_IP, announcedAddress: ANNOUNCED_ADDRESS, port: RTC_PORT },
    { protocol: 'tcp', ip: LISTEN_IP, announcedAddress: ANNOUNCED_ADDRESS, port: RTC_PORT },
  ],
});
const rooms = new Map();

async function roomFor(mode, roomId) {
  const key = `${mode}:${roomId}`;
  if (rooms.has(key)) return rooms.get(key);
  const router = await worker.createRouter({ mediaCodecs });
  const room = { key, mode, roomId, router, peers: new Map() };
  rooms.set(key, room); return room;
}
async function authorize({ accessToken, roomId, mode, role }) {
  const { data, error } = await supabase.auth.getUser(accessToken);
  const user = data?.user; if (error || !user) throw new Error('Unauthorized');
  if (mode === 'call') {
    const { data: call } = await supabase.from('video_calls').select('id,host_id,status').eq('id', roomId).maybeSingle();
    if (!call || call.status === 'ended') throw new Error('Call is not active');
    const { data: participant } = await supabase.from('call_participants').select('user_id').eq('call_id', roomId).eq('user_id', user.id).is('left_at', null).maybeSingle();
    if (call.host_id !== user.id && !participant) throw new Error('Not a call participant');
  } else if (mode === 'live') {
    const { data: stream } = await supabase.from('live_streams').select('id,user_id,status').eq('id', roomId).maybeSingle();
    if (!stream || stream.status !== 'live') throw new Error('Stream is not live');
    if (role === 'publisher' && stream.user_id !== user.id) throw new Error('Only the stream owner can publish');
  } else throw new Error('Invalid mode');
  return user;
}
function send(ws, payload) { if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(payload)); }
function broadcast(room, payload, except = null) { for (const peer of room.peers.values()) if (peer.id !== except) send(peer.ws, payload); }
function counts(room) { return { peerCount: room.peers.size, viewerCount: room.mode === 'live' ? [...room.peers.values()].filter((p) => p.role === 'viewer').length : room.peers.size }; }
function publishCounts(room) { broadcast(room, { type: 'peerCount', ...counts(room) }); }
function info(peer, producer) { return { producerId: producer.id, peerId: peer.id, userId: peer.userId, kind: producer.kind, appData: producer.appData || {} }; }

async function createTransport(peer, direction) {
  const transport = await peer.room.router.createWebRtcTransport({ webRtcServer, enableUdp: true, enableTcp: true, preferUdp: true, initialAvailableOutgoingBitrate: direction === 'send' ? 2500000 : 1500000 });
  transport.appData = { direction }; peer.transports.set(transport.id, transport);
  transport.on('dtlsstatechange', (state) => { if (state === 'closed') transport.close(); });
  transport.on('close', () => peer.transports.delete(transport.id));
  return { id: transport.id, iceParameters: transport.iceParameters, iceCandidates: transport.iceCandidates, dtlsParameters: transport.dtlsParameters, sctpParameters: transport.sctpParameters };
}
async function cleanup(peer) {
  if (!peer || peer.closed) return; peer.closed = true; const room = peer.room;
  for (const producer of peer.producers.values()) { broadcast(room, { type: 'producerClosed', producerId: producer.id, peerId: peer.id, userId: peer.userId }, peer.id); try { producer.close(); } catch {} }
  for (const consumer of peer.consumers.values()) { try { consumer.close(); } catch {} }
  for (const transport of peer.transports.values()) { try { transport.close(); } catch {} }
  room.peers.delete(peer.id); broadcast(room, { type: 'peerLeft', peerId: peer.id, userId: peer.userId }, peer.id); publishCounts(room);
  if (!room.peers.size) { try { room.router.close(); } catch {} rooms.delete(room.key); }
}

const server = http.createServer((req, res) => {
  if (req.url === '/healthz') { res.writeHead(200, { 'content-type': 'application/json' }); return res.end(JSON.stringify({ ok: true, rooms: rooms.size })); }
  res.writeHead(404).end();
});
const wss = new WebSocketServer({
  server, path: '/ws', maxPayload: 64 * 1024,
  verifyClient: ({ origin }, done) => ALLOWED_ORIGINS.size === 0 || !origin || ALLOWED_ORIGINS.has(origin) ? done(true) : done(false, 403, 'Origin not allowed'),
});

wss.on('connection', (ws) => {
  let peer = null; let authenticated = false; let authTimer = setTimeout(() => ws.close(4001, 'Authentication timeout'), 10000);
  ws.isAlive = true; ws.on('pong', () => { ws.isAlive = true; });
  ws.on('message', async (raw) => {
    let message; try { message = JSON.parse(String(raw)); } catch { return send(ws, { type: 'error', error: 'Invalid JSON' }); }
    try {
      if (!authenticated) {
        if (message.type !== 'auth') throw new Error('Authenticate first');
        const mode = message.mode === 'live' ? 'live' : message.mode === 'call' ? 'call' : null;
        const role = message.role === 'viewer' ? 'viewer' : message.role === 'publisher' ? 'publisher' : null;
        if (!mode || !role || !message.roomId || !message.accessToken || (mode === 'call' && role !== 'publisher')) throw new Error('Invalid auth payload');
        const user = await authorize({ accessToken: message.accessToken, roomId: message.roomId, mode, role });
        const room = await roomFor(mode, message.roomId); const cap = mode === 'call' ? MAX_CALL_PEERS : MAX_LIVE_PEERS;
        if (room.peers.size >= cap) throw new Error('Room capacity reached');
        if (mode === 'live' && role === 'publisher' && [...room.peers.values()].some((p) => p.role === 'publisher')) throw new Error('Stream already has a publisher');
        peer = { id: crypto.randomUUID(), ws, room, userId: user.id, role, transports: new Map(), producers: new Map(), consumers: new Map(), closed: false, state: {} };
        room.peers.set(peer.id, peer); authenticated = true; clearTimeout(authTimer); authTimer = null;
        const producers = []; for (const other of room.peers.values()) if (other.id !== peer.id) for (const producer of other.producers.values()) producers.push(info(other, producer));
        send(ws, { type: 'ready', peerId: peer.id, userId: peer.userId, routerRtpCapabilities: room.router.rtpCapabilities, producers, ...counts(room) }); publishCounts(room); return;
      }
      const { requestId, action, data = {} } = message; if (!requestId || !action) throw new Error('Invalid request');
      const ok = (data) => send(ws, { requestId, ok: true, data });
      if (action === 'createTransport') return ok(await createTransport(peer, data.direction));
      if (action === 'connectTransport') { const t = peer.transports.get(data.transportId); if (!t) throw new Error('Transport not found'); await t.connect({ dtlsParameters: data.dtlsParameters }); return ok({ connected: true }); }
      if (action === 'produce') {
        if (peer.room.mode === 'live' && peer.role !== 'publisher') throw new Error('Viewers cannot publish');
        const t = peer.transports.get(data.transportId); if (!t || t.appData.direction !== 'send') throw new Error('Send transport not found');
        const producer = await t.produce({ kind: data.kind, rtpParameters: data.rtpParameters, appData: data.appData || {} }); peer.producers.set(producer.id, producer);
        producer.on('transportclose', () => peer.producers.delete(producer.id)); broadcast(peer.room, { type: 'newProducer', producer: info(peer, producer) }, peer.id); return ok({ id: producer.id });
      }
      if (action === 'consume') {
        const t = peer.transports.get(data.transportId); if (!t || t.appData.direction !== 'recv') throw new Error('Receive transport not found');
        if (!peer.room.router.canConsume({ producerId: data.producerId, rtpCapabilities: data.rtpCapabilities })) throw new Error('Cannot consume producer');
        const owner = [...peer.room.peers.values()].find((p) => p.producers.has(data.producerId)); if (!owner) throw new Error('Producer not found');
        const consumer = await t.consume({ producerId: data.producerId, rtpCapabilities: data.rtpCapabilities, paused: true, appData: { peerId: owner.id, userId: owner.userId } }); peer.consumers.set(consumer.id, consumer);
        consumer.on('transportclose', () => peer.consumers.delete(consumer.id)); consumer.on('producerclose', () => { peer.consumers.delete(consumer.id); send(ws, { type: 'producerClosed', producerId: data.producerId, peerId: owner.id, userId: owner.userId }); });
        return ok({ id: consumer.id, producerId: consumer.producerId, kind: consumer.kind, rtpParameters: consumer.rtpParameters, appData: consumer.appData });
      }
      if (action === 'resumeConsumer') { const consumer = peer.consumers.get(data.consumerId); if (!consumer) throw new Error('Consumer not found'); await consumer.resume(); return ok({ resumed: true }); }
      if (action === 'closeProducer') { const producer = peer.producers.get(data.producerId); if (producer) { peer.producers.delete(producer.id); broadcast(peer.room, { type: 'producerClosed', producerId: producer.id, peerId: peer.id, userId: peer.userId }, peer.id); producer.close(); } return ok({ closed: true }); }
      if (action === 'mediaState') { peer.state = { isMuted: !!data.isMuted, isVideoOn: !!data.isVideoOn, isScreenSharing: !!data.isScreenSharing, isHandRaised: !!data.isHandRaised }; broadcast(peer.room, { type: 'peerState', peerId: peer.id, userId: peer.userId, state: peer.state }, peer.id); return ok({ updated: true }); }
      throw new Error(`Unknown action: ${action}`);
    } catch (cause) {
      const error = cause instanceof Error ? cause.message : String(cause); if (message?.requestId) send(ws, { requestId: message.requestId, ok: false, error }); else send(ws, { type: 'error', error }); if (!authenticated) ws.close(4003, 'Unauthorized');
    }
  });
  ws.on('close', () => { if (authTimer) clearTimeout(authTimer); void cleanup(peer); }); ws.on('error', () => void cleanup(peer));
});
const heartbeat = setInterval(() => { for (const ws of wss.clients) { if (ws.isAlive === false) { ws.terminate(); continue; } ws.isAlive = false; ws.ping(); } }, 30000); heartbeat.unref();
server.listen(PORT, '0.0.0.0', () => console.log(`[SFU] signaling :${PORT}/ws; WebRTC UDP/TCP :${RTC_PORT}; announced=${ANNOUNCED_ADDRESS}`));
async function shutdown() { clearInterval(heartbeat); for (const room of rooms.values()) for (const peer of room.peers.values()) await cleanup(peer); wss.close(); server.close(); webRtcServer.close(); worker.close(); }
process.on('SIGTERM', () => void shutdown().finally(() => process.exit(0))); process.on('SIGINT', () => void shutdown().finally(() => process.exit(0)));

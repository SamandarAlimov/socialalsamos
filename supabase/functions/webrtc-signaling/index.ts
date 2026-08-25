// Lightweight WebSocket relay for Flutter/Web WebRTC calls.
//
// Durable DB signaling remains the source-of-truth fallback. This Edge
// Function is only a low-latency relay for offer/answer/ICE/media events.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

type Client = {
  socket: WebSocket;
  roomId: string;
  userId: string;
  joinedAt: number;
  lastSeenAt: number;
};

type PendingSignal = {
  targetUserId: string;
  createdAt: number;
  message: Record<string, unknown>;
};

const rooms = new Map<string, Map<string, Client>>();
const pendingSignals = new Map<string, PendingSignal[]>();
const roomCleanupTimers = new Map<string, number>();
const heartbeatTimers = new WeakMap<WebSocket, number>();

const HEARTBEAT_MS = 15_000;
const STALE_CLIENT_MS = 45_000;
const PENDING_SIGNAL_TTL_MS = 30_000;
const MAX_PENDING_SIGNALS_PER_ROOM = 300;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve((req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const upgrade = req.headers.get("upgrade") ?? "";
  if (upgrade.toLowerCase() !== "websocket") {
    return new Response("WebSocket required", {
      status: 426,
      headers: corsHeaders,
    });
  }

  const url = new URL(req.url);
  const initialRoomId =
    url.searchParams.get("roomId") ?? url.searchParams.get("callId");
  const initialUserId = url.searchParams.get("userId");

  const { socket, response } = Deno.upgradeWebSocket(req);
  let client: Client | null = null;
  let keepAliveResolve: (() => void) | null = null;
  const keepAlive = new Promise<void>((resolve) => {
    keepAliveResolve = resolve;
  });
  EdgeRuntime.waitUntil(keepAlive);
  const tokenUserId = getUserIdFromToken(req.headers.get("authorization"));

  socket.onopen = async () => {
    startSocketHeartbeat(socket);
    if (initialRoomId != null && initialUserId != null && tokenUserId != null) {
      client = await registerClient({
        socket,
        roomId: initialRoomId,
        userId: initialUserId,
        tokenUserId,
      });
      return;
    }
    socket.send(JSON.stringify({ type: "ready" }));
  };

  socket.onmessage = async (event) => {
    const message = parseMessage(event.data);
    if (message == null) return;

    const type = String(message.type ?? "");
    if (type.length === 0) return;

    if (client != null) {
      client.lastSeenAt = Date.now();
    }

    if (type === "pong" || type === "heartbeat") {
      if (client != null) {
        await touchParticipant(client, type === "heartbeat");
      }
      socket.send(JSON.stringify({
        type: "heartbeat-ack",
        serverTime: new Date().toISOString(),
      }));
      return;
    }

    if (type === "join" || type === "join-room") {
      const roomId =
        stringOrNull(message.roomId) ?? stringOrNull(message.callId);
      const userId = stringOrNull(message.userId);
      const joinTokenUserId =
        tokenUserId ?? getUserIdFromToken(stringOrNull(message.accessToken));
      if (roomId == null || userId == null) {
        socket.send(JSON.stringify({
          type: "error",
          message: "Missing roomId/callId or userId",
        }));
        return;
      }
      client = await registerClient({
        socket,
        roomId,
        userId,
        tokenUserId: joinTokenUserId,
      });
      return;
    }

    if (client == null) {
      socket.send(JSON.stringify({
        type: "error",
        message: "Join the call before sending signaling messages",
      }));
      return;
    }

    const normalized = {
      ...message,
      type,
      roomId: client.roomId,
      callId: client.roomId,
      userId: client.userId,
      fromUserId: client.userId,
      from: client.userId,
    };

    if (type === "leave" && message.ended === true) {
      await markParticipantLeft(client, true);
      broadcast(client.roomId, client.userId, {
        ...normalized,
        type: "call-ended",
        ended: true,
      });
      socket.close(1000, "call_ended");
      return;
    }

    const targetUserId =
      stringOrNull(message.targetUserId) ?? stringOrNull(message.to);

    if (targetUserId != null) {
      sendTo(client.roomId, targetUserId, normalized);
      return;
    }

    broadcast(client.roomId, client.userId, normalized);
  };

  socket.onerror = () => {
    if (client != null) leave(client);
  };

  socket.onclose = () => {
    stopSocketHeartbeat(socket);
    if (client != null) leave(client);
    keepAliveResolve?.();
  };

  return response;
});

async function registerClient({
  socket,
  roomId,
  userId,
  tokenUserId,
}: {
  socket: WebSocket;
  roomId: string;
  userId: string;
  tokenUserId: string | null;
}): Promise<Client | null> {
  const now = Date.now();
  const candidate: Client = {
    socket,
    roomId,
    userId,
    joinedAt: now,
    lastSeenAt: now,
  };

  if (tokenUserId == null) {
    send(candidate, {
      type: "error",
      message: "Authentication token is required",
    });
    socket.close(1008, "auth_required");
    return null;
  }

  if (tokenUserId != null && tokenUserId !== userId) {
    send(candidate, {
      type: "error",
      message: "User ID mismatch with authentication token",
    });
    socket.close(1008, "user_id_mismatch");
    return null;
  }

  const allowed = await verifyParticipant(userId, roomId);
  if (!allowed) {
    send(candidate, {
      type: "error",
      message: "Not authorized to join this call",
    });
    socket.close(1008, "not_authorized");
    return null;
  }

  const room = getRoom(roomId);
  const previous = room.get(userId);
  if (previous != null && previous.socket !== socket) {
    previous.socket.close(1000, "replaced");
  }
  room.set(userId, candidate);
  scheduleRoomCleanup(roomId);
  await touchParticipant(candidate, false);

  const peers = [...room.keys()].filter((id) => id !== userId);
  send(candidate, {
    type: "joined",
    roomId,
    callId: roomId,
    userId,
    peers,
    participants: peers,
    participantCount: room.size,
  });

  broadcast(roomId, userId, {
    type: "user-joined",
    roomId,
    callId: roomId,
    userId,
    participantCount: room.size,
  });

  flushPendingSignals(roomId, userId);

  return candidate;
}

function getRoom(roomId: string): Map<string, Client> {
  let room = rooms.get(roomId);
  if (room == null) {
    room = new Map<string, Client>();
    rooms.set(roomId, room);
  }
  return room;
}

function leave(client: Client) {
  const room = rooms.get(client.roomId);
  if (room == null) return;

  const existing = room.get(client.userId);
  if (existing?.socket !== client.socket) return;

  room.delete(client.userId);
  void markParticipantLeft(client);
  broadcast(client.roomId, client.userId, {
    type: "user-left",
    roomId: client.roomId,
    callId: client.roomId,
    userId: client.userId,
    fromUserId: client.userId,
    from: client.userId,
  });

  if (room.size === 0) {
    rooms.delete(client.roomId);
    pendingSignals.delete(client.roomId);
  }
}

function startSocketHeartbeat(socket: WebSocket) {
  stopSocketHeartbeat(socket);
  const timer = setInterval(() => {
    if (socket.readyState !== WebSocket.OPEN) {
      stopSocketHeartbeat(socket);
      return;
    }
    try {
      socket.send(JSON.stringify({
        type: "ping",
        serverTime: new Date().toISOString(),
      }));
    } catch {
      stopSocketHeartbeat(socket);
      try {
        socket.close(1011, "heartbeat_failed");
      } catch {
        // best effort
      }
    }
  }, HEARTBEAT_MS);
  heartbeatTimers.set(socket, timer);
}

function stopSocketHeartbeat(socket: WebSocket) {
  const timer = heartbeatTimers.get(socket);
  if (timer != null) {
    clearInterval(timer);
    heartbeatTimers.delete(socket);
  }
}

function scheduleRoomCleanup(roomId: string) {
  if (roomCleanupTimers.has(roomId)) return;
  const timer = setInterval(() => {
    const room = rooms.get(roomId);
    if (room == null) {
      clearInterval(timer);
      roomCleanupTimers.delete(roomId);
      return;
    }
    const now = Date.now();
    for (const client of room.values()) {
      if (now - client.lastSeenAt > STALE_CLIENT_MS) {
        try {
          client.socket.close(1001, "heartbeat_timeout");
        } catch {
          // best effort
        }
        leave(client);
      }
    }
    if (room.size === 0) {
      rooms.delete(roomId);
      pendingSignals.delete(roomId);
      clearInterval(timer);
      roomCleanupTimers.delete(roomId);
    }
  }, HEARTBEAT_MS);
  roomCleanupTimers.set(roomId, timer);
}

function broadcast(
  roomId: string,
  exceptUserId: string,
  message: Record<string, unknown>,
) {
  const room = rooms.get(roomId);
  if (room == null) return;

  for (const [peerId, peer] of room.entries()) {
    if (peerId === exceptUserId) continue;
    send(peer, message);
  }
}

function sendTo(
  roomId: string,
  targetUserId: string,
  message: Record<string, unknown>,
) {
  const peer = rooms.get(roomId)?.get(targetUserId);
  if (peer == null) {
    queuePendingSignal(roomId, targetUserId, message);
    return;
  }
  send(peer, message);
}

function queuePendingSignal(
  roomId: string,
  targetUserId: string,
  message: Record<string, unknown>,
) {
  const type = String(message.type ?? "");
  if (!isDurableSignalType(type)) return;

  const now = Date.now();
  const active = (pendingSignals.get(roomId) ?? []).filter((signal) =>
    now - signal.createdAt <= PENDING_SIGNAL_TTL_MS
  );
  active.push({
    targetUserId,
    createdAt: now,
    message: { ...message },
  });
  pendingSignals.set(roomId, active.slice(-MAX_PENDING_SIGNALS_PER_ROOM));
}

function flushPendingSignals(roomId: string, userId: string) {
  const queued = pendingSignals.get(roomId);
  if (queued == null || queued.length === 0) return;

  const now = Date.now();
  const keep: PendingSignal[] = [];
  for (const signal of queued) {
    if (now - signal.createdAt > PENDING_SIGNAL_TTL_MS) continue;
    if (signal.targetUserId !== userId) {
      keep.push(signal);
      continue;
    }
    sendTo(roomId, userId, signal.message);
  }

  if (keep.length === 0) {
    pendingSignals.delete(roomId);
  } else {
    pendingSignals.set(roomId, keep);
  }
}

function isDurableSignalType(type: string): boolean {
  return type === "offer" ||
    type === "answer" ||
    type === "ice" ||
    type === "ice-candidate" ||
    type === "media-state" ||
    type === "media-state-changed" ||
    type === "leave" ||
    type === "call-ended";
}

function send(client: Client, message: Record<string, unknown>) {
  if (client.socket.readyState !== WebSocket.OPEN) return;
  client.socket.send(JSON.stringify(message));
}

function parseMessage(data: unknown): Record<string, unknown> | null {
  try {
    if (typeof data === "string") {
      const parsed = JSON.parse(data);
      return isRecord(parsed) ? parsed : null;
    }
    if (data instanceof ArrayBuffer) {
      const parsed = JSON.parse(new TextDecoder().decode(data));
      return isRecord(parsed) ? parsed : null;
    }
  } catch {
    return null;
  }
  return null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringOrNull(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function getUserIdFromToken(authHeader: string | null): string | null {
  if (authHeader == null) return null;

  try {
    const token = authHeader.startsWith("Bearer ")
      ? authHeader.substring(7)
      : authHeader;
    const parts = token.split(".");
    if (parts.length !== 3) return null;

    const payload = JSON.parse(atob(parts[1]));
    return typeof payload.sub === "string" ? payload.sub : null;
  } catch {
    return null;
  }
}

async function verifyParticipant(
  userId: string,
  callId: string,
): Promise<boolean> {
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (supabaseUrl == null || serviceKey == null) return false;

    const supabase = createClient(supabaseUrl, serviceKey);

    const { data: directParticipant } = await supabase
      .from("call_participants")
      .select("call_id")
      .eq("call_id", callId)
      .eq("user_id", userId)
      .maybeSingle();

    if (directParticipant != null) return true;

    const { data: call } = await supabase
      .from("video_calls")
      .select("id, host_id, conversation_id")
      .eq("id", callId)
      .maybeSingle();

    if (call == null) return false;
    if (call.host_id === userId) return true;

    const conversationId = call.conversation_id;
    if (typeof conversationId !== "string") return false;

    const { data: byUserId } = await supabase
      .from("conversation_participants")
      .select("conversation_id")
      .eq("conversation_id", conversationId)
      .eq("user_id", userId)
      .maybeSingle();

    if (byUserId != null) return true;

    const { data: byProfileId } = await supabase
      .from("conversation_participants")
      .select("conversation_id")
      .eq("conversation_id", conversationId)
      .eq("profile_id", userId)
      .maybeSingle();

    return byProfileId != null;
  } catch (error) {
    console.error("WebRTC participant verification failed", error);
    return false;
  }
}

async function touchParticipant(client: Client, includeHeartbeat: boolean) {
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (supabaseUrl == null || serviceKey == null) return;

    const supabase = createClient(supabaseUrl, serviceKey);
    const now = new Date().toISOString();
    await supabase
      .from("call_participants")
      .upsert({
        call_id: client.roomId,
        user_id: client.userId,
        joined_at: now,
        left_at: null,
        connection_state: "connected",
        last_seen_at: now,
      }, { onConflict: "call_id,user_id" });

    if (includeHeartbeat) {
      await supabase
        .from("video_calls")
        .update({ last_heartbeat_at: now })
        .eq("id", client.roomId)
        .is("ended_at", null);
    }
  } catch (error) {
    console.error("WebRTC participant heartbeat failed", error);
  }
}

async function markParticipantLeft(client: Client, endCall = false) {
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (supabaseUrl == null || serviceKey == null) return;

    const supabase = createClient(supabaseUrl, serviceKey);
    const now = new Date().toISOString();
    await supabase
      .from("call_participants")
      .update({
        left_at: now,
        connection_state: "left",
        last_seen_at: now,
      })
      .eq("call_id", client.roomId)
      .eq("user_id", client.userId);

    if (endCall) {
      await supabase
        .from("video_calls")
        .update({
          status: "ended",
          ended_at: now,
          last_heartbeat_at: now,
        })
        .eq("id", client.roomId)
        .is("ended_at", null);
    }
  } catch (error) {
    console.error("WebRTC participant leave mark failed", error);
  }
}

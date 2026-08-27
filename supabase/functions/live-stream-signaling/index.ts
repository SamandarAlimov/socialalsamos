// Live stream signaling (WebSocket).
//
// XAVFSIZLIK TUZATISHI:
//   1. Ilgari token faqat base64 ochilib payload.sub olinardi — imzo tekshirilmagan.
//      Endi Supabase orqali haqiqiy tekshiriladi (userFromToken).
//   2. Ilgari 'viewer-join' da token umuman tekshirilmagan: istalgan odam
//      istalgan userId nomidan tomoshabin bo'lib ulanardi. Endi userId token
//      egasiga mos bo'lishi shart.
//   3. WebSocket sarlavha yubora olmasligi uchun token query paramdan ham
//      qabul qilinadi: ?access_token=... / ?token=..., yoki xabardagi accessToken.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { userFromToken, corsHeaders as sharedCors, logFunctionEvent } from "../_shared/guard.ts";

const FUNCTION_NAME = "live-stream-signaling";

// In-memory storage for live streams
// streamId -> { broadcaster: WebSocket, viewers: Map<userId, WebSocket> }
const streams = new Map<string, {
  broadcasterId: string;
  broadcaster: WebSocket | null;
  viewers: Map<string, WebSocket>;
}>();

// Verify stream exists and user is authorized
async function verifyStreamAccess(streamId: string, userId: string, role: 'broadcaster' | 'viewer'): Promise<boolean> {
  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { data: stream, error } = await supabase
      .from('live_streams')
      .select('id, user_id, status')
      .eq('id', streamId)
      .maybeSingle();

    if (error || !stream) {
      console.log(`Stream ${streamId} not found`);
      return false;
    }

    // Broadcaster must be the stream owner
    if (role === 'broadcaster') {
      return stream.user_id === userId && stream.status === 'live';
    }

    // Viewers just need the stream to be live
    return stream.status === 'live';
  } catch (error) {
    console.error('Error verifying stream access:', error);
    return false;
  }
}

serve(async (req) => {
  const { headers } = req;
  const upgradeHeader = headers.get("upgrade") || "";
  const authHeader = headers.get("authorization");
  const requestUrl = new URL(req.url);
  const queryToken =
    requestUrl.searchParams.get("access_token") ?? requestUrl.searchParams.get("token");

  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: sharedCors(req, "GET, POST, OPTIONS") });
  }

  // WebSocket upgrade
  if (upgradeHeader.toLowerCase() === "websocket") {
    const { socket, response } = Deno.upgradeWebSocket(req);

    let currentStreamId: string | null = null;
    let currentUserId: string | null = null;
    let currentRole: 'broadcaster' | 'viewer' | null = null;
    let tokenUserId: string | null = null;

    socket.onopen = async () => {
      // Imzo tekshiruvi ulanish boshida bir marta.
      tokenUserId = (await userFromToken(authHeader)) ?? (await userFromToken(queryToken));
      console.log("Live stream WebSocket connection established", tokenUserId ? "(auth ok)" : "(no auth yet)");
    };

    // Har bir join uchun token egasini aniqlaymiz (xabarda accessToken kelishi mumkin).
    const resolveTokenUser = async (messageToken: unknown): Promise<string | null> => {
      if (tokenUserId) return tokenUserId;
      const fromMessage = typeof messageToken === "string" ? messageToken : null;
      tokenUserId = await userFromToken(fromMessage);
      return tokenUserId;
    };

    const denyAuth = async (reason: string, metadata: Record<string, unknown>) => {
      await logFunctionEvent({
        functionName: FUNCTION_NAME,
        userId: tokenUserId,
        outcome: "blocked",
        reason,
        metadata,
      });
      socket.send(JSON.stringify({ type: 'error', message: 'Authentication required' }));
      socket.close(1008, reason.toLowerCase());
    };

    socket.onmessage = async (event) => {
      try {
        const data = JSON.parse(event.data);

        switch (data.type) {
          case 'broadcaster-join': {
            const { streamId, userId } = data;
            const authUserId = await resolveTokenUser(data.accessToken);

            if (!authUserId) {
              await denyAuth("UNAUTHORIZED", { streamId, role: 'broadcaster' });
              return;
            }
            if (authUserId !== userId) {
              await denyAuth("USER_ID_MISMATCH", { streamId, role: 'broadcaster', claimedUserId: userId });
              return;
            }

            const isAuthorized = await verifyStreamAccess(streamId, authUserId, 'broadcaster');
            if (!isAuthorized) {
              await logFunctionEvent({
                functionName: FUNCTION_NAME,
                userId: authUserId,
                outcome: "blocked",
                reason: "NOT_STREAM_OWNER",
                metadata: { streamId },
              });
              socket.send(JSON.stringify({
                type: 'error',
                message: 'Not authorized to broadcast this stream',
              }));
              socket.close(1008, 'not_authorized');
              return;
            }

            currentStreamId = streamId;
            currentUserId = authUserId;
            currentRole = 'broadcaster';

            if (!streams.has(streamId)) {
              streams.set(streamId, {
                broadcasterId: authUserId,
                broadcaster: socket,
                viewers: new Map(),
              });
            } else {
              const stream = streams.get(streamId)!;
              stream.broadcaster = socket;
              stream.broadcasterId = authUserId;
            }

            socket.send(JSON.stringify({
              type: 'broadcaster-ready',
              streamId,
              viewerCount: streams.get(streamId)?.viewers.size || 0,
            }));

            console.log(`Broadcaster ${authUserId} joined stream ${streamId}`);
            break;
          }

          case 'viewer-join': {
            const { streamId } = data;
            const authUserId = await resolveTokenUser(data.accessToken);

            // Ilgari bu yerda hech qanday tekshiruv yo'q edi.
            if (!authUserId) {
              await denyAuth("UNAUTHORIZED", { streamId, role: 'viewer' });
              return;
            }
            if (typeof data.userId === "string" && data.userId !== authUserId) {
              await denyAuth("USER_ID_MISMATCH", { streamId, role: 'viewer', claimedUserId: data.userId });
              return;
            }

            const isAuthorized = await verifyStreamAccess(streamId, authUserId, 'viewer');
            if (!isAuthorized) {
              socket.send(JSON.stringify({
                type: 'error',
                message: 'Stream not available',
              }));
              socket.close(1008, 'stream_unavailable');
              return;
            }

            currentStreamId = streamId;
            currentUserId = authUserId;
            currentRole = 'viewer';

            if (!streams.has(streamId)) {
              streams.set(streamId, {
                broadcasterId: '',
                broadcaster: null,
                viewers: new Map(),
              });
            }

            const stream = streams.get(streamId)!;
            stream.viewers.set(authUserId, socket);

            if (stream.broadcaster && stream.broadcaster.readyState === WebSocket.OPEN) {
              stream.broadcaster.send(JSON.stringify({
                type: 'viewer-joined',
                viewerId: authUserId,
                viewerCount: stream.viewers.size,
              }));

              socket.send(JSON.stringify({
                type: 'request-offer',
                streamId,
                broadcasterId: stream.broadcasterId,
              }));
            } else {
              socket.send(JSON.stringify({
                type: 'waiting-for-broadcaster',
                streamId,
              }));
            }

            console.log(`Viewer ${authUserId} joined stream ${streamId}. Total viewers: ${stream.viewers.size}`);
            break;
          }

          case 'offer': {
            // Broadcaster sends offer to a specific viewer
            const { targetViewerId, sdp } = data;
            if (currentStreamId && currentRole === 'broadcaster') {
              const stream = streams.get(currentStreamId);
              const viewerSocket = stream?.viewers.get(targetViewerId);
              if (viewerSocket && viewerSocket.readyState === WebSocket.OPEN) {
                viewerSocket.send(JSON.stringify({
                  type: 'offer',
                  sdp,
                  broadcasterId: currentUserId,
                }));
              }
            }
            break;
          }

          case 'answer': {
            // Viewer sends answer back to broadcaster
            const { sdp } = data;
            if (currentStreamId && currentRole === 'viewer') {
              const stream = streams.get(currentStreamId);
              if (stream?.broadcaster && stream.broadcaster.readyState === WebSocket.OPEN) {
                stream.broadcaster.send(JSON.stringify({
                  type: 'answer',
                  sdp,
                  viewerId: currentUserId,
                }));
              }
            }
            break;
          }

          case 'ice-candidate': {
            const { candidate, targetUserId } = data;
            if (currentStreamId) {
              const stream = streams.get(currentStreamId);

              if (currentRole === 'broadcaster' && targetUserId) {
                const viewerSocket = stream?.viewers.get(targetUserId);
                if (viewerSocket && viewerSocket.readyState === WebSocket.OPEN) {
                  viewerSocket.send(JSON.stringify({
                    type: 'ice-candidate',
                    candidate,
                    fromUserId: currentUserId,
                  }));
                }
              } else if (currentRole === 'viewer') {
                if (stream?.broadcaster && stream.broadcaster.readyState === WebSocket.OPEN) {
                  stream.broadcaster.send(JSON.stringify({
                    type: 'ice-candidate',
                    candidate,
                    fromUserId: currentUserId,
                  }));
                }
              }
            }
            break;
          }

          case 'stream-ended': {
            if (currentStreamId && currentRole === 'broadcaster') {
              const stream = streams.get(currentStreamId);
              if (stream) {
                stream.viewers.forEach((ws) => {
                  if (ws.readyState === WebSocket.OPEN) {
                    ws.send(JSON.stringify({ type: 'stream-ended' }));
                  }
                });
                streams.delete(currentStreamId);
              }
            }
            break;
          }

          case 'leave': {
            handleLeave(currentStreamId, currentUserId, currentRole);
            break;
          }
        }
      } catch (error) {
        console.error("Error handling message:", error);
      }
    };

    socket.onclose = () => {
      handleLeave(currentStreamId, currentUserId, currentRole);
      console.log("Live stream WebSocket connection closed");
    };

    socket.onerror = (error) => {
      console.error("WebSocket error:", error);
    };

    return response;
  }

  // REST API for stream info — faqat autentifikatsiyadan o'tganlar uchun.
  const restUserId = (await userFromToken(authHeader)) ?? (await userFromToken(queryToken));
  if (!restUserId) {
    return new Response(JSON.stringify({ error: "Avval tizimga kirishingiz kerak.", code: "UNAUTHORIZED" }), {
      status: 401,
      headers: { ...sharedCors(req, "GET, POST, OPTIONS"), 'Content-Type': 'application/json' },
    });
  }

  if (requestUrl.pathname.includes('/stream-info')) {
    const streamId = requestUrl.searchParams.get('streamId');
    if (streamId) {
      const stream = streams.get(streamId);
      return new Response(JSON.stringify({
        exists: !!stream,
        hasBroadcaster: !!stream?.broadcaster,
        viewerCount: stream?.viewers.size || 0
      }), {
        headers: { ...sharedCors(req, "GET, POST, OPTIONS"), 'Content-Type': 'application/json' }
      });
    }
  }

  return new Response(JSON.stringify({
    status: 'Live Stream Signaling Server',
    activeStreams: streams.size
  }), {
    headers: { ...sharedCors(req, "GET, POST, OPTIONS"), 'Content-Type': 'application/json' }
  });
});

function handleLeave(streamId: string | null, userId: string | null, role: 'broadcaster' | 'viewer' | null) {
  if (!streamId || !userId || !role) return;

  const stream = streams.get(streamId);
  if (!stream) return;

  if (role === 'broadcaster') {
    stream.viewers.forEach((ws) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'stream-ended' }));
      }
    });

    streams.delete(streamId);
    console.log(`Broadcaster left stream ${streamId}. Stream cleaned up.`);
  } else if (role === 'viewer') {
    stream.viewers.delete(userId);

    if (stream.broadcaster && stream.broadcaster.readyState === WebSocket.OPEN) {
      stream.broadcaster.send(JSON.stringify({
        type: 'viewer-left',
        viewerId: userId,
        viewerCount: stream.viewers.size,
      }));
    }

    console.log(`Viewer ${userId} left stream ${streamId}. Remaining viewers: ${stream.viewers.size}`);
  }
}

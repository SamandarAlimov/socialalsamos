import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// In-memory storage for live streams
// streamId -> { broadcaster: WebSocket, viewers: Map<userId, WebSocket> }
const streams = new Map<string, {
  broadcasterId: string;
  broadcaster: WebSocket | null;
  viewers: Map<string, WebSocket>;
}>();

// Helper to extract user ID from JWT token
function getUserIdFromToken(authHeader: string | null): string | null {
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }
  
  try {
    const token = authHeader.substring(7);
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    
    const payload = JSON.parse(atob(parts[1]));
    return payload.sub || null;
  } catch {
    return null;
  }
}

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

  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  // WebSocket upgrade
  if (upgradeHeader.toLowerCase() === "websocket") {
    const { socket, response } = Deno.upgradeWebSocket(req);
    
    let currentStreamId: string | null = null;
    let currentUserId: string | null = null;
    let currentRole: 'broadcaster' | 'viewer' | null = null;

    // Try to get user ID from auth header
    const tokenUserId = getUserIdFromToken(authHeader);

    socket.onopen = () => {
      console.log("Live stream WebSocket connection established");
    };

    socket.onmessage = async (event) => {
      try {
        const data = JSON.parse(event.data);
        console.log("Received message:", data.type, "from user:", data.userId);

        switch (data.type) {
          case 'broadcaster-join': {
            const { streamId, userId } = data;
            
            // Verify the user ID matches the token
            if (tokenUserId && tokenUserId !== userId) {
              socket.send(JSON.stringify({
                type: 'error',
                message: 'User ID mismatch with authentication token',
              }));
              socket.close();
              return;
            }

            // Verify broadcaster access
            const isAuthorized = await verifyStreamAccess(streamId, userId, 'broadcaster');
            if (!isAuthorized) {
              console.log(`User ${userId} not authorized as broadcaster for stream ${streamId}`);
              socket.send(JSON.stringify({
                type: 'error',
                message: 'Not authorized to broadcast this stream',
              }));
              socket.close();
              return;
            }

            currentStreamId = streamId;
            currentUserId = userId;
            currentRole = 'broadcaster';

            // Create or update stream entry
            if (!streams.has(streamId)) {
              streams.set(streamId, {
                broadcasterId: userId,
                broadcaster: socket,
                viewers: new Map(),
              });
            } else {
              const stream = streams.get(streamId)!;
              stream.broadcaster = socket;
              stream.broadcasterId = userId;
            }

            socket.send(JSON.stringify({
              type: 'broadcaster-ready',
              streamId,
              viewerCount: streams.get(streamId)?.viewers.size || 0,
            }));

            console.log(`Broadcaster ${userId} joined stream ${streamId}`);
            break;
          }

          case 'viewer-join': {
            const { streamId, userId } = data;
            
            // Verify viewer access
            const isAuthorized = await verifyStreamAccess(streamId, userId, 'viewer');
            if (!isAuthorized) {
              socket.send(JSON.stringify({
                type: 'error',
                message: 'Stream not available',
              }));
              socket.close();
              return;
            }

            currentStreamId = streamId;
            currentUserId = userId;
            currentRole = 'viewer';

            // Create stream entry if doesn't exist (broadcaster might not be connected yet)
            if (!streams.has(streamId)) {
              streams.set(streamId, {
                broadcasterId: '',
                broadcaster: null,
                viewers: new Map(),
              });
            }

            const stream = streams.get(streamId)!;
            stream.viewers.set(userId, socket);

            // If broadcaster is connected, notify them of new viewer
            if (stream.broadcaster && stream.broadcaster.readyState === WebSocket.OPEN) {
              stream.broadcaster.send(JSON.stringify({
                type: 'viewer-joined',
                viewerId: userId,
                viewerCount: stream.viewers.size,
              }));

              // Tell viewer to request offer from broadcaster
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

            console.log(`Viewer ${userId} joined stream ${streamId}. Total viewers: ${stream.viewers.size}`);
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
                // Broadcaster sending ICE to specific viewer
                const viewerSocket = stream?.viewers.get(targetUserId);
                if (viewerSocket && viewerSocket.readyState === WebSocket.OPEN) {
                  viewerSocket.send(JSON.stringify({
                    type: 'ice-candidate',
                    candidate,
                    fromUserId: currentUserId,
                  }));
                }
              } else if (currentRole === 'viewer') {
                // Viewer sending ICE to broadcaster
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
                // Notify all viewers
                stream.viewers.forEach((ws) => {
                  if (ws.readyState === WebSocket.OPEN) {
                    ws.send(JSON.stringify({
                      type: 'stream-ended',
                    }));
                  }
                });
                
                // Clean up
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

  // REST API for stream info
  const url = new URL(req.url);
  
  if (url.pathname.includes('/stream-info')) {
    const streamId = url.searchParams.get('streamId');
    if (streamId) {
      const stream = streams.get(streamId);
      return new Response(JSON.stringify({
        exists: !!stream,
        hasBroadcaster: !!stream?.broadcaster,
        viewerCount: stream?.viewers.size || 0
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
  }

  return new Response(JSON.stringify({ 
    status: 'Live Stream Signaling Server',
    activeStreams: streams.size 
  }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  });
});

function handleLeave(streamId: string | null, userId: string | null, role: 'broadcaster' | 'viewer' | null) {
  if (!streamId || !userId || !role) return;
  
  const stream = streams.get(streamId);
  if (!stream) return;

  if (role === 'broadcaster') {
    // Notify all viewers that stream ended
    stream.viewers.forEach((ws) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
          type: 'stream-ended',
        }));
      }
    });
    
    // Clean up stream
    streams.delete(streamId);
    console.log(`Broadcaster left stream ${streamId}. Stream cleaned up.`);
  } else if (role === 'viewer') {
    stream.viewers.delete(userId);
    
    // Notify broadcaster of viewer count change
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

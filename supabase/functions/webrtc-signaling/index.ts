import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// In-memory storage for rooms (in production, use Redis)
const rooms = new Map<string, Map<string, WebSocket>>();
const roomCallIds = new Map<string, string>(); // roomId -> callId mapping

// Helper to verify user is participant in a conversation/call
async function verifyParticipant(userId: string, roomId: string): Promise<boolean> {
  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Check if the roomId corresponds to a video_call or conversation
    // First check if user is a call participant
    const { data: callParticipant } = await supabase
      .from('call_participants')
      .select('id')
      .eq('call_id', roomId)
      .eq('user_id', userId)
      .maybeSingle();

    if (callParticipant) return true;

    // Check if user is part of the conversation (roomId could be conversation_id)
    const { data: convParticipant } = await supabase
      .from('conversation_participants')
      .select('id')
      .eq('conversation_id', roomId)
      .eq('user_id', userId)
      .maybeSingle();

    if (convParticipant) return true;

    // Check if there's a video_call for this room and user is host or conversation participant
    const { data: videoCall } = await supabase
      .from('video_calls')
      .select('id, host_id, conversation_id')
      .eq('id', roomId)
      .maybeSingle();

    if (videoCall) {
      if (videoCall.host_id === userId) return true;
      
      if (videoCall.conversation_id) {
        const { data: isConvParticipant } = await supabase
          .from('conversation_participants')
          .select('id')
          .eq('conversation_id', videoCall.conversation_id)
          .eq('user_id', userId)
          .maybeSingle();
        
        if (isConvParticipant) return true;
      }
    }

    return false;
  } catch (error) {
    console.error('Error verifying participant:', error);
    return false;
  }
}

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
    
    let currentRoomId: string | null = null;
    let currentUserId: string | null = null;
    let isAuthenticated = false;

    // Try to get user ID from auth header
    const tokenUserId = getUserIdFromToken(authHeader);

    socket.onopen = () => {
      console.log("WebSocket connection established");
    };

    socket.onmessage = async (event) => {
      try {
        const data = JSON.parse(event.data);
        console.log("Received message:", data.type);

        switch (data.type) {
          case 'join': {
            const { roomId, userId } = data;
            
            // Verify the user ID matches the token (if token provided)
            if (tokenUserId && tokenUserId !== userId) {
              socket.send(JSON.stringify({
                type: 'error',
                message: 'User ID mismatch with authentication token',
              }));
              socket.close();
              return;
            }

            // Verify user is authorized to join this room
            const isAuthorized = await verifyParticipant(userId, roomId);
            if (!isAuthorized) {
              console.log(`User ${userId} not authorized for room ${roomId}`);
              socket.send(JSON.stringify({
                type: 'error',
                message: 'Not authorized to join this call',
              }));
              socket.close();
              return;
            }

            isAuthenticated = true;
            currentRoomId = roomId;
            currentUserId = userId;

            // Create room if it doesn't exist
            if (!rooms.has(roomId)) {
              rooms.set(roomId, new Map());
            }

            const room = rooms.get(roomId)!;
            
            // Notify existing participants about new user
            const existingParticipants: string[] = [];
            room.forEach((ws, participantId) => {
              existingParticipants.push(participantId);
              if (ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({
                  type: 'user-joined',
                  userId,
                  participantCount: room.size + 1
                }));
              }
            });

            // Add new participant
            room.set(userId, socket);
            
            // Send existing participants to new user
            socket.send(JSON.stringify({
              type: 'room-joined',
              roomId,
              participants: existingParticipants,
              participantCount: room.size
            }));
            
            console.log(`User ${userId} joined room ${roomId}. Total participants: ${room.size}`);
            break;
          }

          case 'offer': {
            const { targetUserId, sdp, userId } = data;
            if (currentRoomId) {
              const room = rooms.get(currentRoomId);
              const targetSocket = room?.get(targetUserId);
              if (targetSocket && targetSocket.readyState === WebSocket.OPEN) {
                targetSocket.send(JSON.stringify({
                  type: 'offer',
                  sdp,
                  fromUserId: userId
                }));
              }
            }
            break;
          }

          case 'answer': {
            const { targetUserId, sdp, userId } = data;
            if (currentRoomId) {
              const room = rooms.get(currentRoomId);
              const targetSocket = room?.get(targetUserId);
              if (targetSocket && targetSocket.readyState === WebSocket.OPEN) {
                targetSocket.send(JSON.stringify({
                  type: 'answer',
                  sdp,
                  fromUserId: userId
                }));
              }
            }
            break;
          }

          case 'ice-candidate': {
            const { targetUserId, candidate, userId } = data;
            if (currentRoomId) {
              const room = rooms.get(currentRoomId);
              const targetSocket = room?.get(targetUserId);
              if (targetSocket && targetSocket.readyState === WebSocket.OPEN) {
                targetSocket.send(JSON.stringify({
                  type: 'ice-candidate',
                  candidate,
                  fromUserId: userId
                }));
              }
            }
            break;
          }

          case 'media-state': {
            const { userId, isMuted, isVideoOn, isScreenSharing, isHandRaised } = data;
            if (currentRoomId) {
              const room = rooms.get(currentRoomId);
              room?.forEach((ws, participantId) => {
                if (participantId !== userId && ws.readyState === WebSocket.OPEN) {
                  ws.send(JSON.stringify({
                    type: 'media-state-changed',
                    userId,
                    isMuted,
                    isVideoOn,
                    isScreenSharing,
                    isHandRaised
                  }));
                }
              });
            }
            break;
          }

          case 'chat-message': {
            const { userId, message, timestamp } = data;
            if (currentRoomId) {
              const room = rooms.get(currentRoomId);
              room?.forEach((ws, participantId) => {
                if (ws.readyState === WebSocket.OPEN) {
                  ws.send(JSON.stringify({
                    type: 'chat-message',
                    userId,
                    message,
                    timestamp
                  }));
                }
              });
            }
            break;
          }

          case 'leave': {
            handleLeave(currentRoomId, currentUserId, socket);
            break;
          }

          case 'call-ended': {
            // Broadcast CALL_ENDED to all participants immediately
            if (currentRoomId) {
              const room = rooms.get(currentRoomId);
              room?.forEach((ws, participantId) => {
                if (participantId !== currentUserId && ws.readyState === WebSocket.OPEN) {
                  ws.send(JSON.stringify({
                    type: 'call-ended',
                    userId: currentUserId,
                  }));
                }
              });
            }
            handleLeave(currentRoomId, currentUserId, socket);
            break;
          }
        }
      } catch (error) {
        console.error("Error handling message:", error);
      }
    };

    socket.onclose = () => {
      handleLeave(currentRoomId, currentUserId, socket);
      console.log("WebSocket connection closed");
    };

    socket.onerror = (error) => {
      console.error("WebSocket error:", error);
    };

    return response;
  }

  // REST API for room info
  const url = new URL(req.url);
  
  if (url.pathname.includes('/room-info')) {
    const roomId = url.searchParams.get('roomId');
    if (roomId) {
      const room = rooms.get(roomId);
      return new Response(JSON.stringify({
        exists: !!room,
        participantCount: room?.size || 0
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
  }

  return new Response(JSON.stringify({ 
    status: 'WebRTC Signaling Server',
    activeRooms: rooms.size 
  }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  });
});

function handleLeave(roomId: string | null, userId: string | null, socket: WebSocket) {
  if (roomId && userId) {
    const room = rooms.get(roomId);
    if (room) {
      room.delete(userId);
      
      // Notify remaining participants
      room.forEach((ws) => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({
            type: 'user-left',
            userId,
            participantCount: room.size
          }));
        }
      });

      // Clean up empty rooms
      if (room.size === 0) {
        rooms.delete(roomId);
      }
      
      console.log(`User ${userId} left room ${roomId}. Remaining: ${room.size}`);
    }
  }
}

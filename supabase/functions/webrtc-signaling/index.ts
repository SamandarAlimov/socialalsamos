import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// In-memory storage for rooms (in production, use Redis)
const rooms = new Map<string, Map<string, WebSocket>>();
const participants = new Map<string, { odsp: string; userId: string; roomId: string }>();

serve(async (req) => {
  const { headers } = req;
  const upgradeHeader = headers.get("upgrade") || "";

  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  // WebSocket upgrade
  if (upgradeHeader.toLowerCase() === "websocket") {
    const { socket, response } = Deno.upgradeWebSocket(req);
    
    let currentRoomId: string | null = null;
    let currentUserId: string | null = null;

    socket.onopen = () => {
      console.log("WebSocket connection established");
    };

    socket.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        console.log("Received message:", data.type);

        switch (data.type) {
          case 'join': {
            const { roomId, userId } = data;
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

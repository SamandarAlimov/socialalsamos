import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { IncomingCallDialog } from '@/components/messages/IncomingCallDialog';
import { useNavigate, useLocation } from 'react-router-dom';

interface IncomingCall {
  id: string;
  conversation_id: string;
  host_id: string;
  call_type: 'audio' | 'video';
  host_profile: {
    display_name: string | null;
    username: string | null;
    avatar_url: string | null;
  } | null;
}

interface GlobalCallContextType {
  incomingCall: IncomingCall | null;
  handleCallHandled: (callId: string) => void;
  acceptCall: () => void;
  declineCall: () => void;
}

const GlobalCallContext = createContext<GlobalCallContextType | undefined>(undefined);

export function GlobalCallProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [incomingCall, setIncomingCall] = useState<IncomingCall | null>(null);
  const [handledCallIds, setHandledCallIds] = useState<Set<string>>(new Set());
  const callSoundRef = useRef<AudioContext | null>(null);

  const handleCallHandled = useCallback((callId: string) => {
    setHandledCallIds(prev => new Set([...prev, callId]));
    if (incomingCall?.id === callId) {
      setIncomingCall(null);
    }
  }, [incomingCall]);

  const acceptCall = useCallback(() => {
    if (incomingCall) {
      handleCallHandled(incomingCall.id);
      // Navigate to messages with call info
      navigate(`/messages?call=${incomingCall.id}&type=${incomingCall.call_type}`);
    }
  }, [incomingCall, handleCallHandled, navigate]);

  const declineCall = useCallback(async () => {
    if (incomingCall) {
      // Update call status to declined
      await supabase
        .from('video_calls')
        .update({ status: 'ended' })
        .eq('id', incomingCall.id);
      
      handleCallHandled(incomingCall.id);
    }
  }, [incomingCall, handleCallHandled]);

  // Listen for incoming calls globally
  useEffect(() => {
    if (!user) return;

    const channel = supabase
      .channel('global-incoming-calls')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'video_calls',
        },
        async (payload) => {
          const newCall = payload.new as {
            id: string;
            conversation_id: string;
            host_id: string;
            call_type: string;
            status: string;
          };

          console.log('[GlobalCall] New call detected:', newCall);

          // Skip if it's our own call or already handled
          if (newCall.host_id === user.id || handledCallIds.has(newCall.id)) {
            console.log('[GlobalCall] Skipping - our call or already handled');
            return;
          }

          // Check if we're a participant in this conversation
          const { data: participant } = await supabase
            .from('conversation_participants')
            .select('id')
            .eq('conversation_id', newCall.conversation_id)
            .eq('user_id', user.id)
            .maybeSingle();

          if (!participant) {
            console.log('[GlobalCall] Not a participant in this conversation');
            return;
          }

          // Fetch caller's profile
          const { data: hostProfile } = await supabase
            .from('profiles')
            .select('display_name, username, avatar_url')
            .eq('id', newCall.host_id)
            .single();

          console.log('[GlobalCall] Incoming call from:', hostProfile);

          setIncomingCall({
            id: newCall.id,
            conversation_id: newCall.conversation_id,
            host_id: newCall.host_id,
            call_type: newCall.call_type as 'audio' | 'video',
            host_profile: hostProfile,
          });
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'video_calls',
        },
        (payload) => {
          const updatedCall = payload.new as { id: string; status: string };
          
          console.log('[GlobalCall] Call updated:', updatedCall.id, 'status:', updatedCall.status);
          
          // If call ended, dismiss the notification immediately
          if (updatedCall.status === 'ended') {
            if (incomingCall?.id === updatedCall.id) {
              console.log('[GlobalCall] Incoming call ended, dismissing');
              setIncomingCall(null);
            }
            // Also mark as handled to prevent any stale state
            setHandledCallIds(prev => new Set([...prev, updatedCall.id]));
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, handledCallIds, incomingCall]);

  // Don't show dialog if already on messages page (it handles its own calls)
  const showDialog = incomingCall && location.pathname !== '/messages';

  return (
    <GlobalCallContext.Provider value={{ incomingCall, handleCallHandled, acceptCall, declineCall }}>
      {children}
      
      {/* Global incoming call dialog */}
      {showDialog && (
        <IncomingCallDialog
          isOpen={true}
          callerName={incomingCall.host_profile?.display_name || incomingCall.host_profile?.username || 'Unknown'}
          callerAvatar={incomingCall.host_profile?.avatar_url || undefined}
          callType={incomingCall.call_type}
          onAccept={acceptCall}
          onDecline={declineCall}
        />
      )}
    </GlobalCallContext.Provider>
  );
}

export function useGlobalCall() {
  const context = useContext(GlobalCallContext);
  if (context === undefined) {
    throw new Error('useGlobalCall must be used within a GlobalCallProvider');
  }
  return context;
}

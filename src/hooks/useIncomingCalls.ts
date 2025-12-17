import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

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

export function useIncomingCalls() {
  const { user } = useAuth();
  const [incomingCall, setIncomingCall] = useState<IncomingCall | null>(null);
  const [activeCallIds, setActiveCallIds] = useState<Set<string>>(new Set());

  // Track calls that we've already handled (accepted/declined/created by us)
  const handleCallHandled = useCallback((callId: string) => {
    setActiveCallIds(prev => new Set([...prev, callId]));
    if (incomingCall?.id === callId) {
      setIncomingCall(null);
    }
  }, [incomingCall]);

  const declineCall = useCallback(() => {
    if (incomingCall) {
      handleCallHandled(incomingCall.id);
    }
  }, [incomingCall, handleCallHandled]);

  useEffect(() => {
    if (!user) return;

    // Subscribe to new video calls
    const channel = supabase
      .channel('incoming-calls')
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

          console.log('New call detected:', newCall);

          // Skip if it's our own call or already handled
          if (newCall.host_id === user.id || activeCallIds.has(newCall.id)) {
            console.log('Skipping - our call or already handled');
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
            console.log('Not a participant in this conversation');
            return;
          }

          // Fetch caller's profile
          const { data: hostProfile } = await supabase
            .from('profiles')
            .select('display_name, username, avatar_url')
            .eq('id', newCall.host_id)
            .single();

          console.log('Incoming call from:', hostProfile);

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
          
          // If call ended, dismiss the notification
          if (updatedCall.status === 'ended' && incomingCall?.id === updatedCall.id) {
            setIncomingCall(null);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, activeCallIds, incomingCall]);

  return {
    incomingCall,
    handleCallHandled,
    declineCall,
  };
}

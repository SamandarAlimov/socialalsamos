import { useState, useCallback, useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';

/** Mesh topology cap: WebRTC mesh creates N-1 peer connections per client.
 *  8 participants = 7 uplinks each, which is the practical ceiling before
 *  CPU/bandwidth degrade. Enforced atomically in join_video_call_guarded(). */
export const MAX_MESH_PARTICIPANTS = 8;

interface VideoCallRecord {
  id: string;
  conversation_id: string | null;
  host_id: string;
  call_type: string;
  status: string;
  started_at: string | null;
  ended_at: string | null;
  is_group_call?: boolean;
  max_participants?: number | null;
}

interface CallParticipant {
  id: string;
  call_id: string;
  user_id: string;
  joined_at: string | null;
  left_at: string | null;
  is_muted: boolean;
  is_video_on: boolean;
  is_screen_sharing: boolean;
  is_hand_raised: boolean;
  profile?: {
    id: string;
    username: string | null;
    display_name: string | null;
    avatar_url: string | null;
  };
}

export function useVideoCall() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [currentCall, setCurrentCall] = useState<VideoCallRecord | null>(null);
  const [callParticipants, setCallParticipants] = useState<CallParticipant[]>([]);
  const [isCreatingCall, setIsCreatingCall] = useState(false);
  const [callEnded, setCallEnded] = useState(false);
  const callSubscriptionRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const isCreatingCallRef = useRef(false);
  const endedToastCallRef = useRef<string | null>(null);

  // Subscribe once per call id. Updating currentCall with realtime payloads must
  // NOT tear down and recreate the channel on every status update.
  const currentCallId = currentCall?.id ?? null;
  useEffect(() => {
    if (!currentCallId) return;

    console.log('[VideoCall] Subscribing to call status:', currentCallId);

    const channel = supabase
      .channel(`call_status_${currentCallId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'video_calls',
          filter: `id=eq.${currentCallId}`,
        },
        (payload) => {
          const updated = payload.new as VideoCallRecord;
          console.log('[VideoCall] Call status updated:', updated.status);

          setCurrentCall((previous) =>
            previous?.id === updated.id ? { ...previous, ...updated } : updated
          );

          if (
            updated.status === 'ended' &&
            endedToastCallRef.current !== updated.id
          ) {
            endedToastCallRef.current = updated.id;
            console.log('[VideoCall] Call ended by other participant');
            setCallEnded(true);
            toast({
              title: 'Call Ended',
              description: 'The call has ended',
            });
          }
        }
      )
      .subscribe();

    callSubscriptionRef.current = channel;

    return () => {
      console.log('[VideoCall] Unsubscribing from call status');
      if (callSubscriptionRef.current === channel) {
        callSubscriptionRef.current = null;
      }
      void supabase.removeChannel(channel);
    };
  }, [currentCallId, toast]);

  // Create a new video call
  const createCall = useCallback(async (
    conversationId: string,
    callType: 'audio' | 'video'
  ): Promise<string | null> => {
    if (!user?.id) {
      toast({
        title: 'Error',
        description: 'You must be logged in to start a call',
        variant: 'destructive',
      });
      return null;
    }

    // The ref closes the small window before React commits isCreatingCall,
    // preventing double-clicks from creating competing call sessions.
    if (isCreatingCallRef.current) return null;

    isCreatingCallRef.current = true;
    setIsCreatingCall(true);
    setCallEnded(false);
    endedToastCallRef.current = null;

    try {
      // The database function atomically validates membership, creates/reuses
      // the open call, and adds the host to both participant registries.
      const { data: callId, error: createError } = await supabase.rpc('create_video_call', {
        p_conversation_id: conversationId,
        p_call_type: callType,
        p_is_video_on: callType === 'video',
      });

      if (createError) throw createError;
      if (!callId) throw new Error('Call was not created');

      const { data: call, error: readError } = await supabase
        .from('video_calls')
        .select('*')
        .eq('id', callId)
        .single();

      if (readError || !call) throw readError ?? new Error('Created call is not readable');
      setCurrentCall(call as VideoCallRecord);
      
      toast({
        title: 'Call Started',
        description: `${callType === 'video' ? 'Video' : 'Audio'} call started`,
      });

      return callId;
    } catch (error) {
      console.error('Failed to create call:', error);
      toast({
        title: 'Error',
        description: 'Failed to start call. Please try again.',
        variant: 'destructive',
      });
      return null;
    } finally {
      isCreatingCallRef.current = false;
      setIsCreatingCall(false);
    }
  }, [user?.id, toast]);

  // Join an existing call — atomic, cap-enforced server side
  const joinCall = useCallback(async (callId: string, isVideoOn = true): Promise<boolean> => {
    if (!user?.id) return false;

    setCallEnded(false);
    endedToastCallRef.current = null;

    try {
      const { data, error } = await supabase.rpc('join_video_call_guarded', {
        p_call_id: callId,
        p_is_video_on: isVideoOn,
      });

      if (error) throw error;

      const result = (data ?? {}) as {
        joined?: boolean;
        reason?: string;
        max_participants?: number;
      };

      if (!result.joined) {
        if (result.reason === 'call_full') {
          toast({
            title: 'This group call is full',
            description: `A maximum of ${result.max_participants ?? MAX_MESH_PARTICIPANTS} participants can join this call.`,
            variant: 'destructive',
          });
        } else {
          toast({
            title: 'Call Ended',
            description: 'This call has already ended',
            variant: 'destructive',
          });
        }
        return false;
      }

      const { data: callData } = await supabase
        .from('video_calls')
        .select('*')
        .eq('id', callId)
        .single();

      if (!callData) return false;

      setCurrentCall(callData as VideoCallRecord);
      return true;
    } catch (error) {
      console.error('Failed to join call:', error);
      toast({
        title: 'Error',
        description: 'Failed to join call',
        variant: 'destructive',
      });
      return false;
    }
  }, [user?.id, toast]);

  /**
   * Liveness heartbeat.
   * The server reaper (`reap_stale_calls`, pg_cron every minute) marks any
   * participant silent for >90s as left and ends calls with nobody active.
   * We therefore ping every 20s while in a call, and immediately when the tab
   * becomes visible again, so a live participant is never reaped.
   */
  useEffect(() => {
    const callId = currentCall?.id;
    if (!callId || !user?.id || currentCall?.ended_at) return;

    let cancelled = false;
    const ping = async () => {
      if (cancelled || document.visibilityState === 'hidden') return;
      try {
        await supabase.rpc('call_heartbeat', { p_call_id: callId });
      } catch (e) {
        console.warn('[VideoCall] heartbeat failed', e);
      }
    };

    void ping();
    const interval = window.setInterval(ping, 20_000);
    const onVisible = () => {
      if (document.visibilityState === 'visible') void ping();
    };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [currentCall?.id, currentCall?.ended_at, user?.id]);

  // Reset call state (called after cleanup is complete)
  const resetCallState = useCallback(() => {
    setCurrentCall(null);
    setCallParticipants([]);
    setCallEnded(false);
    endedToastCallRef.current = null;
  }, []);

  /**
   * Leave the call. Atomic server-side lifecycle:
   *  - 1:1 call  -> always ends the call for both sides
   *  - group call -> only ends when the leaver was the last active participant.
   *    Host departure is NOT special.
   * Returns true when the whole call was ended.
   */
  const leaveCall = useCallback(async (): Promise<boolean> => {
    if (!currentCall || !user?.id) return false;

    const callId = currentCall.id;
    console.log('[VideoCall] Leaving call:', callId);

    try {
      const { data, error } = await supabase.rpc('leave_video_call', {
        p_call_id: callId,
      });

      if (error) throw error;

      const result = (data ?? {}) as { call_ended?: boolean; active_participants?: number };
      console.log('[VideoCall] Leave result:', result);
      return !!result.call_ended;
    } catch (error) {
      console.error('Error leaving call:', error);
      return false;
    }
  }, [currentCall, user?.id]);

  // Update participant media state in database
  const updateMediaState = useCallback(async (
    isMuted: boolean,
    isVideoOn: boolean,
    isScreenSharing: boolean,
    isHandRaised: boolean
  ) => {
    if (!currentCall || !user?.id) return;

    try {
      await supabase
        .from('call_participants')
        .update({
          is_muted: isMuted,
          is_video_on: isVideoOn,
          is_screen_sharing: isScreenSharing,
          is_hand_raised: isHandRaised,
        })
        .eq('call_id', currentCall.id)
        .eq('user_id', user.id);
    } catch (error) {
      console.error('Error updating media state:', error);
    }
  }, [currentCall, user?.id]);

  // Fetch participants with profiles
  const fetchParticipants = useCallback(async () => {
    if (!currentCall) return [];

    try {
      const { data } = await supabase
        .from('call_participants')
        .select(`
          *,
          profile:profiles!call_participants_user_id_fkey (
            id,
            username,
            display_name,
            avatar_url
          )
        `)
        .eq('call_id', currentCall.id)
        .is('left_at', null);

      const participants = (data || []) as CallParticipant[];
      setCallParticipants(participants);
      return participants;
    } catch (error) {
      console.error('Error fetching participants:', error);
      return [];
    }
  }, [currentCall]);

  /**
   * Subscribe to participant changes.
   * `onParticipantLeft` fires when a single participant's left_at becomes
   * non-null while the call itself stays active (group call departure).
   */
  const subscribeToParticipants = useCallback((
    onParticipantLeft?: (userId: string) => void
  ) => {
    if (!currentCall) return () => {};

    const channel = supabase
      .channel(`call_participants_${currentCall.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'call_participants',
          filter: `call_id=eq.${currentCall.id}`,
        },
        (payload) => {
          const oldRow = payload.old as Partial<CallParticipant> | null;
          const newRow = payload.new as Partial<CallParticipant> | null;

          if (
            newRow?.left_at &&
            !oldRow?.left_at &&
            newRow.user_id &&
            newRow.user_id !== user?.id
          ) {
            console.log('[VideoCall] Participant left:', newRow.user_id);
            onParticipantLeft?.(newRow.user_id);
          }

          fetchParticipants();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [currentCall, fetchParticipants, user?.id]);

  return {
    currentCall,
    callParticipants,
    isCreatingCall,
    callEnded,
    createCall,
    joinCall,
    leaveCall,
    resetCallState,
    updateMediaState,
    fetchParticipants,
    subscribeToParticipants,
  };
}
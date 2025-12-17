import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';

interface VideoCallRecord {
  id: string;
  conversation_id: string | null;
  host_id: string;
  call_type: string;
  status: string;
  started_at: string | null;
  ended_at: string | null;
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

    setIsCreatingCall(true);

    try {
      // Create the video call record
      const { data: call, error: callError } = await supabase
        .from('video_calls')
        .insert({
          conversation_id: conversationId,
          host_id: user.id,
          call_type: callType,
          status: 'active',
          started_at: new Date().toISOString(),
        })
        .select()
        .single();

      if (callError) {
        console.error('Error creating call:', callError);
        throw callError;
      }

      // Add host as participant
      const { error: participantError } = await supabase
        .from('call_participants')
        .insert({
          call_id: call.id,
          user_id: user.id,
          is_muted: false,
          is_video_on: callType === 'video',
          is_screen_sharing: false,
          is_hand_raised: false,
        });

      if (participantError) {
        console.error('Error adding participant:', participantError);
        // Cleanup the call if participant insert fails
        await supabase.from('video_calls').delete().eq('id', call.id);
        throw participantError;
      }

      setCurrentCall(call);
      
      toast({
        title: 'Call Started',
        description: `${callType === 'video' ? 'Video' : 'Audio'} call started`,
      });

      return call.id;
    } catch (error) {
      console.error('Failed to create call:', error);
      toast({
        title: 'Error',
        description: 'Failed to start call. Please try again.',
        variant: 'destructive',
      });
      return null;
    } finally {
      setIsCreatingCall(false);
    }
  }, [user?.id, toast]);

  // Join an existing call
  const joinCall = useCallback(async (callId: string): Promise<boolean> => {
    if (!user?.id) return false;

    try {
      // Check if already a participant
      const { data: existing } = await supabase
        .from('call_participants')
        .select('id')
        .eq('call_id', callId)
        .eq('user_id', user.id)
        .maybeSingle();

      if (existing) {
        // Update joined_at if rejoining
        await supabase
          .from('call_participants')
          .update({ 
            left_at: null,
            joined_at: new Date().toISOString() 
          })
          .eq('id', existing.id);
      } else {
        // Add as new participant
        await supabase
          .from('call_participants')
          .insert({
            call_id: callId,
            user_id: user.id,
            is_muted: false,
            is_video_on: true,
            is_screen_sharing: false,
            is_hand_raised: false,
          });
      }

      // Fetch call details
      const { data: call } = await supabase
        .from('video_calls')
        .select('*')
        .eq('id', callId)
        .single();

      if (call) {
        setCurrentCall(call);
      }

      return true;
    } catch (error) {
      console.error('Failed to join call:', error);
      return false;
    }
  }, [user?.id]);

  // Leave call
  const leaveCall = useCallback(async () => {
    if (!currentCall || !user?.id) return;

    try {
      // Update participant record
      await supabase
        .from('call_participants')
        .update({ left_at: new Date().toISOString() })
        .eq('call_id', currentCall.id)
        .eq('user_id', user.id);

      // Check if any participants remain
      const { count } = await supabase
        .from('call_participants')
        .select('id', { count: 'exact' })
        .eq('call_id', currentCall.id)
        .is('left_at', null);

      // If no participants remain, end the call
      if (count === 0) {
        await supabase
          .from('video_calls')
          .update({ 
            status: 'ended',
            ended_at: new Date().toISOString() 
          })
          .eq('id', currentCall.id);
      }

      setCurrentCall(null);
      setCallParticipants([]);
    } catch (error) {
      console.error('Error leaving call:', error);
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

  // Subscribe to participant changes
  const subscribeToParticipants = useCallback(() => {
    if (!currentCall) return () => {};

    const channel = supabase
      .channel(`call_${currentCall.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'call_participants',
          filter: `call_id=eq.${currentCall.id}`,
        },
        () => {
          fetchParticipants();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [currentCall, fetchParticipants]);

  return {
    currentCall,
    callParticipants,
    isCreatingCall,
    createCall,
    joinCall,
    leaveCall,
    updateMediaState,
    fetchParticipants,
    subscribeToParticipants,
  };
}

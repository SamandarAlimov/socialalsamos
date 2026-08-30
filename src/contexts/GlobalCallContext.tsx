import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { IncomingCallDialog } from '@/components/messages/IncomingCallDialog';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';

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
  declineCall: () => Promise<void>;
  missCall: () => Promise<void>;
}

const GlobalCallContext = createContext<GlobalCallContextType | undefined>(undefined);

const TERMINAL_INVITE_STATUSES = new Set([
  'accepted',
  'joined',
  'declined',
  'missed',
  'cancelled',
  'ended',
  'expired',
]);

export function GlobalCallProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [incomingCall, setIncomingCall] = useState<IncomingCall | null>(null);
  const [handledCallIds, setHandledCallIds] = useState<Set<string>>(new Set());

  const incomingCallRef = useRef<IncomingCall | null>(null);
  const handledCallIdsRef = useRef<Set<string>>(new Set());
  incomingCallRef.current = incomingCall;
  handledCallIdsRef.current = handledCallIds;

  const rememberHandled = useCallback((callId: string) => {
    setHandledCallIds((previous) => {
      const next = new Set(previous);
      next.add(callId);

      // A session can stay open for days. Keep dedupe memory bounded.
      while (next.size > 200) {
        const oldest = next.values().next().value as string | undefined;
        if (!oldest) break;
        next.delete(oldest);
      }
      return next;
    });
  }, []);

  const handleCallHandled = useCallback(
    (callId: string) => {
      rememberHandled(callId);
      if (incomingCallRef.current?.id === callId) setIncomingCall(null);
    },
    [rememberHandled]
  );

  const resolveIncomingCall = useCallback(
    async (
      callId: string,
      hints?: {
        inviterId?: string | null;
        conversationId?: string | null;
        callType?: string | null;
      }
    ) => {
      if (!user?.id) return;
      if (handledCallIdsRef.current.has(callId)) return;
      if (incomingCallRef.current?.id === callId) return;

      const { data: call, error: callError } = await supabase
        .from('video_calls')
        .select('id, conversation_id, host_id, call_type, status, ended_at')
        .eq('id', callId)
        .maybeSingle();

      if (
        callError ||
        !call ||
        call.ended_at ||
        call.status === 'ended' ||
        call.host_id === user.id
      ) {
        return;
      }

      const conversationId = call.conversation_id || hints?.conversationId;
      if (!conversationId) return;

      // Compatibility/security guard. Invite-driven events already target this
      // user, while the legacy video_calls fallback is global and must verify.
      const { data: membership } = await supabase
        .from('conversation_participants')
        .select('id')
        .eq('conversation_id', conversationId)
        .eq('user_id', user.id)
        .maybeSingle();

      if (!membership) return;

      const callerId = hints?.inviterId || call.host_id;
      const { data: hostProfile } = await supabase
        .from('profiles')
        .select('display_name, username, avatar_url')
        .eq('id', callerId)
        .maybeSingle();

      setIncomingCall({
        id: call.id,
        conversation_id: conversationId,
        host_id: callerId,
        call_type:
          call.call_type === 'audio' || hints?.callType === 'audio' ? 'audio' : 'video',
        host_profile: hostProfile,
      });
    },
    [user?.id]
  );

  const acceptCall = useCallback(() => {
    const call = incomingCallRef.current;
    if (!call) return;

    handleCallHandled(call.id);
    navigate(`/messages?call=${call.id}&type=${call.call_type}`);
  }, [handleCallHandled, navigate]);

  const declineCall = useCallback(async () => {
    const call = incomingCallRef.current;
    if (!call) return;

    const { error } = await supabase.rpc('decline_video_call', {
      p_call_id: call.id,
    });
    if (error) {
      console.error('[GlobalCall] Failed to decline call:', error);
      return;
    }

    handleCallHandled(call.id);
  }, [handleCallHandled]);

  const missCall = useCallback(async () => {
    const call = incomingCallRef.current;
    if (!call) return;

    const { error } = await supabase.rpc('mark_video_call_missed' as never, {
      p_call_id: call.id,
    } as never);

    if (error) {
      // Compatibility until the new migration reaches every environment.
      const fallback = await supabase.rpc('decline_video_call', {
        p_call_id: call.id,
      });
      if (fallback.error) {
        console.error('[GlobalCall] Failed to mark call missed:', error);
        return;
      }
    }

    handleCallHandled(call.id);
  }, [handleCallHandled]);

  useEffect(() => {
    if (!user?.id) {
      setIncomingCall(null);
      return;
    }

    let cancelled = false;

    // Recover an invite that arrived while this tab was suspended/reloaded.
    void (async () => {
      const { data } = await supabase
        .from('call_invites')
        .select('call_id, conversation_id, inviter_id, call_type, status')
        .eq('invitee_id', user.id)
        .in('status', ['pending', 'ringing'])
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!cancelled && data?.call_id) {
        await resolveIncomingCall(data.call_id, {
          inviterId: data.inviter_id,
          conversationId: data.conversation_id,
          callType: data.call_type,
        });
      }
    })();

    const inviteChannel = supabase
      .channel(`incoming-call-invites:${user.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'call_invites',
          filter: `invitee_id=eq.${user.id}`,
        },
        async (payload) => {
          const row = payload.new as {
            call_id?: string;
            conversation_id?: string | null;
            inviter_id?: string | null;
            call_type?: string | null;
            status?: string | null;
          };

          if (!row?.call_id) return;
          const status = String(row.status || 'pending').toLowerCase();

          if (TERMINAL_INVITE_STATUSES.has(status)) {
            if (incomingCallRef.current?.id === row.call_id) setIncomingCall(null);
            if (status !== 'accepted' && status !== 'joined') rememberHandled(row.call_id);
            return;
          }

          if (status === 'pending' || status === 'ringing') {
            await resolveIncomingCall(row.call_id, {
              inviterId: row.inviter_id,
              conversationId: row.conversation_id,
              callType: row.call_type,
            });
          }
        }
      )
      .subscribe();

    // Legacy compatibility path. It can be removed after all production
    // databases have the invite-seeding trigger from 20260830171000.
    const callChannel = supabase
      .channel(`incoming-call-legacy:${user.id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'video_calls',
        },
        async ({ new: raw }) => {
          const row = raw as {
            id?: string;
            host_id?: string;
            status?: string;
          };
          if (!row.id || row.host_id === user.id || row.status === 'ended') return;

          // Give the explicit invite event a short head start so normal
          // deployments never do the heavier legacy membership path twice.
          window.setTimeout(() => {
            if (
              !cancelled &&
              !handledCallIdsRef.current.has(row.id!) &&
              incomingCallRef.current?.id !== row.id
            ) {
              void resolveIncomingCall(row.id!);
            }
          }, 350);
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'video_calls',
        },
        ({ new: raw }) => {
          const row = raw as { id?: string; status?: string; ended_at?: string | null };
          if (!row.id) return;
          if (row.status === 'ended' || row.ended_at) {
            if (incomingCallRef.current?.id === row.id) setIncomingCall(null);
            rememberHandled(row.id);
          }
        }
      )
      .subscribe();

    return () => {
      cancelled = true;
      void supabase.removeChannel(inviteChannel);
      void supabase.removeChannel(callChannel);
    };
  }, [rememberHandled, resolveIncomingCall, user?.id]);

  const showDialog = incomingCall && location.pathname !== '/messages';

  return (
    <GlobalCallContext.Provider
      value={{ incomingCall, handleCallHandled, acceptCall, declineCall, missCall }}
    >
      {children}

      {showDialog && (
        <IncomingCallDialog
          isOpen
          callerName={
            incomingCall.host_profile?.display_name ||
            incomingCall.host_profile?.username ||
            'Foydalanuvchi'
          }
          callerAvatar={incomingCall.host_profile?.avatar_url || undefined}
          callType={incomingCall.call_type}
          onAccept={acceptCall}
          onDecline={declineCall}
          onMissed={missCall}
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

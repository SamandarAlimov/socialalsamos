/**
 * Thin consumer of GlobalCallContext.
 *
 * IMPORTANT: this hook must NEVER create its own Supabase Realtime
 * subscription. `GlobalCallProvider` (src/contexts/GlobalCallContext.tsx) is the
 * single source of truth for incoming call events — a second subscription here
 * caused incoming calls to fire twice.
 */
import { useGlobalCall } from '@/contexts/GlobalCallContext';

export function useIncomingCalls() {
  const { incomingCall, handleCallHandled, declineCall } = useGlobalCall();

  return {
    incomingCall,
    handleCallHandled,
    declineCall,
  };
}

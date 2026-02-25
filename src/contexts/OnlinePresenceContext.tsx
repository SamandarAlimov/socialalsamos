import { createContext, useContext, ReactNode } from 'react';
import { useRealtimeStatus } from '@/hooks/useRealtimeStatus';

interface OnlinePresenceContextValue {
  isUserOnline: (userId: string) => boolean;
  onlineCount: number;
}

const OnlinePresenceContext = createContext<OnlinePresenceContextValue>({
  isUserOnline: () => false,
  onlineCount: 0,
});

export function OnlinePresenceProvider({ children }: { children: ReactNode }) {
  const { onlineUsers, isUserOnline } = useRealtimeStatus();

  return (
    <OnlinePresenceContext.Provider value={{ 
      isUserOnline, 
      onlineCount: onlineUsers.size 
    }}>
      {children}
    </OnlinePresenceContext.Provider>
  );
}

export function useOnlinePresence() {
  return useContext(OnlinePresenceContext);
}

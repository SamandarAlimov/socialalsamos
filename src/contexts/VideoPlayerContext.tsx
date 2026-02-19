import { createContext, useContext, useState, useCallback, ReactNode } from 'react';

interface VideoPlayerContextType {
  isMuted: boolean;
  volume: number;
  setMuted: (muted: boolean) => void;
  setVolume: (vol: number) => void;
}

const VideoPlayerContext = createContext<VideoPlayerContextType>({
  isMuted: true,
  volume: 1,
  setMuted: () => {},
  setVolume: () => {},
});

export function VideoPlayerProvider({ children }: { children: ReactNode }) {
  const [isMuted, setIsMuted] = useState(true);
  const [volume, setVolumeState] = useState(1);

  const setMuted = useCallback((muted: boolean) => {
    setIsMuted(muted);
  }, []);

  const setVolume = useCallback((vol: number) => {
    setVolumeState(vol);
    if (vol > 0) setIsMuted(false);
    else setIsMuted(true);
  }, []);

  return (
    <VideoPlayerContext.Provider value={{ isMuted, volume, setMuted, setVolume }}>
      {children}
    </VideoPlayerContext.Provider>
  );
}

export function useVideoPlayerContext() {
  return useContext(VideoPlayerContext);
}

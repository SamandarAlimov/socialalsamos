import { useLiveStreamBroadcaster as useLegacyBroadcaster, useLiveStreamViewer as useLegacyViewer } from './useLiveStreamWebRTC.legacy';
import { useLiveStreamBroadcasterSfu, useLiveStreamViewerSfu } from './useLiveStreamWebRTC.sfu';

const USE_SFU = Boolean(String(import.meta.env.VITE_SFU_URL || '').trim());

export function useLiveStreamBroadcaster(streamId: string | null) {
  const legacy = useLegacyBroadcaster(streamId);
  const sfu = useLiveStreamBroadcasterSfu(streamId);
  return USE_SFU ? sfu : { ...legacy, replaceStream: async (_stream: MediaStream) => undefined };
}

export function useLiveStreamViewer(streamId: string | null) {
  const legacy = useLegacyViewer(streamId);
  const sfu = useLiveStreamViewerSfu(streamId);
  return USE_SFU ? sfu : legacy;
}

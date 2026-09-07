export interface PeerMediaSenders {
  audio: RTCRtpSender;
  video: RTCRtpSender;
}

/**
 * Create one deterministic RTP topology for every peer: audio m-line first,
 * video m-line second. Tracks can later be swapped with replaceTrack() without
 * adding/removing transceivers, which keeps Chrome's m-line order stable across
 * glare rollback, ICE restarts and device/screen changes.
 */
export function attachStablePeerMedia(
  pc: RTCPeerConnection,
  stream: MediaStream,
): PeerMediaSenders {
  const audioTrack = stream.getAudioTracks()[0] ?? null;
  const videoTrack = stream.getVideoTracks()[0] ?? null;

  const audioTransceiver = audioTrack
    ? pc.addTransceiver(audioTrack, { direction: 'sendrecv', streams: [stream] })
    : pc.addTransceiver('audio', { direction: 'sendrecv' });

  const videoTransceiver = videoTrack
    ? pc.addTransceiver(videoTrack, { direction: 'sendrecv', streams: [stream] })
    : pc.addTransceiver('video', { direction: 'sendrecv' });

  return {
    audio: audioTransceiver.sender,
    video: videoTransceiver.sender,
  };
}

export async function replaceStablePeerTrack(
  senders: PeerMediaSenders,
  kind: 'audio' | 'video',
  track: MediaStreamTrack | null,
): Promise<void> {
  await senders[kind].replaceTrack(track);
}

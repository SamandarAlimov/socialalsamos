export type LiveTrackKind = 'audio' | 'video';

export interface LivePeerSyncResult {
  addedKinds: LiveTrackKind[];
  replacedKinds: LiveTrackKind[];
  removedKinds: LiveTrackKind[];
  renegotiationRequired: boolean;
}

const LIVE_TRACK_KINDS: readonly LiveTrackKind[] = ['audio', 'video'];

function senderForKind(
  peer: RTCPeerConnection,
  kind: LiveTrackKind,
): RTCRtpSender | null {
  return (
    peer
      .getSenders()
      .find((sender) => sender.track?.kind === kind) ?? null
  );
}

/**
 * Keep an already-connected viewer on the same RTCPeerConnection while the
 * broadcaster changes camera, starts/stops screen sharing, or swaps microphone.
 *
 * Replacing an existing sender does not require SDP renegotiation. If a peer was
 * created without a sender for a media kind, addTrack is used and the caller is
 * told to renegotiate that viewer once.
 */
export async function syncLivePeerStream(
  peer: RTCPeerConnection,
  nextStream: MediaStream,
): Promise<LivePeerSyncResult> {
  const result: LivePeerSyncResult = {
    addedKinds: [],
    replacedKinds: [],
    removedKinds: [],
    renegotiationRequired: false,
  };

  for (const kind of LIVE_TRACK_KINDS) {
    const sender = senderForKind(peer, kind);
    const nextTrack =
      nextStream.getTracks().find((track) => track.kind === kind) ?? null;

    if (sender) {
      if (sender.track === nextTrack) continue;
      await sender.replaceTrack(nextTrack);
      if (nextTrack) result.replacedKinds.push(kind);
      else result.removedKinds.push(kind);
      continue;
    }

    if (nextTrack) {
      peer.addTrack(nextTrack, nextStream);
      result.addedKinds.push(kind);
      result.renegotiationRequired = true;
    }
  }

  return result;
}

export interface ParticipantVisualState {
  isVideoOn: boolean;
  isScreenSharing: boolean;
}

/**
 * Audio/video is the initial call mode, not a permanent media capability.
 * Reserve one video transceiver for publishing participants so an audio call
 * can enable camera later with replaceTrack(), without a second SDP offer.
 */
export function shouldReserveVideoTransceiver(
  canPublishMedia: boolean,
  hasVideoTransceiver: boolean,
): boolean {
  return canPublishMedia && !hasVideoTransceiver;
}

/**
 * Either camera or screen sharing makes the remote participant visual. This is
 * intentionally independent from the call's initial audio/video type.
 */
export function isParticipantVisualActive(state: ParticipantVisualState): boolean {
  return state.isVideoOn || state.isScreenSharing;
}

import { describe, expect, it } from 'vitest';
import {
  isParticipantVisualActive,
  shouldReserveVideoTransceiver,
} from './callMediaPolicy';

describe('upgradeable call media policy', () => {
  it('reserves a video transceiver even when an audio call starts camera-off', () => {
    expect(shouldReserveVideoTransceiver(true, false)).toBe(true);
    expect(shouldReserveVideoTransceiver(true, true)).toBe(false);
    expect(shouldReserveVideoTransceiver(false, false)).toBe(false);
  });

  it('shows video from current participant media state, not the original call type', () => {
    expect(isParticipantVisualActive({ isVideoOn: false, isScreenSharing: false })).toBe(false);
    expect(isParticipantVisualActive({ isVideoOn: true, isScreenSharing: false })).toBe(true);
    expect(isParticipantVisualActive({ isVideoOn: false, isScreenSharing: true })).toBe(true);
  });
});

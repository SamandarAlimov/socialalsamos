import { describe, expect, it, vi } from 'vitest';

import { syncLivePeerStream } from './liveTrackSync';

function track(kind: 'audio' | 'video', id: string): MediaStreamTrack {
  return { kind, id } as MediaStreamTrack;
}

function stream(tracks: MediaStreamTrack[]): MediaStream {
  return {
    getTracks: () => tracks,
  } as MediaStream;
}

describe('syncLivePeerStream', () => {
  it('replaces existing audio/video senders without renegotiation', async () => {
    const oldAudio = track('audio', 'old-audio');
    const oldVideo = track('video', 'old-video');
    const nextAudio = track('audio', 'next-audio');
    const nextVideo = track('video', 'next-video');

    const audioReplace = vi.fn().mockResolvedValue(undefined);
    const videoReplace = vi.fn().mockResolvedValue(undefined);
    const addTrack = vi.fn();

    const peer = {
      getSenders: () => [
        { track: oldAudio, replaceTrack: audioReplace },
        { track: oldVideo, replaceTrack: videoReplace },
      ],
      addTrack,
    } as unknown as RTCPeerConnection;

    const result = await syncLivePeerStream(
      peer,
      stream([nextVideo, nextAudio]),
    );

    expect(audioReplace).toHaveBeenCalledWith(nextAudio);
    expect(videoReplace).toHaveBeenCalledWith(nextVideo);
    expect(addTrack).not.toHaveBeenCalled();
    expect(result).toEqual({
      addedKinds: [],
      replacedKinds: ['audio', 'video'],
      removedKinds: [],
      renegotiationRequired: false,
    });
  });

  it('adds a missing sender and requests renegotiation', async () => {
    const oldAudio = track('audio', 'old-audio');
    const nextAudio = track('audio', 'next-audio');
    const nextVideo = track('video', 'next-video');

    const audioReplace = vi.fn().mockResolvedValue(undefined);
    const addTrack = vi.fn();

    const peer = {
      getSenders: () => [{ track: oldAudio, replaceTrack: audioReplace }],
      addTrack,
    } as unknown as RTCPeerConnection;
    const nextStream = stream([nextAudio, nextVideo]);

    const result = await syncLivePeerStream(peer, nextStream);

    expect(audioReplace).toHaveBeenCalledWith(nextAudio);
    expect(addTrack).toHaveBeenCalledWith(nextVideo, nextStream);
    expect(result.addedKinds).toEqual(['video']);
    expect(result.renegotiationRequired).toBe(true);
  });

  it('removes a sender track when the next stream has no matching kind', async () => {
    const oldAudio = track('audio', 'old-audio');
    const oldVideo = track('video', 'old-video');
    const nextVideo = track('video', 'next-video');

    const audioReplace = vi.fn().mockResolvedValue(undefined);
    const videoReplace = vi.fn().mockResolvedValue(undefined);

    const peer = {
      getSenders: () => [
        { track: oldAudio, replaceTrack: audioReplace },
        { track: oldVideo, replaceTrack: videoReplace },
      ],
      addTrack: vi.fn(),
    } as unknown as RTCPeerConnection;

    const result = await syncLivePeerStream(peer, stream([nextVideo]));

    expect(audioReplace).toHaveBeenCalledWith(null);
    expect(videoReplace).toHaveBeenCalledWith(nextVideo);
    expect(result.removedKinds).toEqual(['audio']);
  });
});

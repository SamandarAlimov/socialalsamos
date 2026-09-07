import { describe, expect, it, vi } from "vitest";
import { attachStablePeerMedia } from "./webrtcStableMedia";

function makeSender(): RTCRtpSender {
  return { replaceTrack: vi.fn() } as unknown as RTCRtpSender;
}

describe("attachStablePeerMedia", () => {
  it("always creates audio before video regardless of MediaStream track order", () => {
    const audioTrack = { kind: "audio", id: "audio-1" } as MediaStreamTrack;
    const videoTrack = { kind: "video", id: "video-1" } as MediaStreamTrack;
    const stream = {
      getAudioTracks: () => [audioTrack],
      getVideoTracks: () => [videoTrack],
    } as unknown as MediaStream;

    const order: string[] = [];
    const audioSender = makeSender();
    const videoSender = makeSender();
    const pc = {
      addTransceiver: vi.fn((trackOrKind: MediaStreamTrack | string) => {
        const kind = typeof trackOrKind === "string" ? trackOrKind : trackOrKind.kind;
        order.push(kind);
        return { sender: kind === "audio" ? audioSender : videoSender };
      }),
    } as unknown as RTCPeerConnection;

    const senders = attachStablePeerMedia(pc, stream);

    expect(order).toEqual(["audio", "video"]);
    expect(senders.audio).toBe(audioSender);
    expect(senders.video).toBe(videoSender);
  });

  it("reserves both m-lines for an audio-only call", () => {
    const audioTrack = { kind: "audio", id: "audio-1" } as MediaStreamTrack;
    const stream = {
      getAudioTracks: () => [audioTrack],
      getVideoTracks: () => [],
    } as unknown as MediaStream;

    const order: string[] = [];
    const pc = {
      addTransceiver: vi.fn((trackOrKind: MediaStreamTrack | string) => {
        order.push(typeof trackOrKind === "string" ? trackOrKind : trackOrKind.kind);
        return { sender: makeSender() };
      }),
    } as unknown as RTCPeerConnection;

    attachStablePeerMedia(pc, stream);

    expect(order).toEqual(["audio", "video"]);
  });
});

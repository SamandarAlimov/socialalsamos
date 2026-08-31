import { describe, expect, it } from 'vitest';

import {
  assessClientRender,
  buildFfmpegArgs,
  CLIENT_RENDER_MAX_BYTES,
  normalizeRotation,
  type FfmpegArgsInput,
} from '@/lib/videoPipeline';

function baseInput(overrides: Partial<FfmpegArgsInput> = {}): FfmpegArgsInput {
  return {
    inputName: 'input.bin',
    outputName: 'output.mp4',
    audioName: null,
    trim: null,
    crop: null,
    rotation: 0,
    flipHorizontal: false,
    flipVertical: false,
    scale: null,
    fps: null,
    crf: 26,
    preset: 'veryfast',
    mute: false,
    volume: 1,
    audioStartSeconds: 0,
    audioVolume: 1,
    replaceOriginalAudio: false,
    ...overrides,
  };
}

/** Argument ro'yxatidagi flagdan keyingi qiymatni oladi. */
function valueAfter(args: string[], flag: string): string | undefined {
  const index = args.indexOf(flag);
  return index === -1 ? undefined : args[index + 1];
}

describe('buildFfmpegArgs', () => {
  it('encodes with faststart and even pixel format by default', () => {
    const args = buildFfmpegArgs(baseInput());

    expect(valueAfter(args, '-c:v')).toBe('libx264');
    expect(valueAfter(args, '-pix_fmt')).toBe('yuv420p');
    expect(valueAfter(args, '-movflags')).toBe('+faststart');
    expect(args[args.length - 1]).toBe('output.mp4');
  });

  it('puts the trim start before the input so seeking stays fast', () => {
    const args = buildFfmpegArgs(
      baseInput({ trim: { startSeconds: 4.25, endSeconds: 10 } }),
    );

    expect(args.indexOf('-ss')).toBeLessThan(args.indexOf('-i'));
    expect(valueAfter(args, '-ss')).toBe('4.25');
    // Davomiylik 10 - 4.25 = 5.75
    expect(valueAfter(args, '-t')).toBe('5.75');
  });

  it('ignores a trim whose end is not after its start', () => {
    const args = buildFfmpegArgs(
      baseInput({ trim: { startSeconds: 5, endSeconds: 5 } }),
    );

    expect(args).not.toContain('-t');
  });

  it('skips the crop filter when the crop covers the whole frame', () => {
    const args = buildFfmpegArgs(
      baseInput({ crop: { x: 0, y: 0, width: 100, height: 100 } }),
    );

    expect(args).not.toContain('-vf');
  });

  it('expresses a percent crop with iw/ih factors', () => {
    const args = buildFfmpegArgs(
      baseInput({ crop: { x: 10, y: 20, width: 50, height: 60 } }),
    );

    expect(valueAfter(args, '-vf')).toBe('crop=iw*0.5:ih*0.6:iw*0.1:ih*0.2');
  });

  it('chains crop, flips, rotation, scale and fps in canvas order', () => {
    const args = buildFfmpegArgs(
      baseInput({
        crop: { x: 0, y: 0, width: 80, height: 100 },
        flipHorizontal: true,
        rotation: 90,
        scale: { maxWidth: 1080, maxHeight: 1080 },
        fps: 30,
      }),
    );

    const parts = (valueAfter(args, '-vf') ?? '').split(',');

    expect(parts[0]).toBe('crop=iw*0.8:ih*1:iw*0:ih*0');
    expect(parts[1]).toBe('hflip');
    expect(parts[2]).toBe('transpose=1');
    expect(parts[3]).toContain('scale=1080:1080');
    expect(parts[3]).toContain('force_divisible_by=2');
    expect(parts[4]).toBe('fps=30');
  });

  it('maps 180 and 270 degrees onto transpose steps', () => {
    const half = buildFfmpegArgs(baseInput({ rotation: 180 }));
    const threeQuarters = buildFfmpegArgs(baseInput({ rotation: 270 }));

    expect(valueAfter(half, '-vf')).toBe('transpose=1,transpose=1');
    expect(valueAfter(threeQuarters, '-vf')).toBe('transpose=2');
  });

  it('drops the audio stream entirely when muted without extra audio', () => {
    const args = buildFfmpegArgs(baseInput({ mute: true }));

    expect(args).toContain('-an');
    expect(args).not.toContain('-c:a');
  });

  it('applies a volume filter when the original audio is kept but changed', () => {
    const args = buildFfmpegArgs(baseInput({ volume: 0.4 }));

    expect(valueAfter(args, '-af')).toBe('volume=0.4');
    expect(valueAfter(args, '-c:a')).toBe('aac');
  });

  it('replaces the original audio by mapping streams instead of mixing', () => {
    const args = buildFfmpegArgs(
      baseInput({
        audioName: 'audio.bin',
        replaceOriginalAudio: true,
        audioStartSeconds: 12,
      }),
    );

    expect(args).not.toContain('-filter_complex');
    expect(args).toContain('-shortest');
    expect(args.slice(args.indexOf('-map'))).toContain('0:v:0');
    expect(args.slice(args.indexOf('-map'))).toContain('1:a:0');
    // Musiqa uchun -ss ikkinchi inputdan oldin turishi kerak.
    const audioInputIndex = args.indexOf('audio.bin');
    expect(args[audioInputIndex - 3]).toBe('-ss');
    expect(args[audioInputIndex - 2]).toBe('12');
  });

  it('mixes original audio with the new track when both are kept', () => {
    const args = buildFfmpegArgs(
      baseInput({
        audioName: 'audio.bin',
        volume: 0.3,
        audioVolume: 0.8,
        scale: { maxWidth: 720, maxHeight: 1280 },
      }),
    );

    const complex = valueAfter(args, '-filter_complex') ?? '';

    expect(complex).toContain('[0:v]scale=720:1280');
    expect(complex).toContain('[0:a]volume=0.3[a0]');
    expect(complex).toContain('[1:a]volume=0.8[a1]');
    expect(complex).toContain('amix=inputs=2:duration=first:normalize=0[aout]');
    expect(args).not.toContain('-vf');
    expect(args.slice(args.indexOf('-map'))).toContain('[vout]');
  });

  it('keeps a null video filter in filter_complex when nothing changes the picture', () => {
    const args = buildFfmpegArgs(
      baseInput({ audioName: 'audio.bin', audioVolume: 1 }),
    );

    expect(valueAfter(args, '-filter_complex')).toContain('[0:v]null[vout]');
  });
});

describe('normalizeRotation', () => {
  it('snaps arbitrary angles onto quarter turns', () => {
    expect(normalizeRotation(0)).toBe(0);
    expect(normalizeRotation(89)).toBe(90);
    expect(normalizeRotation(450)).toBe(90);
    expect(normalizeRotation(-90)).toBe(270);
    expect(normalizeRotation(undefined)).toBe(0);
    expect(normalizeRotation(Number.NaN)).toBe(0);
  });
});

describe('assessClientRender', () => {
  it('accepts a short, small clip without warnings', () => {
    const result = assessClientRender({ sizeBytes: 8 * 1024 * 1024, durationSeconds: 20 });

    expect(result).toEqual({ ok: true, slow: false });
  });

  it('warns but still allows long clips', () => {
    const result = assessClientRender({ sizeBytes: 20 * 1024 * 1024, durationSeconds: 120 });

    expect(result.ok).toBe(true);
    expect(result.slow).toBe(true);
    expect(result.reason).toBeTruthy();
  });

  it('rejects files above the byte ceiling', () => {
    const result = assessClientRender({ sizeBytes: CLIENT_RENDER_MAX_BYTES + 1 });

    expect(result.ok).toBe(false);
    expect(result.reason).toContain('MB');
  });

  it('rejects clips above the duration ceiling', () => {
    const result = assessClientRender({ sizeBytes: 1024, durationSeconds: 6000 });

    expect(result.ok).toBe(false);
  });

  it('treats unknown duration as acceptable', () => {
    const result = assessClientRender({ sizeBytes: 1024, durationSeconds: null });

    expect(result.ok).toBe(true);
    expect(result.slow).toBe(false);
  });
});

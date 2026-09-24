import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  CAMERA_ZOOM_MAX,
  CAMERA_ZOOM_MIN,
  captureSize,
  clampCameraZoom,
  createCompatibleMediaRecorder,
  extensionForMime,
  supportedRecorderMime,
} from './cameraCaptureUtils';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('camera capture compatibility helpers', () => {
  it('clamps digital zoom to the supported range', () => {
    expect(clampCameraZoom(Number.NaN)).toBe(CAMERA_ZOOM_MIN);
    expect(clampCameraZoom(0.2)).toBe(CAMERA_ZOOM_MIN);
    expect(clampCameraZoom(2.5)).toBe(2.5);
    expect(clampCameraZoom(99)).toBe(CAMERA_ZOOM_MAX);
  });

  it('keeps capture dimensions even for encoder compatibility', () => {
    const portrait = captureSize('9:16', 1920, 1080);
    const landscape = captureSize('16:9', 1080, 1920);
    const square = captureSize('1:1', 801, 603);

    for (const size of [portrait, landscape, square]) {
      expect(size.width % 2).toBe(0);
      expect(size.height % 2).toBe(0);
      expect(Math.max(size.width, size.height)).toBeLessThanOrEqual(1280);
    }
  });

  it('selects the first MIME type the browser actually advertises', () => {
    class MockMediaRecorder {
      static isTypeSupported(type: string) {
        return type === 'video/webm;codecs=vp8,opus';
      }
    }
    vi.stubGlobal('MediaRecorder', MockMediaRecorder);

    expect(supportedRecorderMime()).toBe('video/webm;codecs=vp8,opus');
  });

  it('falls through a lying codec report to another working encoder', () => {
    class MockMediaRecorder {
      static isTypeSupported(type: string) {
        return type === 'video/mp4' || type === 'video/webm;codecs=vp8,opus';
      }

      readonly mimeType: string;

      constructor(_stream: MediaStream, options?: MediaRecorderOptions) {
        if (options?.mimeType === 'video/mp4') {
          throw new TypeError('codec rejected at construction time');
        }
        this.mimeType = options?.mimeType ?? 'video/default';
      }
    }
    vi.stubGlobal('MediaRecorder', MockMediaRecorder);

    const recorder = createCompatibleMediaRecorder({} as MediaStream);
    expect(recorder).not.toBeNull();
    expect((recorder as unknown as MockMediaRecorder).mimeType).toBe(
      'video/webm;codecs=vp8,opus',
    );
  });

  it('uses the browser default encoder when MIME probing is unavailable', () => {
    class BareMediaRecorder {
      readonly mimeType = 'video/default';
      constructor(_stream: MediaStream, _options?: MediaRecorderOptions) {}
    }
    vi.stubGlobal('MediaRecorder', BareMediaRecorder);

    expect(supportedRecorderMime()).toBe('');
    expect(createCompatibleMediaRecorder({} as MediaStream)).not.toBeNull();
  });

  it('maps common recorder MIME types to file extensions', () => {
    expect(extensionForMime('video/mp4')).toBe('mp4');
    expect(extensionForMime('video/webm;codecs=vp8')).toBe('webm');
  });
});


describe('Create camera flashlight contract', () => {
  it('keeps Create flashlight compatible with iOS/WebKit', () => {
    const hook = readFileSync(
      resolve(process.cwd(), 'src/components/create/useCameraCapture.ts'),
      'utf8',
    );
    const recorder = readFileSync(
      resolve(process.cwd(), 'src/components/create/CameraVideoRecorder.tsx'),
      'utf8',
    );

    expect(hook).toContain('getSupportedConstraints');
    expect(hook).toContain("facingMode: { exact: 'environment' }");
    expect(hook).toContain("if (!track || facingMode !== 'environment') return false;");
    expect(hook).toContain('setTorchSupported(true);');
    expect(hook).not.toContain('if (!track || !torchSupported) return false;');

    expect(recorder).toContain("if (facingMode === 'environment')");
    expect(recorder).not.toContain('if (camera.torchSupported)');
    expect(recorder).toContain('softwareFlash && !camera.torchEnabled');
  });
});

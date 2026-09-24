from pathlib import Path


def read(path: str) -> str:
    return Path(path).read_text(encoding="utf-8")


def write(path: str, text: str) -> None:
    Path(path).write_text(text, encoding="utf-8")


def replace_once(path: str, old: str, new: str) -> None:
    text = read(path)
    count = text.count(old)
    if count != 1:
        raise RuntimeError(
            f"{path}: expected exactly 1 occurrence, found {count}: {old[:120]!r}"
        )
    write(path, text.replace(old, new, 1))


HOOK = "src/components/create/useCameraCapture.ts"
RECORDER = "src/components/create/CameraVideoRecorder.tsx"
TEST = "src/components/create/cameraCaptureUtils.test.ts"

replace_once(
    HOOK,
    """function shouldStopConstraintFallback(error: unknown) {
  const name = mediaErrorName(error);
  return name === 'NotAllowedError' || name === 'SecurityError';
}

async function waitForVideoDimensions""",
    """function shouldStopConstraintFallback(error: unknown) {
  const name = mediaErrorName(error);
  return name === 'NotAllowedError' || name === 'SecurityError';
}

function trackSupportsTorch(
  track: MediaStreamTrack,
  requestedFacingMode: 'user' | 'environment',
) {
  const capabilities = track.getCapabilities?.() as
    | (MediaTrackCapabilities & { torch?: boolean })
    | undefined;
  if (typeof capabilities?.torch === 'boolean') return capabilities.torch;

  // Safari/WebKit has shipped torch support in versions where capability
  // reporting can still be incomplete. The supported-constraint signal is
  // therefore a safe fallback for the rear camera; toggleTorch still probes
  // the live track and gracefully falls back if the hardware rejects it.
  const supportedConstraints = navigator.mediaDevices?.getSupportedConstraints?.() as
    | { torch?: boolean }
    | undefined;
  return requestedFacingMode === 'environment' && Boolean(supportedConstraints?.torch);
}

async function waitForVideoDimensions""",
)

replace_once(
    HOOK,
    """      const videoCandidates: MediaTrackConstraints[] = [
        {
          facingMode: { ideal: facingMode },
          width: { ideal: 1280 },
          height: { ideal: 1280 },
          frameRate: { ideal: 30 },
        },
        { facingMode: { ideal: facingMode } },
        {},
      ];""",
    """      const videoCandidates: MediaTrackConstraints[] = [
        ...(facingMode === 'environment'
          ? [
              {
                facingMode: { exact: 'environment' },
                width: { ideal: 1280 },
                height: { ideal: 1280 },
                frameRate: { ideal: 30 },
              } as MediaTrackConstraints,
            ]
          : []),
        {
          facingMode: { ideal: facingMode },
          width: { ideal: 1280 },
          height: { ideal: 1280 },
          frameRate: { ideal: 30 },
        },
        { facingMode: { ideal: facingMode } },
        {},
      ];""",
)

replace_once(
    HOOK,
    """      const videoTrack = stream.getVideoTracks()[0];
      if (videoTrack?.getCapabilities) {
        const capabilities = videoTrack.getCapabilities() as MediaTrackCapabilities & {
          torch?: boolean;
        };
        setTorchSupported(Boolean(capabilities.torch));
      }
""",
    """      const videoTrack = stream.getVideoTracks()[0];
      if (videoTrack) {
        const activeFacingMode = videoTrack.getSettings?.().facingMode;
        const isRearTrack = activeFacingMode
          ? activeFacingMode === 'environment'
          : facingMode === 'environment';
        setTorchSupported(isRearTrack && trackSupportsTorch(videoTrack, facingMode));
      }
""",
)

replace_once(
    HOOK,
    """  const toggleTorch = useCallback(async () => {
    const track = streamRef.current?.getVideoTracks()[0];
    if (!track || !torchSupported) return false;
    const next = !torchEnabled;
    try {
      await track.applyConstraints({
        advanced: [{ torch: next } as MediaTrackConstraintSet],
      });
      setTorchEnabled(next);
      return true;
    } catch (error) {
      console.warn('Camera torch toggle failed:', error);
      setTorchSupported(false);
      setTorchEnabled(false);
      return false;
    }
  }, [torchEnabled, torchSupported]);""",
    """  const toggleTorch = useCallback(async () => {
    const track = streamRef.current?.getVideoTracks()[0];
    if (!track || facingMode !== 'environment') return false;
    const next = !torchEnabled;
    const torchConstraint = { torch: next } as MediaTrackConstraintSet;

    try {
      const currentConstraints = track.getConstraints?.() ?? {};
      const retainedAdvanced = (currentConstraints.advanced ?? []).filter(
        (constraint) => !('torch' in constraint),
      );

      try {
        // Preserve the active rear-camera constraints when possible so Safari
        // does not unnecessarily recapture/reconfigure the source.
        await track.applyConstraints({
          ...currentConstraints,
          advanced: [...retainedAdvanced, torchConstraint],
        });
      } catch (preservedConstraintError) {
        // Some iOS/WebView versions reject re-applying unrelated constraints
        // while still accepting the torch constraint itself.
        console.warn(
          'Camera torch retrying with a minimal constraint set:',
          preservedConstraintError,
        );
        await track.applyConstraints({ advanced: [torchConstraint] });
      }

      setTorchSupported(true);
      setTorchEnabled(next);
      return true;
    } catch (error) {
      console.warn('Camera torch toggle failed:', error);
      setTorchSupported(false);
      setTorchEnabled(false);
      return false;
    }
  }, [facingMode, torchEnabled]);""",
)

replace_once(
    RECORDER,
    """  const toggleFlash = useCallback(() => {
    if (camera.isRecording) return;
    if (camera.torchSupported) {
      void camera.toggleTorch().then((changed) => {
        if (changed) setSoftwareFlash(false);
      });
      return;
    }
    setSoftwareFlash((current) => !current);
  }, [camera]);""",
    """  const toggleFlash = useCallback(() => {
    if (camera.isRecording) return;

    if (facingMode === 'environment') {
      // Capability reporting is not reliable enough on every iPhone/WebView.
      // Probe the live rear track whenever the user explicitly taps Flash.
      void camera.toggleTorch().then((changed) => {
        if (changed) {
          setSoftwareFlash(false);
          return;
        }
        setSoftwareFlash((current) => !current);
      });
      return;
    }

    // Front cameras have no hardware LED. Use the display as a visible light
    // source instead of showing an enabled icon that has no effect.
    setSoftwareFlash((current) => !current);
  }, [camera.isRecording, camera.toggleTorch, facingMode]);""",
)

replace_once(
    RECORDER,
    """                  {gridEnabled && (
                    <div className=\"pointer-events-none absolute inset-0 z-10 grid grid-cols-3 grid-rows-3\">""",
    """                  {softwareFlash && !camera.torchEnabled && (
                    <div
                      aria-hidden=\"true\"
                      className=\"pointer-events-none absolute inset-0 z-[9] bg-white/30 mix-blend-screen\"
                    />
                  )}

                  {gridEnabled && (
                    <div className=\"pointer-events-none absolute inset-0 z-10 grid grid-cols-3 grid-rows-3\">""",
)

test = read(TEST)
if "import { readFileSync } from 'node:fs';" not in test:
    test = test.replace(
        "import { afterEach, describe, expect, it, vi } from 'vitest';\n",
        "import { readFileSync } from 'node:fs';\nimport { resolve } from 'node:path';\nimport { afterEach, describe, expect, it, vi } from 'vitest';\n",
        1,
    )

if "keeps Create flashlight compatible with iOS/WebKit" not in test:
    test += """

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
"""

write(TEST, test)

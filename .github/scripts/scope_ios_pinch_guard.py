from pathlib import Path


def replace_exact(path: str, old: str, new: str, expected: int) -> None:
    p = Path(path)
    text = p.read_text(encoding='utf-8')
    count = text.count(old)
    if count != expected:
        raise RuntimeError(f'{path}: expected {expected}, found {count}: {old!r}')
    p.write_text(text.replace(old, new), encoding='utf-8')

capture = 'src/components/create/useCameraCapture.ts'
rail = 'src/hooks/useCameraFilterRail.ts'
test = 'src/lib/iosCameraCanvasPreview.test.ts'

replace_exact(
    capture,
    "if (recorderRoot?.dataset.cameraZoomGesture === 'active') return;",
    """if (
        document.documentElement.classList.contains('alsamos-ios-camera-canvas-preview') &&
        recorderRoot?.dataset.cameraZoomGesture === 'active'
      ) {
        return;
      }""",
    2,
)

replace_exact(
    rail,
    """      if (resolved.kind === 'recorder') {
        resolved.host.setAttribute(ZOOM_GESTURE_ATTRIBUTE, 'active');
      }""",
    """      if (
        resolved.kind === 'recorder' &&
        document.documentElement.classList.contains('alsamos-ios-camera-canvas-preview')
      ) {
        resolved.host.setAttribute(ZOOM_GESTURE_ATTRIBUTE, 'active');
      }""",
    2,
)

replace_exact(
    test,
    """    expect(capture).toContain(
      \"recorderRoot?.dataset.cameraZoomGesture === 'active'\",
    );""",
    """    expect(capture).toContain(
      \"document.documentElement.classList.contains('alsamos-ios-camera-canvas-preview')\",
    );
    expect(capture).toContain(
      \"recorderRoot?.dataset.cameraZoomGesture === 'active'\",
    );""",
    1,
)

replace_exact(
    test,
    """    expect(rail).toContain(
      \"resolved.host.setAttribute(ZOOM_GESTURE_ATTRIBUTE, 'active')\",
    );""",
    """    expect(rail).toContain(
      \"document.documentElement.classList.contains('alsamos-ios-camera-canvas-preview')\",
    );
    expect(rail).toContain(
      \"resolved.host.setAttribute(ZOOM_GESTURE_ATTRIBUTE, 'active')\",
    );""",
    1,
)

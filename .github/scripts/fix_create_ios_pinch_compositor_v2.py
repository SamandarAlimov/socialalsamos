from pathlib import Path


def replace_once(path: str, old: str, new: str) -> None:
    file_path = Path(path)
    text = file_path.read_text(encoding="utf-8")
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f"{path}: expected one match, found {count}: {old[:120]!r}")
    file_path.write_text(text.replace(old, new, 1), encoding="utf-8")


def replace_exact(path: str, old: str, new: str, expected: int) -> None:
    file_path = Path(path)
    text = file_path.read_text(encoding="utf-8")
    count = text.count(old)
    if count != expected:
        raise RuntimeError(
            f"{path}: expected {expected} matches, found {count}: {old[:120]!r}"
        )
    file_path.write_text(text.replace(old, new), encoding="utf-8")


capture_path = "src/components/create/useCameraCapture.ts"
rail_path = "src/hooks/useCameraFilterRail.ts"
test_path = "src/lib/iosCameraCanvasPreview.test.ts"

replace_once(
    capture_path,
    """      const safeZoom = clampCameraZoom(nextZoom);\n      zoomRef.current = safeZoom;\n      setZoom(safeZoom);\n""",
    """      const safeZoom = clampCameraZoom(nextZoom);\n      zoomRef.current = safeZoom;\n\n      // On iOS/WebKit, mutating the hardware-backed <video> transform on every\n      // pinch frame can corrupt the compositor into the giant rounded/capsule\n      // surface visible only while fingers are moving. The iOS Canvas2D preview\n      // owns the moving gesture, so keep only zoomRef current during that window.\n      // useCameraFilterRail dispatches one final zoom event after the gesture\n      // marker is removed, which commits the stable transform exactly once.\n      const recorderRoot = videoRef.current?.closest<HTMLElement>(\n        '[data-camera-recorder-root=\"true\"]',\n      );\n      if (recorderRoot?.dataset.cameraZoomGesture === 'active') return;\n\n      setZoom(safeZoom);\n""",
)

replace_once(
    capture_path,
    """    const video = videoRef.current;\n    if (!video) return;\n\n    const scaleX = facingMode === 'user' ? -zoom : zoom;\n""",
    """    const video = videoRef.current;\n    if (!video) return;\n\n    // The Canvas2D compatibility path deliberately freezes the hardware video\n    // while an iOS pinch is active. Do not touch its compositor properties until\n    // useCameraFilterRail commits the final stable zoom after finger release.\n    const recorderRoot = video.closest<HTMLElement>(\n      '[data-camera-recorder-root=\"true\"]',\n    );\n    if (recorderRoot?.dataset.cameraZoomGesture === 'active') return;\n\n    const scaleX = facingMode === 'user' ? -zoom : zoom;\n""",
)

replace_once(
    rail_path,
    """const RECORDER_SELECTOR = '[data-camera-recorder-root=\"true\"]';\nconst LIVE_STAGE_SELECTOR = '[data-create-mode=\"live\"]';\n""",
    """const RECORDER_SELECTOR = '[data-camera-recorder-root=\"true\"]';\nconst LIVE_STAGE_SELECTOR = '[data-create-mode=\"live\"]';\nconst ZOOM_GESTURE_ATTRIBUTE = 'data-camera-zoom-gesture';\n""",
)

replace_once(
    rail_path,
    """    const handleTouchStart = (event: TouchEvent) => {\n""",
    """    const finishZoomGesture = () => {\n      const completed = activeZoom;\n      activeZoom = null;\n      if (!completed || completed.kind !== 'recorder') return;\n\n      completed.host.removeAttribute(ZOOM_GESTURE_ATTRIBUTE);\n      // Commit the final stable zoom only after the iOS Canvas2D gesture window\n      // ends. This causes one hardware-video transform update instead of one per\n      // moving frame, avoiding WebKit's transient giant capsule compositor bug.\n      setCameraZoom(\n        completed.host,\n        completed.video,\n        completed.kind,\n        getCurrentZoom(completed.host),\n      );\n    };\n\n    const handleTouchStart = (event: TouchEvent) => {\n""",
)

assignment = """      activeZoom = {\n        ...resolved,\n        startDistance: distance,\n        startZoom: getCurrentZoom(resolved.host),\n      };\n      event.preventDefault();\n"""
assignment_with_marker = """      activeZoom = {\n        ...resolved,\n        startDistance: distance,\n        startZoom: getCurrentZoom(resolved.host),\n      };\n      if (resolved.kind === 'recorder') {\n        resolved.host.setAttribute(ZOOM_GESTURE_ATTRIBUTE, 'active');\n      }\n      event.preventDefault();\n"""
replace_exact(rail_path, assignment, assignment_with_marker, 2)

replace_once(
    rail_path,
    """    const handleTouchEnd = (event: TouchEvent) => {\n      if (event.touches.length < 2) activeZoom = null;\n    };\n""",
    """    const handleTouchEnd = (event: TouchEvent) => {\n      if (event.touches.length < 2) finishZoomGesture();\n    };\n""",
)

replace_once(
    rail_path,
    """    const handlePointerEnd = (event: PointerEvent) => {\n      if (event.pointerType !== 'touch') return;\n      pointerTouches.delete(event.pointerId);\n      if (pointerTouches.size < 2) activeZoom = null;\n    };\n""",
    """    const handlePointerEnd = (event: PointerEvent) => {\n      if (event.pointerType !== 'touch') return;\n      pointerTouches.delete(event.pointerId);\n      if (pointerTouches.size < 2) finishZoomGesture();\n    };\n""",
)

replace_once(
    rail_path,
    """      cleanups.forEach((cleanup) => cleanup());\n      cleanups.clear();\n      pointerTouches.clear();\n""",
    """      cleanups.forEach((cleanup) => cleanup());\n      cleanups.clear();\n      if (activeZoom?.kind === 'recorder') {\n        activeZoom.host.removeAttribute(ZOOM_GESTURE_ATTRIBUTE);\n      }\n      activeZoom = null;\n      pointerTouches.clear();\n""",
)

replace_once(
    test_path,
    """    expect(css).toContain('.alsamos-camera-filter-scroll');\n  });\n});\n""",
    """    expect(css).toContain('.alsamos-camera-filter-scroll');\n  });\n\n  it('does not mutate the iOS hardware video transform while pinch is moving', () => {\n    const capture = readFileSync(\n      resolve(process.cwd(), 'src/components/create/useCameraCapture.ts'),\n      'utf8',\n    );\n    const rail = readFileSync(\n      resolve(process.cwd(), 'src/hooks/useCameraFilterRail.ts'),\n      'utf8',\n    );\n\n    expect(capture).toContain(\n      \"recorderRoot?.dataset.cameraZoomGesture === 'active'\",\n    );\n    expect(rail).toContain(\n      \"const ZOOM_GESTURE_ATTRIBUTE = 'data-camera-zoom-gesture'\",\n    );\n    expect(rail).toContain(\n      \"resolved.host.setAttribute(ZOOM_GESTURE_ATTRIBUTE, 'active')\",\n    );\n    expect(rail).toContain(\n      'completed.host.removeAttribute(ZOOM_GESTURE_ATTRIBUTE)',\n    );\n    expect(rail).toContain('finishZoomGesture();');\n  });\n});\n""",
)

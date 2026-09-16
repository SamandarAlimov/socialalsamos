from pathlib import Path

PATH = Path('src/components/video/VideoWatchPanel.tsx')
text = PATH.read_text(encoding='utf-8')


def replace_once(old: str, new: str) -> None:
    global text
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'expected one match, found {count}: {old[:160]!r}')
    text = text.replace(old, new, 1)


replace_once(
    "  const nextVideo = upNext[0] ?? null;",
    """  const autoplayHistoryRef = useRef<Set<string>>(new Set([activeVideoId]));
  const nextVideo = upNext.find((item) => !autoplayHistoryRef.current.has(item.id)) ?? upNext[0] ?? null;""",
)

replace_once(
    """  const speedRef = useRef(1);
  const mutedRef = useRef(readVideosMutedPreference());
""",
    """  const speedRef = useRef(1);
  const mutedRef = useRef(readVideosMutedPreference());
  const volumeRef = useRef(1);
  const lastAudibleVolumeRef = useRef(1);
""",
)

replace_once(
    """    el.muted = mutedRef.current;
    el.playbackRate = speedRef.current;
""",
    """    el.muted = mutedRef.current;
    el.volume = volumeRef.current;
    el.playbackRate = speedRef.current;
""",
)

replace_once(
    """  const advanceToNextVideo = useCallback((playback?: VideoPlaybackSnapshot) => {
    if (!nextVideo) return false;
    autoAdvanceRef.current = true;
    onSelectVideo(nextVideo.id, playback ?? publishPlayback());
    return true;
  }, [nextVideo, onSelectVideo, publishPlayback]);

  useEffect(() => {
""",
    """  const advanceToNextVideo = useCallback((playback?: VideoPlaybackSnapshot) => {
    if (!nextVideo) return false;
    autoAdvanceRef.current = true;
    onSelectVideo(nextVideo.id, playback ?? publishPlayback());
    return true;
  }, [nextVideo, onSelectVideo, publishPlayback]);

  const toggleMute = useCallback(() => {
    setIsMuted((current) => {
      const next = !current;
      if (!next && volumeRef.current <= 0) {
        volumeRef.current = Math.max(0.05, lastAudibleVolumeRef.current);
        if (videoRef.current) videoRef.current.volume = volumeRef.current;
      }
      return next;
    });
    revealControls();
  }, [revealControls]);

  const adjustVolume = useCallback((delta: number) => {
    const el = videoRef.current;
    const current = el?.volume ?? volumeRef.current;
    const next = Math.min(1, Math.max(0, current + delta));
    volumeRef.current = next;
    if (next > 0) lastAudibleVolumeRef.current = next;
    if (el) el.volume = next;
    setIsMuted(next <= 0);
    revealControls();
  }, [revealControls]);

  useEffect(() => {
""",
)

replace_once(
    """  useEffect(() => {
    const playback = autoAdvanceRef.current
""",
    """  useEffect(() => {
    autoplayHistoryRef.current.add(activeVideoId);
    const playback = autoAdvanceRef.current
""",
)

replace_once(
    """        case 'arrowleft': event.preventDefault(); seekBy(-5); break;
        case 'arrowright': event.preventDefault(); seekBy(5); break;
        case 'm': event.preventDefault(); setIsMuted((value) => !value); break;
""",
    """        case 'arrowleft': event.preventDefault(); seekBy(-5); break;
        case 'arrowright': event.preventDefault(); seekBy(5); break;
        case 'arrowup': event.preventDefault(); adjustVolume(0.05); break;
        case 'arrowdown': event.preventDefault(); adjustVolume(-0.05); break;
        case 'm': event.preventDefault(); toggleMute(); break;
""",
)

replace_once(
    """  }, [advanceToNextVideo, closeWithPlayback, duration, handleSeek, keyboardEnabled, seekBy, stepSpeed, toggleFullscreen, togglePlay]);
""",
    """  }, [adjustVolume, advanceToNextVideo, closeWithPlayback, duration, handleSeek, keyboardEnabled, seekBy, stepSpeed, toggleFullscreen, toggleMute, togglePlay]);
""",
)

replace_once(
    """<Button variant=\"ghost\" size=\"icon\" onClick={() => setIsMuted((value) => !value)} className=\"h-9 w-9 rounded-full text-white hover:bg-white/15\" aria-label={isMuted ? 'Ovozni yoqish' : 'Ovozni o‘chirish'}>""",
    """<Button variant=\"ghost\" size=\"icon\" onClick={toggleMute} className=\"h-9 w-9 rounded-full text-white hover:bg-white/15\" aria-label={isMuted ? 'Ovozni yoqish' : 'Ovozni o‘chirish'}>""",
)

PATH.write_text(text, encoding='utf-8')

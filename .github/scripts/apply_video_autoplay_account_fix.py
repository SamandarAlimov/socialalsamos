from pathlib import Path


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'{label}: expected exactly one match, found {count}')
    return text.replace(old, new, 1)


watch_path = Path('src/components/video/VideoWatchPanel.tsx')
watch = watch_path.read_text(encoding='utf-8')

watch = replace_once(
    watch,
    "import { useHapticFeedback } from '@/hooks/useHapticFeedback';\n",
    "import { useHapticFeedback } from '@/hooks/useHapticFeedback';\nimport { useVideoAutoplayPreference } from '@/hooks/useVideoAutoplayPreference';\n",
    'add autoplay hook import',
)

watch = replace_once(
    watch,
    """import {
  readVideosAutoplayPreference,
  readVideosMutedPreference,
  writeVideosAutoplayPreference,
  writeVideosMutedPreference,
} from '@/lib/videoPlaybackPreference';""",
    """import {
  readVideosMutedPreference,
  writeVideosMutedPreference,
} from '@/lib/videoPlaybackPreference';""",
    'remove local autoplay imports',
)

watch = replace_once(
    watch,
    "  const [isAutoplayEnabled, setIsAutoplayEnabled] = useState(readVideosAutoplayPreference);\n",
    '',
    'remove local autoplay state',
)

watch = replace_once(
    watch,
    """  const [isFullscreen, setIsFullscreen] = useState(false);
  const [descriptionOpen, setDescriptionOpen] = useState(false);

  const { lightTap, mediumTap, successFeedback } = useHapticFeedback();""",
    """  const [isFullscreen, setIsFullscreen] = useState(false);
  const [descriptionOpen, setDescriptionOpen] = useState(false);
  const {
    isAutoplayEnabled,
    isLoading: isAutoplayPreferenceLoading,
    isSaving: isAutoplayPreferenceSaving,
    setAutoplayEnabled,
  } = useVideoAutoplayPreference(currentUserId);

  const { lightTap, mediumTap, successFeedback } = useHapticFeedback();""",
    'add database autoplay state',
)

watch = replace_once(
    watch,
    """  useEffect(() => {
    writeVideosAutoplayPreference(isAutoplayEnabled);
  }, [isAutoplayEnabled]);

""",
    '',
    'remove localStorage autoplay effect',
)

watch = replace_once(
    watch,
    "                  onClick={() => setIsAutoplayEnabled((value) => !value)}\n                  className=\"h-9 w-10 rounded-full text-white hover:bg-white/15\"\n",
    "                  onClick={() => void setAutoplayEnabled(!isAutoplayEnabled)}\n                  disabled={isAutoplayPreferenceLoading || isAutoplayPreferenceSaving}\n                  className=\"h-9 w-10 rounded-full text-white hover:bg-white/15 disabled:opacity-60\"\n",
    'persist autoplay toggle to account',
)

watch_path.write_text(watch, encoding='utf-8')


types_path = Path('src/integrations/supabase/types.ts')
types = types_path.read_text(encoding='utf-8')

types = replace_once(
    types,
    """          two_factor_recovery_updated_at: string | null
          updated_at: string
          user_id: string
        }
        Insert: {""",
    """          two_factor_recovery_updated_at: string | null
          updated_at: string
          user_id: string
          videos_autoplay: boolean
        }
        Insert: {""",
    'add videos_autoplay row type',
)

types = replace_once(
    types,
    """          two_factor_recovery_updated_at?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {""",
    """          two_factor_recovery_updated_at?: string | null
          updated_at?: string
          user_id: string
          videos_autoplay?: boolean
        }
        Update: {""",
    'add videos_autoplay insert type',
)

types = replace_once(
    types,
    """          two_factor_recovery_updated_at?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: \"user_settings_user_id_fkey\"""",
    """          two_factor_recovery_updated_at?: string | null
          updated_at?: string
          user_id?: string
          videos_autoplay?: boolean
        }
        Relationships: [
          {
            foreignKeyName: \"user_settings_user_id_fkey\"""",
    'add videos_autoplay update type',
)

types_path.write_text(types, encoding='utf-8')

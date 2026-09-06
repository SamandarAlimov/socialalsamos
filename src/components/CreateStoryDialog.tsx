import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

interface CreateStoryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

/**
 * Compatibility bridge for callers that still open the historical Story
 * dialog. Story publishing now has one source of truth: StoryComposer on the
 * canonical Create route. Keeping a second uploader here previously bypassed
 * posts/post_media, privacy, draft lifecycle and interactive stickers.
 */
export function CreateStoryDialog({
  open,
  onOpenChange,
}: CreateStoryDialogProps) {
  const navigate = useNavigate();

  useEffect(() => {
    if (!open) return;

    onOpenChange(false);
    navigate('/create?mode=story');
  }, [navigate, onOpenChange, open]);

  return null;
}

import { useCallback, useState, type ComponentProps } from 'react';
import { toast } from 'sonner';

import { db } from '@/lib/db';
import { StoryViewer as StoryViewerCore } from './StoryViewerCore';

type StoryViewerProps = ComponentProps<typeof StoryViewerCore>;

/**
 * Lifecycle guard around the immersive Story viewer.
 *
 * The visual viewer is intentionally kept separate from persistence. New
 * unified stories are a graph (stories -> posts -> post_media/stickers), so a
 * direct DELETE against `stories` is not enough. The wrapper always uses the
 * database RPC that removes the owned graph transactionally, while preserving
 * the old `onDelete` callback as a UI refresh hook for callers.
 */
export function StoryViewer(props: StoryViewerProps) {
  const [deletingStoryId, setDeletingStoryId] = useState<string | null>(null);

  const handleDelete = useCallback(
    async (storyId: string) => {
      if (deletingStoryId) return;

      setDeletingStoryId(storyId);
      try {
        const { error } = await db.rpc('delete_story', {
          p_story_id: storyId,
        });

        if (error) throw error;

        await props.onDelete?.(storyId);
        toast.success('Stori o‘chirildi');
        props.onClose();
      } catch (error) {
        console.error('Story graph delete xatosi:', error);
        const message =
          error instanceof Error
            ? error.message
            : 'Storini o‘chirib bo‘lmadi. Qayta urinib ko‘ring.';
        toast.error(message);
      } finally {
        setDeletingStoryId(null);
      }
    },
    [deletingStoryId, props],
  );

  return <StoryViewerCore {...props} onDelete={handleDelete} />;
}

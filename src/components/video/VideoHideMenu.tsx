import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useLocation, useSearchParams } from 'react-router-dom';

import { PostActionsMenu } from '@/components/PostActionsMenu';
import { useAuth } from '@/contexts/AuthContext';
import db from '@/lib/supabaseAny';

interface ActiveVideoPost {
  user_id: string;
  content: string | null;
  is_pinned: boolean;
}

const VIDEO_ACTION_RAIL_CLASS = 'alsamos-video-action-rail';

function findVisibleVideoActionRail(): {
  host: HTMLElement;
  saveButton: HTMLButtonElement;
} | null {
  if (typeof document === 'undefined' || typeof window === 'undefined') return null;

  const candidates = Array.from(
    document.querySelectorAll<HTMLButtonElement>('button[aria-label="Save"]'),
  )
    .map((button) => ({ button, rect: button.getBoundingClientRect() }))
    .filter(({ rect }) => (
      rect.width > 0 &&
      rect.height > 0 &&
      rect.bottom > 0 &&
      rect.top < window.innerHeight
    ))
    .sort((a, b) => {
      const viewportCenter = window.innerHeight / 2;
      const aCenter = a.rect.top + a.rect.height / 2;
      const bCenter = b.rect.top + b.rect.height / 2;
      return Math.abs(aCenter - viewportCenter) - Math.abs(bCenter - viewportCenter);
    });

  const saveButton = candidates[0]?.button;
  const host = saveButton?.parentElement;
  if (!saveButton || !host) return null;

  return { host, saveButton };
}

/**
 * Videos/Reels mirrors the active canonical post id into `?v=`. Resolve the
 * lightweight post metadata here and reuse the exact same More Actions surface
 * as Home/Profile.
 *
 * The video player still owns the Like/Comment/Repost/Share action rail. Rather
 * than keeping More as a separate floating control at the top of the screen,
 * mount the shared More trigger into the visible rail itself. This keeps mobile,
 * tablet and desktop interaction hierarchy consistent with modern reels UIs.
 */
export function VideoHideMenu() {
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const { user } = useAuth();
  const [post, setPost] = useState<ActiveVideoPost | null>(null);
  const [isBookmarked, setIsBookmarked] = useState(false);
  const [railHost, setRailHost] = useState<HTMLElement | null>(null);

  const postId =
    searchParams.get('v') ||
    searchParams.get('post') ||
    searchParams.get('id');

  useEffect(() => {
    if (location.pathname !== '/videos' || !postId || !user?.id) {
      setPost(null);
      setIsBookmarked(false);
      return;
    }

    let cancelled = false;

    void (async () => {
      const [postResult, bookmarkResult] = await Promise.all([
        db
          .from('posts')
          .select('user_id, content, is_pinned')
          .eq('id', postId)
          .maybeSingle(),
        db
          .from('bookmarks')
          .select('id')
          .eq('post_id', postId)
          .eq('user_id', user.id)
          .maybeSingle(),
      ]);

      if (cancelled) return;

      if (postResult.error || !postResult.data) {
        console.error('Video actions metadata failed:', postResult.error);
        setPost(null);
        setIsBookmarked(false);
        return;
      }

      setPost({
        user_id: String((postResult.data as any).user_id ?? ''),
        content: (postResult.data as any).content ?? null,
        is_pinned: Boolean((postResult.data as any).is_pinned),
      });
      setIsBookmarked(Boolean(bookmarkResult.data));
    })();

    return () => {
      cancelled = true;
    };
  }, [location.pathname, postId, user?.id]);

  useEffect(() => {
    if (location.pathname !== '/videos' || !postId) {
      setRailHost(null);
      return;
    }

    let observer: MutationObserver | null = null;
    let attachedHost: HTMLElement | null = null;
    let hiddenSaveButton: HTMLButtonElement | null = null;
    let previousSaveDisplay = '';

    const detach = () => {
      if (attachedHost) attachedHost.classList.remove(VIDEO_ACTION_RAIL_CLASS);
      if (hiddenSaveButton) hiddenSaveButton.style.display = previousSaveDisplay;
      attachedHost = null;
      hiddenSaveButton = null;
      setRailHost(null);
    };

    const attach = () => {
      const match = findVisibleVideoActionRail();
      if (!match) return false;

      if (attachedHost === match.host && hiddenSaveButton === match.saveButton) {
        return true;
      }

      detach();
      attachedHost = match.host;
      hiddenSaveButton = match.saveButton;
      previousSaveDisplay = match.saveButton.style.display;
      match.host.classList.add(VIDEO_ACTION_RAIL_CLASS);

      // Save remains available in the More Actions sheet. Removing it from the
      // side rail gives the rail the same compact hierarchy as reels products:
      // Like, Comment, Repost, Share, More.
      match.saveButton.style.display = 'none';
      setRailHost(match.host);
      return true;
    };

    const scheduleAttach = () => requestAnimationFrame(() => void attach());
    scheduleAttach();

    observer = new MutationObserver(scheduleAttach);
    observer.observe(document.body, { childList: true, subtree: true });
    window.addEventListener('resize', scheduleAttach);

    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', scheduleAttach);
      detach();
    };
  }, [location.pathname, postId]);

  if (
    location.pathname !== '/videos' ||
    !postId ||
    !user?.id ||
    !post?.user_id ||
    !railHost
  ) {
    return null;
  }

  const moreTrigger = (
    <PostActionsMenu
      key={postId}
      postId={postId}
      postUserId={post.user_id}
      postContent={post.content ?? undefined}
      isPinned={post.is_pinned}
      isBookmarked={isBookmarked}
      triggerLabel="Video amallari"
      triggerClassName="h-8 w-8 rounded-full bg-transparent p-0 text-white shadow-none ring-0 hover:bg-white/10 hover:text-white active:scale-90"
      triggerIconClassName="h-6 w-6"
    />
  );

  return (
    <>
      <style>{`
        .${VIDEO_ACTION_RAIL_CLASS} {
          gap: 0.42rem !important;
        }

        .${VIDEO_ACTION_RAIL_CLASS} button[aria-label="Like"],
        .${VIDEO_ACTION_RAIL_CLASS} button[aria-label="Comments"],
        .${VIDEO_ACTION_RAIL_CLASS} button[aria-label="Share"],
        .${VIDEO_ACTION_RAIL_CLASS} button[aria-label="Repost"] {
          padding: 0.2rem !important;
        }

        .${VIDEO_ACTION_RAIL_CLASS} button[aria-label="Like"] svg,
        .${VIDEO_ACTION_RAIL_CLASS} button[aria-label="Comments"] svg,
        .${VIDEO_ACTION_RAIL_CLASS} button[aria-label="Share"] svg,
        .${VIDEO_ACTION_RAIL_CLASS} button[aria-label="Repost"] svg {
          width: 1.5rem !important;
          height: 1.5rem !important;
        }

        .${VIDEO_ACTION_RAIL_CLASS} button[aria-label="Comments"] span,
        .${VIDEO_ACTION_RAIL_CLASS} button[aria-label="Like"] + button {
          font-size: 0.625rem !important;
          line-height: 0.75rem !important;
        }
      `}</style>
      {createPortal(moreTrigger, railHost)}
    </>
  );
}

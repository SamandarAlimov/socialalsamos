import { useCallback, useEffect, useRef, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import {
  clearMessageDraft,
  loadMessageDraft,
  saveMessageDraft,
} from '@/lib/messageDrafts';

const DRAFT_SAVE_DELAY_MS = 350;

export function useMessageDraft(conversationId: string | null) {
  const { user } = useAuth();
  const [draft, setDraftState] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingRef = useRef('');
  const dirtyRef = useRef(false);
  const revisionRef = useRef(0);

  /**
   * Draft mutations must be ordered. Without this queue an in-flight stale save
   * can finish after clearDraft() and recreate a draft that was already sent.
   */
  const mutationChainRef = useRef<Promise<void>>(Promise.resolve());

  const enqueueMutation = useCallback((work: () => Promise<void>): Promise<void> => {
    const next = mutationChainRef.current
      .catch(() => undefined)
      .then(work);
    mutationChainRef.current = next.catch(() => undefined);
    return next;
  }, []);

  const cancelSaveTimer = useCallback(() => {
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
  }, []);

  const persist = useCallback(
    async (value: string, revision: number) => {
      if (!user?.id || !conversationId) return;
      try {
        await enqueueMutation(() => saveMessageDraft(user.id, conversationId, value));
        if (revisionRef.current === revision && pendingRef.current === value) {
          dirtyRef.current = false;
        }
      } catch (error) {
        console.error('Message draft save failed:', error);
      }
    },
    [conversationId, enqueueMutation, user?.id]
  );

  useEffect(() => {
    cancelSaveTimer();
    pendingRef.current = '';
    dirtyRef.current = false;
    setDraftState('');

    if (!user?.id || !conversationId) {
      setIsLoading(false);
      return;
    }

    let cancelled = false;
    const loadRevision = ++revisionRef.current;
    setIsLoading(true);

    void loadMessageDraft(user.id, conversationId)
      .then((value) => {
        if (cancelled || revisionRef.current !== loadRevision) return;
        pendingRef.current = value;
        dirtyRef.current = false;
        setDraftState(value);
      })
      .catch((error) => {
        if (!cancelled) console.error('Message draft load failed:', error);
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
      cancelSaveTimer();
      const pending = pendingRef.current;
      if (dirtyRef.current) {
        const uid = user.id;
        const cid = conversationId;
        void enqueueMutation(() => saveMessageDraft(uid, cid, pending)).catch((error) => {
          console.error('Message draft flush failed:', error);
        });
      }
    };
  }, [cancelSaveTimer, conversationId, enqueueMutation, user?.id]);

  const setDraft: Dispatch<SetStateAction<string>> = useCallback(
    (next) => {
      const revision = ++revisionRef.current;
      setDraftState((previous) => {
        const value = typeof next === 'function' ? next(previous) : next;
        pendingRef.current = value;
        dirtyRef.current = true;

        cancelSaveTimer();
        if (user?.id && conversationId) {
          saveTimerRef.current = setTimeout(() => {
            saveTimerRef.current = null;
            void persist(value, revision);
          }, DRAFT_SAVE_DELAY_MS);
        }

        return value;
      });
    },
    [cancelSaveTimer, conversationId, persist, user?.id]
  );

  const clearDraft = useCallback(async () => {
    ++revisionRef.current;
    cancelSaveTimer();
    pendingRef.current = '';
    dirtyRef.current = false;
    setDraftState('');

    if (!user?.id || !conversationId) return;
    try {
      // Queued behind every older save for this mounted composer.
      await enqueueMutation(() => clearMessageDraft(user.id, conversationId));
    } catch (error) {
      console.error('Message draft clear failed:', error);
    }
  }, [cancelSaveTimer, conversationId, enqueueMutation, user?.id]);

  return { draft, setDraft, clearDraft, isLoading };
}

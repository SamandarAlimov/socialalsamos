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
  const revisionRef = useRef(0);

  const cancelSaveTimer = useCallback(() => {
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
  }, []);

  const persist = useCallback(
    async (value: string) => {
      if (!user?.id || !conversationId) return;
      try {
        await saveMessageDraft(user.id, conversationId, value);
      } catch (error) {
        console.error('Message draft save failed:', error);
      }
    },
    [conversationId, user?.id]
  );

  useEffect(() => {
    cancelSaveTimer();
    pendingRef.current = '';
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
      if (pending.trim()) {
        void saveMessageDraft(user.id, conversationId, pending).catch((error) => {
          console.error('Message draft flush failed:', error);
        });
      }
    };
  }, [cancelSaveTimer, conversationId, user?.id]);

  const setDraft: Dispatch<SetStateAction<string>> = useCallback(
    (next) => {
      revisionRef.current += 1;
      setDraftState((previous) => {
        const value = typeof next === 'function' ? next(previous) : next;
        pendingRef.current = value;

        cancelSaveTimer();
        if (user?.id && conversationId) {
          saveTimerRef.current = setTimeout(() => {
            saveTimerRef.current = null;
            void persist(value);
          }, DRAFT_SAVE_DELAY_MS);
        }

        return value;
      });
    },
    [cancelSaveTimer, conversationId, persist, user?.id]
  );

  const clearDraft = useCallback(async () => {
    revisionRef.current += 1;
    cancelSaveTimer();
    pendingRef.current = '';
    setDraftState('');

    if (!user?.id || !conversationId) return;
    try {
      await clearMessageDraft(user.id, conversationId);
    } catch (error) {
      console.error('Message draft clear failed:', error);
    }
  }, [cancelSaveTimer, conversationId, user?.id]);

  return { draft, setDraft, clearDraft, isLoading };
}

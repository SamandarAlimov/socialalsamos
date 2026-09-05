import { useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { loadRecommendationProfileForUser } from '@/hooks/useHomeRecommendations';

const STORAGE_KEY = 'alsamos-ad-relevance-v1';
const SNAPSHOT_TTL_MS = 6 * 60 * 60 * 1000;

interface StoredAdRelevance {
  updatedAt: number;
  interests: string[];
  mediaPreference: string | null;
}

function readSnapshot(): StoredAdRelevance | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as StoredAdRelevance) : null;
  } catch {
    return null;
  }
}

function saveSnapshot(snapshot: StoredAdRelevance) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
  } catch {
    // Relevance is optional. Storage restrictions must not affect the app.
  }
}

/**
 * Builds a small first-party relevance snapshot from the same behavior graph
 * already used by Home recommendations. No new cross-site identifier is
 * created and raw interaction history is not copied into localStorage.
 */
export function useAdRelevanceBootstrap() {
  const { user } = useAuth();

  useEffect(() => {
    if (!user?.id) return;

    const stored = readSnapshot();
    if (stored && Date.now() - stored.updatedAt < SNAPSHOT_TTL_MS) return;

    let active = true;
    void loadRecommendationProfileForUser(user.id)
      .then((profile) => {
        if (!active) return;

        const interests = Array.from(profile.hashtagAffinity.entries())
          .filter(([, weight]) => Number.isFinite(weight) && weight > 0)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 20)
          .map(([tag]) => tag);

        const mediaPreference = Array.from(profile.mediaAffinity.entries())
          .sort((a, b) => b[1] - a[1])[0]?.[0] || null;

        saveSnapshot({
          updatedAt: Date.now(),
          interests,
          mediaPreference,
        });
      })
      .catch((error) => {
        console.warn('Ad relevance bootstrap unavailable:', error);
      });

    return () => {
      active = false;
    };
  }, [user?.id]);
}

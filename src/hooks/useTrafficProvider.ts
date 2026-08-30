import { useEffect, useState } from 'react';

import {
  fetchTrafficProviderStatus,
  type TrafficProviderStatus,
} from '@/lib/traffic';

const EMPTY: TrafficProviderStatus = {
  configured: false,
  provider: null,
  label: null,
  attribution: null,
  minZoom: 0,
  maxZoom: 22,
  refreshSeconds: 60,
};

export function useTrafficProvider() {
  const [status, setStatus] =
    useState<TrafficProviderStatus>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    void fetchTrafficProviderStatus(controller.signal)
      .then(setStatus)
      .finally(() => {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      });

    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (!status.configured) return;
    const intervalMs = Math.max(
      15,
      status.refreshSeconds || 60,
    ) * 1000;
    const timer = window.setInterval(
      () => setRevision((value) => value + 1),
      intervalMs,
    );
    return () => window.clearInterval(timer);
  }, [status.configured, status.refreshSeconds]);

  return { status, loading, revision };
}

export default useTrafficProvider;

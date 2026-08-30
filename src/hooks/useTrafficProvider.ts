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

  return { status, loading };
}

export default useTrafficProvider;

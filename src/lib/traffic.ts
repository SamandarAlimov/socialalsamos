export type TrafficProviderId =
  | 'tomtom-orbis'
  | 'template';

export type TrafficStyle = 'light' | 'dark';

export interface TrafficProviderStatus {
  configured: boolean;
  provider: TrafficProviderId | null;
  label: string | null;
  attribution: string | null;
  minZoom: number;
  maxZoom: number;
  refreshSeconds: number;
}

const FALLBACK_STATUS: TrafficProviderStatus = {
  configured: false,
  provider: null,
  label: null,
  attribution: null,
  minZoom: 0,
  maxZoom: 22,
  refreshSeconds: 60,
};

export async function fetchTrafficProviderStatus(
  signal?: AbortSignal,
): Promise<TrafficProviderStatus> {
  try {
    const response = await fetch('/api/traffic?action=status', {
      signal,
      headers: {
        Accept: 'application/json',
      },
    });
    if (!response.ok) return FALLBACK_STATUS;
    const data = await response.json();
    return {
      configured: Boolean(data?.configured),
      provider:
        data?.provider === 'tomtom-orbis' ||
        data?.provider === 'template'
          ? data.provider
          : null,
      label:
        typeof data?.label === 'string'
          ? data.label
          : null,
      attribution:
        typeof data?.attribution === 'string'
          ? data.attribution
          : null,
      minZoom: Number.isFinite(Number(data?.minZoom))
        ? Number(data.minZoom)
        : 0,
      maxZoom: Number.isFinite(Number(data?.maxZoom))
        ? Number(data.maxZoom)
        : 22,
      refreshSeconds: Math.max(
        15,
        Number(data?.refreshSeconds) || 60,
      ),
    };
  } catch {
    return FALLBACK_STATUS;
  }
}

export function trafficTileTemplate(
  style: TrafficStyle,
  revision?: number,
): string {
  const version =
    revision != null && Number.isFinite(revision)
      ? '&v=' + Math.max(0, Math.floor(revision))
      : '';
  return (
    '/api/traffic?action=tile' +
    '&style=' +
    style +
    '&z={z}&x={x}&y={y}' +
    version
  );
}

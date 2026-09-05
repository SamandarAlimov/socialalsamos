const MEDIA_UPLOAD_ORIGIN = 'https://media.alsamos.com';
const MEDIA_PROXY_PREFIX = '/__media';

let installed = false;

function canUseSameOriginMediaProxy(): boolean {
  if (typeof window === 'undefined') return false;
  const host = window.location.hostname.toLowerCase();
  return (
    host === 'alsamos.com' ||
    host.endsWith('.alsamos.com') ||
    host.endsWith('.vercel.app')
  );
}

function requestUrl(input: RequestInfo | URL): string | null {
  if (typeof input === 'string') return input;
  if (input instanceof URL) return input.toString();
  if (typeof Request !== 'undefined' && input instanceof Request) return input.url;
  return null;
}

function requestMethod(input: RequestInfo | URL, init?: RequestInit): string {
  if (init?.method) return init.method.toUpperCase();
  if (typeof Request !== 'undefined' && input instanceof Request) {
    return input.method.toUpperCase();
  }
  return 'GET';
}

function proxiedMediaUrl(rawUrl: string): string | null {
  if (typeof window === 'undefined') return null;
  try {
    const target = new URL(rawUrl, window.location.href);
    if (target.origin !== MEDIA_UPLOAD_ORIGIN) return null;

    const proxy = new URL(`${MEDIA_PROXY_PREFIX}${target.pathname}`, window.location.origin);
    proxy.search = target.search;
    return proxy.toString();
  } catch {
    return null;
  }
}

/**
 * Production compatibility bridge for direct MinIO uploads.
 *
 * Media presign URLs are intentionally direct-to-MinIO so large files never flow
 * through the Alsamos API gateway. Older production ingress revisions only
 * allowed a subset of Alsamos origins, however, which makes Safari/browser PUT
 * requests fail at CORS preflight before MinIO receives a single byte.
 *
 * We keep the efficient direct PUT as the first attempt. Only when the browser
 * rejects that request at the network/CORS layer do we retry the exact same
 * signed URL through Vercel's same-origin rewrite (`/__media/*`). Vercel then
 * forwards the request to media.alsamos.com server-to-server, preserving the
 * signed query string and avoiding browser CORS. Once every ingress is updated,
 * the direct path succeeds and this fallback becomes a no-op.
 */
export function installMediaUploadFetchFallback(): void {
  if (installed || typeof window === 'undefined' || typeof window.fetch !== 'function') return;
  installed = true;

  const nativeFetch = window.fetch.bind(window);

  window.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const rawUrl = requestUrl(input);
    const method = requestMethod(input, init);

    if (!rawUrl || method !== 'PUT') {
      return nativeFetch(input, init);
    }

    const proxyUrl = proxiedMediaUrl(rawUrl);
    if (!proxyUrl) {
      return nativeFetch(input, init);
    }

    try {
      return await nativeFetch(input, init);
    } catch (directError) {
      // Retrying a consumed Request stream is unsafe. Alsamos media uploads pass
      // a File/Blob in `init.body`, so only take the fallback for replayable bodies.
      const body = init?.body;
      const replayable =
        body == null ||
        (typeof Blob !== 'undefined' && body instanceof Blob) ||
        typeof body === 'string' ||
        body instanceof URLSearchParams;

      if (!canUseSameOriginMediaProxy() || !replayable) throw directError;

      console.warn('[media] direct MinIO PUT blocked; retrying through same-origin proxy');
      return nativeFetch(proxyUrl, init);
    }
  };
}

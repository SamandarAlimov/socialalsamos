/* Temporary production transport probe. Remove after verification. */
export default async function handler(req: any, res: any) {
  if (req.method !== 'GET') {
    res.status(405).json({ ok: false, error: 'Method not allowed' });
    return;
  }

  try {
    const upstream = await fetch(
      'https://tcykulflvagvwuygwgmu.supabase.co/functions/v1/account-signup',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Origin: 'https://alsamos.com',
        },
        body: '{}',
        signal: AbortSignal.timeout(15000),
      },
    );

    const text = await upstream.text();
    res.status(200).json({
      ok: upstream.status === 400 && text.includes('INVALID_REQUEST'),
      upstreamStatus: upstream.status,
      upstreamContentType: upstream.headers.get('content-type'),
      upstreamBody: text,
    });
  } catch (error) {
    res.status(502).json({
      ok: false,
      error: error instanceof Error ? `${error.name}: ${error.message}` : String(error),
    });
  }
}

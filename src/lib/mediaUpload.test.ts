import { beforeEach, describe, expect, it, vi } from 'vitest';
import { resolveStorageUrlCandidates } from './mediaUpload';

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  getSession: vi.fn(),
  createSignedUrl: vi.fn(),
  getPublicUrl: vi.fn(),
}));
vi.mock('@/integrations/supabase/client', () => ({
  supabase: { storage: { from: mocks.from }, auth: { getSession: mocks.getSession } },
}));

beforeEach(() => {
  vi.resetAllMocks();
  vi.unstubAllGlobals();
  mocks.from.mockImplementation(() => ({
    createSignedUrl: mocks.createSignedUrl,
    getPublicUrl: mocks.getPublicUrl,
  }));
  mocks.getPublicUrl.mockReturnValue({ data: { publicUrl: 'https://example.com/public.mp4' } });
});

describe('historical media provider resolution', () => {
  it('uses the dedicated signer when only the metadata identifies the external provider', async () => {
    mocks.getSession.mockResolvedValue({ data: { session: { access_token: 'test-session' } } });
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ url: 'https://media.alsamos.com/signed.mp4' }) });
    vi.stubGlobal('fetch', fetchMock);
    const candidates = await resolveStorageUrlCandidates(
      'storage://alsamos-media/private/author/clip.mp4',
      'alsamos-media',
      'private/author/clip.mp4',
    );
    expect(candidates).toEqual(['https://media.alsamos.com/signed.mp4']);
    expect(fetchMock.mock.calls[0][0]).toContain('/api/media/sign?key=');
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it('keeps the original public reference when legacy signing is denied', async () => {
    mocks.createSignedUrl.mockResolvedValue({ data: null, error: { message: 'Access denied' } });
    const original = 'https://mbhjganbihamoiqmankv.supabase.co/storage/v1/object/public/message-attachments/author/clip.mp4';
    const candidates = await resolveStorageUrlCandidates(original, 'message-attachments', 'author/clip.mp4');
    expect(candidates).toContain(original);
    expect(mocks.createSignedUrl).toHaveBeenCalledWith('author/clip.mp4', 3600);
  });

  it('offers authorized signed playback for a bucket that used to be public', async () => {
    mocks.createSignedUrl.mockResolvedValue({ data: { signedUrl: 'https://example.com/authorized.mp4' }, error: null });
    const original = 'https://mbhjganbihamoiqmankv.supabase.co/storage/v1/object/public/message-attachments/author/clip.mp4';
    const candidates = await resolveStorageUrlCandidates(original, 'message-attachments', 'author/clip.mp4');
    expect(candidates[0]).toBe('https://example.com/authorized.mp4');
    expect(candidates).toContain(original);
  });

  it('does not sign a foreign project URL using this project credentials', async () => {
    const original = 'https://foreign-project.supabase.co/storage/v1/object/sign/message-attachments/author/clip.mp4?token=old';
    expect(await resolveStorageUrlCandidates(original)).toEqual([original]);
    expect(mocks.from).not.toHaveBeenCalled();
  });
});

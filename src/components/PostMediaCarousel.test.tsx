import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import { PostMediaCarousel } from './PostMediaCarousel';

vi.mock('@/components/VideoPlayer', () => ({
  VideoPlayer: ({ src, onPlaybackError }: { src: string; onPlaybackError: () => void }) => (
    <video data-testid="video" src={src} onError={onPlaybackError} />
  ),
}));
vi.mock('@/components/media/MediaFrame', () => ({
  MediaFrame: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));
vi.mock('@/components/media/ImageLightbox', () => ({ ImageLightbox: () => null }));

afterEach(cleanup);

describe('post media recovery', () => {
  it('tries the saved alternative without removing or mutating either reference', () => {
    const urls = ['https://example.com/first.mp4'];
    const candidates = [[urls[0], 'https://example.com/original.mp4']];
    render(<PostMediaCarousel mediaUrls={urls} mediaCandidates={candidates} mediaType="video" />);
    fireEvent.error(screen.getByTestId('video'));
    expect(screen.getByTestId('video')).toHaveAttribute('src', candidates[0][1]);
    expect(urls).toEqual(['https://example.com/first.mp4']);
    expect(candidates[0]).toHaveLength(2);
  });

  it('keeps a failed album item reachable and retryable alongside a working item', () => {
    const onRetry = vi.fn();
    render(<PostMediaCarousel
      mediaUrls={['https://example.com/first.mp4', 'https://example.com/second.mp4']}
      mediaType="video"
      onRetry={onRetry}
    />);
    fireEvent.error(screen.getByTestId('video'));
    expect(screen.getByRole('status')).toBeVisible();
    expect(screen.getByText('1/2')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Keyingi media' }));
    expect(screen.getByTestId('video')).toHaveAttribute('src', 'https://example.com/second.mp4');
    expect(screen.getByRole('button', { name: '1-media' })).toBeEnabled();
    fireEvent.click(screen.getByRole('button', { name: '1-media' }));
    fireEvent.click(screen.getByRole('button', { name: 'Qayta urinish' }));
    expect(onRetry).toHaveBeenCalledOnce();
    expect(screen.getByTestId('video')).toHaveAttribute('src', 'https://example.com/first.mp4');
  });

  it('retains every album position when all images fail', () => {
    render(<PostMediaCarousel
      mediaUrls={['https://example.com/first.jpg', 'https://example.com/second.jpg']}
      mediaType="image"
    />);
    fireEvent.error(screen.getByRole('img'));
    fireEvent.click(screen.getByRole('button', { name: '2-media' }));
    fireEvent.error(screen.getByRole('img'));
    expect(screen.getByRole('button', { name: '1-media' })).toBeEnabled();
    expect(screen.getByRole('button', { name: '2-media' })).toHaveAttribute('aria-current', 'true');
    expect(screen.getByText('2/2')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Oldingi media' }));
    expect(screen.getByRole('button', { name: 'Qayta urinish' })).toBeVisible();
  });

  it('stays on the retried position when refreshed signed URLs arrive', () => {
    const urls = ['https://example.com/first.mp4', 'https://example.com/second.mp4'];
    const { rerender } = render(<PostMediaCarousel mediaUrls={urls} mediaType="video" />);
    fireEvent.click(screen.getByRole('button', { name: '2-media' }));
    fireEvent.error(screen.getByTestId('video'));
    fireEvent.click(screen.getByRole('button', { name: 'Qayta urinish' }));
    const refreshed = urls.map(url => url + '?token=new');
    rerender(<PostMediaCarousel mediaUrls={refreshed} mediaType="video" />);
    expect(screen.getByTestId('video')).toHaveAttribute('src', refreshed[1]);
    expect(screen.getByText('2/2')).toBeVisible();
  });
});

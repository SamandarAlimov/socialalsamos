import type { ReactNode } from 'react';
import { Calendar, Images, LinkIcon, MapPin } from 'lucide-react';

import { EmojiText } from '@/components/emoji/EmojiText';
import { RichTextContent } from '@/components/RichTextContent';
import { StoryAvatar } from '@/components/stories/StoryAvatar';
import { VerifiedBadge } from '@/components/VerifiedBadge';
import { toExternalUrl, stripProtocol } from '@/lib/urls';

export interface ProfileHeaderProfile {
  id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
  cover_url: string | null;
  bio: string | null;
  website: string | null;
  is_verified: boolean | null;
}

interface ProfileHeaderProps {
  profile: ProfileHeaderProfile;
  coverAction?: ReactNode;
  identityTrailing?: ReactNode;
  actions?: ReactNode;
  locationLabel?: string | null;
  joinedLabel?: string | null;
  noBioLabel: string;
  postsLabel: string;
  followersLabel: string;
  followingLabel: string;
  postsCount: number;
  followersCount: number;
  followingCount: number;
  onPhotos?: () => void;
  onFollowersClick?: () => void;
  onFollowingClick?: () => void;
}

function formatCount(count: number) {
  if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1)}M`;
  if (count >= 1_000) return `${(count / 1_000).toFixed(1)}K`;
  return String(count);
}

export function ProfileHeader({
  profile,
  coverAction,
  identityTrailing,
  actions,
  locationLabel,
  joinedLabel,
  noBioLabel,
  postsLabel,
  followersLabel,
  followingLabel,
  postsCount,
  followersCount,
  followingCount,
  onPhotos,
  onFollowersClick,
  onFollowingClick,
}: ProfileHeaderProps) {
  return (
    <>
      <div className="relative mb-12 h-36 overflow-hidden rounded-xl bg-gradient-to-r from-muted to-muted/60 sm:mb-16 sm:h-48 md:mb-16 md:h-64 md:rounded-2xl">
        {profile.cover_url ? (
          <img src={profile.cover_url} alt="" className="h-full w-full object-cover" />
        ) : (
          <div className="absolute inset-0 bg-gradient-to-br from-muted via-card to-muted/80" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-background/50 to-transparent" />
        {coverAction}
      </div>

      <div className="relative -mt-12 px-2 sm:-mt-16 md:-mt-24 md:px-4">
        <div className="flex flex-col gap-3 md:gap-4">
          <div className="flex min-w-0 items-center gap-3 md:gap-4">
            <div className="relative shrink-0">
              <StoryAvatar
                userId={profile.id}
                username={profile.username}
                displayName={profile.display_name}
                avatarUrl={profile.avatar_url}
                isVerified={Boolean(profile.is_verified)}
                size="xl"
                showRing
                className="h-20 w-20 sm:h-24 sm:w-24 md:h-28 md:w-28"
              />
              {(profile.avatar_url || onPhotos) && onPhotos ? (
                <button
                  type="button"
                  onClick={onPhotos}
                  aria-label="Profil rasmlari"
                  className="absolute -bottom-1 -right-1 rounded-full border border-border bg-background/95 p-1.5 shadow-sm transition-colors hover:bg-accent"
                >
                  <Images className="h-3.5 w-3.5" />
                </button>
              ) : null}
            </div>

            <div className="min-w-0 flex-1">
              <div className="flex min-w-0 items-center gap-1.5 md:gap-2">
                <h1 className="min-w-0 truncate text-xl font-bold tracking-[-0.02em] md:text-2xl">
                  <span className="block truncate">
                    <EmojiText
                      text={profile.display_name || profile.username || 'User'}
                      size={22}
                    />
                  </span>
                </h1>
                {profile.is_verified ? (
                  <>
                    <VerifiedBadge size="sm" className="shrink-0 md:hidden" />
                    <VerifiedBadge size="md" className="hidden shrink-0 md:block" />
                  </>
                ) : null}
              </div>
              <p className="mt-0.5 block max-w-full truncate text-sm text-muted-foreground md:text-base">
                @{profile.username || 'user'}
              </p>
            </div>

            {identityTrailing ? <div className="shrink-0 self-center">{identityTrailing}</div> : null}
          </div>

          {actions ? <div className="flex min-w-0 flex-wrap items-center gap-2">{actions}</div> : null}
        </div>

        <div className="mt-4 max-w-2xl md:mt-6">
          {profile.bio ? (
            <RichTextContent
              content={profile.bio}
              className="text-sm leading-relaxed text-foreground md:text-base"
              emojiSize={20}
            />
          ) : (
            <p className="text-sm leading-relaxed text-muted-foreground md:text-base">{noBioLabel}</p>
          )}

          <div className="mt-3 flex flex-wrap gap-3 text-xs text-muted-foreground md:mt-4 md:gap-4 md:text-sm">
            {locationLabel ? (
              <span className="flex min-w-0 items-center gap-1">
                <MapPin className="h-4 w-4 shrink-0" />
                <span className="truncate">{locationLabel}</span>
              </span>
            ) : null}
            {profile.website ? (
              <span className="flex min-w-0 items-center gap-1">
                <LinkIcon className="h-4 w-4 shrink-0" />
                <a
                  href={toExternalUrl(profile.website)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="truncate text-link hover:text-link-hover hover:underline"
                >
                  {stripProtocol(profile.website)}
                </a>
              </span>
            ) : null}
            {joinedLabel ? (
              <span className="flex items-center gap-1">
                <Calendar className="h-4 w-4 shrink-0" />
                {joinedLabel}
              </span>
            ) : null}
          </div>
        </div>

        <div className="mt-4 grid grid-cols-3 border-y border-border py-3 md:mt-6 md:py-4">
          <div className="flex flex-col items-center justify-center sm:flex-row sm:items-baseline">
            <span className="text-lg font-bold md:text-xl">{formatCount(postsCount)}</span>
            <span className="text-xs text-muted-foreground sm:ml-1 md:text-sm">{postsLabel}</span>
          </div>
          <button
            type="button"
            onClick={onFollowersClick}
            className="flex flex-col items-center justify-center transition-opacity hover:opacity-75 sm:flex-row sm:items-baseline"
          >
            <span className="text-lg font-bold md:text-xl">{formatCount(followersCount)}</span>
            <span className="text-xs text-muted-foreground sm:ml-1 md:text-sm">{followersLabel}</span>
          </button>
          <button
            type="button"
            onClick={onFollowingClick}
            className="flex flex-col items-center justify-center transition-opacity hover:opacity-75 sm:flex-row sm:items-baseline"
          >
            <span className="text-lg font-bold md:text-xl">{formatCount(followingCount)}</span>
            <span className="text-xs text-muted-foreground sm:ml-1 md:text-sm">{followingLabel}</span>
          </button>
        </div>
      </div>
    </>
  );
}

import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';

import { cn } from '@/lib/utils';
import { usePostCollaborators } from '@/hooks/usePostCollaborators';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { StoryAvatar } from '@/components/stories/StoryAvatar';

interface PostAuthorAvatarsProps {
  postId: string;
  userId: string;
  username?: string | null;
  displayName?: string | null;
  avatarUrl?: string | null;
  isVerified?: boolean;
  onOwnerClick?: (event: React.MouseEvent) => void;
  className?: string;
}

/**
 * Post muallifi avatari.
 *
 * Instagram kabi: postda hammuallif bo'lsa ikki profil rasmi qavatlanib
 * ko'rinadi - muallif oldinda, hammuallif orqada o'ngga surilgan holda.
 * Hammuallif rasmini bosish uning profiliga olib boradi.
 */
export function PostAuthorAvatars({
  postId,
  userId,
  username,
  displayName,
  avatarUrl,
  isVerified = false,
  onOwnerClick,
  className,
}: PostAuthorAvatarsProps) {
  const navigate = useNavigate();
  const { collaborators } = usePostCollaborators(postId);

  const partner = useMemo(() => {
    const accepted = collaborators.filter((item) => item.status === 'accepted');
    return accepted[0] ?? null;
  }, [collaborators]);

  const ownerAvatar = (
    <StoryAvatar
      userId={userId}
      username={username}
      displayName={displayName}
      avatarUrl={avatarUrl}
      isVerified={isVerified}
      size="md"
      showRing
      onClick={onOwnerClick}
    />
  );

  if (!partner) {
    return <div className={cn('shrink-0', className)}>{ownerAvatar}</div>;
  }

  const partnerLabel =
    partner.profile?.display_name || partner.profile?.username || 'Hammuallif';

  return (
    <div className={cn('relative h-11 w-[58px] shrink-0', className)}>
      {/* Orqadagi hammuallif rasmi */}
      <button
        type="button"
        aria-label={partnerLabel + ' profiliga o\u2018tish'}
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          navigate('/user/' + (partner.profile?.username || partner.user_id));
        }}
        className="absolute right-0 top-1/2 -translate-y-1/2 rounded-full bg-card p-[2px] transition-transform hover:scale-105"
      >
        <Avatar className="h-7 w-7">
          <AvatarImage src={partner.profile?.avatar_url || ''} />
          <AvatarFallback className="text-[10px]">
            {partnerLabel.charAt(0).toUpperCase()}
          </AvatarFallback>
        </Avatar>
      </button>

      {/* Oldindagi muallif rasmi */}
      <div className="absolute left-0 top-1/2 -translate-y-1/2 rounded-full bg-card">
        {ownerAvatar}
      </div>
    </div>
  );
}

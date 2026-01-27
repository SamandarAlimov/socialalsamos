import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { VerifiedBadge } from '@/components/VerifiedBadge';
import { useCollaborations, Collaboration } from '@/hooks/useCollaborations';
import { Users } from 'lucide-react';
import { cn } from '@/lib/utils';

interface PostCollaboratorsProps {
  postId: string;
  postAuthor: {
    id: string;
    username: string | null;
    display_name: string | null;
    avatar_url: string | null;
    is_verified?: boolean;
  };
  className?: string;
  compact?: boolean;
}

export function PostCollaborators({ 
  postId, 
  postAuthor,
  className,
  compact = false 
}: PostCollaboratorsProps) {
  const { getPostCollaborators } = useCollaborations();
  const [collaborators, setCollaborators] = useState<Collaboration[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchCollaborators = async () => {
      const data = await getPostCollaborators(postId);
      setCollaborators(data);
      setIsLoading(false);
    };
    fetchCollaborators();
  }, [postId, getPostCollaborators]);

  if (isLoading || collaborators.length === 0) {
    return null;
  }

  if (compact) {
    return (
      <div className={cn("flex items-center gap-1 text-sm text-muted-foreground", className)}>
        <Users className="h-3.5 w-3.5" />
        <span>with</span>
        {collaborators.slice(0, 2).map((collab, idx) => (
          <span key={collab.id}>
            <Link 
              to={`/user/${collab.collaborator?.username}`}
              className="font-medium text-foreground hover:text-primary transition-colors"
            >
              {collab.collaborator?.display_name || collab.collaborator?.username}
            </Link>
            {idx < Math.min(collaborators.length, 2) - 1 && ', '}
          </span>
        ))}
        {collaborators.length > 2 && (
          <span>+{collaborators.length - 2} more</span>
        )}
      </div>
    );
  }

  return (
    <div className={cn("flex items-center gap-2", className)}>
      <div className="flex items-center -space-x-2">
        {/* Post author */}
        <Link to={`/user/${postAuthor.username}`}>
          <Avatar className="h-8 w-8 border-2 border-background ring-2 ring-primary">
            <AvatarImage src={postAuthor.avatar_url || ''} />
            <AvatarFallback>
              {postAuthor.display_name?.[0] || postAuthor.username?.[0]}
            </AvatarFallback>
          </Avatar>
        </Link>
        
        {/* Collaborators */}
        {collaborators.slice(0, 3).map(collab => (
          <Link key={collab.id} to={`/user/${collab.collaborator?.username}`}>
            <Avatar className="h-8 w-8 border-2 border-background">
              <AvatarImage src={collab.collaborator?.avatar_url || ''} />
              <AvatarFallback>
                {collab.collaborator?.display_name?.[0] || collab.collaborator?.username?.[0]}
              </AvatarFallback>
            </Avatar>
          </Link>
        ))}
        
        {collaborators.length > 3 && (
          <div className="h-8 w-8 rounded-full border-2 border-background bg-muted flex items-center justify-center text-xs font-medium">
            +{collaborators.length - 3}
          </div>
        )}
      </div>
      
      <div className="flex flex-col min-w-0">
        <div className="flex items-center gap-1 flex-wrap">
          <Link 
            to={`/user/${postAuthor.username}`}
            className="font-semibold hover:text-primary transition-colors"
          >
            {postAuthor.display_name || postAuthor.username}
          </Link>
          {postAuthor.is_verified && <VerifiedBadge size="sm" />}
          
          <span className="text-muted-foreground">&</span>
          
          {collaborators.slice(0, 1).map(collab => (
            <span key={collab.id} className="flex items-center gap-1">
              <Link 
                to={`/user/${collab.collaborator?.username}`}
                className="font-semibold hover:text-primary transition-colors"
              >
                {collab.collaborator?.display_name || collab.collaborator?.username}
              </Link>
              {collab.collaborator?.is_verified && <VerifiedBadge size="sm" />}
            </span>
          ))}
          
          {collaborators.length > 1 && (
            <span className="text-muted-foreground">
              +{collaborators.length - 1} {collaborators.length === 2 ? 'other' : 'others'}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

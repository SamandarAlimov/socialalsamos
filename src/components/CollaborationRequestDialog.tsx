import { useState } from 'react';
import { format } from 'date-fns';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useCollaborations, Collaboration } from '@/hooks/useCollaborations';
import { VerifiedBadge } from '@/components/VerifiedBadge';
import { 
  Users, 
  Check, 
  X, 
  Clock, 
  SendHorizontal,
  Image as ImageIcon,
  Film,
  Loader2
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface CollaborationRequestDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CollaborationRequestDialog({ 
  open, 
  onOpenChange 
}: CollaborationRequestDialogProps) {
  const { 
    pendingRequests, 
    sentRequests, 
    isLoading,
    respondToRequest,
    cancelRequest 
  } = useCollaborations();
  
  const [respondingId, setRespondingId] = useState<string | null>(null);
  const [cancellingId, setCancellingId] = useState<string | null>(null);

  const handleRespond = async (id: string, accept: boolean) => {
    setRespondingId(id);
    await respondToRequest(id, accept);
    setRespondingId(null);
  };

  const handleCancel = async (id: string) => {
    setCancellingId(id);
    await cancelRequest(id);
    setCancellingId(null);
  };

  const renderMediaPreview = (collab: Collaboration) => {
    const post = collab.post;
    if (!post) return null;

    const hasMedia = post.media_urls && post.media_urls.length > 0;
    const isVideo = post.media_type === 'video';

    if (!hasMedia) {
      return (
        <div className="w-12 h-12 rounded-lg bg-muted flex items-center justify-center">
          <span className="text-xs text-muted-foreground">Text</span>
        </div>
      );
    }

    return (
      <div className="relative w-12 h-12 rounded-lg overflow-hidden bg-muted">
        <img 
          src={post.media_urls[0]} 
          alt="Post preview"
          className="w-full h-full object-cover"
        />
        {isVideo && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/30">
            <Film className="w-4 h-4 text-white" />
          </div>
        )}
      </div>
    );
  };

  const PendingRequestItem = ({ collab }: { collab: Collaboration }) => (
    <div className="flex items-start gap-3 p-4 rounded-xl bg-card border border-border hover:bg-secondary/30 transition-colors">
      <Avatar className="h-10 w-10">
        <AvatarImage src={collab.inviter?.avatar_url || ''} />
        <AvatarFallback>
          {collab.inviter?.display_name?.[0] || collab.inviter?.username?.[0]}
        </AvatarFallback>
      </Avatar>
      
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1">
          <span className="font-medium truncate">
            {collab.inviter?.display_name || collab.inviter?.username}
          </span>
          {collab.inviter?.is_verified && <VerifiedBadge size="sm" />}
        </div>
        <p className="text-sm text-muted-foreground">
          wants to collaborate with you
        </p>
        <p className="text-xs text-muted-foreground mt-1">
          {format(new Date(collab.created_at), 'MMM d, h:mm a')}
        </p>
      </div>
      
      {renderMediaPreview(collab)}
      
      <div className="flex gap-2">
        <Button
          size="sm"
          variant="ghost"
          className="text-destructive hover:text-destructive hover:bg-destructive/10"
          onClick={() => handleRespond(collab.id, false)}
          disabled={respondingId === collab.id}
        >
          {respondingId === collab.id ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <X className="h-4 w-4" />
          )}
        </Button>
        <Button
          size="sm"
          onClick={() => handleRespond(collab.id, true)}
          disabled={respondingId === collab.id}
        >
          {respondingId === collab.id ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <>
              <Check className="h-4 w-4 mr-1" />
              Accept
            </>
          )}
        </Button>
      </div>
    </div>
  );

  const SentRequestItem = ({ collab }: { collab: Collaboration }) => (
    <div className="flex items-start gap-3 p-4 rounded-xl bg-card border border-border">
      <Avatar className="h-10 w-10">
        <AvatarImage src={collab.collaborator?.avatar_url || ''} />
        <AvatarFallback>
          {collab.collaborator?.display_name?.[0] || collab.collaborator?.username?.[0]}
        </AvatarFallback>
      </Avatar>
      
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1">
          <span className="font-medium truncate">
            {collab.collaborator?.display_name || collab.collaborator?.username}
          </span>
          {collab.collaborator?.is_verified && <VerifiedBadge size="sm" />}
        </div>
        <div className="flex items-center gap-2 mt-1">
          <Badge 
            variant={
              collab.status === 'pending' ? 'secondary' : 
              collab.status === 'accepted' ? 'default' : 'destructive'
            }
            className="text-xs"
          >
            {collab.status === 'pending' && <Clock className="h-3 w-3 mr-1" />}
            {collab.status === 'accepted' && <Check className="h-3 w-3 mr-1" />}
            {collab.status === 'declined' && <X className="h-3 w-3 mr-1" />}
            {collab.status.charAt(0).toUpperCase() + collab.status.slice(1)}
          </Badge>
        </div>
        <p className="text-xs text-muted-foreground mt-1">
          Sent {format(new Date(collab.created_at), 'MMM d, h:mm a')}
        </p>
      </div>
      
      {renderMediaPreview(collab)}
      
      {collab.status === 'pending' && (
        <Button
          size="sm"
          variant="ghost"
          className="text-muted-foreground"
          onClick={() => handleCancel(collab.id)}
          disabled={cancellingId === collab.id}
        >
          {cancellingId === collab.id ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            'Cancel'
          )}
        </Button>
      )}
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Users className="h-5 w-5 text-primary" />
            Collaboration Requests
          </DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="received" className="w-full">
          <TabsList className="w-full">
            <TabsTrigger value="received" className="flex-1">
              Received
              {pendingRequests.length > 0 && (
                <Badge variant="destructive" className="ml-2 h-5 min-w-[20px] px-1.5">
                  {pendingRequests.length}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="sent" className="flex-1">
              <SendHorizontal className="h-4 w-4 mr-1" />
              Sent
            </TabsTrigger>
          </TabsList>

          <TabsContent value="received" className="mt-4">
            <ScrollArea className="h-[400px]">
              {isLoading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-6 w-6 animate-spin text-primary" />
                </div>
              ) : pendingRequests.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <Users className="h-12 w-12 mx-auto mb-3 opacity-50" />
                  <p>No pending requests</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {pendingRequests.map(collab => (
                    <PendingRequestItem key={collab.id} collab={collab} />
                  ))}
                </div>
              )}
            </ScrollArea>
          </TabsContent>

          <TabsContent value="sent" className="mt-4">
            <ScrollArea className="h-[400px]">
              {isLoading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-6 w-6 animate-spin text-primary" />
                </div>
              ) : sentRequests.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <SendHorizontal className="h-12 w-12 mx-auto mb-3 opacity-50" />
                  <p>No sent requests</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {sentRequests.map(collab => (
                    <SentRequestItem key={collab.id} collab={collab} />
                  ))}
                </div>
              )}
            </ScrollArea>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

import { useState } from 'react';
import { Plus, X, MoreHorizontal, Edit2, Trash2, GripVertical } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useStoryHighlights, StoryHighlight } from '@/hooks/useStoryHighlights';
import { StoryViewer } from './StoryViewer';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Skeleton } from '@/components/ui/skeleton';

interface StoryHighlightsProps {
  userId: string;
  className?: string;
}

export function StoryHighlights({ userId, className }: StoryHighlightsProps) {
  const {
    highlights,
    isLoading,
    isOwnProfile,
    createHighlight,
    updateHighlight,
    deleteHighlight,
  } = useStoryHighlights(userId);

  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [editingHighlight, setEditingHighlight] = useState<StoryHighlight | null>(null);
  const [newHighlightName, setNewHighlightName] = useState('');
  const [selectedHighlight, setSelectedHighlight] = useState<StoryHighlight | null>(null);
  const [isCreating, setIsCreating] = useState(false);

  const handleCreateHighlight = async () => {
    if (!newHighlightName.trim()) return;
    
    setIsCreating(true);
    await createHighlight(newHighlightName.trim());
    setNewHighlightName('');
    setShowCreateDialog(false);
    setIsCreating(false);
  };

  const handleEditHighlight = async () => {
    if (!editingHighlight || !newHighlightName.trim()) return;
    
    setIsCreating(true);
    await updateHighlight(editingHighlight.id, { name: newHighlightName.trim() });
    setNewHighlightName('');
    setShowEditDialog(false);
    setEditingHighlight(null);
    setIsCreating(false);
  };

  const handleDeleteHighlight = async (highlight: StoryHighlight) => {
    if (confirm(`Delete "${highlight.name}" highlight?`)) {
      await deleteHighlight(highlight.id);
    }
  };

  const openEditDialog = (highlight: StoryHighlight, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingHighlight(highlight);
    setNewHighlightName(highlight.name);
    setShowEditDialog(true);
  };

  const openHighlightViewer = (highlight: StoryHighlight) => {
    if (highlight.items && highlight.items.length > 0) {
      setSelectedHighlight(highlight);
    }
  };

  if (isLoading) {
    return (
      <div className={cn("flex gap-4 overflow-x-auto pb-4 scrollbar-hidden", className)}>
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="flex flex-col items-center gap-2 flex-shrink-0">
            <Skeleton className="w-16 h-16 rounded-full" />
            <Skeleton className="w-12 h-3" />
          </div>
        ))}
      </div>
    );
  }

  if (highlights.length === 0 && !isOwnProfile) {
    return null;
  }

  return (
    <>
      <div className={cn("flex gap-4 overflow-x-auto pb-4 scrollbar-hidden", className)}>
        {/* Create New Highlight Button (Only for own profile) */}
        {isOwnProfile && (
          <button
            onClick={() => setShowCreateDialog(true)}
            className="flex flex-col items-center gap-2 flex-shrink-0"
          >
            <div className="w-16 h-16 rounded-full border-2 border-dashed border-muted-foreground/50 flex items-center justify-center hover:border-primary hover:bg-primary/5 transition-colors">
              <Plus className="h-6 w-6 text-muted-foreground" />
            </div>
            <span className="text-xs text-muted-foreground">New</span>
          </button>
        )}

        {/* Highlights */}
        {highlights.map((highlight) => (
          <div
            key={highlight.id}
            className="flex flex-col items-center gap-2 flex-shrink-0 group relative"
          >
            <button
              onClick={() => openHighlightViewer(highlight)}
              className="relative"
            >
              <div className={cn(
                "w-16 h-16 rounded-full overflow-hidden border-2",
                highlight.items && highlight.items.length > 0
                  ? "border-primary"
                  : "border-muted"
              )}>
                {highlight.cover_url ? (
                  <img
                    src={highlight.cover_url}
                    alt={highlight.name}
                    className="w-full h-full object-cover"
                  />
                ) : highlight.items && highlight.items.length > 0 ? (
                  <img
                    src={highlight.items[0].media_url}
                    alt={highlight.name}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full bg-muted flex items-center justify-center">
                    <span className="text-2xl">{highlight.name[0]?.toUpperCase()}</span>
                  </div>
                )}
              </div>
              
              {/* Item count badge */}
              {highlight.items && highlight.items.length > 0 && (
                <div className="absolute -bottom-1 -right-1 bg-primary text-primary-foreground text-[10px] font-medium rounded-full w-5 h-5 flex items-center justify-center">
                  {highlight.items.length}
                </div>
              )}
            </button>

            <span className="text-xs text-muted-foreground truncate max-w-[64px]">
              {highlight.name}
            </span>

            {/* Edit/Delete Menu (Only for own profile) */}
            {isOwnProfile && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button className="absolute -top-1 -right-1 opacity-0 group-hover:opacity-100 bg-background rounded-full p-0.5 shadow-md transition-opacity">
                    <MoreHorizontal className="h-4 w-4" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={(e) => openEditDialog(highlight, e)}>
                    <Edit2 className="h-4 w-4 mr-2" />
                    Edit
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => handleDeleteHighlight(highlight)}
                    className="text-destructive"
                  >
                    <Trash2 className="h-4 w-4 mr-2" />
                    Delete
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        ))}
      </div>

      {/* Create Highlight Dialog */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Highlight</DialogTitle>
            <DialogDescription>
              Give your highlight a name. You can add stories from your archive later.
            </DialogDescription>
          </DialogHeader>
          <Input
            value={newHighlightName}
            onChange={(e) => setNewHighlightName(e.target.value)}
            placeholder="Highlight name..."
            maxLength={50}
          />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setShowCreateDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreateHighlight} disabled={!newHighlightName.trim() || isCreating}>
              {isCreating ? 'Creating...' : 'Create'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Highlight Dialog */}
      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Highlight</DialogTitle>
          </DialogHeader>
          <Input
            value={newHighlightName}
            onChange={(e) => setNewHighlightName(e.target.value)}
            placeholder="Highlight name..."
            maxLength={50}
          />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setShowEditDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleEditHighlight} disabled={!newHighlightName.trim() || isCreating}>
              {isCreating ? 'Saving...' : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Highlight Viewer */}
      {selectedHighlight && selectedHighlight.items && selectedHighlight.items.length > 0 && (
        <StoryViewer
          storyGroup={{
            user_id: userId,
            username: null,
            display_name: selectedHighlight.name,
            avatar_url: selectedHighlight.cover_url || selectedHighlight.items[0]?.media_url || null,
            is_verified: false,
            stories: selectedHighlight.items.map(item => ({
              id: item.story_id,
              user_id: userId,
              media_url: item.media_url,
              media_type: item.media_type,
              caption: item.caption,
              views_count: 0,
              expires_at: new Date(Date.now() + 86400000).toISOString(),
              created_at: item.created_at,
            })),
            all_story_ids: selectedHighlight.items.map(item => item.story_id),
          }}
          allGroups={[]}
          onClose={() => setSelectedHighlight(null)}
        />
      )}
    </>
  );
}

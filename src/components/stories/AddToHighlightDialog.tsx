import { useState } from 'react';
import { useStoryHighlights } from '@/hooks/useStoryHighlights';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Bookmark, Plus, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface AddToHighlightDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  story: {
    id: string;
    media_url: string;
    media_type: string;
    caption: string | null;
  } | null;
}

export function AddToHighlightDialog({ open, onOpenChange, story }: AddToHighlightDialogProps) {
  const { highlights, createHighlight, addStoryToHighlight } = useStoryHighlights();
  
  const [selectedHighlightId, setSelectedHighlightId] = useState<string>('');
  const [newHighlightName, setNewHighlightName] = useState('');
  const [isAdding, setIsAdding] = useState(false);

  const handleAddToHighlight = async () => {
    if (!story) return;

    setIsAdding(true);
    try {
      let highlightId = selectedHighlightId;

      // Create new highlight if needed
      if (selectedHighlightId === 'new' && newHighlightName.trim()) {
        const newHighlight = await createHighlight(newHighlightName.trim(), story.media_url);
        if (newHighlight) {
          highlightId = newHighlight.id;
        } else {
          setIsAdding(false);
          return;
        }
      }

      if (highlightId && highlightId !== 'new') {
        await addStoryToHighlight(
          highlightId,
          story.id,
          story.media_url,
          story.media_type,
          story.caption || undefined
        );
      }

      onOpenChange(false);
      setSelectedHighlightId('');
      setNewHighlightName('');
    } catch (error) {
      console.error('Error adding to highlight:', error);
      toast.error('Failed to add to highlight');
    } finally {
      setIsAdding(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="z-[110]">
        <DialogHeader>
          <DialogTitle>Add to Highlight</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Preview */}
          {story && (
            <div className="flex items-center gap-4">
              <div className="w-16 h-24 rounded-lg overflow-hidden bg-muted">
                {story.media_type === 'video' ? (
                  <video
                    src={story.media_url}
                    className="w-full h-full object-cover"
                    muted
                  />
                ) : (
                  <img
                    src={story.media_url}
                    alt="Story"
                    className="w-full h-full object-cover"
                  />
                )}
              </div>
              <div>
                <p className="text-sm font-medium">Current Story</p>
                <p className="text-xs text-muted-foreground">
                  Add to an existing highlight or create a new one
                </p>
              </div>
            </div>
          )}

          {/* Select Highlight */}
          <div className="space-y-2">
            <label className="text-sm font-medium">Choose Highlight</label>
            <Select value={selectedHighlightId} onValueChange={setSelectedHighlightId}>
              <SelectTrigger>
                <SelectValue placeholder="Select a highlight" />
              </SelectTrigger>
              <SelectContent className="z-[120]">
                {highlights.map((highlight) => (
                  <SelectItem key={highlight.id} value={highlight.id}>
                    <div className="flex items-center gap-2">
                      <Bookmark className="h-4 w-4" />
                      {highlight.name}
                    </div>
                  </SelectItem>
                ))}
                <SelectItem value="new">
                  <div className="flex items-center gap-2 text-primary">
                    <Plus className="h-4 w-4" />
                    Create New Highlight
                  </div>
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* New Highlight Name */}
          {selectedHighlightId === 'new' && (
            <div className="space-y-2">
              <label className="text-sm font-medium">Highlight Name</label>
              <Input
                value={newHighlightName}
                onChange={(e) => setNewHighlightName(e.target.value)}
                placeholder="Enter highlight name..."
              />
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleAddToHighlight}
            disabled={
              isAdding ||
              (!selectedHighlightId) ||
              (selectedHighlightId === 'new' && !newHighlightName.trim())
            }
          >
            {isAdding ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Adding...
              </>
            ) : (
              'Add to Highlight'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

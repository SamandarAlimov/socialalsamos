import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useStoryHighlights } from '@/hooks/useStoryHighlights';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { ArrowLeft, Archive, Plus, Bookmark, Play, Image as ImageIcon, Loader2 } from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
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

interface ArchivedStory {
  id: string;
  user_id: string;
  media_url: string;
  media_type: string;
  caption: string | null;
  views_count: number;
  expires_at: string;
  created_at: string;
}

export default function StoryArchivePage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { highlights, createHighlight, addStoryToHighlight, isLoading: loadingHighlights } = useStoryHighlights();
  
  const [archivedStories, setArchivedStories] = useState<ArchivedStory[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedStory, setSelectedStory] = useState<ArchivedStory | null>(null);
  const [showHighlightDialog, setShowHighlightDialog] = useState(false);
  const [selectedHighlightId, setSelectedHighlightId] = useState<string>('');
  const [newHighlightName, setNewHighlightName] = useState('');
  const [isAdding, setIsAdding] = useState(false);

  const fetchArchivedStories = useCallback(async () => {
    if (!user) return;

    setIsLoading(true);
    try {
      // Fetch all stories including expired ones (need to use a workaround since RLS blocks expired)
      // We'll fetch stories that have passed their expiration
      const { data, error } = await supabase
        .from('stories')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (error) throw error;

      // Filter to only show expired stories
      const now = new Date();
      const expired = (data || []).filter(story => new Date(story.expires_at) <= now);
      setArchivedStories(expired as ArchivedStory[]);
    } catch (error) {
      console.error('Error fetching archived stories:', error);
    } finally {
      setIsLoading(false);
    }
  }, [user]);

  useEffect(() => {
    fetchArchivedStories();
  }, [fetchArchivedStories]);

  const handleAddToHighlight = async () => {
    if (!selectedStory) return;

    setIsAdding(true);
    try {
      let highlightId = selectedHighlightId;

      // Create new highlight if needed
      if (selectedHighlightId === 'new' && newHighlightName.trim()) {
        const newHighlight = await createHighlight(newHighlightName.trim(), selectedStory.media_url);
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
          selectedStory.id,
          selectedStory.media_url,
          selectedStory.media_type,
          selectedStory.caption || undefined
        );
      }

      setShowHighlightDialog(false);
      setSelectedStory(null);
      setSelectedHighlightId('');
      setNewHighlightName('');
    } catch (error) {
      console.error('Error adding to highlight:', error);
      toast.error('Failed to add to highlight');
    } finally {
      setIsAdding(false);
    }
  };

  const openHighlightDialog = (story: ArchivedStory) => {
    setSelectedStory(story);
    setShowHighlightDialog(true);
  };

  return (
    <div className="container max-w-4xl mx-auto p-4">
      {/* Header */}
      <div className="flex items-center gap-4 mb-6">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex items-center gap-2">
          <Archive className="h-6 w-6 text-primary" />
          <h1 className="text-2xl font-bold">Story Archive</h1>
        </div>
      </div>

      {/* Description */}
      <p className="text-muted-foreground mb-6">
        View your expired stories and add them to highlights to keep them visible on your profile.
      </p>

      {/* Stories Grid */}
      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : archivedStories.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <Archive className="h-16 w-16 text-muted-foreground/50 mb-4" />
            <h3 className="text-lg font-medium mb-2">No Archived Stories</h3>
            <p className="text-muted-foreground text-center max-w-sm">
              Your expired stories will appear here. You can add them to highlights to keep them on your profile.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2">
          {archivedStories.map((story) => (
            <div
              key={story.id}
              className="relative aspect-[9/16] rounded-lg overflow-hidden group cursor-pointer bg-muted"
              onClick={() => openHighlightDialog(story)}
            >
              {story.media_type === 'video' ? (
                <>
                  <video
                    src={story.media_url}
                    className="w-full h-full object-cover"
                    muted
                  />
                  <div className="absolute top-2 right-2">
                    <Play className="h-4 w-4 text-white drop-shadow-lg" />
                  </div>
                </>
              ) : (
                <img
                  src={story.media_url}
                  alt="Story"
                  className="w-full h-full object-cover"
                />
              )}
              
              {/* Overlay */}
              <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                <Button size="sm" variant="secondary" className="gap-1">
                  <Plus className="h-4 w-4" />
                  Add to Highlight
                </Button>
              </div>

              {/* Date */}
              <div className="absolute bottom-2 left-2 right-2">
                <span className="text-xs text-white bg-black/50 px-2 py-0.5 rounded backdrop-blur-sm">
                  {format(new Date(story.created_at), 'MMM d, yyyy')}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add to Highlight Dialog */}
      <Dialog open={showHighlightDialog} onOpenChange={setShowHighlightDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add to Highlight</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            {/* Preview */}
            {selectedStory && (
              <div className="flex items-center gap-4">
                <div className="w-16 h-24 rounded-lg overflow-hidden bg-muted">
                  {selectedStory.media_type === 'video' ? (
                    <video
                      src={selectedStory.media_url}
                      className="w-full h-full object-cover"
                      muted
                    />
                  ) : (
                    <img
                      src={selectedStory.media_url}
                      alt="Story"
                      className="w-full h-full object-cover"
                    />
                  )}
                </div>
                <div>
                  <p className="text-sm font-medium">
                    {format(new Date(selectedStory.created_at), 'MMMM d, yyyy')}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {selectedStory.views_count} views
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
                <SelectContent>
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
            <Button variant="outline" onClick={() => setShowHighlightDialog(false)}>
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
    </div>
  );
}

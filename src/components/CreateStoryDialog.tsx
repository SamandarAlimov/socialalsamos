import { useState, useRef } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { useFileUpload } from '@/hooks/useFileUpload';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Image as ImageIcon, Film, X, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

interface CreateStoryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

export function CreateStoryDialog({ open, onOpenChange, onSuccess }: CreateStoryDialogProps) {
  const { user } = useAuth();
  const { uploadFile, uploading } = useFileUpload();
  const [mediaPreview, setMediaPreview] = useState<{ url: string; type: 'image' | 'video'; file: File } | null>(null);
  const [caption, setCaption] = useState('');
  const [posting, setPosting] = useState(false);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>, type: 'image' | 'video') => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Check file size (20MB limit for stories)
    if (file.size > 20 * 1024 * 1024) {
      toast.error('File size must be less than 20MB');
      return;
    }

    const localUrl = URL.createObjectURL(file);
    setMediaPreview({ url: localUrl, type, file });
    e.target.value = '';
  };

  const handleClear = () => {
    if (mediaPreview) {
      URL.revokeObjectURL(mediaPreview.url);
    }
    setMediaPreview(null);
    setCaption('');
  };

  const handlePost = async () => {
    if (!user || !mediaPreview) return;
    setPosting(true);

    try {
      // Upload the file
      const result = await uploadFile(mediaPreview.file);
      if (!result) throw new Error('Failed to upload file');

      // Create story
      const { error } = await supabase.from('stories').insert({
        user_id: user.id,
        media_url: result.url,
        media_type: mediaPreview.type,
        caption: caption || null,
      });

      if (error) throw error;

      toast.success('Story posted!');
      handleClear();
      onOpenChange(false);
      onSuccess?.();
    } catch (error) {
      console.error('Error posting story:', error);
      toast.error('Failed to post story');
    } finally {
      setPosting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Create Story</DialogTitle>
        </DialogHeader>

        <input
          ref={imageInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => handleFileSelect(e, 'image')}
        />
        <input
          ref={videoInputRef}
          type="file"
          accept="video/*"
          className="hidden"
          onChange={(e) => handleFileSelect(e, 'video')}
        />

        {!mediaPreview ? (
          <div className="flex flex-col gap-4">
            <p className="text-sm text-muted-foreground text-center">
              Share a photo or video to your story
            </p>
            <div className="flex gap-4 justify-center">
              <Button
                variant="outline"
                size="lg"
                onClick={() => imageInputRef.current?.click()}
                className="flex-1"
              >
                <ImageIcon className="h-5 w-5 mr-2" />
                Photo
              </Button>
              <Button
                variant="outline"
                size="lg"
                onClick={() => videoInputRef.current?.click()}
                className="flex-1"
              >
                <Film className="h-5 w-5 mr-2" />
                Video
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Preview */}
            <div className="relative aspect-[9/16] max-h-[400px] rounded-xl overflow-hidden bg-muted">
              {mediaPreview.type === 'video' ? (
                <video
                  src={mediaPreview.url}
                  className="w-full h-full object-cover"
                  controls
                />
              ) : (
                <img
                  src={mediaPreview.url}
                  alt="Story preview"
                  className="w-full h-full object-cover"
                />
              )}
              <button
                onClick={handleClear}
                className="absolute top-2 right-2 p-1.5 bg-background/80 rounded-full hover:bg-background transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Caption */}
            <Input
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              placeholder="Add a caption..."
              maxLength={100}
            />

            {/* Actions */}
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => onOpenChange(false)} className="flex-1">
                Cancel
              </Button>
              <Button 
                onClick={handlePost} 
                disabled={posting || uploading}
                className="flex-1"
              >
                {(posting || uploading) ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : null}
                Post Story
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

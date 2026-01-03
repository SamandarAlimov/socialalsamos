import { useState, useRef } from 'react';
import { Image, Video, X, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface CommentMediaUploadProps {
  onMediaSelect: (url: string, type: 'image' | 'video' | 'gif') => void;
  onMediaClear: () => void;
  selectedMedia: { url: string; type: 'image' | 'video' | 'gif' } | null;
}

export function CommentMediaUpload({ onMediaSelect, onMediaClear, selectedMedia }: CommentMediaUploadProps) {
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    const isImage = file.type.startsWith('image/');
    const isVideo = file.type.startsWith('video/');
    
    if (!isImage && !isVideo) {
      toast.error('Please select an image or video file');
      return;
    }

    // Validate file size (max 10MB for images, 50MB for videos)
    const maxSize = isImage ? 10 * 1024 * 1024 : 50 * 1024 * 1024;
    if (file.size > maxSize) {
      toast.error(`File too large. Max size: ${isImage ? '10MB' : '50MB'}`);
      return;
    }

    setIsUploading(true);

    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `comment-${Date.now()}.${fileExt}`;
      const filePath = `comments/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('message-attachments')
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('message-attachments')
        .getPublicUrl(filePath);

      onMediaSelect(publicUrl, isImage ? 'image' : 'video');
      toast.success('Media uploaded successfully');
    } catch (error) {
      console.error('Error uploading file:', error);
      toast.error('Failed to upload media');
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  return (
    <div className="flex items-center gap-1">
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*,video/*"
        onChange={handleFileSelect}
        className="hidden"
      />
      
      <Button 
        type="button" 
        variant="ghost" 
        size="icon" 
        className="h-7 w-7 text-muted-foreground hover:text-foreground"
        onClick={() => fileInputRef.current?.click()}
        disabled={isUploading || !!selectedMedia}
        title="Add image/video"
      >
        {isUploading ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Image className="h-4 w-4" />
        )}
      </Button>

      {/* Selected Media Preview */}
      {selectedMedia && (
        <div className="relative ml-2">
          <div className="relative w-12 h-12 rounded-lg overflow-hidden border border-border">
            {selectedMedia.type === 'video' ? (
              <video 
                src={selectedMedia.url} 
                className="w-full h-full object-cover"
              />
            ) : (
              <img 
                src={selectedMedia.url} 
                alt="Selected media" 
                className="w-full h-full object-cover"
              />
            )}
            <div className="absolute inset-0 bg-black/20 flex items-center justify-center">
              {selectedMedia.type === 'video' && (
                <Video className="h-4 w-4 text-white" />
              )}
            </div>
          </div>
          <Button
            type="button"
            variant="destructive"
            size="icon"
            className="absolute -top-1 -right-1 h-4 w-4 rounded-full"
            onClick={onMediaClear}
          >
            <X className="h-2 w-2" />
          </Button>
        </div>
      )}
    </div>
  );
}

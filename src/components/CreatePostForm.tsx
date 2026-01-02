import { useState, useRef } from 'react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';
import { useFileUpload } from '@/hooks/useFileUpload';
import { useAutocompleteInput } from '@/hooks/useAutocompleteInput';
import { MentionAutocomplete } from '@/components/MentionAutocomplete';
import { HashtagAutocomplete } from '@/components/HashtagAutocomplete';
import { 
  Image as ImageIcon, 
  Play, 
  X, 
  Loader2 
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface CreatePostFormProps {
  onPost: (content: string, mediaUrls: string[], mediaType: string) => Promise<any>;
}

export function CreatePostForm({ onPost }: CreatePostFormProps) {
  const { user, profile } = useAuth();
  const [postContent, setPostContent] = useState('');
  const [isPosting, setIsPosting] = useState(false);
  const [mediaFiles, setMediaFiles] = useState<{ url: string; type: 'image' | 'video'; file?: File }[]>([]);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const { uploadFile, uploading } = useFileUpload();
  const { autocompleteState, handleInputChange, insertAutocomplete, closeAutocomplete } = useAutocompleteInput();

  const handleAutocompleteSelect = (value: string) => {
    const newValue = insertAutocomplete(postContent, value, textareaRef);
    setPostContent(newValue);
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>, type: 'image' | 'video') => {
    const files = e.target.files;
    if (!files) return;

    const newFiles = Array.from(files).slice(0, 4 - mediaFiles.length);
    
    for (const file of newFiles) {
      // Create local preview
      const localUrl = URL.createObjectURL(file);
      setMediaFiles(prev => [...prev, { url: localUrl, type, file }]);
    }
    
    e.target.value = '';
  };

  const removeMedia = (index: number) => {
    setMediaFiles(prev => {
      const newFiles = [...prev];
      // Revoke object URL if local
      if (newFiles[index].file) {
        URL.revokeObjectURL(newFiles[index].url);
      }
      newFiles.splice(index, 1);
      return newFiles;
    });
  };

  const handlePost = async () => {
    if (!postContent.trim() && mediaFiles.length === 0) return;
    
    setIsPosting(true);
    
    try {
      // Upload all files
      const uploadedUrls: string[] = [];
      for (const media of mediaFiles) {
        if (media.file) {
          const result = await uploadFile(media.file);
          if (result) {
            uploadedUrls.push(result.url);
          }
        } else {
          uploadedUrls.push(media.url);
        }
      }
      
      const mediaType = mediaFiles.length > 0 
        ? (mediaFiles[0].type === 'video' ? 'video' : 'image')
        : 'text';
      
      await onPost(postContent, uploadedUrls, mediaType);
      
      // Reset form
      setPostContent('');
      setMediaFiles([]);
    } finally {
      setIsPosting(false);
    }
  };

  return (
    <div className="bg-card rounded-2xl border border-border p-4 mb-6">
      <input
        ref={imageInputRef}
        type="file"
        accept="image/*"
        multiple
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
      
      <div className="flex gap-3">
        <Avatar className="h-10 w-10">
          <AvatarImage src={profile?.avatar_url || ''} />
          <AvatarFallback className="bg-primary text-primary-foreground">
            {profile?.display_name?.[0] || user?.email?.[0]?.toUpperCase() || 'U'}
          </AvatarFallback>
        </Avatar>
        <div className="flex-1 relative">
          <textarea
            ref={textareaRef}
            value={postContent}
            onChange={(e) => handleInputChange(
              e.target.value, 
              e.target.selectionStart || 0,
              setPostContent
            )}
            placeholder="What's on your mind? Use @ to mention, # for hashtags"
            className="w-full bg-transparent text-foreground placeholder:text-muted-foreground focus:outline-none resize-none min-h-[60px]"
            rows={2}
          />
          {autocompleteState.isActive && autocompleteState.type === 'mention' && (
            <MentionAutocomplete
              query={autocompleteState.query}
              onSelect={handleAutocompleteSelect}
              onClose={closeAutocomplete}
              className="top-full left-0 mt-1"
            />
          )}
          {autocompleteState.isActive && autocompleteState.type === 'hashtag' && (
            <HashtagAutocomplete
              query={autocompleteState.query}
              onSelect={handleAutocompleteSelect}
              onClose={closeAutocomplete}
              className="top-full left-0 mt-1"
            />
          )}
        </div>
      </div>

      {/* Media Preview */}
      {mediaFiles.length > 0 && (
        <div className={cn(
          "mt-4 grid gap-2",
          mediaFiles.length === 1 ? "grid-cols-1" : 
          mediaFiles.length === 2 ? "grid-cols-2" :
          mediaFiles.length === 3 ? "grid-cols-2" : "grid-cols-2"
        )}>
          {mediaFiles.map((media, index) => (
            <div 
              key={index} 
              className={cn(
                "relative rounded-xl overflow-hidden bg-muted",
                mediaFiles.length === 3 && index === 0 ? "row-span-2" : "",
                mediaFiles.length === 1 ? "aspect-video" : "aspect-square"
              )}
            >
              {media.type === 'video' ? (
                <video 
                  src={media.url}
                  className="w-full h-full object-cover"
                  controls
                />
              ) : (
                <img 
                  src={media.url}
                  alt={`Preview ${index + 1}`}
                  className="w-full h-full object-cover"
                />
              )}
              <button
                onClick={() => removeMedia(index)}
                className="absolute top-2 right-2 bg-background/80 hover:bg-background rounded-full p-1"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="flex items-center justify-between mt-4 pt-4 border-t border-border">
        <div className="flex gap-2">
          <Button 
            variant="ghost" 
            size="sm" 
            className="text-muted-foreground"
            onClick={() => imageInputRef.current?.click()}
            disabled={mediaFiles.length >= 4 || isPosting}
          >
            <ImageIcon className="h-4 w-4 mr-2" />
            Photo
          </Button>
          <Button 
            variant="ghost" 
            size="sm" 
            className="text-muted-foreground"
            onClick={() => videoInputRef.current?.click()}
            disabled={mediaFiles.length >= 4 || isPosting}
          >
            <Play className="h-4 w-4 mr-2" />
            Video
          </Button>
        </div>
        <Button 
          variant="hero" 
          size="sm" 
          onClick={handlePost}
          disabled={(!postContent.trim() && mediaFiles.length === 0) || isPosting || uploading}
        >
          {(isPosting || uploading) ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Post'}
        </Button>
      </div>
    </div>
  );
}

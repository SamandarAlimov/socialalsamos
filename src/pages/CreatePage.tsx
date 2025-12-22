import { useState, useRef, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Slider } from '@/components/ui/slider';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/contexts/AuthContext';
import { useFileUpload } from '@/hooks/useFileUpload';
import { usePosts } from '@/hooks/usePosts';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { 
  Image as ImageIcon, 
  Video, 
  Music, 
  X, 
  Loader2,
  Plus,
  ChevronLeft,
  ChevronRight,
  Play,
  Pause,
  Volume2,
  VolumeX,
  Crop,
  Type,
  Sparkles,
  Globe,
  Users,
  Lock,
  MapPin,
  Hash,
  AtSign,
  Smile,
  FileText,
  Upload,
  Camera,
  Film,
  Mic,
  Palette,
  Filter,
  RotateCcw,
  ZoomIn,
  Trash2
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { EmojiPicker } from '@/components/EmojiPicker';

// Predefined music tracks (in a real app, these would come from a backend)
const MUSIC_TRACKS = [
  { id: '1', name: 'Chill Vibes', artist: 'Alsamos Music', duration: 30, url: 'https://www.soundjay.com/misc/sounds/bell-ringing-05.mp3' },
  { id: '2', name: 'Summer Days', artist: 'Mood Beats', duration: 30, url: 'https://www.soundjay.com/misc/sounds/bell-ringing-04.mp3' },
  { id: '3', name: 'Night Drive', artist: 'Lo-Fi House', duration: 30, url: 'https://www.soundjay.com/misc/sounds/bell-ringing-03.mp3' },
  { id: '4', name: 'Golden Hour', artist: 'Sunset Sound', duration: 30, url: 'https://www.soundjay.com/misc/sounds/bell-ringing-02.mp3' },
  { id: '5', name: 'City Lights', artist: 'Urban Mix', duration: 30, url: 'https://www.soundjay.com/misc/sounds/bell-ringing-01.mp3' },
];

// Image filters
const FILTERS = [
  { id: 'none', name: 'Normal', style: '' },
  { id: 'grayscale', name: 'B&W', style: 'grayscale(100%)' },
  { id: 'sepia', name: 'Sepia', style: 'sepia(100%)' },
  { id: 'warm', name: 'Warm', style: 'sepia(30%) saturate(140%)' },
  { id: 'cool', name: 'Cool', style: 'saturate(80%) hue-rotate(20deg)' },
  { id: 'vivid', name: 'Vivid', style: 'saturate(150%) contrast(110%)' },
  { id: 'fade', name: 'Fade', style: 'contrast(90%) brightness(110%)' },
  { id: 'vintage', name: 'Vintage', style: 'sepia(40%) contrast(90%)' },
];

interface MediaFile {
  id: string;
  file?: File;
  url: string;
  type: 'image' | 'video' | 'audio';
  filter?: string;
  musicTrack?: typeof MUSIC_TRACKS[0];
  musicStartTime?: number;
  thumbnail?: string;
}

export default function CreatePage() {
  const navigate = useNavigate();
  const { user, profile } = useAuth();
  const { uploadFile, uploadMultiple, uploading, progress } = useFileUpload();
  const { createPost } = usePosts();

  // State
  const [activeTab, setActiveTab] = useState<'post' | 'story' | 'reel'>('post');
  const [postContent, setPostContent] = useState('');
  const [mediaFiles, setMediaFiles] = useState<MediaFile[]>([]);
  const [currentMediaIndex, setCurrentMediaIndex] = useState(0);
  const [isPosting, setIsPosting] = useState(false);
  const [visibility, setVisibility] = useState<'public' | 'friends' | 'private'>('public');
  const [location, setLocation] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState('');
  const [showMusicPicker, setShowMusicPicker] = useState(false);
  const [showFilterPicker, setShowFilterPicker] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [selectedFilter, setSelectedFilter] = useState('none');
  const [playingAudio, setPlayingAudio] = useState<string | null>(null);
  const [musicVolume, setMusicVolume] = useState(50);

  // Refs
  const imageInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const currentMedia = mediaFiles[currentMediaIndex];

  // Handle file selection
  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>, type: 'image' | 'video') => {
    const files = e.target.files;
    if (!files) return;

    const maxFiles = activeTab === 'post' ? 10 : 1;
    const newFiles = Array.from(files).slice(0, maxFiles - mediaFiles.length);

    const newMediaFiles: MediaFile[] = newFiles.map(file => ({
      id: `${Date.now()}-${Math.random().toString(36).substring(7)}`,
      file,
      url: URL.createObjectURL(file),
      type,
      filter: 'none',
    }));

    setMediaFiles(prev => [...prev, ...newMediaFiles]);
    e.target.value = '';
  }, [activeTab, mediaFiles.length]);

  // Remove media
  const removeMedia = useCallback((id: string) => {
    setMediaFiles(prev => {
      const fileToRemove = prev.find(f => f.id === id);
      if (fileToRemove?.file) {
        URL.revokeObjectURL(fileToRemove.url);
      }
      const newFiles = prev.filter(f => f.id !== id);
      if (currentMediaIndex >= newFiles.length && newFiles.length > 0) {
        setCurrentMediaIndex(newFiles.length - 1);
      }
      return newFiles;
    });
  }, [currentMediaIndex]);

  // Apply filter to current media
  const applyFilter = useCallback((filterId: string) => {
    if (!currentMedia) return;
    setMediaFiles(prev => prev.map(f => 
      f.id === currentMedia.id ? { ...f, filter: filterId } : f
    ));
    setSelectedFilter(filterId);
  }, [currentMedia]);

  // Add music to current media
  const addMusicToMedia = useCallback((track: typeof MUSIC_TRACKS[0]) => {
    if (!currentMedia || currentMedia.type !== 'image') return;
    setMediaFiles(prev => prev.map(f => 
      f.id === currentMedia.id ? { ...f, musicTrack: track, musicStartTime: 0 } : f
    ));
    setShowMusicPicker(false);
    toast.success(`Added "${track.name}" to your image`);
  }, [currentMedia]);

  // Remove music from current media
  const removeMusicFromMedia = useCallback(() => {
    if (!currentMedia) return;
    setMediaFiles(prev => prev.map(f => 
      f.id === currentMedia.id ? { ...f, musicTrack: undefined, musicStartTime: undefined } : f
    ));
  }, [currentMedia]);

  // Preview music
  const toggleMusicPreview = useCallback((trackUrl: string) => {
    if (audioRef.current) {
      if (playingAudio === trackUrl) {
        audioRef.current.pause();
        setPlayingAudio(null);
      } else {
        audioRef.current.src = trackUrl;
        audioRef.current.volume = musicVolume / 100;
        audioRef.current.play();
        setPlayingAudio(trackUrl);
      }
    }
  }, [playingAudio, musicVolume]);

  // Add tag
  const addTag = useCallback(() => {
    const tag = tagInput.trim().replace(/^#/, '');
    if (tag && !tags.includes(tag) && tags.length < 30) {
      setTags(prev => [...prev, tag]);
      setTagInput('');
    }
  }, [tagInput, tags]);

  // Remove tag
  const removeTag = useCallback((tag: string) => {
    setTags(prev => prev.filter(t => t !== tag));
  }, []);

  // Add emoji to content
  const addEmoji = useCallback((emoji: string) => {
    setPostContent(prev => prev + emoji);
    setShowEmojiPicker(false);
    textareaRef.current?.focus();
  }, []);

  // Handle post submission
  const handlePost = async () => {
    if (!postContent.trim() && mediaFiles.length === 0) {
      toast.error('Please add some content or media');
      return;
    }

    setIsPosting(true);

    try {
      // Upload all media files
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

      // Determine media type
      let mediaType = 'text';
      if (mediaFiles.length > 0) {
        const firstMedia = mediaFiles[0];
        if (firstMedia.type === 'video') {
          mediaType = 'video';
        } else if (firstMedia.type === 'image') {
          mediaType = firstMedia.musicTrack ? 'image_music' : 'image';
        }
      }

      // Build content with tags and location
      let finalContent = postContent;
      if (tags.length > 0) {
        finalContent += '\n\n' + tags.map(t => `#${t}`).join(' ');
      }
      if (location) {
        finalContent += `\n📍 ${location}`;
      }

      // Create the post
      const result = await createPost(finalContent, uploadedUrls, mediaType);

      if (result) {
        toast.success('Post created successfully!');
        navigate('/home');
      }
    } catch (error) {
      console.error('Error creating post:', error);
      toast.error('Failed to create post');
    } finally {
      setIsPosting(false);
    }
  };

  // Create story
  const handleCreateStory = async () => {
    if (mediaFiles.length === 0) {
      toast.error('Please add an image or video');
      return;
    }

    setIsPosting(true);

    try {
      const media = mediaFiles[0];
      let mediaUrl = media.url;

      if (media.file) {
        const result = await uploadFile(media.file);
        if (result) {
          mediaUrl = result.url;
        }
      }

      const { error } = await supabase.from('stories').insert({
        user_id: user?.id,
        media_url: mediaUrl,
        media_type: media.type,
        caption: postContent || null,
      });

      if (error) throw error;

      toast.success('Story created!');
      navigate('/home');
    } catch (error) {
      console.error('Error creating story:', error);
      toast.error('Failed to create story');
    } finally {
      setIsPosting(false);
    }
  };

  // Cleanup URLs on unmount
  useEffect(() => {
    return () => {
      mediaFiles.forEach(f => {
        if (f.file) URL.revokeObjectURL(f.url);
      });
    };
  }, []);

  return (
    <div className="min-h-screen bg-background">
      <audio ref={audioRef} onEnded={() => setPlayingAudio(null)} />

      {/* Header */}
      <div className="sticky top-0 z-50 bg-background/80 backdrop-blur-xl border-b border-border">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
            <X className="h-5 w-5" />
          </Button>
          <h1 className="text-lg font-semibold">Create</h1>
          <Button 
            variant="hero" 
            size="sm"
            onClick={activeTab === 'story' ? handleCreateStory : handlePost}
            disabled={isPosting || uploading}
          >
            {isPosting || uploading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : activeTab === 'story' ? 'Share Story' : 'Post'}
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <div className="max-w-4xl mx-auto px-4 py-4">
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)}>
          <TabsList className="grid grid-cols-3 mb-6">
            <TabsTrigger value="post" className="gap-2">
              <FileText className="h-4 w-4" />
              Post
            </TabsTrigger>
            <TabsTrigger value="story" className="gap-2">
              <Camera className="h-4 w-4" />
              Story
            </TabsTrigger>
            <TabsTrigger value="reel" className="gap-2">
              <Film className="h-4 w-4" />
              Reel
            </TabsTrigger>
          </TabsList>

          {/* Post Tab */}
          <TabsContent value="post" className="space-y-6">
            {/* Author Info */}
            <div className="flex items-center gap-3">
              <Avatar className="h-12 w-12 border-2 border-primary">
                <AvatarImage src={profile?.avatar_url || ''} />
                <AvatarFallback className="bg-primary text-primary-foreground">
                  {profile?.display_name?.[0] || 'U'}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1">
                <p className="font-semibold">{profile?.display_name || 'User'}</p>
                <Select value={visibility} onValueChange={(v: any) => setVisibility(v)}>
                  <SelectTrigger className="h-7 w-32 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="public">
                      <div className="flex items-center gap-2">
                        <Globe className="h-3 w-3" /> Public
                      </div>
                    </SelectItem>
                    <SelectItem value="friends">
                      <div className="flex items-center gap-2">
                        <Users className="h-3 w-3" /> Friends
                      </div>
                    </SelectItem>
                    <SelectItem value="private">
                      <div className="flex items-center gap-2">
                        <Lock className="h-3 w-3" /> Only me
                      </div>
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Text Input */}
            <div className="relative">
              <Textarea
                ref={textareaRef}
                value={postContent}
                onChange={(e) => setPostContent(e.target.value)}
                placeholder="What's on your mind?"
                className="min-h-[120px] text-lg bg-transparent border-none resize-none focus-visible:ring-0 p-0"
              />
              <div className="absolute bottom-2 right-2">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                >
                  <Smile className="h-5 w-5 text-muted-foreground" />
                </Button>
                {showEmojiPicker && (
                  <div className="absolute bottom-full right-0 mb-2">
                    <EmojiPicker onSelect={addEmoji} />
                  </div>
                )}
              </div>
            </div>

            {/* Media Preview */}
            {mediaFiles.length > 0 && (
              <div className="space-y-4">
                {/* Main Preview */}
                <div className="relative aspect-square max-h-[500px] rounded-2xl overflow-hidden bg-muted">
                  {currentMedia?.type === 'video' ? (
                    <video
                      src={currentMedia.url}
                      className="w-full h-full object-contain"
                      controls
                      style={{ filter: FILTERS.find(f => f.id === currentMedia.filter)?.style }}
                    />
                  ) : (
                    <img
                      src={currentMedia?.url}
                      alt="Preview"
                      className="w-full h-full object-contain"
                      style={{ filter: FILTERS.find(f => f.id === currentMedia?.filter)?.style }}
                    />
                  )}

                  {/* Music indicator */}
                  {currentMedia?.musicTrack && (
                    <div className="absolute bottom-4 left-4 right-4 bg-background/90 backdrop-blur-sm rounded-xl p-3 flex items-center gap-3">
                      <div className="w-10 h-10 bg-primary rounded-lg flex items-center justify-center">
                        <Music className="h-5 w-5 text-primary-foreground" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium truncate">{currentMedia.musicTrack.name}</p>
                        <p className="text-sm text-muted-foreground truncate">{currentMedia.musicTrack.artist}</p>
                      </div>
                      <Button variant="ghost" size="icon" onClick={removeMusicFromMedia}>
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  )}

                  {/* Remove button */}
                  <Button
                    variant="secondary"
                    size="icon"
                    className="absolute top-2 right-2"
                    onClick={() => currentMedia && removeMedia(currentMedia.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>

                  {/* Navigation arrows */}
                  {mediaFiles.length > 1 && (
                    <>
                      <Button
                        variant="secondary"
                        size="icon"
                        className="absolute left-2 top-1/2 -translate-y-1/2"
                        onClick={() => setCurrentMediaIndex(i => Math.max(0, i - 1))}
                        disabled={currentMediaIndex === 0}
                      >
                        <ChevronLeft className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="secondary"
                        size="icon"
                        className="absolute right-2 top-1/2 -translate-y-1/2"
                        onClick={() => setCurrentMediaIndex(i => Math.min(mediaFiles.length - 1, i + 1))}
                        disabled={currentMediaIndex === mediaFiles.length - 1}
                      >
                        <ChevronRight className="h-4 w-4" />
                      </Button>
                    </>
                  )}

                  {/* Dots indicator */}
                  {mediaFiles.length > 1 && (
                    <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-1.5">
                      {mediaFiles.map((_, i) => (
                        <button
                          key={i}
                          onClick={() => setCurrentMediaIndex(i)}
                          className={cn(
                            "w-2 h-2 rounded-full transition-colors",
                            i === currentMediaIndex ? "bg-primary" : "bg-foreground/30"
                          )}
                        />
                      ))}
                    </div>
                  )}
                </div>

                {/* Thumbnails */}
                {mediaFiles.length > 1 && (
                  <ScrollArea className="w-full">
                    <div className="flex gap-2 pb-2">
                      {mediaFiles.map((media, i) => (
                        <button
                          key={media.id}
                          onClick={() => setCurrentMediaIndex(i)}
                          className={cn(
                            "relative w-16 h-16 rounded-lg overflow-hidden flex-shrink-0 border-2 transition-colors",
                            i === currentMediaIndex ? "border-primary" : "border-transparent"
                          )}
                        >
                          {media.type === 'video' ? (
                            <>
                              <video src={media.url} className="w-full h-full object-cover" />
                              <div className="absolute inset-0 flex items-center justify-center bg-background/50">
                                <Play className="h-4 w-4" />
                              </div>
                            </>
                          ) : (
                            <img src={media.url} alt="" className="w-full h-full object-cover" />
                          )}
                        </button>
                      ))}
                    </div>
                  </ScrollArea>
                )}

                {/* Edit Tools */}
                <div className="flex gap-2 overflow-x-auto pb-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setShowFilterPicker(true)}
                    className="flex-shrink-0"
                  >
                    <Filter className="h-4 w-4 mr-2" />
                    Filters
                  </Button>
                  {currentMedia?.type === 'image' && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setShowMusicPicker(true)}
                      className="flex-shrink-0"
                    >
                      <Music className="h-4 w-4 mr-2" />
                      Add Music
                    </Button>
                  )}
                </div>
              </div>
            )}

            {/* Media Upload Buttons */}
            <div className="grid grid-cols-2 gap-3">
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
              <Button
                variant="outline"
                size="lg"
                className="h-24 flex-col gap-2"
                onClick={() => imageInputRef.current?.click()}
                disabled={mediaFiles.length >= 10}
              >
                <ImageIcon className="h-8 w-8 text-primary" />
                <span>Add Photos</span>
              </Button>
              <Button
                variant="outline"
                size="lg"
                className="h-24 flex-col gap-2"
                onClick={() => videoInputRef.current?.click()}
                disabled={mediaFiles.length >= 10}
              >
                <Video className="h-8 w-8 text-primary" />
                <span>Add Video</span>
              </Button>
            </div>

            {/* Location */}
            <div className="flex items-center gap-2 p-3 rounded-xl bg-secondary/50">
              <MapPin className="h-5 w-5 text-muted-foreground" />
              <Input
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="Add location"
                className="border-none bg-transparent focus-visible:ring-0 p-0"
              />
            </div>

            {/* Tags */}
            <div className="space-y-3">
              <div className="flex items-center gap-2 p-3 rounded-xl bg-secondary/50">
                <Hash className="h-5 w-5 text-muted-foreground" />
                <Input
                  value={tagInput}
                  onChange={(e) => setTagInput(e.target.value)}
                  placeholder="Add tags"
                  className="border-none bg-transparent focus-visible:ring-0 p-0"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      addTag();
                    }
                  }}
                />
              </div>
              {tags.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {tags.map(tag => (
                    <Badge key={tag} variant="secondary" className="gap-1">
                      #{tag}
                      <button onClick={() => removeTag(tag)}>
                        <X className="h-3 w-3" />
                      </button>
                    </Badge>
                  ))}
                </div>
              )}
            </div>

            {/* Upload Progress */}
            {uploading && (
              <div className="bg-secondary rounded-xl p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm">Uploading...</span>
                  <span className="text-sm font-medium">{Math.round(progress)}%</span>
                </div>
                <div className="h-2 bg-muted rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-primary transition-all"
                    style={{ width: `${progress}%` }}
                  />
                </div>
              </div>
            )}
          </TabsContent>

          {/* Story Tab */}
          <TabsContent value="story" className="space-y-6">
            {mediaFiles.length === 0 ? (
              <div className="aspect-[9/16] max-h-[600px] rounded-2xl bg-gradient-to-br from-primary/20 to-accent/20 border-2 border-dashed border-primary/50 flex flex-col items-center justify-center gap-4">
                <div className="w-20 h-20 rounded-full bg-primary/20 flex items-center justify-center">
                  <Camera className="h-10 w-10 text-primary" />
                </div>
                <p className="text-lg font-medium">Create Your Story</p>
                <p className="text-sm text-muted-foreground">Add a photo or video</p>
                <div className="flex gap-3">
                  <Button onClick={() => imageInputRef.current?.click()}>
                    <ImageIcon className="h-4 w-4 mr-2" />
                    Photo
                  </Button>
                  <Button variant="outline" onClick={() => videoInputRef.current?.click()}>
                    <Video className="h-4 w-4 mr-2" />
                    Video
                  </Button>
                </div>
              </div>
            ) : (
              <div className="relative aspect-[9/16] max-h-[600px] rounded-2xl overflow-hidden bg-muted">
                {currentMedia?.type === 'video' ? (
                  <video
                    src={currentMedia.url}
                    className="w-full h-full object-cover"
                    controls
                    style={{ filter: FILTERS.find(f => f.id === currentMedia.filter)?.style }}
                  />
                ) : (
                  <img
                    src={currentMedia?.url}
                    alt="Story preview"
                    className="w-full h-full object-cover"
                    style={{ filter: FILTERS.find(f => f.id === currentMedia?.filter)?.style }}
                  />
                )}

                {/* Story caption */}
                <div className="absolute bottom-20 left-4 right-4">
                  <Input
                    value={postContent}
                    onChange={(e) => setPostContent(e.target.value)}
                    placeholder="Add a caption..."
                    className="bg-background/80 backdrop-blur-sm"
                  />
                </div>

                {/* Music indicator */}
                {currentMedia?.musicTrack && (
                  <div className="absolute bottom-4 left-4 right-4 bg-background/90 backdrop-blur-sm rounded-xl p-2 flex items-center gap-2">
                    <Music className="h-4 w-4" />
                    <span className="text-sm truncate">{currentMedia.musicTrack.name}</span>
                    <Button variant="ghost" size="icon" className="h-6 w-6 ml-auto" onClick={removeMusicFromMedia}>
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                )}

                {/* Tools */}
                <div className="absolute top-4 right-4 flex flex-col gap-2">
                  <Button variant="secondary" size="icon" onClick={() => currentMedia && removeMedia(currentMedia.id)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                  <Button variant="secondary" size="icon" onClick={() => setShowFilterPicker(true)}>
                    <Filter className="h-4 w-4" />
                  </Button>
                  {currentMedia?.type === 'image' && (
                    <Button variant="secondary" size="icon" onClick={() => setShowMusicPicker(true)}>
                      <Music className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </div>
            )}

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
          </TabsContent>

          {/* Reel Tab */}
          <TabsContent value="reel" className="space-y-6">
            {mediaFiles.length === 0 ? (
              <div className="aspect-[9/16] max-h-[600px] rounded-2xl bg-gradient-to-br from-accent/20 to-primary/20 border-2 border-dashed border-accent/50 flex flex-col items-center justify-center gap-4">
                <div className="w-20 h-20 rounded-full bg-accent/20 flex items-center justify-center">
                  <Film className="h-10 w-10 text-accent" />
                </div>
                <p className="text-lg font-medium">Create a Reel</p>
                <p className="text-sm text-muted-foreground">Record or upload a video</p>
                <Button onClick={() => videoInputRef.current?.click()}>
                  <Video className="h-4 w-4 mr-2" />
                  Select Video
                </Button>
              </div>
            ) : (
              <div className="relative aspect-[9/16] max-h-[600px] rounded-2xl overflow-hidden bg-muted">
                <video
                  src={currentMedia?.url}
                  className="w-full h-full object-cover"
                  controls
                />
                
                {/* Caption */}
                <div className="absolute bottom-4 left-4 right-4">
                  <Textarea
                    value={postContent}
                    onChange={(e) => setPostContent(e.target.value)}
                    placeholder="Write a caption..."
                    className="bg-background/80 backdrop-blur-sm resize-none"
                    rows={2}
                  />
                </div>

                {/* Remove button */}
                <Button
                  variant="secondary"
                  size="icon"
                  className="absolute top-4 right-4"
                  onClick={() => currentMedia && removeMedia(currentMedia.id)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            )}

            <input
              ref={videoInputRef}
              type="file"
              accept="video/*"
              className="hidden"
              onChange={(e) => handleFileSelect(e, 'video')}
            />
          </TabsContent>
        </Tabs>
      </div>

      {/* Filter Picker Dialog */}
      <Dialog open={showFilterPicker} onOpenChange={setShowFilterPicker}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Choose Filter</DialogTitle>
          </DialogHeader>
          <ScrollArea className="h-[300px]">
            <div className="grid grid-cols-4 gap-3">
              {FILTERS.map(filter => (
                <button
                  key={filter.id}
                  onClick={() => {
                    applyFilter(filter.id);
                    setShowFilterPicker(false);
                  }}
                  className={cn(
                    "rounded-xl overflow-hidden border-2 transition-colors",
                    currentMedia?.filter === filter.id ? "border-primary" : "border-transparent"
                  )}
                >
                  <div 
                    className="aspect-square bg-gradient-to-br from-primary/50 to-accent/50"
                    style={{ filter: filter.style }}
                  />
                  <p className="text-xs py-1 text-center">{filter.name}</p>
                </button>
              ))}
            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>

      {/* Music Picker Dialog */}
      <Dialog open={showMusicPicker} onOpenChange={setShowMusicPicker}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Music className="h-5 w-5" />
              Add Music to Photo
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {/* Volume slider */}
            <div className="flex items-center gap-3 p-3 bg-secondary/50 rounded-xl">
              <Volume2 className="h-4 w-4" />
              <Slider
                value={[musicVolume]}
                onValueChange={([v]) => {
                  setMusicVolume(v);
                  if (audioRef.current) audioRef.current.volume = v / 100;
                }}
                max={100}
                step={1}
                className="flex-1"
              />
              <span className="text-sm w-10 text-right">{musicVolume}%</span>
            </div>

            {/* Music tracks */}
            <ScrollArea className="h-[300px]">
              <div className="space-y-2">
                {MUSIC_TRACKS.map(track => (
                  <div
                    key={track.id}
                    className={cn(
                      "flex items-center gap-3 p-3 rounded-xl transition-colors cursor-pointer hover:bg-secondary/50",
                      currentMedia?.musicTrack?.id === track.id && "bg-primary/10"
                    )}
                    onClick={() => addMusicToMedia(track)}
                  >
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleMusicPreview(track.url);
                      }}
                    >
                      {playingAudio === track.url ? (
                        <Pause className="h-4 w-4" />
                      ) : (
                        <Play className="h-4 w-4" />
                      )}
                    </Button>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">{track.name}</p>
                      <p className="text-sm text-muted-foreground truncate">{track.artist}</p>
                    </div>
                    <span className="text-sm text-muted-foreground">{track.duration}s</span>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

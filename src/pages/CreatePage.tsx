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
import { useScheduledMessages } from '@/hooks/useScheduledMessages';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { 
  X, 
  Loader2,
  ChevronLeft,
  ChevronRight,
  Play,
  Globe,
  Users,
  Lock,
  MapPin,
  Hash,
  Smile,
  FileText,
  Camera,
  Film,
  Filter,
  Trash2,
  Radio,
  Music,
  Scissors,
  Type,
  Sparkles,
  Sticker,
  Pencil,
  Image as ImageIcon,
  CalendarClock
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { EmojiPicker } from '@/components/EmojiPicker';
import { LiveStreamBroadcast } from '@/components/live/LiveStreamBroadcast';
import { CameraVideoRecorder } from '@/components/create/CameraVideoRecorder';
import { MediaToolbar } from '@/components/create/MediaToolbar';
import { VideoEditor, VideoEditData } from '@/components/VideoEditor';
import { FilterPicker } from '@/components/create/filters/FilterPicker';
import { MusicPicker } from '@/components/create/MusicPicker';
import { TextBackgroundPicker } from '@/components/create/TextBackgroundPicker';
import { MentionCollaborator } from '@/components/create/MentionCollaborator';
import { EnhancedPollCreator, EnhancedPollData, createDefaultEnhancedPoll } from '@/components/create/EnhancedPollCreator';
import { FILTERS, TEXT_BACKGROUNDS, MUSIC_TRACKS } from '@/components/create/filters/FilterData';
import { StickerPicker, StickerData } from '@/components/create/StickerPicker';
import { DrawingCanvas } from '@/components/create/DrawingCanvas';
import { ARFaceFilters } from '@/components/create/ARFaceFilters';
import { SchedulePostDialog } from '@/components/create/SchedulePostDialog';
import { GifStickerPicker } from '@/components/create/GifStickerPicker';

interface MediaFile {
  id: string;
  file?: File;
  url: string;
  type: 'image' | 'video' | 'audio';
  filter?: string;
  musicTrack?: typeof MUSIC_TRACKS[0];
  musicStartTime?: number;
}

interface OverlayItem {
  id: string;
  type: 'sticker' | 'gif' | 'text' | 'drawing';
  content: string;
  x: number;
  y: number;
  scale: number;
  rotation: number;
}

interface Profile {
  id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
  is_verified?: boolean;
}

export default function CreatePage() {
  const navigate = useNavigate();
  const { user, profile } = useAuth();
  const { uploadFile, uploading, progress } = useFileUpload();
  const { createPost } = usePosts();

  // Core states
  const [activeTab, setActiveTab] = useState<'post' | 'story' | 'reel' | 'live'>('post');
  const [showLiveBroadcast, setShowLiveBroadcast] = useState(false);
  const [showCamera, setShowCamera] = useState(false);
  const [cameraMode, setCameraMode] = useState<'photo' | 'video' | 'both'>('both');
  const [postContent, setPostContent] = useState('');
  const [mediaFiles, setMediaFiles] = useState<MediaFile[]>([]);
  const [currentMediaIndex, setCurrentMediaIndex] = useState(0);
  const [isPosting, setIsPosting] = useState(false);
  const [visibility, setVisibility] = useState<'public' | 'friends' | 'private'>('public');
  const [location, setLocation] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState('');

  // Enhanced features
  const [poll, setPoll] = useState<EnhancedPollData | null>(null);
  const [textBackground, setTextBackground] = useState('none');
  const [mentionedUsers, setMentionedUsers] = useState<Profile[]>([]);
  const [collaborators, setCollaborators] = useState<Profile[]>([]);
  const [overlays, setOverlays] = useState<OverlayItem[]>([]);
  const [scheduledDate, setScheduledDate] = useState<Date | null>(null);
  
  // Dialogs
  const [showFilterPicker, setShowFilterPicker] = useState(false);
  const [showMusicPicker, setShowMusicPicker] = useState(false);
  const [showTextBackgroundPicker, setShowTextBackgroundPicker] = useState(false);
  const [showMentionPicker, setShowMentionPicker] = useState(false);
  const [showCollaboratorPicker, setShowCollaboratorPicker] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [showVideoEditor, setShowVideoEditor] = useState(false);
  const [videoEditData, setVideoEditData] = useState<VideoEditData | null>(null);
  const [showStickerPicker, setShowStickerPicker] = useState(false);
  const [showDrawingCanvas, setShowDrawingCanvas] = useState(false);
  const [showARFilters, setShowARFilters] = useState(false);
  const [showScheduleDialog, setShowScheduleDialog] = useState(false);
  const [showGifStickerPicker, setShowGifStickerPicker] = useState(false);

  const imageInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const currentMedia = mediaFiles[currentMediaIndex];
  const currentBg = TEXT_BACKGROUNDS.find(b => b.id === textBackground) || TEXT_BACKGROUNDS[0];

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

  const handleCameraCapture = useCallback((file: File, type: 'image' | 'video', url: string) => {
    const newMedia: MediaFile = {
      id: `${Date.now()}-${Math.random().toString(36).substring(7)}`,
      file,
      url,
      type,
      filter: 'none',
    };
    
    if (activeTab === 'post') {
      setMediaFiles(prev => [...prev, newMedia]);
    } else {
      setMediaFiles([newMedia]);
    }
    setShowCamera(false);
  }, [activeTab]);

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

  const applyFilter = useCallback((filterId: string) => {
    if (!currentMedia) return;
    setMediaFiles(prev => prev.map(f => 
      f.id === currentMedia.id ? { ...f, filter: filterId } : f
    ));
  }, [currentMedia]);

  const addMusicToMedia = useCallback((track: typeof MUSIC_TRACKS[0]) => {
    if (!currentMedia) return;
    setMediaFiles(prev => prev.map(f => 
      f.id === currentMedia.id ? { ...f, musicTrack: track, musicStartTime: 0 } : f
    ));
    toast.success(`Added "${track.name}" to your media`);
  }, [currentMedia]);

  const removeMusicFromMedia = useCallback(() => {
    if (!currentMedia) return;
    setMediaFiles(prev => prev.map(f => 
      f.id === currentMedia.id ? { ...f, musicTrack: undefined, musicStartTime: undefined } : f
    ));
  }, [currentMedia]);

  const addTag = useCallback(() => {
    const tag = tagInput.trim().replace(/^#/, '');
    if (tag && !tags.includes(tag) && tags.length < 30) {
      setTags(prev => [...prev, tag]);
      setTagInput('');
    }
  }, [tagInput, tags]);

  const removeTag = useCallback((tag: string) => {
    setTags(prev => prev.filter(t => t !== tag));
  }, []);

  const addEmoji = useCallback((emoji: string) => {
    setPostContent(prev => prev + emoji);
    setShowEmojiPicker(false);
    textareaRef.current?.focus();
  }, []);

  const openCamera = useCallback((mode: 'photo' | 'video' | 'both') => {
    setCameraMode(mode);
    setShowCamera(true);
  }, []);

  // Overlay management
  const addSticker = useCallback((sticker: StickerData) => {
    const overlay: OverlayItem = {
      id: `sticker-${Date.now()}`,
      type: 'sticker',
      content: sticker.url,
      x: 50,
      y: 50,
      scale: 1,
      rotation: 0
    };
    setOverlays(prev => [...prev, overlay]);
  }, []);

  const addGifOverlay = useCallback((gifUrl: string) => {
    const overlay: OverlayItem = {
      id: `gif-${Date.now()}`,
      type: 'gif',
      content: gifUrl,
      x: 50,
      y: 50,
      scale: 1,
      rotation: 0
    };
    setOverlays(prev => [...prev, overlay]);
  }, []);

  const removeOverlay = useCallback((id: string) => {
    setOverlays(prev => prev.filter(o => o.id !== id));
  }, []);

  const handleDrawingSave = useCallback((imageDataUrl: string) => {
    // Convert data URL to file and add as media
    fetch(imageDataUrl)
      .then(res => res.blob())
      .then(blob => {
        const file = new File([blob], `drawing-${Date.now()}.png`, { type: 'image/png' });
        const url = URL.createObjectURL(blob);
        const newMedia: MediaFile = {
          id: `${Date.now()}-drawing`,
          file,
          url,
          type: 'image',
          filter: 'none'
        };
        if (activeTab === 'post') {
          setMediaFiles(prev => [...prev, newMedia]);
        } else {
          setMediaFiles([newMedia]);
        }
      });
  }, [activeTab]);

  const handleARCapture = useCallback((file: File, url: string) => {
    const newMedia: MediaFile = {
      id: `${Date.now()}-ar`,
      file,
      url,
      type: 'image',
      filter: 'none'
    };
    if (activeTab === 'post') {
      setMediaFiles(prev => [...prev, newMedia]);
    } else {
      setMediaFiles([newMedia]);
    }
  }, [activeTab]);

  const handleSchedulePost = useCallback((date: Date) => {
    setScheduledDate(date);
    toast.success(`Post scheduled for ${date.toLocaleString()}`);
  }, []);

  // Calculate poll duration in milliseconds
  const getPollDuration = (poll: EnhancedPollData): number | null => {
    if (poll.durationType === 'unlimited') return null;
    
    if (poll.durationType === 'custom') {
      const days = poll.customDays || 0;
      const hours = poll.customHours || 0;
      const minutes = poll.customMinutes || 0;
      return (days * 24 * 60 + hours * 60 + minutes) * 60 * 1000;
    }
    
    // Preset durations
    const presetMs: Record<string, number> = {
      '1h': 60 * 60 * 1000,
      '6h': 6 * 60 * 60 * 1000,
      '12h': 12 * 60 * 60 * 1000,
      '1d': 24 * 60 * 60 * 1000,
      '3d': 3 * 24 * 60 * 60 * 1000,
      '7d': 7 * 24 * 60 * 60 * 1000,
      '30d': 30 * 24 * 60 * 60 * 1000,
      '1y': 365 * 24 * 60 * 60 * 1000,
    };
    return presetMs[poll.duration] || 24 * 60 * 60 * 1000;
  };

  const handlePost = async () => {
    if (!postContent.trim() && mediaFiles.length === 0 && !poll) {
      toast.error('Please add some content, media, or a poll');
      return;
    }

    if (poll && (!poll.question.trim() || poll.options.filter(o => o.text.trim()).length < 2)) {
      toast.error('Please complete your poll with a question and at least 2 options');
      return;
    }

    setIsPosting(true);

    try {
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

      let mediaType = 'text';
      if (poll) {
        mediaType = 'poll';
      } else if (mediaFiles.length > 0) {
        const firstMedia = mediaFiles[0];
        if (firstMedia.type === 'video') {
          mediaType = 'video';
        } else if (firstMedia.type === 'image') {
          mediaType = firstMedia.musicTrack ? 'image_music' : 'image';
        }
      }

      let finalContent = postContent;
      
      // Add mentions
      if (mentionedUsers.length > 0) {
        finalContent += '\n\n' + mentionedUsers.map(u => `@${u.username}`).join(' ');
      }
      
      // Add tags
      if (tags.length > 0) {
        finalContent += '\n\n' + tags.map(t => `#${t}`).join(' ');
      }
      
      // Add location
      if (location) {
        finalContent += `\n📍 ${location}`;
      }
      
      // Add collaborators
      if (collaborators.length > 0) {
        finalContent += `\n👥 with ${collaborators.map(c => c.display_name).join(', ')}`;
      }

      // Add text background info
      if (textBackground !== 'none' && !mediaFiles.length) {
        finalContent = `[TEXT_BG:${textBackground}]${finalContent}[/TEXT_BG]`;
      }
      
      // Add poll data to content if present
      if (poll) {
        const durationMs = getPollDuration(poll);
        const pollJson = JSON.stringify({
          type: 'poll',
          question: poll.question,
          options: poll.options.filter(o => o.text.trim()).map(o => ({ 
            id: o.id, 
            text: o.text, 
            emoji: o.emoji,
            votes: 0 
          })),
          duration: poll.durationType === 'unlimited' ? 'unlimited' : poll.duration,
          durationType: poll.durationType,
          expiresAt: durationMs ? new Date(Date.now() + durationMs).toISOString() : null,
          allowMultiple: poll.allowMultiple,
          isAnonymous: poll.isAnonymous,
          showResultsBeforeVote: poll.showResultsBeforeVote,
          quizMode: poll.quizMode,
          correctOptionId: poll.correctOptionId,
          createdAt: new Date().toISOString()
        });
        finalContent = `[POLL]${pollJson}[/POLL]\n${finalContent}`;
      }

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

  const handleCreateStory = async () => {
    if (mediaFiles.length === 0 && !postContent.trim()) {
      toast.error('Please add content or media');
      return;
    }

    setIsPosting(true);

    try {
      let mediaUrl = '';
      let mediaType: 'image' | 'video' = 'image';
      
      if (mediaFiles.length > 0) {
        const media = mediaFiles[0];
        mediaType = media.type === 'video' ? 'video' : 'image';
        
        if (media.file) {
          const result = await uploadFile(media.file);
          if (result) {
            mediaUrl = result.url;
          }
        } else {
          mediaUrl = media.url;
        }
      }

      let caption = postContent || null;

      // Store filter and music info in caption metadata
      if (currentMedia?.filter && currentMedia.filter !== 'none') {
        caption = `[FILTER:${currentMedia.filter}]${caption || ''}`;
      }
      if (currentMedia?.musicTrack) {
        caption = `[MUSIC:${currentMedia.musicTrack.id}]${caption || ''}`;
      }
      if (textBackground !== 'none') {
        caption = `[TEXT_BG:${textBackground}]${caption || ''}`;
      }

      const { error } = await supabase.from('stories').insert({
        user_id: user?.id,
        media_url: mediaUrl || null,
        media_type: mediaType,
        caption,
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

  const handleCreateReel = async () => {
    if (mediaFiles.length === 0) {
      toast.error('Please add a video');
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

      let finalContent = postContent;
      if (tags.length > 0) {
        finalContent += '\n\n' + tags.map(t => `#${t}`).join(' ');
      }
      if (location) {
        finalContent += `\n📍 ${location}`;
      }

      const result = await createPost(finalContent, [mediaUrl], 'video');

      if (result) {
        toast.success('Reel created!');
        navigate('/videos');
      }
    } catch (error) {
      console.error('Error creating reel:', error);
      toast.error('Failed to create reel');
    } finally {
      setIsPosting(false);
    }
  };

  useEffect(() => {
    return () => {
      mediaFiles.forEach(f => {
        if (f.file) URL.revokeObjectURL(f.url);
      });
    };
  }, []);

  // Camera view
  if (showCamera) {
    return (
      <CameraVideoRecorder
        mode={cameraMode}
        aspectRatio={activeTab === 'post' ? '1:1' : '9:16'}
        onCapture={handleCameraCapture}
        onClose={() => setShowCamera(false)}
      />
    );
  }

  return (
    <div className="min-h-screen bg-background pb-24 md:pb-4">
      <audio ref={audioRef} />
      
      <input
        ref={imageInputRef}
        type="file"
        accept="image/*"
        multiple={activeTab === 'post'}
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
            onClick={
              activeTab === 'story' ? handleCreateStory : 
              activeTab === 'reel' ? handleCreateReel : 
              handlePost
            }
            disabled={isPosting || uploading}
          >
            {isPosting || uploading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : activeTab === 'story' ? 'Share' : activeTab === 'reel' ? 'Post Reel' : 'Post'}
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <div className="max-w-4xl mx-auto px-4 py-4">
        <Tabs value={activeTab} onValueChange={(v) => {
          setActiveTab(v as any);
          setMediaFiles([]);
          setPoll(null);
          setTextBackground('none');
        }}>
          <TabsList className="grid grid-cols-4 mb-6">
            <TabsTrigger value="post" className="gap-2">
              <FileText className="h-4 w-4" />
              <span className="hidden sm:inline">Post</span>
            </TabsTrigger>
            <TabsTrigger value="story" className="gap-2">
              <Camera className="h-4 w-4" />
              <span className="hidden sm:inline">Story</span>
            </TabsTrigger>
            <TabsTrigger value="reel" className="gap-2">
              <Film className="h-4 w-4" />
              <span className="hidden sm:inline">Reel</span>
            </TabsTrigger>
            <TabsTrigger value="live" className="gap-2">
              <Radio className="h-4 w-4" />
              <span className="hidden sm:inline">Live</span>
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

            {/* Text Input with Optional Background */}
            <div 
              className={cn(
                "relative rounded-xl overflow-hidden transition-all",
                textBackground !== 'none' && !mediaFiles.length && "p-6 min-h-[200px] flex items-center justify-center"
              )}
              style={textBackground !== 'none' && !mediaFiles.length ? {
                background: currentBg.color,
              } : undefined}
            >
              <Textarea
                ref={textareaRef}
                value={postContent}
                onChange={(e) => setPostContent(e.target.value)}
                placeholder={poll ? "Add a description for your poll..." : "What's on your mind?"}
                className={cn(
                  "min-h-[100px] text-lg border-none resize-none focus-visible:ring-0",
                  textBackground !== 'none' && !mediaFiles.length 
                    ? `bg-transparent text-center text-xl font-semibold ${currentBg.textColor}` 
                    : "bg-transparent p-0"
                )}
              />
              <div className="absolute bottom-2 right-2 flex gap-1">
                {!mediaFiles.length && (
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setShowTextBackgroundPicker(true)}
                    className={cn(textBackground !== 'none' && currentBg.textColor)}
                  >
                    <Type className="h-5 w-5" />
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                  className={cn(textBackground !== 'none' && !mediaFiles.length && currentBg.textColor)}
                >
                  <Smile className="h-5 w-5" />
                </Button>
                {showEmojiPicker && (
                  <div className="absolute bottom-full right-0 mb-2 z-50">
                    <EmojiPicker onSelect={addEmoji} />
                  </div>
                )}
              </div>
            </div>

            {/* Collaborators & Mentions Display */}
            {(collaborators.length > 0 || mentionedUsers.length > 0) && (
              <div className="flex flex-wrap gap-2">
                {collaborators.map(user => (
                  <Badge key={user.id} variant="secondary" className="gap-1">
                    👥 {user.display_name}
                    <button onClick={() => setCollaborators(prev => prev.filter(u => u.id !== user.id))}>
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
                {mentionedUsers.map(user => (
                  <Badge key={user.id} variant="outline" className="gap-1">
                    @{user.username}
                    <button onClick={() => setMentionedUsers(prev => prev.filter(u => u.id !== user.id))}>
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
              </div>
            )}

            {/* Poll Creator */}
            {poll && (
              <EnhancedPollCreator 
                poll={poll} 
                onChange={setPoll} 
                onRemove={() => setPoll(null)} 
              />
            )}

            {/* Media Preview */}
            {mediaFiles.length > 0 && (
              <div className="space-y-4">
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

                  <Button
                    variant="secondary"
                    size="icon"
                    className="absolute top-2 right-2"
                    onClick={() => currentMedia && removeMedia(currentMedia.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>

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

                {/* Media Tools */}
                <div className="flex gap-2 overflow-x-auto pb-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setShowFilterPicker(true)}
                    className="flex-shrink-0 gap-2"
                  >
                    <Sparkles className="h-4 w-4" />
                    Filters
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setShowMusicPicker(true)}
                    className="flex-shrink-0 gap-2"
                  >
                    <Music className="h-4 w-4" />
                    Music
                  </Button>
                  {currentMedia?.type === 'video' && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setShowVideoEditor(true)}
                      className="flex-shrink-0 gap-2"
                    >
                      <Scissors className="h-4 w-4" />
                      Edit
                    </Button>
                  )}
                </div>
              </div>
            )}

            {/* Media Toolbar */}
            <MediaToolbar
              onImageClick={() => imageInputRef.current?.click()}
              onVideoClick={() => videoInputRef.current?.click()}
              onCameraClick={() => openCamera('both')}
              onPollClick={() => setPoll(poll ? null : createDefaultEnhancedPoll())}
              onMentionClick={() => setShowMentionPicker(true)}
              onCollaborateClick={() => setShowCollaboratorPicker(true)}
              onEmojiClick={() => setShowEmojiPicker(true)}
              onMusicClick={() => setShowMusicPicker(true)}
              onFilterClick={mediaFiles.length > 0 ? () => setShowFilterPicker(true) : undefined}
              onTextBackgroundClick={!mediaFiles.length ? () => setShowTextBackgroundPicker(true) : undefined}
              hasPoll={!!poll}
              hasMusic={!!currentMedia?.musicTrack}
              hasTextBackground={textBackground !== 'none'}
              disabled={mediaFiles.length >= 10}
              variant="post"
              showAll
              compact
            />

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
          <TabsContent value="story" className="space-y-6 flex flex-col items-center">
            {mediaFiles.length === 0 && !postContent.trim() ? (
              <div 
                className="aspect-[9/16] max-h-[600px] rounded-2xl border-2 border-dashed border-primary/50 flex flex-col items-center justify-center gap-4"
                style={{
                  background: textBackground !== 'none' ? currentBg.color : 'linear-gradient(135deg, hsl(var(--primary) / 0.2), hsl(var(--accent) / 0.2))'
                }}
              >
                {textBackground !== 'none' ? (
                  <div className="w-full px-8">
                    <Textarea
                      ref={textareaRef}
                      value={postContent}
                      onChange={(e) => setPostContent(e.target.value)}
                      placeholder="Type your story..."
                      className={cn(
                        "bg-transparent border-none text-center text-2xl font-bold resize-none focus-visible:ring-0",
                        currentBg.textColor
                      )}
                      rows={4}
                    />
                  </div>
                ) : (
                  <>
                    <div className="w-20 h-20 rounded-full bg-primary/20 flex items-center justify-center">
                      <Camera className="h-10 w-10 text-primary" />
                    </div>
                    <p className="text-lg font-medium">Create Your Story</p>
                    <p className="text-sm text-muted-foreground text-center px-4">
                      Take a photo, record a video, or create a text story
                    </p>
                  </>
                )}
                <div className="flex flex-col gap-3 w-48">
                  <Button onClick={() => openCamera('both')} className="w-full">
                    <Camera className="h-4 w-4 mr-2" />
                    Open Camera
                  </Button>
                  <div className="flex gap-2">
                    <Button variant="outline" onClick={() => imageInputRef.current?.click()} className="flex-1">
                      Photo
                    </Button>
                    <Button variant="outline" onClick={() => videoInputRef.current?.click()} className="flex-1">
                      Video
                    </Button>
                  </div>
                  <Button 
                    variant="outline" 
                    onClick={() => setShowTextBackgroundPicker(true)}
                    className="w-full gap-2"
                  >
                    <Type className="h-4 w-4" />
                    Text Story
                  </Button>
                </div>
              </div>
            ) : (
              <div className="relative aspect-[9/16] max-h-[600px] rounded-2xl overflow-hidden bg-muted">
                {mediaFiles.length > 0 ? (
                  currentMedia?.type === 'video' ? (
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
                  )
                ) : (
                  <div 
                    className="w-full h-full flex items-center justify-center p-8"
                    style={{ background: currentBg.color }}
                  >
                    <p className={cn("text-2xl font-bold text-center", currentBg.textColor)}>
                      {postContent}
                    </p>
                  </div>
                )}

                <div className="absolute bottom-20 left-4 right-4">
                  <Input
                    value={postContent}
                    onChange={(e) => setPostContent(e.target.value)}
                    placeholder="Add a caption..."
                    className="bg-background/80 backdrop-blur-sm"
                  />
                </div>

                {currentMedia?.musicTrack && (
                  <div className="absolute bottom-4 left-4 right-4 bg-background/90 backdrop-blur-sm rounded-xl p-2 flex items-center gap-2">
                    <Music className="h-4 w-4" />
                    <span className="text-sm truncate">{currentMedia.musicTrack.name}</span>
                    <Button variant="ghost" size="icon" className="h-6 w-6 ml-auto" onClick={removeMusicFromMedia}>
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                )}

                <div className="absolute top-4 right-4 flex flex-col gap-2">
                  <Button variant="secondary" size="icon" onClick={() => {
                    if (mediaFiles.length > 0 && currentMedia) {
                      removeMedia(currentMedia.id);
                    } else {
                      setPostContent('');
                      setTextBackground('none');
                    }
                  }}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                  {mediaFiles.length > 0 && (
                    <Button variant="secondary" size="icon" onClick={() => setShowFilterPicker(true)}>
                      <Sparkles className="h-4 w-4" />
                    </Button>
                  )}
                  <Button variant="secondary" size="icon" onClick={() => setShowMusicPicker(true)}>
                    <Music className="h-4 w-4" />
                  </Button>
                  <Button variant="secondary" size="icon" onClick={() => setShowTextBackgroundPicker(true)}>
                    <Type className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            )}
          </TabsContent>

          {/* Reel Tab */}
          <TabsContent value="reel" className="space-y-6 flex flex-col items-center">
            {mediaFiles.length === 0 ? (
              <div className="aspect-[9/16] max-h-[600px] rounded-2xl bg-gradient-to-br from-accent/20 to-primary/20 border-2 border-dashed border-accent/50 flex flex-col items-center justify-center gap-4">
                <div className="w-20 h-20 rounded-full bg-accent/20 flex items-center justify-center">
                  <Film className="h-10 w-10 text-accent-foreground" />
                </div>
                <p className="text-lg font-medium">Create a Reel</p>
                <p className="text-sm text-muted-foreground text-center px-4">
                  Record a video or choose from your gallery
                </p>
                <div className="flex flex-col gap-3 w-48">
                  <Button onClick={() => openCamera('video')} className="w-full bg-red-500 hover:bg-red-600">
                    <Camera className="h-4 w-4 mr-2" />
                    Record Video
                  </Button>
                  <Button variant="outline" onClick={() => videoInputRef.current?.click()} className="w-full">
                    Choose Video
                  </Button>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="relative aspect-[9/16] max-h-[600px] rounded-2xl overflow-hidden bg-muted">
                  <video
                    src={currentMedia?.url}
                    className="w-full h-full object-cover"
                    controls
                    style={{ filter: FILTERS.find(f => f.id === currentMedia?.filter)?.style }}
                  />
                  
                  <div className="absolute bottom-4 left-4 right-4 space-y-3">
                    <Textarea
                      value={postContent}
                      onChange={(e) => setPostContent(e.target.value)}
                      placeholder="Write a caption..."
                      className="bg-background/80 backdrop-blur-sm resize-none"
                      rows={2}
                    />
                    
                    <div className="flex items-center gap-2">
                      <Hash className="h-4 w-4 text-muted-foreground" />
                      <Input
                        value={tagInput}
                        onChange={(e) => setTagInput(e.target.value)}
                        placeholder="Add hashtags"
                        className="bg-background/80 backdrop-blur-sm"
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            addTag();
                          }
                        }}
                      />
                    </div>
                    
                    {tags.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {tags.map(tag => (
                          <Badge key={tag} variant="secondary" className="text-xs gap-1">
                            #{tag}
                            <button onClick={() => removeTag(tag)}>
                              <X className="h-2 w-2" />
                            </button>
                          </Badge>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="absolute top-4 right-4 flex flex-col gap-2">
                    <Button
                      variant="secondary"
                      size="icon"
                      onClick={() => currentMedia && removeMedia(currentMedia.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="secondary"
                      size="icon"
                      onClick={() => setShowFilterPicker(true)}
                    >
                      <Sparkles className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="secondary"
                      size="icon"
                      onClick={() => setShowMusicPicker(true)}
                    >
                      <Music className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="secondary"
                      size="icon"
                      onClick={() => setShowVideoEditor(true)}
                    >
                      <Scissors className="h-4 w-4" />
                    </Button>
                  </div>
                </div>

                {videoEditData && (
                  <div className="p-3 rounded-xl bg-secondary/50 text-sm">
                    <div className="flex items-center gap-2 text-primary">
                      <Scissors className="h-4 w-4" />
                      <span className="font-medium">Video edited</span>
                    </div>
                    <p className="text-muted-foreground text-xs mt-1">
                      Trimmed from {Math.floor(videoEditData.trimStart)}s to {Math.floor(videoEditData.trimEnd)}s
                      {videoEditData.rotation > 0 && ` • Rotated ${videoEditData.rotation}°`}
                    </p>
                  </div>
                )}
              </div>
            )}
          </TabsContent>

          {/* Live Tab */}
          <TabsContent value="live" className="space-y-6">
            <div className="text-center py-8">
              <div className="w-20 h-20 mx-auto bg-red-500/10 rounded-full flex items-center justify-center mb-4">
                <Radio className="h-10 w-10 text-red-500" />
              </div>
              <h3 className="text-xl font-semibold mb-2">Go Live</h3>
              <p className="text-muted-foreground mb-6 max-w-sm mx-auto">
                Broadcast live video to your followers in real-time. They can comment and react to your stream.
              </p>
              <Button 
                size="lg" 
                className="bg-red-500 hover:bg-red-600 text-white"
                onClick={() => setShowLiveBroadcast(true)}
              >
                <Radio className="h-5 w-5 mr-2" />
                Start Live Video
              </Button>
            </div>
          </TabsContent>
        </Tabs>
      </div>

      {/* Live Broadcast Modal */}
      {showLiveBroadcast && (
        <LiveStreamBroadcast 
          onClose={() => setShowLiveBroadcast(false)}
        />
      )}

      {/* Filter Picker Dialog */}
      <FilterPicker
        open={showFilterPicker}
        onOpenChange={setShowFilterPicker}
        currentFilter={currentMedia?.filter || 'none'}
        onSelectFilter={applyFilter}
        previewUrl={currentMedia?.url}
        mediaType={currentMedia?.type === 'video' ? 'video' : 'image'}
      />

      {/* Music Picker Dialog */}
      <MusicPicker
        open={showMusicPicker}
        onOpenChange={setShowMusicPicker}
        currentTrack={currentMedia?.musicTrack}
        onSelectTrack={addMusicToMedia}
      />

      {/* Text Background Picker */}
      <TextBackgroundPicker
        open={showTextBackgroundPicker}
        onOpenChange={setShowTextBackgroundPicker}
        currentBackground={textBackground}
        onSelectBackground={setTextBackground}
        previewText={postContent || 'Your text here'}
      />

      {/* Mention Picker */}
      <MentionCollaborator
        open={showMentionPicker}
        onOpenChange={setShowMentionPicker}
        selectedUsers={mentionedUsers}
        onSelectUser={(user) => setMentionedUsers(prev => [...prev, user])}
        onRemoveUser={(id) => setMentionedUsers(prev => prev.filter(u => u.id !== id))}
        mode="mention"
        maxUsers={10}
      />

      {/* Collaborator Picker */}
      <MentionCollaborator
        open={showCollaboratorPicker}
        onOpenChange={setShowCollaboratorPicker}
        selectedUsers={collaborators}
        onSelectUser={(user) => setCollaborators(prev => [...prev, user])}
        onRemoveUser={(id) => setCollaborators(prev => prev.filter(u => u.id !== id))}
        mode="collaborate"
        maxUsers={5}
      />

      {/* Video Editor Dialog */}
      {currentMedia?.type === 'video' && (
        <VideoEditor
          videoUrl={currentMedia.url}
          open={showVideoEditor}
          onSave={(editData) => {
            setVideoEditData(editData);
            setShowVideoEditor(false);
            toast.success('Video edits saved!');
          }}
          onCancel={() => setShowVideoEditor(false)}
        />
      )}

      {/* Sticker Picker */}
      <StickerPicker
        open={showStickerPicker}
        onOpenChange={setShowStickerPicker}
        onSelect={addSticker}
      />

      {/* Drawing Canvas */}
      <DrawingCanvas
        open={showDrawingCanvas}
        onOpenChange={setShowDrawingCanvas}
        backgroundImage={currentMedia?.url}
        onSave={handleDrawingSave}
      />

      {/* AR Face Filters */}
      <ARFaceFilters
        open={showARFilters}
        onOpenChange={setShowARFilters}
        onCapture={handleARCapture}
      />

      {/* Schedule Post Dialog */}
      <SchedulePostDialog
        open={showScheduleDialog}
        onOpenChange={setShowScheduleDialog}
        onSchedule={handleSchedulePost}
      />

      {/* GIF & Sticker Picker */}
      <GifStickerPicker
        open={showGifStickerPicker}
        onOpenChange={setShowGifStickerPicker}
        onSelectGif={addGifOverlay}
        onSelectSticker={(url) => {
          const overlay: OverlayItem = {
            id: `sticker-${Date.now()}`,
            type: 'sticker',
            content: url,
            x: 50, y: 50, scale: 1, rotation: 0
          };
          setOverlays(prev => [...prev, overlay]);
        }}
      />
    </div>
  );
}

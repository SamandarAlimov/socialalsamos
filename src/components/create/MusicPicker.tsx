import { useState, useRef, useCallback } from 'react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Slider } from '@/components/ui/slider';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { MUSIC_TRACKS, MUSIC_CATEGORIES } from './filters/FilterData';
import { useFileUpload } from '@/hooks/useFileUpload';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { Music, Play, Pause, Volume2, Search, Check, Plus, Upload, Loader2 } from 'lucide-react';

type Track = typeof MUSIC_TRACKS[0];

interface MusicPickerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentTrack?: Track | null;
  onSelectTrack: (track: Track) => void;
}

const getAudioDuration = (file: File): Promise<number> =>
  new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const audio = new Audio(url);
    audio.addEventListener('loadedmetadata', () => {
      const d = Number.isFinite(audio.duration) ? Math.round(audio.duration) : 30;
      URL.revokeObjectURL(url);
      resolve(d);
    });
    audio.addEventListener('error', () => {
      URL.revokeObjectURL(url);
      resolve(30);
    });
  });

export function MusicPicker({
  open,
  onOpenChange,
  currentTrack,
  onSelectTrack
}: MusicPickerProps) {
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [playingTrackId, setPlayingTrackId] = useState<string | null>(null);
  const [volume, setVolume] = useState(70);
  const [deviceTracks, setDeviceTracks] = useState<Track[]>([]);
  const audioRef = useRef<HTMLAudioElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { uploadFile, uploading } = useFileUpload();

  const allTracks: Track[] = [...deviceTracks, ...MUSIC_TRACKS];

  const filteredTracks = allTracks.filter(track => {

    const matchesCategory = selectedCategory === 'all' || track.category === selectedCategory;
    const matchesSearch = !searchQuery || 
      track.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      track.artist.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  const togglePlay = useCallback((track: typeof MUSIC_TRACKS[0]) => {
    if (!audioRef.current) return;
    
    if (playingTrackId === track.id) {
      audioRef.current.pause();
      setPlayingTrackId(null);
    } else {
      audioRef.current.src = track.url;
      audioRef.current.volume = volume / 100;
      audioRef.current.play();
      setPlayingTrackId(track.id);
    }
  }, [playingTrackId, volume]);

  const handleSelectTrack = (track: typeof MUSIC_TRACKS[0]) => {
    onSelectTrack(track);
    if (audioRef.current) {
      audioRef.current.pause();
    }
    setPlayingTrackId(null);
    onOpenChange(false);
  };

  const handleVolumeChange = (newVolume: number[]) => {
    setVolume(newVolume[0]);
    if (audioRef.current) {
      audioRef.current.volume = newVolume[0] / 100;
    }
  };

  const handleDeviceFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    if (!file.type.startsWith('audio/')) {
      toast.error('Faqat audio fayl tanlang');
      return;
    }
    if (file.size > 20 * 1024 * 1024) {
      toast.error('Audio hajmi 20MB dan oshmasligi kerak');
      return;
    }

    const duration = await getAudioDuration(file);
    const uploaded = await uploadFile(file);
    if (!uploaded) {
      toast.error('Musiqani yuklab bo\'lmadi');
      return;
    }

    const track: Track = {
      id: `device-${Date.now()}`,
      name: file.name.replace(/\.[^/.]+$/, ''),
      artist: 'Mening musiqam',
      duration,
      category: selectedCategory === 'all' ? 'all' : selectedCategory,
      url: uploaded.url,
    };

    setDeviceTracks(prev => [track, ...prev]);
    toast.success('Musiqa qo\'shildi');
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto overscroll-contain">
        <audio ref={audioRef} onEnded={() => setPlayingTrackId(null)} />
        <input
          ref={fileInputRef}
          type="file"
          accept="audio/*,.mp3,.m4a,.wav,.aac,.ogg,.flac"
          className="hidden"
          onChange={handleDeviceFile}
        />

        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Music className="h-5 w-5 text-primary" />
            Add Music
          </DialogTitle>
        </DialogHeader>

        {/* Upload from device */}
        <Button
          variant="outline"
          className="w-full gap-2"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
        >
          {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
          {uploading ? 'Yuklanmoqda...' : 'Qurilmadan musiqa qo\'shish'}
        </Button>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search songs or artists..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>


        {/* Volume Control */}
        <div className="flex items-center gap-3 p-3 bg-secondary/50 rounded-xl">
          <Volume2 className="h-4 w-4 text-muted-foreground" />
          <Slider
            value={[volume]}
            onValueChange={handleVolumeChange}
            max={100}
            step={1}
            className="flex-1"
          />
          <span className="text-sm w-10 text-right">{volume}%</span>
        </div>

        {/* Category Tabs */}
        <Tabs value={selectedCategory} onValueChange={setSelectedCategory}>
          <ScrollArea className="w-full">
            <TabsList className="inline-flex w-max gap-1 p-1">
              {MUSIC_CATEGORIES.map(cat => (
                <TabsTrigger
                  key={cat.id}
                  value={cat.id}
                  className="px-4 py-2 text-sm whitespace-nowrap"
                >
                  {cat.name}
                </TabsTrigger>
              ))}
            </TabsList>
          </ScrollArea>
        </Tabs>

        {/* Tracks List */}
        <ScrollArea className="h-[300px]">
          <div className="space-y-2">
            {filteredTracks.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                No tracks found
              </div>
            ) : (
              filteredTracks.map(track => (
                <div
                  key={track.id}
                  className={cn(
                    "flex items-center gap-3 p-3 rounded-xl transition-colors",
                    currentTrack?.id === track.id 
                      ? "bg-primary/10 border border-primary/30"
                      : "hover:bg-secondary/50"
                  )}
                >
                  {/* Play Button */}
                  <button
                    onClick={() => togglePlay(track)}
                    className={cn(
                      "w-10 h-10 rounded-full flex items-center justify-center transition-colors",
                      playingTrackId === track.id
                        ? "bg-primary text-primary-foreground"
                        : "bg-primary/20 hover:bg-primary/30"
                    )}
                  >
                    {playingTrackId === track.id ? (
                      <Pause className="h-4 w-4" />
                    ) : (
                      <Play className="h-4 w-4 ml-0.5" />
                    )}
                  </button>

                  {/* Track Info */}
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">{track.name}</p>
                    <p className="text-sm text-muted-foreground truncate">{track.artist}</p>
                  </div>

                  {/* Duration */}
                  <span className="text-xs text-muted-foreground">{track.duration}s</span>

                  {/* Select Button */}
                  <Button
                    size="sm"
                    variant={currentTrack?.id === track.id ? "default" : "outline"}
                    onClick={() => handleSelectTrack(track)}
                    className="gap-1"
                  >
                    {currentTrack?.id === track.id ? (
                      <>
                        <Check className="h-3 w-3" />
                        Selected
                      </>
                    ) : (
                      <>
                        <Plus className="h-3 w-3" />
                        Use
                      </>
                    )}
                  </Button>
                </div>
              ))
            )}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}

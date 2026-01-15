import { useState } from 'react';
import { FileText, Download, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { VideoMessagePlayer } from './messages/VideoMessagePlayer';
import { VoiceMessagePlayer } from './VoiceMessagePlayer';
import { AudioFilePlayer } from './messages/AudioFilePlayer';
import { cn } from '@/lib/utils';
import { Dialog, DialogContent } from '@/components/ui/dialog';

interface MessageAttachmentProps {
  url: string;
  type: 'image' | 'video' | 'audio' | 'document';
  name?: string;
  isMine?: boolean;
  autoPlay?: boolean;
  senderName?: string;
}

export function MessageAttachment({ url, type, name, isMine, autoPlay = false, senderName }: MessageAttachmentProps) {
  const [showFullscreen, setShowFullscreen] = useState(false);
  
  // Check if it's a GIF
  const isGif = url.includes('giphy.com') || url.includes('.gif') || url.includes('[media:gif:');

  // Check if it's a music/audio file (not voice message)
  const isVoiceMessage = name?.toLowerCase().includes('voice') || url.includes('voice') || !name;
  const isMusicFile = type === 'audio' && name && !isVoiceMessage;

  if (type === 'image' || isGif) {
    const actualUrl = url.startsWith('[media:gif:') 
      ? url.replace('[media:gif:', '').replace(']', '') 
      : url;
    
    return (
      <>
        <div 
          className="relative rounded-xl overflow-hidden max-w-[280px] cursor-pointer"
          onClick={() => setShowFullscreen(true)}
        >
          <img
            src={actualUrl}
            alt={name || 'Image'}
            className="w-full h-auto object-cover hover:opacity-95 transition-opacity"
            loading="lazy"
          />
        </div>

        <Dialog open={showFullscreen} onOpenChange={setShowFullscreen}>
          <DialogContent className="max-w-[95vw] max-h-[95vh] p-0 bg-transparent border-none">
            <img
              src={actualUrl}
              alt={name || 'Image'}
              className="w-full h-full object-contain"
            />
          </DialogContent>
        </Dialog>
      </>
    );
  }

  if (type === 'video') {
    return <VideoMessagePlayer url={url} isMine={isMine} autoPlay={autoPlay} />;
  }

  if (type === 'audio') {
    // Use AudioFilePlayer for music files, VoiceMessagePlayer for voice messages
    if (isMusicFile) {
      return <AudioFilePlayer url={url} name={name} isMine={isMine} senderName={senderName} />;
    }
    return <VoiceMessagePlayer url={url} isMine={isMine} autoPlay={autoPlay} />;
  }

  // Document type
  const fileName = name || url.split('/').pop() || 'Document';
  const fileExtension = fileName.split('.').pop()?.toUpperCase() || 'FILE';
  
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(
        "flex items-center gap-3 p-3 rounded-xl transition-colors min-w-[200px]",
        isMine
          ? "bg-primary-foreground/10 hover:bg-primary-foreground/20"
          : "bg-muted hover:bg-muted/80"
      )}
    >
      <div className={cn(
        "h-10 w-10 rounded-lg flex items-center justify-center flex-shrink-0",
        isMine ? "bg-primary-foreground/20" : "bg-primary/10"
      )}>
        <FileText className={cn(
          "h-5 w-5",
          isMine ? "text-primary-foreground" : "text-primary"
        )} />
      </div>
      <div className="flex-1 min-w-0">
        <p className={cn(
          "text-sm font-medium truncate",
          isMine ? "text-primary-foreground" : "text-foreground"
        )}>
          {fileName}
        </p>
        <p className={cn(
          "text-xs",
          isMine ? "text-primary-foreground/60" : "text-muted-foreground"
        )}>
          {fileExtension}
        </p>
      </div>
      <Download className={cn(
        "h-4 w-4 flex-shrink-0",
        isMine ? "text-primary-foreground/60" : "text-muted-foreground"
      )} />
    </a>
  );
}

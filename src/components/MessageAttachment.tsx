import { FileText, Download, Play, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { VideoMessagePlayer } from './messages/VideoMessagePlayer';
import { VoiceMessagePlayer } from './VoiceMessagePlayer';

interface MessageAttachmentProps {
  url: string;
  type: 'image' | 'video' | 'audio' | 'document';
  name?: string;
  isMine?: boolean;
}

export function MessageAttachment({ url, type, name, isMine }: MessageAttachmentProps) {
  // Check if it's a GIF
  const isGif = url.includes('giphy.com') || url.includes('.gif') || url.includes('[media:gif:');

  if (type === 'image' || isGif) {
    const actualUrl = url.startsWith('[media:gif:') 
      ? url.replace('[media:gif:', '').replace(']', '') 
      : url;
    
    return (
      <div className="relative rounded-lg overflow-hidden max-w-xs">
        <img
          src={actualUrl}
          alt={name || 'Image'}
          className="w-full h-auto object-cover cursor-pointer hover:opacity-90 transition-opacity"
          onClick={() => window.open(actualUrl, '_blank')}
          loading="lazy"
        />
      </div>
    );
  }

  if (type === 'video') {
    return <VideoMessagePlayer url={url} isMine={isMine} />;
  }

  if (type === 'audio') {
    return <VoiceMessagePlayer url={url} isMine={isMine} />;
  }

  // Document type
  return (
    <div className="flex items-center gap-3 p-3 bg-accent rounded-lg max-w-xs">
      <FileText className="h-8 w-8 text-muted-foreground shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="font-medium text-sm truncate">{name || 'Document'}</p>
        <p className="text-xs text-muted-foreground">Click to download</p>
      </div>
      <Button
        variant="ghost"
        size="icon"
        asChild
      >
        <a href={url} target="_blank" rel="noopener noreferrer" download>
          <Download className="h-4 w-4" />
        </a>
      </Button>
    </div>
  );
}

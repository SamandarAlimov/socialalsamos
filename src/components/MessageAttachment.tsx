import { FileText, Download, Play, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface MessageAttachmentProps {
  url: string;
  type: 'image' | 'video' | 'audio' | 'document';
  name?: string;
}

export function MessageAttachment({ url, type, name }: MessageAttachmentProps) {
  if (type === 'image') {
    return (
      <div className="relative rounded-lg overflow-hidden max-w-xs">
        <img
          src={url}
          alt={name || 'Image'}
          className="w-full h-auto object-cover cursor-pointer hover:opacity-90 transition-opacity"
          onClick={() => window.open(url, '_blank')}
        />
      </div>
    );
  }

  if (type === 'video') {
    return (
      <div className="relative rounded-lg overflow-hidden max-w-xs">
        <video
          src={url}
          controls
          className="w-full h-auto"
          preload="metadata"
        >
          Your browser does not support video playback.
        </video>
      </div>
    );
  }

  if (type === 'audio') {
    return (
      <div className="flex items-center gap-2 p-3 bg-accent rounded-lg">
        <Play className="h-5 w-5" />
        <audio src={url} controls className="h-8" />
      </div>
    );
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

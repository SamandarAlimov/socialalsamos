import { useState } from 'react';
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle 
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { 
  Copy, 
  Check, 
  Twitter, 
  Facebook, 
  Send, 
  MessageCircle,
  Mail,
  Link2
} from 'lucide-react';
import { toast } from 'sonner';

interface VideoShareDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  videoId: string;
  videoTitle?: string;
}

export function VideoShareDialog({ 
  open, 
  onOpenChange, 
  videoId, 
  videoTitle 
}: VideoShareDialogProps) {
  const [copied, setCopied] = useState(false);
  
  const shareUrl = `${window.location.origin}/videos?v=${videoId}`;
  const shareText = videoTitle || 'Check out this video!';
  
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      toast.success('Link copied to clipboard');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('Failed to copy link');
    }
  };
  
  const handleNativeShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: shareText,
          text: shareText,
          url: shareUrl,
        });
      } catch (err) {
        if ((err as Error).name !== 'AbortError') {
          toast.error('Failed to share');
        }
      }
    }
  };
  
  const shareOptions = [
    {
      name: 'Twitter',
      icon: Twitter,
      color: 'hover:bg-[#1DA1F2]/10 hover:text-[#1DA1F2]',
      url: `https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}&url=${encodeURIComponent(shareUrl)}`,
    },
    {
      name: 'Facebook',
      icon: Facebook,
      color: 'hover:bg-[#4267B2]/10 hover:text-[#4267B2]',
      url: `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(shareUrl)}`,
    },
    {
      name: 'WhatsApp',
      icon: MessageCircle,
      color: 'hover:bg-[#25D366]/10 hover:text-[#25D366]',
      url: `https://wa.me/?text=${encodeURIComponent(`${shareText} ${shareUrl}`)}`,
    },
    {
      name: 'Telegram',
      icon: Send,
      color: 'hover:bg-[#0088cc]/10 hover:text-[#0088cc]',
      url: `https://t.me/share/url?url=${encodeURIComponent(shareUrl)}&text=${encodeURIComponent(shareText)}`,
    },
    {
      name: 'Email',
      icon: Mail,
      color: 'hover:bg-muted',
      url: `mailto:?subject=${encodeURIComponent(shareText)}&body=${encodeURIComponent(`${shareText}\n\n${shareUrl}`)}`,
    },
  ];
  
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Share Video</DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4">
          {/* Deep Link Input */}
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Link2 className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                value={shareUrl}
                readOnly
                className="pl-10 pr-4 bg-muted/50"
              />
            </div>
            <Button
              variant="outline"
              size="icon"
              onClick={handleCopy}
              className="shrink-0"
            >
              {copied ? (
                <Check className="h-4 w-4 text-green-500" />
              ) : (
                <Copy className="h-4 w-4" />
              )}
            </Button>
          </div>
          
          {/* Social Media Share Buttons */}
          <div className="grid grid-cols-5 gap-2">
            {shareOptions.map((option) => (
              <Button
                key={option.name}
                variant="ghost"
                className={`flex flex-col items-center gap-1 h-auto py-3 ${option.color}`}
                onClick={() => window.open(option.url, '_blank', 'width=600,height=400')}
              >
                <option.icon className="h-5 w-5" />
                <span className="text-xs">{option.name}</span>
              </Button>
            ))}
          </div>
          
          {/* Native Share Button (Mobile) */}
          {navigator.share && (
            <Button 
              variant="default" 
              className="w-full"
              onClick={handleNativeShare}
            >
              <Send className="h-4 w-4 mr-2" />
              Share via...
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

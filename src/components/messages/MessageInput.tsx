import { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { 
  Send, 
  Paperclip, 
  X, 
  Image as ImageIcon, 
  FileText, 
  Film,
  Loader2,
  Bold,
  Italic,
  Underline,
  Strikethrough,
  Code,
  Quote,
  Clock,
} from 'lucide-react';
import { EmojiPicker } from '@/components/EmojiPicker';
import { TelegramMediaRecorder } from './TelegramMediaRecorder';
import { LocationShareButton } from './LocationShareButton';
import { ScheduleMessageDialog } from './ScheduleMessageDialog';
import { MentionAutocomplete } from '@/components/MentionAutocomplete';
import { useFileUpload } from '@/hooks/useFileUpload';
import { useMentionInput } from '@/hooks/useMentionInput';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';

interface ReplyTo {
  id: string;
  content: string;
  sender_name: string;
}

interface MessageInputProps {
  onSend: (content: string, mediaUrl?: string, mediaType?: string) => Promise<any>;
  onSchedule?: (scheduledFor: Date, content: string, mediaUrl?: string, mediaType?: string) => Promise<any>;
  onTyping: (isTyping: boolean) => void;
  replyTo?: ReplyTo | null;
  onCancelReply?: () => void;
  disabled?: boolean;
  onShareLocation?: (location: { latitude: number; longitude: number; address?: string }) => void;
}

export function MessageInput({ 
  onSend, 
  onSchedule,
  onTyping, 
  replyTo, 
  onCancelReply,
  disabled,
  onShareLocation
}: MessageInputProps) {
  const { uploadFile, uploading, getFileType } = useFileUpload();
  const [message, setMessage] = useState('');
  const [pendingAttachment, setPendingAttachment] = useState<{ url: string; type: string; name: string } | null>(null);
  const [showFormatting, setShowFormatting] = useState(false);
  const [showScheduleDialog, setShowScheduleDialog] = useState(false);
  const [attachmentOpen, setAttachmentOpen] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const imageVideoInputRef = useRef<HTMLInputElement>(null);
  const documentInputRef = useRef<HTMLInputElement>(null);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const longPressTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const { mentionState, handleInputChange: handleMentionChange, insertMention, closeMention } = useMentionInput();

  useEffect(() => {
    if (replyTo) {
      inputRef.current?.focus();
    }

    return () => {
      // Prevent "stuck typing" when leaving the chat / unmounting
      onTyping(false);
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
    };
  }, [replyTo, onTyping]);

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value;
    const cursorPosition = e.target.selectionStart || 0;
    
    handleMentionChange(value, cursorPosition, setMessage);
    
    onTyping(true);
    
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }
    
    typingTimeoutRef.current = setTimeout(() => {
      onTyping(false);
    }, 2000);
  };

  const handleMentionSelect = (username: string) => {
    const newValue = insertMention(message, username, inputRef);
    setMessage(newValue);
  };

  const handleSend = async () => {
    if (!message.trim() && !pendingAttachment) return;
    
    await onSend(
      message || (pendingAttachment ? `[${pendingAttachment.name}]` : ''),
      pendingAttachment?.url,
      pendingAttachment?.type
    );
    
    setMessage('');
    setPendingAttachment(null);
    onTyping(false);
    
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleFileUpload = (url: string, type: string, name: string) => {
    setPendingAttachment({ url, type, name });
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Check file size (20MB limit)
    if (file.size > 20 * 1024 * 1024) {
      toast.error('File size must be less than 20MB');
      return;
    }

    const result = await uploadFile(file);
    if (result) {
      handleFileUpload(result.url, getFileType(result.type), result.name);
      toast.success('File uploaded successfully');
      setAttachmentOpen(false);
    } else {
      toast.error('Failed to upload file');
    }

    // Reset input
    e.target.value = '';
  };

  const insertFormatting = (format: string) => {
    const textarea = inputRef.current;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selectedText = message.substring(start, end);
    
    let formattedText = '';
    switch (format) {
      case 'bold':
        formattedText = `**${selectedText || 'text'}**`;
        break;
      case 'italic':
        formattedText = `_${selectedText || 'text'}_`;
        break;
      case 'underline':
        formattedText = `__${selectedText || 'text'}__`;
        break;
      case 'strikethrough':
        formattedText = `~~${selectedText || 'text'}~~`;
        break;
      case 'code':
        formattedText = `\`${selectedText || 'code'}\``;
        break;
      case 'quote':
        formattedText = `> ${selectedText || 'quote'}`;
        break;
      case 'spoiler':
        formattedText = `||${selectedText || 'spoiler'}||`;
        break;
      default:
        formattedText = selectedText;
    }

    const newMessage = message.substring(0, start) + formattedText + message.substring(end);
    setMessage(newMessage);
    
    setTimeout(() => {
      textarea.focus();
      textarea.selectionStart = start + formattedText.length;
      textarea.selectionEnd = start + formattedText.length;
    }, 0);
  };

  return (
    <div className="bg-card p-3 relative z-10">
      {/* Hidden file inputs */}
      <input
        ref={imageVideoInputRef}
        type="file"
        accept="image/*,video/*"
        className="hidden"
        onChange={handleFileSelect}
      />
      <input
        ref={documentInputRef}
        type="file"
        accept=".pdf,.doc,.docx,.txt,.xlsx,.xls,.pptx,.ppt"
        className="hidden"
        onChange={handleFileSelect}
      />

      {/* Reply Preview */}
      {replyTo && (
        <div className="flex items-center gap-2 mb-2 px-3 py-2 bg-muted/50 rounded-lg border-l-2 border-primary">
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium text-primary">{replyTo.sender_name}</p>
            <p className="text-sm text-muted-foreground truncate">{replyTo.content}</p>
          </div>
          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={onCancelReply}>
            <X className="h-4 w-4" />
          </Button>
        </div>
      )}

      {/* Pending Attachment Preview */}
      {pendingAttachment && (
        <div className="flex items-center gap-2 mb-2 px-3 py-2 bg-muted/50 rounded-lg">
          {pendingAttachment.type === 'image' ? (
            <img src={pendingAttachment.url} alt="Preview" className="h-12 w-12 object-cover rounded" />
          ) : pendingAttachment.type === 'video' ? (
            <div className="h-12 w-12 bg-accent rounded flex items-center justify-center">
              <Film className="h-5 w-5 text-primary" />
            </div>
          ) : (
            <div className="h-12 w-12 bg-accent rounded flex items-center justify-center">
              <FileText className="h-5 w-5" />
            </div>
          )}
          <span className="flex-1 text-sm truncate">{pendingAttachment.name}</span>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setPendingAttachment(null)}>
            <X className="h-4 w-4" />
          </Button>
        </div>
      )}

      <div className="flex items-end gap-2">
        {/* Attachment Button */}
        <Popover open={attachmentOpen} onOpenChange={setAttachmentOpen}>
          <PopoverTrigger asChild>
            <Button variant="ghost" size="icon" className="h-10 w-10 flex-shrink-0" disabled={uploading}>
              {uploading ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <Paperclip className="h-5 w-5" />
              )}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-56 p-2" align="start">
            <button
              onClick={() => imageVideoInputRef.current?.click()}
              className="w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-accent transition-colors text-left"
            >
              <ImageIcon className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm">Photo or Video</span>
            </button>
            <button
              onClick={() => documentInputRef.current?.click()}
              className="w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-accent transition-colors text-left"
            >
              <FileText className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm">Document</span>
            </button>
            {onShareLocation && (
              <LocationShareButton onShareLocation={onShareLocation} />
            )}
          </PopoverContent>
        </Popover>

        {/* Message Input */}
        <div className="flex-1 relative">
          <textarea
            ref={inputRef}
            value={message}
            onChange={handleInputChange}
            onKeyDown={(e) => {
              // Prevent sending when mention autocomplete is open and using navigation keys
              if (mentionState.isActive && ['ArrowDown', 'ArrowUp', 'Enter', 'Tab'].includes(e.key)) {
                return; // Let MentionAutocomplete handle these
              }
              handleKeyDown(e);
            }}
            placeholder="Write a message... Use @ to mention"
            disabled={disabled}
            rows={1}
            className={cn(
              "w-full px-4 py-2.5 pr-12 rounded-2xl bg-muted/50 border border-border text-sm resize-none",
              "focus:outline-none focus:ring-2 focus:ring-primary/50",
              "min-h-[44px] max-h-[120px]",
              disabled && "opacity-50 cursor-not-allowed"
            )}
            style={{ height: 'auto' }}
            onInput={(e) => {
              const target = e.target as HTMLTextAreaElement;
              target.style.height = 'auto';
              target.style.height = Math.min(target.scrollHeight, 120) + 'px';
            }}
          />
          
          {/* Mention Autocomplete */}
          {mentionState.isActive && (
            <MentionAutocomplete
              query={mentionState.query}
              onSelect={handleMentionSelect}
              onClose={closeMention}
              className="bottom-full left-0 mb-1"
            />
          )}
          
          {/* Emoji Picker */}
          <div className="absolute right-3 top-1/2 -translate-y-1/2">
            <EmojiPicker 
              onSelect={(emoji) => setMessage(prev => prev + emoji)}
              className="text-muted-foreground hover:text-foreground h-8 w-8"
            />
          </div>
        </div>

        {/* Send / Voice-Video Button */}
        {message.trim() || pendingAttachment ? (
          <Button 
            variant="default" 
            size="icon" 
            className="h-10 w-10 rounded-full flex-shrink-0"
            onClick={handleSend}
            onMouseDown={() => {
              if (onSchedule) {
                longPressTimeoutRef.current = setTimeout(() => {
                  setShowScheduleDialog(true);
                }, 500);
              }
            }}
            onMouseUp={() => {
              if (longPressTimeoutRef.current) {
                clearTimeout(longPressTimeoutRef.current);
              }
            }}
            onMouseLeave={() => {
              if (longPressTimeoutRef.current) {
                clearTimeout(longPressTimeoutRef.current);
              }
            }}
            onTouchStart={() => {
              if (onSchedule) {
                longPressTimeoutRef.current = setTimeout(() => {
                  setShowScheduleDialog(true);
                }, 500);
              }
            }}
            onTouchEnd={() => {
              if (longPressTimeoutRef.current) {
                clearTimeout(longPressTimeoutRef.current);
              }
            }}
            disabled={disabled}
          >
            <Send className="h-5 w-5" />
          </Button>
        ) : (
          <TelegramMediaRecorder 
            onSend={(url, duration, type) => {
              const durationStr = `${Math.floor(duration / 60)}:${(duration % 60).toString().padStart(2, '0')}`;
              onSend(`${type === 'video' ? 'Video' : 'Voice'} message (${durationStr})`, url, type);
            }}
          />
        )}
      </div>

      {/* Schedule Message Dialog */}
      {onSchedule && (
        <ScheduleMessageDialog
          open={showScheduleDialog}
          onOpenChange={setShowScheduleDialog}
          messagePreview={message || (pendingAttachment ? `[${pendingAttachment.name}]` : '')}
          onSchedule={async (scheduledFor) => {
            await onSchedule(
              scheduledFor,
              message || (pendingAttachment ? `[${pendingAttachment.name}]` : ''),
              pendingAttachment?.url,
              pendingAttachment?.type
            );
            setMessage('');
            setPendingAttachment(null);
          }}
        />
      )}

      {/* Formatting Toolbar */}
      {showFormatting && (
        <div className="flex items-center gap-1 mt-2 px-2">
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => insertFormatting('bold')}>
            <Bold className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => insertFormatting('italic')}>
            <Italic className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => insertFormatting('underline')}>
            <Underline className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => insertFormatting('strikethrough')}>
            <Strikethrough className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => insertFormatting('code')}>
            <Code className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => insertFormatting('quote')}>
            <Quote className="h-4 w-4" />
          </Button>
        </div>
      )}
    </div>
  );
}

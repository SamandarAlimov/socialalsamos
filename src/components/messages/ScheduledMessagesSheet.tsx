import { useState } from 'react';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Clock, Trash2, Edit, Image, FileText, Mic, Video } from 'lucide-react';
import { format } from 'date-fns';
import { useScheduledMessages, ScheduledMessage } from '@/hooks/useScheduledMessages';
import { cn } from '@/lib/utils';

interface ScheduledMessagesSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  conversationId?: string;
}

function getMediaIcon(mediaType: string | null) {
  if (!mediaType) return null;
  if (mediaType.startsWith('image')) return <Image className="h-4 w-4" />;
  if (mediaType.startsWith('video')) return <Video className="h-4 w-4" />;
  if (mediaType === 'voice' || mediaType.startsWith('audio')) return <Mic className="h-4 w-4" />;
  return <FileText className="h-4 w-4" />;
}

export function ScheduledMessagesSheet({
  open,
  onOpenChange,
  conversationId
}: ScheduledMessagesSheetProps) {
  const { scheduledMessages, isLoading, cancelScheduledMessage } = useScheduledMessages(conversationId);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const handleDelete = async (id: string) => {
    setDeletingId(id);
    await cancelScheduledMessage(id);
    setDeletingId(null);
  };

  const groupedMessages = scheduledMessages.reduce((acc, msg) => {
    const dateKey = format(new Date(msg.scheduled_for), 'yyyy-MM-dd');
    if (!acc[dateKey]) acc[dateKey] = [];
    acc[dateKey].push(msg);
    return acc;
  }, {} as Record<string, ScheduledMessage[]>);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-md">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5" />
            Scheduled Messages
          </SheetTitle>
        </SheetHeader>

        <ScrollArea className="h-[calc(100vh-100px)] mt-4">
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin h-6 w-6 border-2 border-primary border-t-transparent rounded-full" />
            </div>
          ) : scheduledMessages.length === 0 ? (
            <div className="text-center py-12">
              <Clock className="h-12 w-12 mx-auto text-muted-foreground/50 mb-3" />
              <p className="text-muted-foreground">No scheduled messages</p>
              <p className="text-sm text-muted-foreground/70 mt-1">
                Long press the send button to schedule a message
              </p>
            </div>
          ) : (
            <div className="space-y-6">
              {Object.entries(groupedMessages).map(([dateKey, messages]) => (
                <div key={dateKey}>
                  <h3 className="text-sm font-medium text-muted-foreground mb-3">
                    {format(new Date(dateKey), 'EEEE, MMMM d')}
                  </h3>
                  <div className="space-y-2">
                    {messages.map((msg) => (
                      <div
                        key={msg.id}
                        className={cn(
                          "p-3 rounded-lg bg-muted/50 border border-border",
                          deletingId === msg.id && "opacity-50"
                        )}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <Clock className="h-3.5 w-3.5 text-primary" />
                              <span className="text-sm font-medium text-primary">
                                {format(new Date(msg.scheduled_for), 'p')}
                              </span>
                              {msg.media_type && (
                                <span className="text-muted-foreground">
                                  {getMediaIcon(msg.media_type)}
                                </span>
                              )}
                            </div>
                            {msg.content && (
                              <p className="text-sm text-foreground line-clamp-2">
                                {msg.content}
                              </p>
                            )}
                            {msg.media_url && !msg.content && (
                              <p className="text-sm text-muted-foreground italic">
                                {msg.media_type?.startsWith('image') ? 'Photo' :
                                 msg.media_type?.startsWith('video') ? 'Video' :
                                 msg.media_type === 'voice' ? 'Voice message' : 'Attachment'}
                              </p>
                            )}
                          </div>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-destructive hover:text-destructive"
                            onClick={() => handleDelete(msg.id)}
                            disabled={deletingId === msg.id}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}

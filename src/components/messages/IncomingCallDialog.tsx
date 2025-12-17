import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Phone, PhoneOff, Video } from 'lucide-react';
import { useEffect, useState } from 'react';

interface IncomingCallDialogProps {
  isOpen: boolean;
  callerName: string;
  callerAvatar?: string;
  callType: 'audio' | 'video';
  onAccept: () => void;
  onDecline: () => void;
}

export function IncomingCallDialog({
  isOpen,
  callerName,
  callerAvatar,
  callType,
  onAccept,
  onDecline,
}: IncomingCallDialogProps) {
  const [isRinging, setIsRinging] = useState(false);

  // Play ringtone effect
  useEffect(() => {
    if (isOpen) {
      setIsRinging(true);
      // Could add actual audio ringtone here
    } else {
      setIsRinging(false);
    }
  }, [isOpen]);

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onDecline()}>
      <DialogContent className="sm:max-w-md bg-card/95 backdrop-blur-xl border-border/50">
        <div className="flex flex-col items-center py-6 space-y-6">
          {/* Caller Avatar with pulsing ring */}
          <div className="relative">
            <div 
              className={`absolute inset-0 rounded-full bg-primary/20 ${
                isRinging ? 'animate-ping' : ''
              }`}
              style={{ animationDuration: '1.5s' }}
            />
            <Avatar className="h-24 w-24 border-4 border-primary/30 relative">
              <AvatarImage src={callerAvatar} alt={callerName} />
              <AvatarFallback className="text-2xl bg-primary/20 text-primary">
                {callerName.slice(0, 2).toUpperCase()}
              </AvatarFallback>
            </Avatar>
          </div>

          {/* Call Info */}
          <div className="text-center space-y-1">
            <h3 className="text-xl font-semibold text-foreground">{callerName}</h3>
            <p className="text-muted-foreground flex items-center justify-center gap-2">
              {callType === 'video' ? (
                <>
                  <Video className="h-4 w-4" />
                  Incoming video call...
                </>
              ) : (
                <>
                  <Phone className="h-4 w-4" />
                  Incoming audio call...
                </>
              )}
            </p>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-6">
            <Button
              size="lg"
              variant="destructive"
              className="h-16 w-16 rounded-full"
              onClick={onDecline}
            >
              <PhoneOff className="h-6 w-6" />
            </Button>
            <Button
              size="lg"
              className="h-16 w-16 rounded-full bg-green-500 hover:bg-green-600"
              onClick={onAccept}
            >
              {callType === 'video' ? (
                <Video className="h-6 w-6" />
              ) : (
                <Phone className="h-6 w-6" />
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

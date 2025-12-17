import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Phone, PhoneOff, Video } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

interface IncomingCallDialogProps {
  isOpen: boolean;
  callerName: string;
  callerAvatar?: string;
  callType: 'audio' | 'video';
  onAccept: () => void;
  onDecline: () => void;
}

// Simple ringtone using Web Audio API
const createRingtone = (audioContext: AudioContext): OscillatorNode[] => {
  const oscillators: OscillatorNode[] = [];
  
  // Create dual-tone ringtone
  const frequencies = [440, 480]; // A4 and B4 for a pleasant ring
  
  frequencies.forEach(freq => {
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();
    
    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(freq, audioContext.currentTime);
    
    gainNode.gain.setValueAtTime(0.1, audioContext.currentTime);
    
    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);
    
    oscillators.push(oscillator);
  });
  
  return oscillators;
};

export function IncomingCallDialog({
  isOpen,
  callerName,
  callerAvatar,
  callType,
  onAccept,
  onDecline,
}: IncomingCallDialogProps) {
  const [isRinging, setIsRinging] = useState(false);
  const audioContextRef = useRef<AudioContext | null>(null);
  const oscillatorsRef = useRef<OscillatorNode[]>([]);
  const ringIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const isPlayingRef = useRef(false);

  // Play ringtone pattern
  const playRingtone = () => {
    if (!audioContextRef.current || audioContextRef.current.state === 'closed') {
      try {
        audioContextRef.current = new AudioContext();
      } catch (err) {
        console.error('Failed to create AudioContext:', err);
        return;
      }
    }

    // Resume audio context if suspended
    if (audioContextRef.current.state === 'suspended') {
      audioContextRef.current.resume();
    }

    // Create ring pattern: ring for 1s, pause for 2s
    const ring = () => {
      if (!isPlayingRef.current || !audioContextRef.current) return;
      
      try {
        // Stop any existing oscillators
        oscillatorsRef.current.forEach(osc => {
          try { osc.stop(); } catch {}
        });
        
        // Create new oscillators
        oscillatorsRef.current = createRingtone(audioContextRef.current);
        oscillatorsRef.current.forEach(osc => osc.start());
        
        // Stop after 1 second
        setTimeout(() => {
          oscillatorsRef.current.forEach(osc => {
            try { osc.stop(); } catch {}
          });
        }, 1000);
      } catch (err) {
        console.error('Error playing ringtone:', err);
      }
    };

    // Start ringing
    isPlayingRef.current = true;
    ring();
    ringIntervalRef.current = setInterval(ring, 3000);
  };

  // Stop ringtone
  const stopRingtone = () => {
    isPlayingRef.current = false;
    
    if (ringIntervalRef.current) {
      clearInterval(ringIntervalRef.current);
      ringIntervalRef.current = null;
    }
    
    oscillatorsRef.current.forEach(osc => {
      try { osc.stop(); } catch {}
    });
    oscillatorsRef.current = [];
    
    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
      try {
        audioContextRef.current.close();
      } catch {}
      audioContextRef.current = null;
    }
  };

  // Handle ringtone on open/close
  useEffect(() => {
    if (isOpen) {
      setIsRinging(true);
      playRingtone();
    } else {
      setIsRinging(false);
      stopRingtone();
    }

    return () => {
      stopRingtone();
    };
  }, [isOpen]);

  const handleAccept = () => {
    stopRingtone();
    onAccept();
  };

  const handleDecline = () => {
    stopRingtone();
    onDecline();
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && handleDecline()}>
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
            <div 
              className={`absolute -inset-2 rounded-full border-2 border-primary/40 ${
                isRinging ? 'animate-pulse' : ''
              }`}
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
          <div className="flex items-center gap-8">
            <div className="flex flex-col items-center gap-2">
              <Button
                size="lg"
                variant="destructive"
                className="h-16 w-16 rounded-full shadow-lg hover:scale-105 transition-transform"
                onClick={handleDecline}
              >
                <PhoneOff className="h-6 w-6" />
              </Button>
              <span className="text-xs text-muted-foreground">Decline</span>
            </div>
            <div className="flex flex-col items-center gap-2">
              <Button
                size="lg"
                className="h-16 w-16 rounded-full bg-green-500 hover:bg-green-600 shadow-lg hover:scale-105 transition-transform"
                onClick={handleAccept}
              >
                {callType === 'video' ? (
                  <Video className="h-6 w-6" />
                ) : (
                  <Phone className="h-6 w-6" />
                )}
              </Button>
              <span className="text-xs text-muted-foreground">Accept</span>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

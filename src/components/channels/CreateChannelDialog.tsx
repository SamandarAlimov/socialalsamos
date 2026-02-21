import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Globe, Lock, Megaphone } from 'lucide-react';

interface CreateChannelDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreateChannel: (
    name: string,
    type: 'public' | 'private',
    description?: string,
    username?: string
  ) => Promise<any>;
}

export function CreateChannelDialog({ open, onOpenChange, onCreateChannel }: CreateChannelDialogProps) {
  const [name, setName] = useState('');
  const [username, setUsername] = useState('');
  const [description, setDescription] = useState('');
  const [channelType, setChannelType] = useState<'public' | 'private'>('public');
  const [isCreating, setIsCreating] = useState(false);

  const handleCreate = async () => {
    if (!name.trim()) return;
    setIsCreating(true);
    const result = await onCreateChannel(name.trim(), channelType, description.trim(), username.trim() || undefined);
    setIsCreating(false);
    if (result) {
      setName('');
      setUsername('');
      setDescription('');
      setChannelType('public');
      onOpenChange(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Megaphone className="h-5 w-5 text-primary" />
            Yangi kanal yaratish
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 pt-2">
          <div className="space-y-2">
            <Label>Kanal nomi *</Label>
            <Input
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="Kanal nomini kiriting"
              maxLength={64}
            />
          </div>

          <div className="space-y-2">
            <Label>Username (ixtiyoriy)</Label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">@</span>
              <Input
                value={username}
                onChange={e => setUsername(e.target.value.replace(/[^a-zA-Z0-9_]/g, '').toLowerCase())}
                placeholder="kanal_username"
                className="pl-8"
                maxLength={32}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Tavsif (ixtiyoriy)</Label>
            <Textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="Kanal haqida qisqacha..."
              rows={3}
              maxLength={256}
            />
          </div>

          <div className="space-y-3">
            <Label>Kanal turi</Label>
            <RadioGroup value={channelType} onValueChange={v => setChannelType(v as 'public' | 'private')}>
              <div className="flex items-start gap-3 p-3 rounded-xl border border-border hover:bg-muted/50 transition-colors">
                <RadioGroupItem value="public" id="public" className="mt-0.5" />
                <div className="flex-1">
                  <label htmlFor="public" className="flex items-center gap-2 font-medium text-sm cursor-pointer">
                    <Globe className="h-4 w-4 text-primary" />
                    Ochiq kanal
                  </label>
                  <p className="text-xs text-muted-foreground mt-0.5">Hamma topishi va obuna bo'lishi mumkin</p>
                </div>
              </div>
              <div className="flex items-start gap-3 p-3 rounded-xl border border-border hover:bg-muted/50 transition-colors">
                <RadioGroupItem value="private" id="private" className="mt-0.5" />
                <div className="flex-1">
                  <label htmlFor="private" className="flex items-center gap-2 font-medium text-sm cursor-pointer">
                    <Lock className="h-4 w-4 text-muted-foreground" />
                    Yopiq kanal
                  </label>
                  <p className="text-xs text-muted-foreground mt-0.5">Faqat taklif yoki havola orqali qo'shilish mumkin</p>
                </div>
              </div>
            </RadioGroup>
          </div>

          <Button onClick={handleCreate} disabled={!name.trim() || isCreating} className="w-full">
            {isCreating ? 'Yaratilmoqda...' : 'Kanal yaratish'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

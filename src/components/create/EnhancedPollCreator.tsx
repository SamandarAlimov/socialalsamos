import { useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { 
  Plus, 
  X, 
  Trash2,
  GripVertical,
  Clock,
  BarChart3,
  Infinity,
  Users,
  EyeOff
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs';

export interface PollOption {
  id: string;
  text: string;
  emoji?: string;
}

export interface EnhancedPollData {
  question: string;
  options: PollOption[];
  durationType: 'preset' | 'custom' | 'unlimited';
  duration: string; // For preset: '1h', '6h', '12h', '1d', '3d', '7d', '30d', '1y'
  customDays?: number;
  customHours?: number;
  customMinutes?: number;
  allowMultiple: boolean;
  isAnonymous: boolean;
  showResultsBeforeVote: boolean;
  quizMode: boolean;
  correctOptionId?: string;
}

interface EnhancedPollCreatorProps {
  poll: EnhancedPollData;
  onChange: (poll: EnhancedPollData) => void;
  onRemove: () => void;
}

const DURATION_PRESETS = [
  { value: '1h', label: '1 hour' },
  { value: '6h', label: '6 hours' },
  { value: '12h', label: '12 hours' },
  { value: '1d', label: '1 day' },
  { value: '3d', label: '3 days' },
  { value: '7d', label: '1 week' },
  { value: '30d', label: '1 month' },
  { value: '1y', label: '1 year' },
];

const POLL_EMOJIS = ['🔵', '🟢', '🔴', '🟡', '🟣', '🟠', '⚪', '⚫'];

export function EnhancedPollCreator({ poll, onChange, onRemove }: EnhancedPollCreatorProps) {
  const [showAdvanced, setShowAdvanced] = useState(false);

  const updateQuestion = useCallback((question: string) => {
    onChange({ ...poll, question });
  }, [poll, onChange]);

  const updateOption = useCallback((id: string, text: string) => {
    onChange({
      ...poll,
      options: poll.options.map(opt => 
        opt.id === id ? { ...opt, text } : opt
      )
    });
  }, [poll, onChange]);

  const updateOptionEmoji = useCallback((id: string, emoji: string) => {
    onChange({
      ...poll,
      options: poll.options.map(opt => 
        opt.id === id ? { ...opt, emoji } : opt
      )
    });
  }, [poll, onChange]);

  const addOption = useCallback(() => {
    if (poll.options.length >= 10) return;
    const newIndex = poll.options.length;
    onChange({
      ...poll,
      options: [
        ...poll.options,
        { 
          id: `opt-${Date.now()}`, 
          text: '',
          emoji: POLL_EMOJIS[newIndex % POLL_EMOJIS.length]
        }
      ]
    });
  }, [poll, onChange]);

  const removeOption = useCallback((id: string) => {
    if (poll.options.length <= 2) return;
    onChange({
      ...poll,
      options: poll.options.filter(opt => opt.id !== id),
      correctOptionId: poll.correctOptionId === id ? undefined : poll.correctOptionId
    });
  }, [poll, onChange]);

  const getDurationLabel = () => {
    if (poll.durationType === 'unlimited') return '♾️ No time limit';
    if (poll.durationType === 'custom') {
      const parts = [];
      if (poll.customDays) parts.push(`${poll.customDays}d`);
      if (poll.customHours) parts.push(`${poll.customHours}h`);
      if (poll.customMinutes) parts.push(`${poll.customMinutes}m`);
      return parts.join(' ') || 'Set duration';
    }
    return DURATION_PRESETS.find(p => p.value === poll.duration)?.label || '1 day';
  };

  return (
    <div className="space-y-4 p-4 rounded-xl bg-secondary/50 border border-border">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <BarChart3 className="h-5 w-5 text-primary" />
          <span className="font-semibold">Create Poll</span>
        </div>
        <Button variant="ghost" size="icon" onClick={onRemove}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      {/* Question */}
      <div className="space-y-2">
        <Label htmlFor="poll-question">Question</Label>
        <Input
          id="poll-question"
          value={poll.question}
          onChange={(e) => updateQuestion(e.target.value)}
          placeholder="Ask a question..."
          className="font-medium text-base"
          maxLength={200}
        />
        <p className="text-xs text-muted-foreground text-right">
          {poll.question.length}/200
        </p>
      </div>

      {/* Options */}
      <div className="space-y-2">
        <Label>Options (2-10)</Label>
        <div className="space-y-2">
          {poll.options.map((option, index) => (
            <div key={option.id} className="flex items-center gap-2">
              <GripVertical className="h-4 w-4 text-muted-foreground cursor-grab flex-shrink-0" />
              
              {/* Emoji Selector */}
              <div className="relative group">
                <button 
                  className="w-8 h-8 text-lg flex items-center justify-center bg-secondary rounded-lg hover:bg-secondary/80 transition-colors"
                >
                  {option.emoji || POLL_EMOJIS[index % POLL_EMOJIS.length]}
                </button>
                <div className="absolute left-0 top-full mt-1 p-1 bg-popover border rounded-lg shadow-lg hidden group-hover:flex gap-1 z-10">
                  {POLL_EMOJIS.map(emoji => (
                    <button
                      key={emoji}
                      onClick={() => updateOptionEmoji(option.id, emoji)}
                      className="w-7 h-7 hover:bg-secondary rounded transition-colors"
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
              </div>

              <Input
                value={option.text}
                onChange={(e) => updateOption(option.id, e.target.value)}
                placeholder={`Option ${index + 1}`}
                className="flex-1"
                maxLength={100}
              />

              {/* Quiz Mode - Mark Correct */}
              {poll.quizMode && (
                <Button
                  variant={poll.correctOptionId === option.id ? "default" : "outline"}
                  size="sm"
                  onClick={() => onChange({ ...poll, correctOptionId: option.id })}
                  className="text-xs"
                >
                  ✓
                </Button>
              )}

              {poll.options.length > 2 && (
                <Button 
                  variant="ghost" 
                  size="icon"
                  onClick={() => removeOption(option.id)}
                >
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              )}
            </div>
          ))}
        </div>
        {poll.options.length < 10 && (
          <Button
            variant="outline"
            size="sm"
            onClick={addOption}
            className="w-full mt-2"
          >
            <Plus className="h-4 w-4 mr-2" />
            Add Option ({poll.options.length}/10)
          </Button>
        )}
      </div>

      {/* Duration Settings */}
      <div className="space-y-3 pt-3 border-t border-border">
        <Label className="flex items-center gap-2">
          <Clock className="h-4 w-4" />
          Poll Duration
        </Label>
        
        <Tabs 
          value={poll.durationType} 
          onValueChange={(v) => onChange({ ...poll, durationType: v as any })}
        >
          <TabsList className="grid grid-cols-3">
            <TabsTrigger value="preset">Preset</TabsTrigger>
            <TabsTrigger value="custom">Custom</TabsTrigger>
            <TabsTrigger value="unlimited" className="gap-1">
              <Infinity className="h-3 w-3" />
              <span className="hidden sm:inline">Unlimited</span>
            </TabsTrigger>
          </TabsList>
          
          <TabsContent value="preset" className="mt-3">
            <Select 
              value={poll.duration} 
              onValueChange={(value) => onChange({ ...poll, duration: value })}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select duration" />
              </SelectTrigger>
              <SelectContent>
                {DURATION_PRESETS.map(opt => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </TabsContent>
          
          <TabsContent value="custom" className="mt-3 space-y-3">
            <div className="grid grid-cols-3 gap-2">
              <div>
                <Label className="text-xs">Days</Label>
                <Input
                  type="number"
                  min={0}
                  max={365}
                  value={poll.customDays || ''}
                  onChange={(e) => onChange({ ...poll, customDays: parseInt(e.target.value) || 0 })}
                  placeholder="0"
                />
              </div>
              <div>
                <Label className="text-xs">Hours</Label>
                <Input
                  type="number"
                  min={0}
                  max={23}
                  value={poll.customHours || ''}
                  onChange={(e) => onChange({ ...poll, customHours: parseInt(e.target.value) || 0 })}
                  placeholder="0"
                />
              </div>
              <div>
                <Label className="text-xs">Minutes</Label>
                <Input
                  type="number"
                  min={0}
                  max={59}
                  value={poll.customMinutes || ''}
                  onChange={(e) => onChange({ ...poll, customMinutes: parseInt(e.target.value) || 0 })}
                  placeholder="0"
                />
              </div>
            </div>
          </TabsContent>
          
          <TabsContent value="unlimited" className="mt-3">
            <p className="text-sm text-muted-foreground text-center py-2">
              Poll will stay open indefinitely until you close it manually.
            </p>
          </TabsContent>
        </Tabs>

        <div className="text-sm text-muted-foreground flex items-center gap-2">
          <Clock className="h-3 w-3" />
          {getDurationLabel()}
        </div>
      </div>

      {/* Settings */}
      <div className="space-y-3 pt-3 border-t border-border">
        <Button 
          variant="ghost" 
          size="sm" 
          onClick={() => setShowAdvanced(!showAdvanced)}
          className="w-full justify-between"
        >
          Advanced Settings
          <span className="text-xs text-muted-foreground">
            {showAdvanced ? '▲' : '▼'}
          </span>
        </Button>

        {showAdvanced && (
          <div className="space-y-3 animate-in fade-in slide-in-from-top-2">
            {/* Allow Multiple */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Users className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm">Allow multiple answers</span>
              </div>
              <Switch
                checked={poll.allowMultiple}
                onCheckedChange={(checked) => onChange({ ...poll, allowMultiple: checked })}
              />
            </div>

            {/* Anonymous */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <EyeOff className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm">Anonymous voting</span>
              </div>
              <Switch
                checked={poll.isAnonymous}
                onCheckedChange={(checked) => onChange({ ...poll, isAnonymous: checked })}
              />
            </div>

            {/* Show Results Before Vote */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <BarChart3 className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm">Show results before voting</span>
              </div>
              <Switch
                checked={poll.showResultsBeforeVote}
                onCheckedChange={(checked) => onChange({ ...poll, showResultsBeforeVote: checked })}
              />
            </div>

            {/* Quiz Mode */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground">🎓</span>
                <span className="text-sm">Quiz mode (has correct answer)</span>
              </div>
              <Switch
                checked={poll.quizMode}
                onCheckedChange={(checked) => onChange({ ...poll, quizMode: checked, correctOptionId: undefined })}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// Default poll data
export const createDefaultEnhancedPoll = (): EnhancedPollData => ({
  question: '',
  options: [
    { id: 'opt-1', text: '', emoji: '🔵' },
    { id: 'opt-2', text: '', emoji: '🟢' }
  ],
  durationType: 'preset',
  duration: '1d',
  allowMultiple: false,
  isAnonymous: false,
  showResultsBeforeVote: false,
  quizMode: false,
});

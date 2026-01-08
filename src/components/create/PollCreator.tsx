import { useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { 
  Plus, 
  X, 
  Trash2,
  GripVertical,
  Clock,
  BarChart3
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

export interface PollOption {
  id: string;
  text: string;
}

export interface PollData {
  question: string;
  options: PollOption[];
  duration: string; // '1h', '6h', '1d', '3d', '7d'
  allowMultiple: boolean;
  isAnonymous: boolean;
}

interface PollCreatorProps {
  poll: PollData;
  onChange: (poll: PollData) => void;
  onRemove: () => void;
}

const DURATION_OPTIONS = [
  { value: '1h', label: '1 hour' },
  { value: '6h', label: '6 hours' },
  { value: '1d', label: '1 day' },
  { value: '3d', label: '3 days' },
  { value: '7d', label: '1 week' },
];

export function PollCreator({ poll, onChange, onRemove }: PollCreatorProps) {
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

  const addOption = useCallback(() => {
    if (poll.options.length >= 6) return;
    onChange({
      ...poll,
      options: [
        ...poll.options,
        { id: `opt-${Date.now()}`, text: '' }
      ]
    });
  }, [poll, onChange]);

  const removeOption = useCallback((id: string) => {
    if (poll.options.length <= 2) return;
    onChange({
      ...poll,
      options: poll.options.filter(opt => opt.id !== id)
    });
  }, [poll, onChange]);

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
          className="font-medium"
        />
      </div>

      {/* Options */}
      <div className="space-y-2">
        <Label>Options</Label>
        <div className="space-y-2">
          {poll.options.map((option, index) => (
            <div key={option.id} className="flex items-center gap-2">
              <GripVertical className="h-4 w-4 text-muted-foreground cursor-grab" />
              <Input
                value={option.text}
                onChange={(e) => updateOption(option.id, e.target.value)}
                placeholder={`Option ${index + 1}`}
                className="flex-1"
              />
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
        {poll.options.length < 6 && (
          <Button
            variant="outline"
            size="sm"
            onClick={addOption}
            className="w-full mt-2"
          >
            <Plus className="h-4 w-4 mr-2" />
            Add Option
          </Button>
        )}
      </div>

      {/* Settings */}
      <div className="space-y-3 pt-2 border-t border-border">
        {/* Duration */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm">Poll Duration</span>
          </div>
          <Select 
            value={poll.duration} 
            onValueChange={(value) => onChange({ ...poll, duration: value })}
          >
            <SelectTrigger className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {DURATION_OPTIONS.map(opt => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Allow Multiple */}
        <div className="flex items-center justify-between">
          <span className="text-sm">Allow multiple answers</span>
          <Switch
            checked={poll.allowMultiple}
            onCheckedChange={(checked) => onChange({ ...poll, allowMultiple: checked })}
          />
        </div>

        {/* Anonymous */}
        <div className="flex items-center justify-between">
          <span className="text-sm">Anonymous voting</span>
          <Switch
            checked={poll.isAnonymous}
            onCheckedChange={(checked) => onChange({ ...poll, isAnonymous: checked })}
          />
        </div>
      </div>
    </div>
  );
}

// Default poll data
export const createDefaultPoll = (): PollData => ({
  question: '',
  options: [
    { id: 'opt-1', text: '' },
    { id: 'opt-2', text: '' }
  ],
  duration: '1d',
  allowMultiple: false,
  isAnonymous: false
});
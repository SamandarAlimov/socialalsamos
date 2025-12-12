import { cn } from '@/lib/utils';
import { EmojiPicker } from './EmojiPicker';
import { Plus } from 'lucide-react';

interface ReactionGroup {
  emoji: string;
  count: number;
  hasReacted: boolean;
}

interface MessageReactionsProps {
  reactions: ReactionGroup[];
  onToggle: (emoji: string) => void;
  onAdd: (emoji: string) => void;
  isMine?: boolean;
}

export function MessageReactions({ reactions, onToggle, onAdd, isMine }: MessageReactionsProps) {
  if (reactions.length === 0) {
    return (
      <div className="flex justify-end mt-1">
        <EmojiPicker
          onSelect={onAdd}
          trigger={
            <button className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded hover:bg-accent">
              <Plus className="h-3 w-3 text-muted-foreground" />
            </button>
          }
        />
      </div>
    );
  }

  return (
    <div className={cn("flex flex-wrap gap-1 mt-1", isMine ? "justify-end" : "justify-start")}>
      {reactions.map((reaction) => (
        <button
          key={reaction.emoji}
          onClick={() => onToggle(reaction.emoji)}
          className={cn(
            "inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-xs transition-colors",
            reaction.hasReacted
              ? "bg-primary/20 text-primary border border-primary/30"
              : "bg-muted hover:bg-accent border border-transparent"
          )}
        >
          <span>{reaction.emoji}</span>
          <span className="font-medium">{reaction.count}</span>
        </button>
      ))}
      <EmojiPicker
        onSelect={onAdd}
        trigger={
          <button className="opacity-0 group-hover:opacity-100 transition-opacity inline-flex items-center justify-center h-6 w-6 rounded-full hover:bg-accent">
            <Plus className="h-3 w-3 text-muted-foreground" />
          </button>
        }
      />
    </div>
  );
}

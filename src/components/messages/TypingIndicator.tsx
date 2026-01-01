import { cn } from '@/lib/utils';

interface TypingIndicatorProps {
  userNames: string[];
  className?: string;
}

export function TypingIndicator({ userNames, className }: TypingIndicatorProps) {
  const displayText = userNames.length === 1 
    ? `${userNames[0]} is typing`
    : userNames.length === 2 
      ? `${userNames[0]} and ${userNames[1]} are typing`
      : `${userNames[0]} and ${userNames.length - 1} others are typing`;

  return (
    <div className={cn("flex items-center gap-2", className)}>
      <div className="flex justify-start">
        <div className="bg-card border border-border rounded-2xl rounded-bl-md px-4 py-3 flex items-center gap-3">
          {/* Animated dots */}
          <div className="flex gap-1">
            <span 
              className="w-2 h-2 bg-primary rounded-full animate-bounce" 
              style={{ animationDelay: '0ms', animationDuration: '600ms' }} 
            />
            <span 
              className="w-2 h-2 bg-primary rounded-full animate-bounce" 
              style={{ animationDelay: '150ms', animationDuration: '600ms' }} 
            />
            <span 
              className="w-2 h-2 bg-primary rounded-full animate-bounce" 
              style={{ animationDelay: '300ms', animationDuration: '600ms' }} 
            />
          </div>
          
          {/* Typing text */}
          <span className="text-xs text-muted-foreground">
            {displayText}
          </span>
        </div>
      </div>
    </div>
  );
}

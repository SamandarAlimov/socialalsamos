import { Bold, Code, Italic, Link2, List, Quote, Strikethrough, Underline, EyeOff, Heading } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { prefixLine, wrapSelection } from '@/lib/messageFormat';

interface FormatToolbarProps {
  /** Formatlanadigan maydon (textarea yoki input) */
  targetRef: React.RefObject<HTMLTextAreaElement | HTMLInputElement>;
  value: string;
  onChange: (value: string) => void;
  className?: string;
  /** Maqola rejimida sarlavha/ro'yxat tugmalari ham ko'rsatiladi */
  extended?: boolean;
}

interface ToolDef {
  key: string;
  label: string;
  icon: React.ElementType;
  marker?: string;
  markerEnd?: string;
  prefix?: string;
  onlyExtended?: boolean;
}

const TOOLS: ToolDef[] = [
  { key: 'bold', label: 'Qalin', icon: Bold, marker: '**' },
  { key: 'italic', label: 'Kursiv', icon: Italic, marker: '__' },
  { key: 'underline', label: 'Tagi chizilgan', icon: Underline, marker: '++' },
  { key: 'strike', label: 'Ustidan chizilgan', icon: Strikethrough, marker: '~~' },
  { key: 'code', label: 'Kod', icon: Code, marker: '`' },
  { key: 'spoiler', label: 'Spoiler', icon: EyeOff, marker: '||' },
  { key: 'link', label: 'Havola', icon: Link2, marker: '[', markerEnd: '](https://)' },
  { key: 'quote', label: 'Iqtibos', icon: Quote, prefix: '> ' },
  { key: 'heading', label: 'Sarlavha', icon: Heading, prefix: '## ', onlyExtended: true },
  { key: 'list', label: "Ro'yxat", icon: List, prefix: '- ', onlyExtended: true },
];

/** Telegramdagidek matn formatlash paneli */
export function FormatToolbar({ targetRef, value, onChange, className, extended }: FormatToolbarProps) {
  const apply = (tool: ToolDef) => {
    const element = targetRef.current;
    const start = element?.selectionStart ?? value.length;
    const end = element?.selectionEnd ?? value.length;

    const result = tool.prefix
      ? prefixLine(value, start, tool.prefix)
      : wrapSelection(value, start, end, tool.marker || '', tool.markerEnd);

    onChange(result.value);

    requestAnimationFrame(() => {
      const el = targetRef.current;
      if (!el) return;
      el.focus();
      el.setSelectionRange(result.selectionStart, result.selectionEnd);
    });
  };

  const tools = TOOLS.filter((tool) => extended || !tool.onlyExtended);

  return (
    <div className={'flex flex-wrap items-center gap-1 ' + (className || '')}>
      {tools.map((tool) => (
        <Button
          key={tool.key}
          type="button"
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-muted-foreground hover:text-foreground"
          title={tool.label}
          aria-label={tool.label}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => apply(tool)}
        >
          <tool.icon className="h-4 w-4" />
        </Button>
      ))}
    </div>
  );
}

export default FormatToolbar;

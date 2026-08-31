import {
  Globe,
  Image as ImageIcon,
  LayoutGrid,
  Monitor,
  Plug,
  SlidersHorizontal,
  Terminal,
  Video,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Switch } from '@/components/ui/switch';
import { TOOL_GROUPS, type ToolGroupId } from '@/lib/ai/capabilities';
import { cn } from '@/lib/utils';

const ICONS: Record<string, LucideIcon> = {
  globe: Globe,
  terminal: Terminal,
  image: ImageIcon,
  video: Video,
  'layout-grid': LayoutGrid,
  plug: Plug,
  monitor: Monitor,
};

interface AIToolsMenuProps {
  selected: ToolGroupId[];
  onChange: (groups: ToolGroupId[]) => void;
  onOpenConnectors?: () => void;
  disabled?: boolean;
}

export function AIToolsMenu({
  selected,
  onChange,
  onOpenConnectors,
  disabled,
}: AIToolsMenuProps) {
  const toggle = (id: ToolGroupId) => {
    onChange(selected.includes(id) ? selected.filter((g) => g !== id) : [...selected, id]);
  };

  return (
    <Popover>
      <PopoverTrigger asChild disabled={disabled}>
        <Button
          variant="ghost"
          size="sm"
          className="h-8 gap-1.5 rounded-full border border-border/60 px-3 text-xs font-medium"
          aria-label="Vositalarni sozlash"
        >
          <SlidersHorizontal className="h-3.5 w-3.5" />
          <span>Vositalar</span>
          <span className="rounded-full bg-muted px-1.5 text-[10px] font-semibold">
            {selected.length}
          </span>
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80 p-0">
        <div className="border-b border-border/60 px-3 py-2.5">
          <p className="text-sm font-semibold">AI imkoniyatlari</p>
          <p className="text-xs text-muted-foreground">
            Yoqilgan vositalarni AI o'zi kerak bo'lganda ishlatadi
          </p>
        </div>
        <div className="max-h-[320px] overflow-y-auto py-1">
          {TOOL_GROUPS.map((group) => {
            const Icon = ICONS[group.icon] ?? LayoutGrid;
            const active = selected.includes(group.id);
            return (
              <label
                key={group.id}
                className="flex cursor-pointer items-start gap-3 px-3 py-2.5 hover:bg-muted/50"
              >
                <span
                  className={cn(
                    'mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg',
                    active ? 'bg-alsamos-orange/10 text-alsamos-orange' : 'bg-muted text-muted-foreground',
                  )}
                >
                  <Icon className="h-4 w-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2 text-sm font-medium">
                    {group.label}
                    {group.sensitive && (
                      <span className="rounded bg-destructive/10 px-1 text-[10px] font-semibold text-destructive">
                        tasdiq
                      </span>
                    )}
                  </span>
                  <span className="block text-xs leading-snug text-muted-foreground">
                    {group.description}
                  </span>
                </span>
                <Switch
                  checked={active}
                  onCheckedChange={() => toggle(group.id)}
                  aria-label={`${group.label} yoqish`}
                />
              </label>
            );
          })}
        </div>
        {onOpenConnectors && (
          <div className="border-t border-border/60 p-2">
            <Button
              variant="ghost"
              size="sm"
              className="w-full justify-start gap-2 text-xs"
              onClick={onOpenConnectors}
            >
              <Plug className="h-3.5 w-3.5" />
              Konnektorlarni boshqarish (MCP)
            </Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}

export default AIToolsMenu;

import type { ComponentProps } from 'react';
import { FolderKanban } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

import { Button } from '@/components/ui/button';
import { AISidebar as AISidebarV2 } from './AISidebarV2';

type Props = ComponentProps<typeof AISidebarV2>;

/**
 * Projects are a standalone workspace (/projects), not an inline AI-sidebar
 * data model. The AI sidebar only exposes a navigation shortcut to that page.
 */
export function AISidebar(props: Props) {
  const navigate = useNavigate();

  return (
    <div className="flex h-full min-h-0 w-full flex-col overflow-hidden bg-background">
      <div className="min-h-0 flex-1 overflow-hidden">
        <AISidebarV2 {...props} />
      </div>
      <div className="shrink-0 border-t border-border/50 p-2.5">
        <Button
          type="button"
          variant="ghost"
          className="h-9 w-full justify-start gap-2.5 rounded-xl px-2.5 text-[13px] font-medium"
          onClick={() => {
            props.onClose();
            navigate('/projects');
          }}
        >
          <FolderKanban className="h-4 w-4 text-muted-foreground" />
          Loyihalar
        </Button>
      </div>
    </div>
  );
}

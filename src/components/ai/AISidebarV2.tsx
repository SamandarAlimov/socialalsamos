import { useMemo, useState } from 'react';
import {
  Archive,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  FileCode2,
  FolderInput,
  FolderKanban,
  Github,
  History,
  MessageSquare,
  MoreHorizontal,
  PanelLeftClose,
  Pencil,
  Pin,
  PinOff,
  Plug,
  Plus,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import type { AIConversation, AIProject } from './types';
import { AIProjectDialog } from './AIProjectDialog';

interface Props {
  conversations: AIConversation[];
  loading: boolean;
  activeId: string | null;
  isMobile: boolean;
  profile?: { display_name?: string | null; username?: string | null; avatar_url?: string | null } | null;
  onNew: () => void;
  onSelect: (conv: AIConversation) => void;
  onDelete: (id: string) => void;
  onRename: (id: string, title: string) => void;
  onTogglePin: (id: string) => void;
  onClose: () => void;
  onOpenArtifacts?: () => void;
  onOpenConnectors?: () => void;
  onOpenGithub?: () => void;
  artifactCount?: number;
  projects?: AIProject[];
  activeProjectId?: string | null;
  onSelectProject?: (projectId: string | null) => void;
  onCreateProject?: (value: { name: string; instructions: string }) => Promise<void> | void;
  onUpdateProject?: (projectId: string, value: { name: string; instructions: string }) => Promise<void> | void;
  onDeleteProject?: (projectId: string) => Promise<void> | void;
  onMoveConversation?: (conversationId: string, projectId: string | null) => Promise<void> | void;
}

type Group = { key: string; label: string; items: AIConversation[] };

function groupByDate(items: AIConversation[]): Group[] {
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const day = 86400000;
  const buckets: Record<string, AIConversation[]> = { today: [], yesterday: [], week: [], month: [], older: [] };
  items.forEach((conversation) => {
    const timestamp = conversation.updatedAt.getTime();
    if (timestamp >= startOfToday) buckets.today.push(conversation);
    else if (timestamp >= startOfToday - day) buckets.yesterday.push(conversation);
    else if (timestamp >= startOfToday - 7 * day) buckets.week.push(conversation);
    else if (timestamp >= startOfToday - 30 * day) buckets.month.push(conversation);
    else buckets.older.push(conversation);
  });
  return [
    { key: 'today', label: 'Bugun', items: buckets.today },
    { key: 'yesterday', label: 'Kecha', items: buckets.yesterday },
    { key: 'week', label: 'Oxirgi 7 kun', items: buckets.week },
    { key: 'month', label: 'Oxirgi 30 kun', items: buckets.month },
    { key: 'older', label: 'Eskiroq', items: buckets.older },
  ].filter((group) => group.items.length > 0);
}

export function AISidebar({
  conversations,
  loading,
  activeId,
  isMobile,
  onNew,
  onSelect,
  onDelete,
  onRename,
  onTogglePin,
  onClose,
  onOpenArtifacts,
  onOpenConnectors,
  onOpenGithub,
  artifactCount = 0,
  projects = [],
  activeProjectId = null,
  onSelectProject,
  onCreateProject,
  onUpdateProject,
  onDeleteProject,
  onMoveConversation,
}: Props) {
  const [query, setQuery] = useState('');
  const [recentsOpen, setRecentsOpen] = useState(true);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [projectDialogOpen, setProjectDialogOpen] = useState(false);
  const [editingProject, setEditingProject] = useState<AIProject | null>(null);

  const activeProject = projects.find((project) => project.id === activeProjectId) ?? null;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const projectScoped = activeProjectId
      ? conversations.filter((conversation) => conversation.projectId === activeProjectId)
      : conversations;
    if (!q) return projectScoped;
    return projectScoped.filter(
      (conversation) =>
        conversation.title.toLowerCase().includes(q) ||
        conversation.messages.some((message) => message.content.toLowerCase().includes(q)),
    );
  }, [activeProjectId, conversations, query]);

  const pinned = filtered.filter((conversation) => conversation.pinned);
  const groups = groupByDate(filtered.filter((conversation) => !conversation.pinned));

  const snippetFor = (conversation: AIConversation) => {
    const q = query.trim().toLowerCase();
    if (!q) return null;
    const hit = conversation.messages.find((message) => message.content.toLowerCase().includes(q));
    if (!hit) return null;
    const index = hit.content.toLowerCase().indexOf(q);
    return `…${hit.content.slice(Math.max(0, index - 24), index + 56).trim()}…`;
  };

  const openCreateProject = () => {
    setEditingProject(null);
    setProjectDialogOpen(true);
  };

  const openEditProject = (project: AIProject) => {
    setEditingProject(project);
    setProjectDialogOpen(true);
  };

  const renderConversation = (conversation: AIConversation) => (
    <div
      key={conversation.id}
      role="button"
      tabIndex={0}
      onClick={() => onSelect(conversation)}
      onKeyDown={(event) => event.key === 'Enter' && onSelect(conversation)}
      className={cn(
        'group flex w-full min-w-0 items-center gap-2 rounded-xl px-2.5 py-2 text-left transition-colors',
        'hover:bg-muted/70',
        activeId === conversation.id && 'bg-muted',
      )}
    >
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-border/60 bg-background">
        {conversation.pinned ? <Pin className="h-3.5 w-3.5" /> : <MessageSquare className="h-3.5 w-3.5" />}
      </span>

      <div className="min-w-0 flex-1 overflow-hidden">
        {renamingId === conversation.id ? (
          <Input
            autoFocus
            value={renameValue}
            onClick={(event) => event.stopPropagation()}
            onChange={(event) => setRenameValue(event.target.value)}
            onBlur={() => {
              onRename(conversation.id, renameValue.trim() || conversation.title);
              setRenamingId(null);
            }}
            onKeyDown={(event) => {
              event.stopPropagation();
              if (event.key === 'Enter') {
                onRename(conversation.id, renameValue.trim() || conversation.title);
                setRenamingId(null);
              }
              if (event.key === 'Escape') setRenamingId(null);
            }}
            className="h-7 text-xs"
          />
        ) : (
          <>
            <p className="truncate text-[13px] font-medium leading-tight" title={conversation.title}>
              {conversation.title}
            </p>
            {snippetFor(conversation) && (
              <p className="truncate text-[10px] text-muted-foreground">{snippetFor(conversation)}</p>
            )}
          </>
        )}
      </div>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            size="icon"
            variant="ghost"
            className="h-6 w-6 shrink-0 rounded-md opacity-0 group-hover:opacity-100 focus:opacity-100"
            onClick={(event) => event.stopPropagation()}
            aria-label="Suhbat amallari"
          >
            <MoreHorizontal className="h-3.5 w-3.5" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-52">
          <DropdownMenuItem
            className="text-xs"
            onClick={(event) => {
              event.stopPropagation();
              setRenamingId(conversation.id);
              setRenameValue(conversation.title);
            }}
          >
            <Pencil className="mr-2 h-3.5 w-3.5" /> Nomini o‘zgartirish
          </DropdownMenuItem>

          <DropdownMenuItem
            className="text-xs"
            onClick={(event) => {
              event.stopPropagation();
              onTogglePin(conversation.id);
            }}
          >
            {conversation.pinned ? (
              <><PinOff className="mr-2 h-3.5 w-3.5" /> Mahkamlashni olish</>
            ) : (
              <><Pin className="mr-2 h-3.5 w-3.5" /> Mahkamlash</>
            )}
          </DropdownMenuItem>

          {onMoveConversation && projects.length > 0 && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuLabel className="text-[10px] font-medium text-muted-foreground">Loyihaga ko‘chirish</DropdownMenuLabel>
              {projects.map((project) => (
                <DropdownMenuItem
                  key={project.id}
                  className="text-xs"
                  onClick={(event) => {
                    event.stopPropagation();
                    void onMoveConversation(conversation.id, project.id);
                  }}
                >
                  <FolderInput className="mr-2 h-3.5 w-3.5" />
                  <span className="truncate">{project.name}</span>
                </DropdownMenuItem>
              ))}
              {conversation.projectId && (
                <DropdownMenuItem
                  className="text-xs"
                  onClick={(event) => {
                    event.stopPropagation();
                    void onMoveConversation(conversation.id, null);
                  }}
                >
                  <Archive className="mr-2 h-3.5 w-3.5" /> Loyihadan chiqarish
                </DropdownMenuItem>
              )}
            </>
          )}

          <DropdownMenuSeparator />
          <DropdownMenuItem
            className="text-xs text-destructive"
            onClick={(event) => {
              event.stopPropagation();
              onDelete(conversation.id);
            }}
          >
            <Trash2 className="mr-2 h-3.5 w-3.5" /> O‘chirish
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );

  return (
    <div className="flex h-full w-full min-w-0 flex-col overflow-hidden bg-background">
      <AIProjectDialog
        open={projectDialogOpen}
        onOpenChange={setProjectDialogOpen}
        project={editingProject}
        onSave={async (value) => {
          if (editingProject && onUpdateProject) await onUpdateProject(editingProject.id, value);
          else if (onCreateProject) await onCreateProject(value);
        }}
      />

      <div className="space-y-3 p-3">
        <div className="flex items-center justify-between">
          <div className="flex min-w-0 items-center gap-2.5">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-border/70 bg-muted/50">
              <MessageSquare className="h-4 w-4" />
            </span>
            <span className="truncate text-sm font-semibold">Alsamos AI</span>
          </div>
          <Button size="icon" variant="ghost" className="h-8 w-8 rounded-lg" onClick={onClose} aria-label="Yon panelni yopish">
            {isMobile ? <ChevronLeft className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
          </Button>
        </div>

        <Button
          className="h-9 w-full gap-2 rounded-xl bg-foreground text-background hover:bg-foreground/90"
          onClick={onNew}
        >
          <Plus className="h-4 w-4" /> Yangi suhbat
        </Button>

        <nav className="space-y-0.5">
          <button
            type="button"
            onClick={() => onOpenArtifacts?.()}
            className="flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left text-[13px] font-medium text-foreground/80 hover:bg-muted/60"
          >
            <FileCode2 className="h-4 w-4 text-muted-foreground" />
            <span className="flex-1">Artefaktlar</span>
            {artifactCount > 0 && <span className="rounded-full bg-muted px-1.5 text-[10px] text-muted-foreground">{artifactCount}</span>}
          </button>
          <button
            type="button"
            onClick={() => onOpenConnectors?.()}
            className="flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left text-[13px] font-medium text-foreground/80 hover:bg-muted/60"
          >
            <Plug className="h-4 w-4 text-muted-foreground" /> Konnektorlar
          </button>
          <button
            type="button"
            onClick={() => onOpenGithub?.()}
            className="flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left text-[13px] font-medium text-foreground/80 hover:bg-muted/60"
          >
            <Github className="h-4 w-4 text-muted-foreground" /> GitHub
          </button>
        </nav>

        <div className="border-t border-border/50 pt-3">
          <div className="mb-1 flex items-center justify-between px-2">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Loyihalar</span>
            <Button
              size="icon"
              variant="ghost"
              className="h-6 w-6 rounded-md"
              onClick={openCreateProject}
              aria-label="Yangi loyiha"
              disabled={!onCreateProject}
            >
              <Plus className="h-3.5 w-3.5" />
            </Button>
          </div>

          <button
            type="button"
            onClick={() => onSelectProject?.(null)}
            className={cn(
              'mb-0.5 flex w-full items-center gap-2 rounded-xl px-2.5 py-2 text-left text-[12px] transition-colors hover:bg-muted/60',
              !activeProjectId && 'bg-muted font-medium',
            )}
          >
            <History className="h-3.5 w-3.5 text-muted-foreground" /> Barcha suhbatlar
          </button>

          {projects.map((project) => (
            <div
              key={project.id}
              className={cn(
                'group/project flex items-center rounded-xl transition-colors hover:bg-muted/60',
                activeProjectId === project.id && 'bg-muted',
              )}
            >
              <button
                type="button"
                onClick={() => onSelectProject?.(project.id)}
                className="flex min-w-0 flex-1 items-center gap-2 px-2.5 py-2 text-left text-[12px]"
              >
                <FolderKanban className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                <span className="truncate">{project.name}</span>
                <span className="ml-auto shrink-0 text-[10px] text-muted-foreground">
                  {conversations.filter((conversation) => conversation.projectId === project.id).length || ''}
                </span>
              </button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="mr-1 h-6 w-6 rounded-md opacity-0 group-hover/project:opacity-100 focus:opacity-100"
                    aria-label="Loyiha amallari"
                  >
                    <MoreHorizontal className="h-3.5 w-3.5" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem className="text-xs" onClick={() => openEditProject(project)}>
                    <Pencil className="mr-2 h-3.5 w-3.5" /> Ko‘rsatmalarni tahrirlash
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    className="text-xs text-destructive"
                    onClick={() => {
                      if (window.confirm(`“${project.name}” loyihasini o‘chirasizmi? Suhbatlar saqlanib qoladi.`)) {
                        void onDeleteProject?.(project.id);
                      }
                    }}
                  >
                    <Trash2 className="mr-2 h-3.5 w-3.5" /> Loyihani o‘chirish
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          ))}
        </div>

        {activeProject && (
          <div className="rounded-xl border border-border/60 bg-muted/25 px-3 py-2">
            <p className="truncate text-xs font-medium">{activeProject.name}</p>
            <p className="mt-0.5 line-clamp-2 text-[10px] leading-relaxed text-muted-foreground">
              {activeProject.instructions || 'Bu loyiha uchun ko‘rsatma hali yozilmagan.'}
            </p>
          </div>
        )}

        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => event.key === 'Escape' && setQuery('')}
            placeholder={activeProject ? 'Loyihada qidirish…' : 'Suhbatlarda qidirish…'}
            autoComplete="off"
            className={cn('h-9 rounded-xl border-border/50 bg-muted/35 pl-9 text-xs', query && 'pr-8')}
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-muted-foreground hover:text-foreground"
              aria-label="Qidiruvni tozalash"
            >
              <X className="h-3 w-3" />
            </button>
          )}
        </div>
      </div>

      <ScrollArea className="min-h-0 w-full min-w-0 flex-1 px-2 [&_[data-radix-scroll-area-viewport]>div]:!block [&_[data-radix-scroll-area-viewport]>div]:!w-full">
        <div className="w-full min-w-0 space-y-3 overflow-hidden pb-4">
          {loading ? (
            <div className="space-y-2 px-1">
              {Array.from({ length: 6 }).map((_, index) => (
                <div key={index} className="flex items-center gap-2.5 px-1.5 py-2">
                  <Skeleton className="h-7 w-7 rounded-lg" />
                  <Skeleton className="h-3.5 flex-1 rounded" />
                </div>
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="px-6 py-12 text-center text-muted-foreground">
              <History className="mx-auto mb-3 h-7 w-7 opacity-40" />
              <p className="text-xs">
                {query ? 'Natija topilmadi' : activeProject ? 'Bu loyihada hali suhbat yo‘q' : 'Hali suhbatlar yo‘q'}
              </p>
            </div>
          ) : (
            <>
              {pinned.length > 0 && (
                <div>
                  <p className="px-2.5 pb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Mahkamlangan</p>
                  <div className="space-y-0.5">{pinned.map(renderConversation)}</div>
                </div>
              )}

              <div>
                <button
                  type="button"
                  onClick={() => setRecentsOpen((value) => !value)}
                  className="flex w-full items-center gap-1 px-2.5 pb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground hover:text-foreground"
                >
                  {recentsOpen ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                  So‘nggilar
                </button>
                {recentsOpen && groups.map((group) => (
                  <div key={group.key} className="mb-2">
                    <p className="px-2.5 py-1 text-[10px] text-muted-foreground/70">{group.label}</p>
                    <div className="space-y-0.5">{group.items.map(renderConversation)}</div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </ScrollArea>

      {/* Intentionally no profile/settings footer here. Global app navigation already owns it. */}
    </div>
  );
}

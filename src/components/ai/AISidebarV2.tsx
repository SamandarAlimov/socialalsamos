import { useMemo, useState } from 'react';
import {
  ChevronDown,
  ChevronLeft,
  FileCode2,
  FolderKanban,
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
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
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
  const buckets: Record<string, AIConversation[]> = {
    today: [],
    yesterday: [],
    week: [],
    month: [],
    older: [],
  };

  for (const conversation of items) {
    const timestamp = conversation.updatedAt.getTime();
    if (timestamp >= startOfToday) buckets.today.push(conversation);
    else if (timestamp >= startOfToday - day) buckets.yesterday.push(conversation);
    else if (timestamp >= startOfToday - 7 * day) buckets.week.push(conversation);
    else if (timestamp >= startOfToday - 30 * day) buckets.month.push(conversation);
    else buckets.older.push(conversation);
  }

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
  const [projectsOpen, setProjectsOpen] = useState(true);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [projectDialogOpen, setProjectDialogOpen] = useState(false);
  const [editingProject, setEditingProject] = useState<AIProject | null>(null);

  const scopedConversations = useMemo(
    () =>
      activeProjectId
        ? conversations.filter((conversation) => conversation.projectId === activeProjectId)
        : conversations,
    [activeProjectId, conversations],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return scopedConversations;
    return scopedConversations.filter(
      (conversation) =>
        conversation.title.toLowerCase().includes(q) ||
        conversation.messages.some((message) => message.content.toLowerCase().includes(q)),
    );
  }, [query, scopedConversations]);

  const pinned = filtered.filter((conversation) => conversation.pinned);
  const groups = groupByDate(filtered.filter((conversation) => !conversation.pinned));
  const activeProject = projects.find((project) => project.id === activeProjectId) ?? null;

  const snippetFor = (conversation: AIConversation) => {
    const q = query.trim().toLowerCase();
    if (!q) return null;
    const hit = conversation.messages.find((message) => message.content.toLowerCase().includes(q));
    if (!hit) return null;
    const index = hit.content.toLowerCase().indexOf(q);
    return `…${hit.content.slice(Math.max(0, index - 24), index + 56).trim()}…`;
  };

  const openCreateProject = () => {
    if (!onCreateProject) return;
    setEditingProject(null);
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
        'group flex w-full min-w-0 items-center gap-2 rounded-xl px-2 py-2 text-left transition-colors',
        'hover:bg-muted/70',
        activeId === conversation.id && 'bg-muted',
      )}
    >
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-border/60 bg-background">
        {conversation.pinned ? <Pin className="h-3.5 w-3.5" /> : <MessageSquare className="h-3.5 w-3.5" />}
      </span>

      <div className="min-w-0 flex-1 overflow-hidden pr-0.5">
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
            <p className="block w-full truncate text-[13px] font-medium leading-tight" title={conversation.title}>
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
            className="h-7 w-7 shrink-0 rounded-lg text-muted-foreground opacity-55 transition-opacity hover:opacity-100 focus:opacity-100 group-hover:opacity-100"
            onClick={(event) => event.stopPropagation()}
            aria-label="Suhbat amallari"
          >
            <MoreHorizontal className="h-4 w-4" />
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
              <DropdownMenuItem
                className="text-xs"
                onClick={(event) => {
                  event.stopPropagation();
                  void onMoveConversation(conversation.id, null);
                }}
              >
                <MessageSquare className="mr-2 h-3.5 w-3.5" /> Umumiy suhbatlarga
              </DropdownMenuItem>
              {projects.slice(0, 8).map((project) => (
                <DropdownMenuItem
                  key={project.id}
                  className="text-xs"
                  onClick={(event) => {
                    event.stopPropagation();
                    void onMoveConversation(conversation.id, project.id);
                  }}
                >
                  <FolderKanban className="mr-2 h-3.5 w-3.5" />
                  <span className="max-w-36 truncate">{project.name}</span>
                </DropdownMenuItem>
              ))}
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
      <div className="space-y-2.5 p-3 pb-2">
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
          <div className="rounded-xl">
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setProjectsOpen((value) => !value)}
                className={cn(
                  'flex min-w-0 flex-1 items-center gap-2.5 rounded-xl px-2.5 py-2 text-left text-[13px] font-medium transition-colors hover:bg-muted/60',
                  activeProjectId && 'bg-muted/45',
                )}
              >
                <FolderKanban className="h-4 w-4 shrink-0 text-muted-foreground" />
                <span className="min-w-0 flex-1 truncate">Loyihalar</span>
                {projects.length > 0 && <span className="text-[10px] text-muted-foreground">{projects.length}</span>}
                <ChevronDown className={cn('h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform', !projectsOpen && '-rotate-90')} />
              </button>
              {onCreateProject && (
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  className="h-8 w-8 shrink-0 rounded-lg"
                  onClick={openCreateProject}
                  aria-label="Yangi loyiha"
                >
                  <Plus className="h-3.5 w-3.5" />
                </Button>
              )}
            </div>

            {projectsOpen && (
              <div className="ml-3 mt-1 space-y-0.5 border-l border-border/55 pl-2">
                <button
                  type="button"
                  onClick={() => onSelectProject?.(null)}
                  className={cn(
                    'flex w-full min-w-0 items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs text-muted-foreground transition-colors hover:bg-muted/55 hover:text-foreground',
                    !activeProjectId && 'bg-muted/45 text-foreground',
                  )}
                >
                  <MessageSquare className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate">Barcha suhbatlar</span>
                </button>

                {projects.map((project) => (
                  <div
                    key={project.id}
                    className={cn(
                      'group/project flex min-w-0 items-center rounded-lg transition-colors hover:bg-muted/55',
                      activeProjectId === project.id && 'bg-muted/55',
                    )}
                  >
                    <button
                      type="button"
                      onClick={() => onSelectProject?.(project.id)}
                      className="flex min-w-0 flex-1 items-center gap-2 px-2 py-1.5 text-left text-xs"
                    >
                      <FolderKanban className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                      <span className="min-w-0 flex-1 truncate font-medium">{project.name}</span>
                    </button>

                    {(onUpdateProject || onDeleteProject) && (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="mr-0.5 h-6 w-6 shrink-0 rounded-md text-muted-foreground opacity-50 hover:opacity-100 group-hover/project:opacity-100"
                            aria-label="Loyiha amallari"
                          >
                            <MoreHorizontal className="h-3.5 w-3.5" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="min-w-44">
                          {onUpdateProject && (
                            <DropdownMenuItem
                              className="text-xs"
                              onClick={() => {
                                setEditingProject(project);
                                setProjectDialogOpen(true);
                              }}
                            >
                              <Pencil className="mr-2 h-3.5 w-3.5" /> Tahrirlash
                            </DropdownMenuItem>
                          )}
                          {onDeleteProject && (
                            <DropdownMenuItem
                              className="text-xs text-destructive"
                              onClick={() => void onDeleteProject(project.id)}
                            >
                              <Trash2 className="mr-2 h-3.5 w-3.5" /> O‘chirish
                            </DropdownMenuItem>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
                  </div>
                ))}

                {projects.length === 0 && (
                  <button
                    type="button"
                    onClick={openCreateProject}
                    disabled={!onCreateProject}
                    className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-[11px] text-muted-foreground hover:bg-muted/45 disabled:cursor-default disabled:hover:bg-transparent"
                  >
                    <Plus className="h-3.5 w-3.5" /> Birinchi loyihani yarating
                  </button>
                )}
              </div>
            )}
          </div>

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
            <Plug className="h-4 w-4 text-muted-foreground" />
            <span className="flex-1">Konnektorlar</span>
          </button>
        </nav>

        <div className="relative border-t border-border/50 pt-3">
          <Search className="absolute left-3 top-[26px] h-3.5 w-3.5 text-muted-foreground" />
          <Input
            type="text"
            name="alsamos-ai-conversation-filter"
            inputMode="search"
            role="searchbox"
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck={false}
            data-1p-ignore="true"
            data-lpignore="true"
            data-form-type="other"
            aria-label="Suhbatlarda qidirish"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={activeProject ? `${activeProject.name} ichida qidirish` : 'Suhbatlarni qidirish'}
            className="h-8 rounded-xl pl-8 text-xs"
          />
        </div>
      </div>

      <ScrollArea className="min-h-0 flex-1 px-3 pb-3">
        {loading ? (
          <div className="space-y-2 px-1 pt-1">
            {Array.from({ length: 6 }).map((_, index) => <Skeleton key={index} className="h-10 w-full rounded-xl" />)}
          </div>
        ) : filtered.length === 0 ? (
          <div className="px-4 py-10 text-center text-xs text-muted-foreground">
            {query
              ? 'Natija topilmadi'
              : activeProject
                ? 'Bu loyihada hali suhbat yo‘q. Yangi suhbat boshlang.'
                : 'Hozircha suhbat yo‘q'}
          </div>
        ) : (
          <div className="space-y-3 pb-3">
            {pinned.length > 0 && (
              <section>
                <div className="mb-1 flex items-center gap-1.5 px-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  <Pin className="h-3 w-3" /> Mahkamlangan
                </div>
                <div className="space-y-0.5">{pinned.map(renderConversation)}</div>
              </section>
            )}

            <section>
              <button
                type="button"
                onClick={() => setRecentsOpen((value) => !value)}
                className="mb-1 flex w-full items-center gap-1.5 px-2 text-left text-[10px] font-semibold uppercase tracking-wide text-muted-foreground"
              >
                <History className="h-3 w-3" /> {activeProject ? activeProject.name : 'Suhbatlar'}
                <ChevronDown className={cn('ml-auto h-3 w-3 transition-transform', !recentsOpen && '-rotate-90')} />
              </button>
              {recentsOpen && (
                <div className="space-y-2">
                  {groups.map((group) => (
                    <div key={group.key}>
                      <p className="mb-0.5 px-2 text-[10px] text-muted-foreground">{group.label}</p>
                      <div className="space-y-0.5">{group.items.map(renderConversation)}</div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>
        )}
      </ScrollArea>

      <AIProjectDialog
        open={projectDialogOpen}
        onOpenChange={setProjectDialogOpen}
        project={editingProject}
        onSave={async (value) => {
          if (editingProject && onUpdateProject) {
            await onUpdateProject(editingProject.id, value);
          } else if (onCreateProject) {
            await onCreateProject(value);
          }
          setEditingProject(null);
        }}
      />
    </div>
  );
}

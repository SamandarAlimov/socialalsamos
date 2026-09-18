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
  PanelLeftOpen,
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
import { Skeleton } from '@/components/ui/skeleton';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import {
  sidebarGeneralConversations,
  sidebarProjectConversations,
} from '@/lib/ai/projectWorkspace';
import type { AIConversation, AIProject } from './types';
import { AIProjectDialog } from './AIProjectDialog';

interface Props {
  conversations: AIConversation[];
  loading: boolean;
  activeId: string | null;
  isMobile: boolean;
  collapsed?: boolean;
  onExpand?: () => void;
  profile?: { display_name?: string | null; username?: string | null; avatar_url?: string | null } | null;
  onNew: () => void;
  onNewProject?: (projectId: string) => void;
  onSelect: (conv: AIConversation) => void;
  onDelete: (id: string) => void;
  onRename: (id: string, title: string) => void;
  onTogglePin: (id: string) => void;
  onClose: () => void;
  onOpenProjects?: () => void;
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
  collapsed = false,
  onExpand,
  onNew,
  onNewProject,
  onSelect,
  onDelete,
  onRename,
  onTogglePin,
  onClose,
  onOpenProjects,
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
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [projectDialogOpen, setProjectDialogOpen] = useState(false);
  const [editingProject, setEditingProject] = useState<AIProject | null>(null);

  const filteredGeneral = useMemo(
    () => sidebarGeneralConversations(conversations, query),
    [conversations, query],
  );
  const pinned = filteredGeneral.filter((conversation) => conversation.pinned);
  const groups = groupByDate(filteredGeneral.filter((conversation) => !conversation.pinned));

  const snippetFor = (conversation: AIConversation) => {
    const clean = query.trim().toLowerCase();
    if (!clean) return null;
    const hit = conversation.messages.find((message) => message.content.toLowerCase().includes(clean));
    if (!hit) return null;
    const index = hit.content.toLowerCase().indexOf(clean);
    return `…${hit.content.slice(Math.max(0, index - 24), index + 56).trim()}…`;
  };

  const openCreateProject = () => {
    if (!onCreateProject) return;
    setEditingProject(null);
    setProjectDialogOpen(true);
  };

  const startGlobalConversation = () => {
    // ChatGPT-style behavior: the top action is always global. Selecting the
    // null project already clears the active conversation in AIPageV2.
    if (activeProjectId && onSelectProject) {
      onSelectProject(null);
      return;
    }
    onNew();
  };

  const startProjectConversation = (projectId: string) => {
    // Prefer an explicit project-new callback when supplied. The existing
    // project selector is also a safe fallback because it opens the project in
    // an empty/new-chat state.
    if (onNewProject) {
      onNewProject(projectId);
      return;
    }
    onSelectProject?.(projectId);
  };

  if (collapsed && !isMobile) {
    const expandSidebar = () => onExpand?.();

    return (
      <div className="flex h-full w-full min-w-0 flex-col items-center overflow-hidden bg-background py-3">
        <Button
          type="button"
          size="icon"
          variant="ghost"
          className="h-10 w-10 shrink-0 rounded-xl"
          onClick={expandSidebar}
          aria-label="AI yon panelini kengaytirish"
          title="AI yon panelini kengaytirish"
        >
          <PanelLeftOpen className="h-[18px] w-[18px]" />
        </Button>

        <div className="my-2 h-px w-8 shrink-0 bg-border/60" />

        <nav className="flex min-h-0 flex-1 flex-col items-center gap-1.5">
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="h-10 w-10 rounded-xl"
            onClick={startGlobalConversation}
            aria-label="Yangi suhbat"
            title="Yangi suhbat"
          >
            <Plus className="h-[18px] w-[18px]" />
          </Button>

          <Button
            type="button"
            size="icon"
            variant={activeProjectId ? 'secondary' : 'ghost'}
            className="h-10 w-10 rounded-xl"
            onClick={() => onOpenProjects?.()}
            aria-label="Loyihalar"
            title="Loyihalar"
          >
            <FolderKanban className="h-[18px] w-[18px]" />
          </Button>

          {onOpenArtifacts && (
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="relative h-10 w-10 rounded-xl"
              onClick={onOpenArtifacts}
              aria-label="Artefaktlar"
              title={artifactCount > 0 ? `Artefaktlar (${artifactCount})` : 'Artefaktlar'}
            >
              <FileCode2 className="h-[18px] w-[18px]" />
              {artifactCount > 0 && (
                <span className="absolute right-1 top-1 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-foreground px-0.5 text-[8px] font-semibold text-background">
                  {artifactCount > 9 ? '9+' : artifactCount}
                </span>
              )}
            </Button>
          )}

          {onOpenConnectors && (
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="h-10 w-10 rounded-xl"
              onClick={onOpenConnectors}
              aria-label="Konnektorlar"
              title="Konnektorlar"
            >
              <Plug className="h-[18px] w-[18px]" />
            </Button>
          )}

          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="h-10 w-10 rounded-xl"
            onClick={expandSidebar}
            aria-label="Suhbatlar tarixini ochish"
            title="Suhbatlar"
          >
            <History className="h-[18px] w-[18px]" />
          </Button>
        </nav>
      </div>
    );
  }

  const renderConversationMenu = (conversation: AIConversation, compact = false) => (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          size="icon"
          variant="ghost"
          className={cn(
            'shrink-0 rounded-lg text-muted-foreground transition-opacity hover:opacity-100 focus:opacity-100 group-hover:opacity-100',
            compact ? 'h-6 w-6 opacity-45' : 'h-7 w-7 opacity-55',
          )}
          onClick={(event) => event.stopPropagation()}
          aria-label="Suhbat amallari"
        >
          <MoreHorizontal className={compact ? 'h-3.5 w-3.5' : 'h-4 w-4'} />
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
            <>
              <PinOff className="mr-2 h-3.5 w-3.5" /> Mahkamlashni olish
            </>
          ) : (
            <>
              <Pin className="mr-2 h-3.5 w-3.5" /> Mahkamlash
            </>
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
  );

  const renderConversation = (conversation: AIConversation) => (
    <div
      key={conversation.id}
      role="button"
      tabIndex={0}
      onClick={() => onSelect(conversation)}
      onKeyDown={(event) => event.key === 'Enter' && onSelect(conversation)}
      className={cn(
        'group flex w-full max-w-full min-w-0 items-center gap-2 overflow-hidden rounded-xl px-2 py-2 text-left transition-colors',
        'hover:bg-muted/70',
        activeId === conversation.id && 'bg-muted',
      )}
    >
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-border/60 bg-background">
        {conversation.pinned ? <Pin className="h-3.5 w-3.5" /> : <MessageSquare className="h-3.5 w-3.5" />}
      </span>

      <div className="w-0 min-w-0 flex-1 overflow-hidden pr-0.5">
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
            className="h-7 min-w-0 max-w-full text-xs"
          />
        ) : (
          <>
            <p className="block max-w-full truncate text-[13px] font-medium leading-tight" title={conversation.title}>
              {conversation.title}
            </p>
            {snippetFor(conversation) && (
              <p className="max-w-full truncate text-[10px] text-muted-foreground">{snippetFor(conversation)}</p>
            )}
          </>
        )}
      </div>

      {renderConversationMenu(conversation)}
    </div>
  );

  const renderProjectConversation = (conversation: AIConversation) => (
    <div
      key={conversation.id}
      className={cn(
        'group flex w-full max-w-full min-w-0 items-center overflow-hidden rounded-lg transition-colors hover:bg-muted/55',
        activeId === conversation.id && 'bg-muted/70',
      )}
    >
      <button
        type="button"
        onClick={() => onSelect(conversation)}
        className="flex w-0 min-w-0 flex-1 items-center px-2 py-1.5 text-left text-xs"
        title={conversation.title}
      >
        <span className="block max-w-full truncate">{conversation.title}</span>
      </button>
      {renderConversationMenu(conversation, true)}
    </div>
  );

  return (
    <div className="flex h-full w-full min-w-0 flex-col overflow-hidden bg-background">
      <div className="shrink-0 space-y-2.5 p-3 pb-2">
        <div className="flex min-w-0 items-center justify-between gap-2">
          <div className="min-w-0 overflow-hidden px-1">
            <span className="block truncate text-sm font-semibold">Alsamos AI</span>
          </div>
          <Button size="icon" variant="ghost" className="h-8 w-8 shrink-0 rounded-lg" onClick={onClose} aria-label="Yon panelni yopish">
            {isMobile ? <ChevronLeft className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
          </Button>
        </div>

        <Button
          className="h-9 w-full min-w-0 gap-2 overflow-hidden rounded-xl bg-foreground text-background hover:bg-foreground/90"
          onClick={startGlobalConversation}
        >
          <Plus className="h-4 w-4 shrink-0" />
          <span className="truncate">Yangi suhbat</span>
        </Button>
      </div>

      <div className="alsamos-scrollbar min-h-0 min-w-0 flex-1 overflow-y-auto overflow-x-hidden px-3 pb-3">
        <nav className="min-w-0 space-y-0.5 overflow-hidden">
          <div className="min-w-0 rounded-xl">
            <div className="flex min-w-0 items-center gap-1">
              <button
                type="button"
                onClick={() => onOpenProjects?.()}
                className={cn(
                  'flex min-w-0 flex-1 items-center overflow-hidden rounded-xl px-2.5 py-2 text-left text-[13px] font-medium transition-colors hover:bg-muted/60',
                  activeProjectId && 'bg-muted/45',
                )}
              >
                <span className="min-w-0 flex-1 truncate">Loyihalar</span>
                {projects.length > 0 && <span className="shrink-0 text-[10px] text-muted-foreground">{projects.length}</span>}
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

            <div className="mt-1 min-w-0 space-y-0.5">
              {projects.map((project) => {
                const projectChats = sidebarProjectConversations(conversations, project.id, query);
                const expanded = activeProjectId === project.id || (query.trim().length > 0 && projectChats.length > 0);
                return (
                  <div key={project.id} className="min-w-0 overflow-hidden">
                    <div
                      className={cn(
                        'group/project flex min-w-0 items-center overflow-hidden rounded-lg transition-colors hover:bg-muted/55',
                        activeProjectId === project.id && 'bg-muted/55',
                      )}
                    >
                      <button
                        type="button"
                        onClick={() => onSelectProject?.(project.id)}
                        className="flex w-0 min-w-0 flex-1 items-center gap-2 overflow-hidden px-2 py-1.5 text-left text-xs"
                      >
                        <FolderKanban className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                        <span className="min-w-0 flex-1 truncate font-medium">{project.name}</span>
                      </button>

                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        className="h-6 w-6 shrink-0 rounded-md text-muted-foreground opacity-70 hover:opacity-100 group-hover/project:opacity-100"
                        onClick={(event) => {
                          event.stopPropagation();
                          startProjectConversation(project.id);
                        }}
                        aria-label={`${project.name} loyihasida yangi suhbat`}
                        title="Loyihada yangi suhbat"
                      >
                        <Plus className="h-3.5 w-3.5" />
                      </Button>

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

                    {expanded && (
                      <div className="ml-6 min-w-0 space-y-0.5 border-l border-border/45 pl-2">
                        {projectChats.map(renderProjectConversation)}
                        {projectChats.length === 0 && activeProjectId === project.id && !query && (
                          <p className="px-2 py-1.5 text-[10px] text-muted-foreground">Bu loyihada hali suhbat yo‘q</p>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}

              {projects.length === 0 && (
                <p className="px-2 py-1.5 text-[11px] text-muted-foreground">Hozircha loyiha yo‘q</p>
              )}
            </div>
          </div>

          <button
            type="button"
            onClick={() => onOpenArtifacts?.()}
            className="flex w-full min-w-0 items-center gap-2.5 overflow-hidden rounded-xl px-2.5 py-2 text-left text-[13px] font-medium text-foreground/80 hover:bg-muted/60"
          >
            <FileCode2 className="h-4 w-4 shrink-0 text-muted-foreground" />
            <span className="min-w-0 flex-1 truncate">Artefaktlar</span>
            {artifactCount > 0 && <span className="shrink-0 rounded-full bg-muted px-1.5 text-[10px] text-muted-foreground">{artifactCount}</span>}
          </button>
          <button
            type="button"
            onClick={() => onOpenConnectors?.()}
            className="flex w-full min-w-0 items-center gap-2.5 overflow-hidden rounded-xl px-2.5 py-2 text-left text-[13px] font-medium text-foreground/80 hover:bg-muted/60"
          >
            <Plug className="h-4 w-4 shrink-0 text-muted-foreground" />
            <span className="min-w-0 flex-1 truncate">Konnektorlar</span>
          </button>
        </nav>

        <div className="relative mt-2 min-w-0 border-t border-border/50 pt-3">
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
            placeholder="Suhbatlarni qidirish"
            className="h-8 min-w-0 max-w-full rounded-xl pl-8 text-xs"
          />
        </div>

        <div className="mt-3 min-w-0 overflow-hidden">
          {loading ? (
            <div className="space-y-2 px-1 pt-1">
              {Array.from({ length: 6 }).map((_, index) => <Skeleton key={index} className="h-10 w-full rounded-xl" />)}
            </div>
          ) : filteredGeneral.length === 0 ? (
            <div className="px-4 py-8 text-center text-xs text-muted-foreground">
              {query ? 'Umumiy suhbatlarda natija topilmadi' : 'Hozircha umumiy suhbat yo‘q'}
            </div>
          ) : (
            <div className="min-w-0 space-y-3 overflow-hidden pb-3">
              {pinned.length > 0 && (
                <section className="min-w-0 overflow-hidden">
                  <div className="mb-1 flex items-center gap-1.5 px-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                    <Pin className="h-3 w-3" /> Mahkamlangan
                  </div>
                  <div className="min-w-0 space-y-0.5 overflow-hidden">{pinned.map(renderConversation)}</div>
                </section>
              )}

              <section className="min-w-0 overflow-hidden">
                <button
                  type="button"
                  onClick={() => setRecentsOpen((value) => !value)}
                  className="mb-1 flex w-full min-w-0 items-center gap-1.5 overflow-hidden px-2 text-left text-[10px] font-semibold uppercase tracking-wide text-muted-foreground"
                >
                  <History className="h-3 w-3 shrink-0" />
                  <span className="truncate">Suhbatlar</span>
                  <ChevronDown className={cn('ml-auto h-3 w-3 shrink-0 transition-transform', !recentsOpen && '-rotate-90')} />
                </button>
                {recentsOpen && (
                  <div className="min-w-0 space-y-2 overflow-hidden">
                    {groups.map((group) => (
                      <div key={group.key} className="min-w-0 overflow-hidden">
                        <p className="mb-0.5 truncate px-2 text-[10px] text-muted-foreground">{group.label}</p>
                        <div className="min-w-0 space-y-0.5 overflow-hidden">{group.items.map(renderConversation)}</div>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            </div>
          )}
        </div>
      </div>

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

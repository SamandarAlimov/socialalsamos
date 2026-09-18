import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ArrowUpDown,
  FolderKanban,
  Loader2,
  MoreHorizontal,
  Pencil,
  Plus,
  Search,
  Trash2,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';

import { AIProjectDialog } from '@/components/ai/AIProjectDialog';
import type { AIProject } from '@/components/ai/types';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { migrateLegacyLocalProjectsToCloud } from '@/lib/ai/migrateLegacyProjects';
import {
  countConversationsByProject,
  createLocalProject,
  deleteLocalProject,
  listLocalProjects,
  updateLocalProject,
} from '@/lib/ai/projectsStore';
import { db } from '@/lib/db';

type ProjectBackendMode = 'database' | 'local';

type ProjectRow = {
  id: string;
  name?: string | null;
  instructions?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

function projectFromRow(row: ProjectRow): AIProject {
  return {
    id: String(row.id),
    name: String(row.name || 'Loyiha'),
    instructions: String(row.instructions || ''),
    createdAt: new Date(row.created_at || Date.now()),
    updatedAt: new Date(row.updated_at || Date.now()),
  };
}

function isProjectSchemaError(error: any): boolean {
  const message = `${error?.message || ''} ${error?.details || ''} ${error?.hint || ''}`.toLowerCase();
  return (
    message.includes('ai_projects') ||
    message.includes('project_id') ||
    message.includes('optional ai schema') ||
    message.includes('schema cache') ||
    error?.code === '42P01' ||
    error?.code === '42703' ||
    error?.code === 'PGRST204' ||
    error?.code === 'PGRST205'
  );
}

function countDatabaseProjects(rows: Array<{ project_id?: string | null }>): Record<string, number> {
  return rows.reduce<Record<string, number>>((result, row) => {
    const projectId = row.project_id ? String(row.project_id) : null;
    if (projectId) result[projectId] = (result[projectId] || 0) + 1;
    return result;
  }, {});
}

function modifiedLabel(date: Date): string {
  const now = new Date();
  const sameYear = date.getFullYear() === now.getFullYear();
  return new Intl.DateTimeFormat('uz-UZ', {
    day: 'numeric',
    month: 'short',
    ...(sameYear ? {} : { year: 'numeric' as const }),
  }).format(date);
}

export default function ProjectsPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [projects, setProjects] = useState<AIProject[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [backendMode, setBackendMode] = useState<ProjectBackendMode>('local');
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [sortNewest, setSortNewest] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<AIProject | null>(null);

  const loadLocal = useCallback(async (userId: string) => {
    setBackendMode('local');
    setProjects(listLocalProjects(userId));

    try {
      const { data } = await db
        .from('ai_conversations')
        .select('id')
        .eq('user_id', userId)
        .limit(2000);
      const ids = ((data as Array<{ id: string }> | null) || []).map((row) => String(row.id));
      setCounts(countConversationsByProject(userId, ids));
    } catch {
      setCounts(countConversationsByProject(userId));
    }
  }, []);

  const load = useCallback(async () => {
    if (!user) {
      setProjects([]);
      setCounts({});
      setBackendMode('local');
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      try {
        await migrateLegacyLocalProjectsToCloud(user.id);
      } catch (migrationError) {
        console.error('Legacy AI project migration failed on Projects page:', migrationError);
      }

      const projectResult = await db
        .from('ai_projects')
        .select('*')
        .eq('user_id', user.id)
        .order('updated_at', { ascending: false });

      if (projectResult.error) {
        if (!isProjectSchemaError(projectResult.error)) {
          console.error('AI projects cloud load failed:', projectResult.error);
        }
        await loadLocal(user.id);
        return;
      }

      setBackendMode('database');
      setProjects(((projectResult.data as ProjectRow[] | null) || []).map(projectFromRow));

      const conversationResult = await db
        .from('ai_conversations')
        .select('project_id')
        .eq('user_id', user.id)
        .limit(2000);

      if (conversationResult.error && !isProjectSchemaError(conversationResult.error)) {
        console.error('AI project conversation counts failed:', conversationResult.error);
      }

      setCounts(
        conversationResult.error
          ? {}
          : countDatabaseProjects(
              (conversationResult.data as Array<{ project_id?: string | null }> | null) || [],
            ),
      );
    } catch (error) {
      console.error('AI projects load failed:', error);
      await loadLocal(user.id);
    } finally {
      setLoading(false);
    }
  }, [loadLocal, user]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (backendMode !== 'local') return;
    const onStorage = (event: StorageEvent) => {
      if (!user || !event.key?.startsWith('alsamos.ai.projects.')) return;
      setProjects(listLocalProjects(user.id));
      setCounts(countConversationsByProject(user.id));
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [backendMode, user]);

  const filtered = useMemo(() => {
    const clean = query.trim().toLowerCase();
    const items = clean
      ? projects.filter(
          (project) =>
            project.name.toLowerCase().includes(clean) ||
            project.instructions.toLowerCase().includes(clean),
        )
      : [...projects];

    return items.sort((a, b) =>
      sortNewest
        ? b.updatedAt.getTime() - a.updatedAt.getTime()
        : a.updatedAt.getTime() - b.updatedAt.getTime(),
    );
  }, [projects, query, sortNewest]);

  const openCreate = () => {
    setEditing(null);
    setDialogOpen(true);
  };

  const openEdit = (project: AIProject) => {
    setEditing(project);
    setDialogOpen(true);
  };

  const save = async (value: { name: string; instructions: string }) => {
    if (!user) return;

    if (backendMode === 'local') {
      if (editing) {
        const updated = updateLocalProject(user.id, editing.id, value);
        if (!updated) throw new Error('Loyiha topilmadi.');
        setProjects(listLocalProjects(user.id));
        toast({ title: 'Loyiha yangilandi' });
        return;
      }

      const created = createLocalProject(user.id, value);
      setProjects(listLocalProjects(user.id));
      setCounts((previous) => ({ ...previous, [created.id]: 0 }));
      toast({ title: 'Loyiha yaratildi' });
      return;
    }

    if (editing) {
      const now = new Date().toISOString();
      const { data, error } = await db
        .from('ai_projects')
        .update({ name: value.name, instructions: value.instructions, updated_at: now })
        .eq('id', editing.id)
        .eq('user_id', user.id)
        .select('*')
        .single();

      if (error || !data) {
        toast({
          title: 'Loyiha saqlanmadi',
          description: error?.message || 'Bulutdagi loyiha yangilanmadi.',
          variant: 'destructive',
        });
        throw error || new Error('Loyiha yangilanmadi');
      }

      const updated = projectFromRow(data as ProjectRow);
      setProjects((previous) =>
        previous.map((project) => (project.id === updated.id ? updated : project)),
      );
      toast({ title: 'Loyiha yangilandi' });
      return;
    }

    const { data, error } = await db
      .from('ai_projects')
      .insert({ user_id: user.id, name: value.name, instructions: value.instructions })
      .select('*')
      .single();

    if (error || !data) {
      toast({
        title: 'Loyiha yaratilmadi',
        description: error?.message || 'Bulutdagi loyiha yaratilmadi.',
        variant: 'destructive',
      });
      throw error || new Error('Loyiha yaratilmadi');
    }

    const created = projectFromRow(data as ProjectRow);
    setProjects((previous) => [created, ...previous]);
    setCounts((previous) => ({ ...previous, [created.id]: 0 }));
    toast({ title: 'Loyiha yaratildi' });
  };

  const remove = async (project: AIProject) => {
    if (!user) return;
    const approved = window.confirm(
      `“${project.name}” loyihasini o‘chirasizmi? Suhbatlar o‘chmaydi, faqat loyihadan chiqariladi.`,
    );
    if (!approved) return;

    if (backendMode === 'local') {
      deleteLocalProject(user.id, project.id);
      setProjects(listLocalProjects(user.id));
      setCounts((previous) => {
        const next = { ...previous };
        delete next[project.id];
        return next;
      });
      toast({ title: 'Loyiha o‘chirildi' });
      return;
    }

    const { error } = await db
      .from('ai_projects')
      .delete()
      .eq('id', project.id)
      .eq('user_id', user.id);

    if (error) {
      toast({
        title: 'Loyiha o‘chirilmadi',
        description: error.message,
        variant: 'destructive',
      });
      return;
    }

    setProjects((previous) => previous.filter((item) => item.id !== project.id));
    setCounts((previous) => {
      const next = { ...previous };
      delete next[project.id];
      return next;
    });
    toast({ title: 'Loyiha o‘chirildi' });
  };

  const openProject = (project: AIProject) => {
    navigate(`/ai?project=${encodeURIComponent(project.id)}`);
  };

  return (
    <div className="mx-auto w-full min-w-0 max-w-5xl overflow-x-hidden px-3 pb-16 pt-4 sm:px-5 sm:pb-20 sm:pt-7 lg:px-7 lg:pb-24 lg:pt-10">
      <AIProjectDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        project={editing}
        onSave={save}
      />

      <header className="mb-5 flex min-w-0 flex-col gap-3 sm:gap-4 lg:mb-8 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Loyihalar</h1>
          <p className="mt-1 text-xs text-muted-foreground">
            {backendMode === 'database' ? 'Hisobingiz bilan sinxronlangan' : 'Shu qurilmada saqlanmoqda'}
          </p>
        </div>

        <div className="flex w-full min-w-0 flex-col gap-2 min-[420px]:flex-row min-[420px]:items-center lg:w-auto">
          <div className="relative w-full min-w-0 flex-1 lg:w-64 lg:flex-none">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Loyihalarni qidirish"
              className="h-10 min-w-0 rounded-xl pl-9"
              autoComplete="off"
              aria-label="Loyihalarni qidirish"
            />
          </div>
          <Button
            onClick={openCreate}
            className="h-10 w-full shrink-0 gap-1.5 rounded-xl bg-foreground px-3 text-background hover:bg-foreground/90 min-[420px]:w-auto sm:px-4"
          >
            <Plus className="h-4 w-4" /> <span>Yangi loyiha</span>
          </Button>
        </div>
      </header>

      <div className="mb-3 border-b border-border/60">
        <button
          type="button"
          className="relative px-1 pb-3 text-sm font-medium text-foreground after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 after:rounded-full after:bg-foreground"
        >
          Barchasi
        </button>
      </div>

      <div className="hidden grid-cols-[minmax(0,1fr)_auto_36px] items-center gap-3 border-b border-border/60 px-2 py-3 text-xs text-muted-foreground sm:grid">
        <span>Nomi</span>
        <button
          type="button"
          onClick={() => setSortNewest((value) => !value)}
          className="hidden items-center gap-1 rounded-md px-1 py-0.5 hover:text-foreground sm:flex"
          aria-label="Yangilangan vaqt bo‘yicha saralash"
        >
          O‘zgartirilgan <ArrowUpDown className="h-3 w-3" />
        </button>
        <span className="sr-only">Amallar</span>
      </div>

      {loading ? (
        <div className="flex min-h-64 items-center justify-center text-muted-foreground">
          <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Yuklanmoqda…
        </div>
      ) : filtered.length === 0 ? (
        <div className="px-2 py-16 text-center sm:py-20">
          <FolderKanban className="mx-auto mb-3 h-9 w-9 text-muted-foreground" />
          <p className="font-medium">{query ? 'Loyiha topilmadi' : 'Hozircha loyiha yo‘q'}</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {query ? 'Qidiruv so‘zini o‘zgartirib ko‘ring.' : 'Birinchi loyihangizni yarating.'}
          </p>
          {!query && (
            <Button
              className="mt-5 rounded-xl bg-foreground text-background hover:bg-foreground/90"
              onClick={openCreate}
            >
              <Plus className="mr-1 h-4 w-4" /> Yangi loyiha
            </Button>
          )}
        </div>
      ) : (
        <div>
          {filtered.map((project) => (
            <div
              key={project.id}
              role="button"
              tabIndex={0}
              onClick={() => openProject(project)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  openProject(project);
                }
              }}
              className="group mb-2 grid min-w-0 cursor-pointer grid-cols-[minmax(0,1fr)_36px] items-center gap-2 rounded-2xl border border-border/60 bg-card/20 px-3 py-3.5 transition-colors hover:bg-muted/35 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 sm:mb-0 sm:grid-cols-[minmax(0,1fr)_auto_36px] sm:gap-3 sm:rounded-none sm:border-x-0 sm:border-t-0 sm:bg-transparent sm:px-2 sm:py-4"
            >
              <div className="flex min-w-0 items-center gap-2.5 sm:gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-border/70 bg-muted/35">
                  <FolderKanban className="h-4 w-4" />
                </span>
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium" title={project.name}>{project.name}</p>
                  <p className="mt-0.5 truncate text-xs text-muted-foreground">
                    {counts[project.id] || 0} suhbat <span className="sm:hidden">· {modifiedLabel(project.updatedAt)}</span>
                  </p>
                  {project.instructions && (
                    <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-muted-foreground/80 sm:hidden">
                      {project.instructions}
                    </p>
                  )}
                </div>
              </div>

              <span className="hidden whitespace-nowrap text-xs text-muted-foreground sm:block">
                {modifiedLabel(project.updatedAt)}
              </span>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8 rounded-lg opacity-70 group-hover:opacity-100"
                    aria-label="Loyiha amallari"
                    onClick={(event) => event.stopPropagation()}
                  >
                    <MoreHorizontal className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" onClick={(event) => event.stopPropagation()}>
                  <DropdownMenuItem onClick={() => openEdit(project)}>
                    <Pencil className="mr-2 h-4 w-4" /> Tahrirlash
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    className="text-destructive"
                    onClick={() => void remove(project)}
                  >
                    <Trash2 className="mr-2 h-4 w-4" /> O‘chirish
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

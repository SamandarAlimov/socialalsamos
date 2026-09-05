import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ArrowUpDown,
  Cloud,
  FolderKanban,
  HardDrive,
  Loader2,
  MessageSquare,
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
import { db } from '@/lib/db';
import {
  countConversationsByProject,
  createLocalProject,
  deleteLocalProject,
  listLocalProjects,
  updateLocalProject,
} from '@/lib/ai/projectsStore';

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

    // ai_conversations itself is old/stable schema. Use its IDs to avoid
    // counting mappings for chats that were already deleted remotely.
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
    <div className="mx-auto w-full max-w-6xl px-4 pb-24 pt-6 sm:px-6 lg:px-8">
      <AIProjectDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        project={editing}
        onSave={save}
      />

      <header className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Loyihalar</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Bir mavzu yoki ish uchun doimiy AI kontekstini alohida saqlang.
          </p>
          <div className="mt-2 inline-flex items-center gap-1.5 text-[11px] text-muted-foreground">
            {backendMode === 'database' ? (
              <>
                <Cloud className="h-3.5 w-3.5" /> Bulut bilan sinxron
              </>
            ) : (
              <>
                <HardDrive className="h-3.5 w-3.5" /> Shu qurilmada saqlanmoqda
              </>
            )}
          </div>
        </div>
        <Button
          onClick={openCreate}
          className="h-10 shrink-0 gap-1.5 rounded-xl bg-foreground px-4 text-background hover:bg-foreground/90"
        >
          <Plus className="h-4 w-4" /> Yangi loyiha
        </Button>
      </header>

      <div className="mb-7 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Loyihalarni qidirish"
            className="h-10 rounded-xl pl-9"
            autoComplete="off"
          />
        </div>
        <Button
          type="button"
          variant="outline"
          className="h-10 justify-start gap-2 rounded-xl sm:justify-center"
          onClick={() => setSortNewest((value) => !value)}
        >
          <ArrowUpDown className="h-4 w-4" />
          {sortNewest ? 'Oxirgi yangilangan' : 'Eski yangilangan'}
        </Button>
      </div>

      {loading ? (
        <div className="flex min-h-64 items-center justify-center text-muted-foreground">
          <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Yuklanmoqda…
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border/70 p-10 text-center">
          <FolderKanban className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
          <p className="font-medium">{query ? 'Loyiha topilmadi' : 'Hozircha loyiha yo‘q'}</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {query ? 'Qidiruv so‘zini o‘zgartirib ko‘ring.' : 'Birinchi loyihani yarating.'}
          </p>
          {!query && (
            <Button
              className="mt-4 rounded-xl bg-foreground text-background hover:bg-foreground/90"
              onClick={openCreate}
            >
              <Plus className="mr-1 h-4 w-4" /> Yaratish
            </Button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map((project) => (
            <article
              key={project.id}
              role="button"
              tabIndex={0}
              onClick={() => openProject(project)}
              onKeyDown={(event) => event.key === 'Enter' && openProject(project)}
              className="group flex min-h-52 cursor-pointer flex-col rounded-2xl border border-border/70 bg-card p-5 transition-colors hover:bg-muted/25 focus:outline-none focus:ring-2 focus:ring-ring"
            >
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-border/70 bg-muted/50">
                  <FolderKanban className="h-4 w-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <h2 className="truncate font-semibold" title={project.name}>{project.name}</h2>
                  <div className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                    <MessageSquare className="h-3.5 w-3.5" /> {counts[project.id] || 0} suhbat
                  </div>
                </div>

                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8 shrink-0 rounded-lg"
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

              <p className="mt-5 line-clamp-4 flex-1 text-sm leading-relaxed text-muted-foreground">
                {project.instructions || 'Bu loyiha uchun hali doimiy ko‘rsatma yozilmagan.'}
              </p>

              <div className="mt-5 flex items-center justify-between border-t border-border/60 pt-3">
                <span className="text-[11px] text-muted-foreground">
                  {project.updatedAt.toLocaleDateString('uz-UZ')}
                </span>
                <span className="text-xs font-medium">Ochish →</span>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}

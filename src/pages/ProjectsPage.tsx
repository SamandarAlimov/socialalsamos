import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ArrowUpDown,
  FolderKanban,
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

export default function ProjectsPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [projects, setProjects] = useState<AIProject[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [sortNewest, setSortNewest] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<AIProject | null>(null);

  const load = useCallback(async () => {
    if (!user) {
      setProjects([]);
      setCounts({});
      setLoading(false);
      return;
    }

    setLoading(true);
    const localProjects = listLocalProjects(user.id);
    setProjects(localProjects);

    // ai_conversations is part of the original, already-deployed AI schema.
    // We only read IDs here. Project membership itself lives in a resilient
    // client mapping until the optional ai_projects migration is deployed.
    try {
      const { data } = await db
        .from('ai_conversations')
        .select('id')
        .eq('user_id', user.id)
        .limit(1000);
      const ids = ((data as Array<{ id: string }> | null) || []).map((row) => String(row.id));
      setCounts(countConversationsByProject(user.id, ids));
    } catch {
      setCounts(countConversationsByProject(user.id));
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (!user || !event.key?.startsWith('alsamos.ai.projects.')) return;
      setProjects(listLocalProjects(user.id));
      setCounts(countConversationsByProject(user.id));
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [user]);

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
  };

  const remove = (project: AIProject) => {
    if (!user) return;
    const approved = window.confirm(
      `“${project.name}” loyihasini o‘chirasizmi? Suhbatlar o‘chmaydi, faqat loyihadan chiqariladi.`,
    );
    if (!approved) return;

    deleteLocalProject(user.id, project.id);
    setProjects(listLocalProjects(user.id));
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
                    <DropdownMenuItem className="text-destructive" onClick={() => remove(project)}>
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

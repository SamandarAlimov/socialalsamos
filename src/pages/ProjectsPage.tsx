import { useCallback, useEffect, useMemo, useState } from 'react';
import { FolderKanban, Loader2, MessageSquare, MoreHorizontal, Pencil, Plus, Search, Trash2 } from 'lucide-react';
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

function fromRow(row: any): AIProject {
  return {
    id: String(row.id),
    name: String(row.name || 'Loyiha'),
    instructions: String(row.instructions || ''),
    createdAt: new Date(row.created_at || Date.now()),
    updatedAt: new Date(row.updated_at || Date.now()),
  };
}

function readableError(error: any): string {
  const message = String(error?.message || '');
  if (
    error?.code === '42P01' ||
    error?.code === 'PGRST205' ||
    message.toLowerCase().includes('ai_projects') ||
    message.toLowerCase().includes('schema cache')
  ) {
    return 'Loyihalar jadvali production bazaga hali qo‘llanmagan. Supabase deployment tugagach sahifani yangilang.';
  }
  return message || 'Loyihalarni yuklab bo‘lmadi.';
}

export default function ProjectsPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [projects, setProjects] = useState<AIProject[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<AIProject | null>(null);

  const load = useCallback(async () => {
    if (!user) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    const [projectResult, conversationResult] = await Promise.all([
      db.from('ai_projects').select('*').eq('user_id', user.id).order('updated_at', { ascending: false }),
      db.from('ai_conversations').select('project_id').eq('user_id', user.id),
    ]);

    if (projectResult.error) {
      setProjects([]);
      setCounts({});
      setError(readableError(projectResult.error));
      setLoading(false);
      return;
    }

    const nextProjects = ((projectResult.data as any[]) || []).map(fromRow);
    const nextCounts: Record<string, number> = {};
    if (!conversationResult.error) {
      for (const row of ((conversationResult.data as any[]) || [])) {
        if (!row.project_id) continue;
        const id = String(row.project_id);
        nextCounts[id] = (nextCounts[id] || 0) + 1;
      }
    }

    setProjects(nextProjects);
    setCounts(nextCounts);
    setLoading(false);
  }, [user]);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    const clean = query.trim().toLowerCase();
    if (!clean) return projects;
    return projects.filter(
      (project) =>
        project.name.toLowerCase().includes(clean) || project.instructions.toLowerCase().includes(clean),
    );
  }, [projects, query]);

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
    const now = new Date().toISOString();

    if (editing) {
      const { data, error: updateError } = await db
        .from('ai_projects')
        .update({ ...value, updated_at: now })
        .eq('id', editing.id)
        .eq('user_id', user.id)
        .select('*')
        .single();

      if (updateError || !data) {
        const message = readableError(updateError);
        toast({ title: 'Loyiha saqlanmadi', description: message, variant: 'destructive' });
        throw updateError || new Error(message);
      }

      const updated = fromRow(data);
      setProjects((previous) => previous.map((project) => (project.id === updated.id ? updated : project)));
      toast({ title: 'Loyiha yangilandi' });
      return;
    }

    const { data, error: insertError } = await db
      .from('ai_projects')
      .insert({ user_id: user.id, ...value, updated_at: now })
      .select('*')
      .single();

    if (insertError || !data) {
      const message = readableError(insertError);
      toast({ title: 'Loyiha yaratilmadi', description: message, variant: 'destructive' });
      throw insertError || new Error(message);
    }

    const created = fromRow(data);
    setProjects((previous) => [created, ...previous]);
    toast({ title: 'Loyiha yaratildi' });
  };

  const remove = async (project: AIProject) => {
    const approved = window.confirm(`“${project.name}” loyihasini o‘chirasizmi? Suhbatlar o‘chmaydi, faqat loyihadan chiqariladi.`);
    if (!approved || !user) return;

    const { error: deleteError } = await db
      .from('ai_projects')
      .delete()
      .eq('id', project.id)
      .eq('user_id', user.id);

    if (deleteError) {
      toast({ title: 'Loyiha o‘chirilmadi', description: readableError(deleteError), variant: 'destructive' });
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

  return (
    <div className="mx-auto w-full max-w-6xl px-4 pb-24 pt-5">
      <AIProjectDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        project={editing}
        onSave={save}
      />

      <header className="mb-5 flex items-start justify-between gap-3">
        <div>
          <div className="mb-1 flex items-center gap-2">
            <FolderKanban className="h-5 w-5" />
            <h1 className="text-2xl font-semibold tracking-tight">Loyihalar</h1>
          </div>
          <p className="max-w-2xl text-sm text-muted-foreground">
            AI ishlarini loyiha bo‘yicha ajrating, doimiy ko‘rsatmalarni saqlang va shu loyihaga tegishli suhbatlarni boshqaring.
          </p>
        </div>
        <Button onClick={openCreate} className="shrink-0 gap-1.5">
          <Plus className="h-4 w-4" /> Yangi loyiha
        </Button>
      </header>

      <div className="relative mb-5 max-w-xl">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Loyihalarni qidirish"
          className="pl-9"
          autoComplete="off"
        />
      </div>

      {loading ? (
        <div className="flex min-h-64 items-center justify-center text-muted-foreground">
          <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Yuklanmoqda…
        </div>
      ) : error ? (
        <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-6">
          <p className="font-medium text-destructive">Loyihalar hozircha ochilmadi</p>
          <p className="mt-1 text-sm text-muted-foreground">{error}</p>
          <Button variant="outline" className="mt-4" onClick={() => void load()}>Qayta urinish</Button>
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-2xl border border-dashed p-10 text-center">
          <FolderKanban className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
          <p className="font-medium">{query ? 'Loyiha topilmadi' : 'Hozircha loyiha yo‘q'}</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {query ? 'Qidiruv so‘zini o‘zgartirib ko‘ring.' : 'Birinchi loyihani yarating va AI ishlarini alohida kontekstlarda yuriting.'}
          </p>
          {!query && <Button className="mt-4" onClick={openCreate}><Plus className="mr-1 h-4 w-4" /> Yaratish</Button>}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map((project) => (
            <article key={project.id} className="group rounded-2xl border bg-card p-4 transition-shadow hover:shadow-sm">
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border bg-muted/50">
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
                    <Button size="icon" variant="ghost" className="h-8 w-8 shrink-0" aria-label="Loyiha amallari">
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => openEdit(project)}>
                      <Pencil className="mr-2 h-4 w-4" /> Tahrirlash
                    </DropdownMenuItem>
                    <DropdownMenuItem className="text-destructive" onClick={() => void remove(project)}>
                      <Trash2 className="mr-2 h-4 w-4" /> O‘chirish
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>

              <p className="mt-4 line-clamp-4 min-h-20 text-sm leading-relaxed text-muted-foreground">
                {project.instructions || 'Bu loyiha uchun hali doimiy ko‘rsatma yozilmagan.'}
              </p>

              <div className="mt-4 flex items-center justify-between border-t pt-3">
                <span className="text-[11px] text-muted-foreground">
                  {project.updatedAt.toLocaleDateString('uz-UZ')}
                </span>
                <Button size="sm" variant="outline" onClick={() => navigate('/ai')}>
                  AI’ga o‘tish
                </Button>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}

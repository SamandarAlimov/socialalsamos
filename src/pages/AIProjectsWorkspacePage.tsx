import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { PanelLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

import { AISidebar as AISidebarV2 } from '@/components/ai/AISidebarV2';
import type { AIConversation, AIMessage, AIProject } from '@/components/ai/types';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';
import { useAIWorkspaceLayout } from '@/hooks/use-ai-workspace-layout';
import { projectForConversation, listLocalProjects } from '@/lib/ai/projectsStore';
import { buildAIWorkspaceHref } from '@/lib/ai/workspaceUrl';
import { db } from '@/lib/db';
import { cn } from '@/lib/utils';
import ProjectsPage from './ProjectsPage';

const PIN_KEY = 'alsamos.ai.pinned';
const TITLE_KEY = 'alsamos.ai.titles';

type ProjectRow = {
  id: string;
  name?: string | null;
  instructions?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

type ConversationRow = {
  id: string;
  messages?: unknown[] | null;
  updated_at?: string | null;
  project_id?: string | null;
};

function readMap(key: string): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(key) || '{}');
  } catch {
    return {};
  }
}

function writeMap(key: string, value: Record<string, string>) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage is only a convenience for sidebar presentation state.
  }
}

function reviveMessages(raw: unknown[] | null | undefined): AIMessage[] {
  return (raw || []).map((message) => {
    const item = message as AIMessage & { timestamp?: Date | string | number };
    return {
      ...item,
      timestamp: new Date(item.timestamp || Date.now()),
    } as AIMessage;
  });
}

function projectFromRow(row: ProjectRow): AIProject {
  return {
    id: String(row.id),
    name: String(row.name || 'Loyiha'),
    instructions: String(row.instructions || ''),
    createdAt: new Date(row.created_at || Date.now()),
    updatedAt: new Date(row.updated_at || Date.now()),
  };
}

function titleFor(messages: AIMessage[], id: string): string {
  const override = readMap(TITLE_KEY)[id];
  if (override) return override;
  const firstUser = messages.find((message) => message.role === 'user' && message.content.trim());
  if (!firstUser) return 'Yangi suhbat';
  return firstUser.content.slice(0, 48) + (firstUser.content.length > 48 ? '…' : '');
}

function isProjectSchemaError(error: any): boolean {
  const message = `${error?.message || ''} ${error?.details || ''} ${error?.hint || ''}`.toLowerCase();
  return (
    message.includes('ai_projects') ||
    message.includes('project_id') ||
    message.includes('schema cache') ||
    error?.code === '42P01' ||
    error?.code === '42703' ||
    error?.code === 'PGRST204' ||
    error?.code === 'PGRST205'
  );
}

export default function AIProjectsWorkspacePage() {
  const { user, profile } = useAuth();
  const navigate = useNavigate();
  const { sidebarOverlay } = useAIWorkspaceLayout();
  const [sidebarOpen, setSidebarOpen] = useState(!sidebarOverlay);
  const [loading, setLoading] = useState(true);
  const [projects, setProjects] = useState<AIProject[]>([]);
  const [conversations, setConversations] = useState<AIConversation[]>([]);

  useEffect(() => setSidebarOpen(!sidebarOverlay), [sidebarOverlay]);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      if (!user) {
        if (!cancelled) {
          setProjects([]);
          setConversations([]);
          setLoading(false);
        }
        return;
      }

      setLoading(true);
      const pins = readMap(PIN_KEY);
      const [projectResult, conversationResult] = await Promise.all([
        db.from('ai_projects').select('*').eq('user_id', user.id).order('updated_at', { ascending: false }),
        db.from('ai_conversations').select('id,messages,updated_at,project_id').eq('user_id', user.id).order('updated_at', { ascending: false }),
      ]);

      if (cancelled) return;

      const cloudProjectsReady = !projectResult.error;
      const loadedProjects = cloudProjectsReady
        ? ((projectResult.data as ProjectRow[] | null) || []).map(projectFromRow)
        : listLocalProjects(user.id);

      let rows = (conversationResult.data as ConversationRow[] | null) || [];
      if (conversationResult.error && isProjectSchemaError(conversationResult.error)) {
        const fallback = await db
          .from('ai_conversations')
          .select('id,messages,updated_at')
          .eq('user_id', user.id)
          .order('updated_at', { ascending: false });
        if (cancelled) return;
        rows = (fallback.data as ConversationRow[] | null) || [];
      }

      const loadedConversations = rows.map((row) => {
        const messages = reviveMessages(row.messages);
        const mappedProjectId = cloudProjectsReady
          ? row.project_id ? String(row.project_id) : null
          : projectForConversation(user.id, String(row.id));
        return {
          id: String(row.id),
          title: titleFor(messages, String(row.id)),
          messages,
          updatedAt: new Date(row.updated_at || Date.now()),
          pinned: Boolean(pins[row.id]),
          projectId: mappedProjectId,
        } satisfies AIConversation;
      });

      setProjects(loadedProjects);
      setConversations(loadedConversations);
      setLoading(false);
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [user]);

  const goToConversation = (conversation: AIConversation) => {
    navigate(
      buildAIWorkspaceHref('/ai', '', {
        projectId: conversation.projectId || null,
        conversationId: conversation.id,
      }),
    );
    if (sidebarOverlay) setSidebarOpen(false);
  };

  const goToProject = (projectId: string | null) => {
    if (!projectId) {
      navigate('/ai');
      return;
    }
    navigate(buildAIWorkspaceHref('/ai', '', { projectId, conversationId: null }));
    if (sidebarOverlay) setSidebarOpen(false);
  };

  const deleteConversation = async (id: string) => {
    if (!user) return;
    const { error } = await db
      .from('ai_conversations')
      .delete()
      .eq('id', id)
      .eq('user_id', user.id);
    if (!error) setConversations((items) => items.filter((item) => item.id !== id));
  };

  const renameConversation = (id: string, title: string) => {
    const titles = readMap(TITLE_KEY);
    titles[id] = title;
    writeMap(TITLE_KEY, titles);
    setConversations((items) =>
      items.map((item) => (item.id === id ? { ...item, title } : item)),
    );
  };

  const togglePin = (id: string) => {
    const pins = readMap(PIN_KEY);
    const nextPinned = !Boolean(pins[id]);
    if (nextPinned) pins[id] = '1';
    else delete pins[id];
    writeMap(PIN_KEY, pins);
    setConversations((items) =>
      items.map((item) => (item.id === id ? { ...item, pinned: nextPinned } : item)),
    );
  };

  const sortedConversations = useMemo(
    () => [...conversations].sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime()),
    [conversations],
  );

  return (
    <div className="relative flex h-full min-h-0 min-w-0 overflow-hidden bg-background">
      <AnimatePresence>
        {sidebarOpen && (
          <>
            {sidebarOverlay && (
              <motion.button
                type="button"
                aria-label="Yon panelni yopish"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="absolute inset-0 z-40 bg-black/45 backdrop-blur-[1px]"
                onClick={() => setSidebarOpen(false)}
              />
            )}
            <motion.aside
              initial={{ x: sidebarOverlay ? -320 : 0, opacity: sidebarOverlay ? 0 : 1 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: -320, opacity: 0 }}
              transition={{ type: 'spring', damping: 26, stiffness: 300 }}
              className={cn(
                'z-50 flex min-h-0 min-w-0 flex-col border-r border-border/50 bg-background',
                sidebarOverlay
                  ? 'absolute inset-y-0 left-0 w-[min(300px,88%)] shadow-2xl'
                  : 'relative h-full w-[280px] shrink-0 xl:w-[300px]',
              )}
            >
              <AISidebarV2
                conversations={sortedConversations}
                loading={loading}
                activeId={null}
                isMobile={sidebarOverlay}
                profile={profile}
                onNew={() => navigate('/ai')}
                onNewProject={goToProject}
                onSelect={goToConversation}
                onDelete={(id) => void deleteConversation(id)}
                onRename={renameConversation}
                onTogglePin={togglePin}
                onClose={() => setSidebarOpen(false)}
                onOpenProjects={() => {
                  navigate('/ai/projects');
                  if (sidebarOverlay) setSidebarOpen(false);
                }}
                projects={projects}
                activeProjectId={null}
                onSelectProject={goToProject}
              />
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      <div className="relative min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-y-contain alsamos-scrollbar">
        {!sidebarOpen && (
          <Button
            size="icon"
            variant="secondary"
            className="sticky left-3 top-3 z-30 ml-3 mt-3 inline-flex h-9 w-9 rounded-xl shadow-sm"
            onClick={() => setSidebarOpen(true)}
            aria-label="Yon panelni ochish"
          >
            <PanelLeft className="h-4 w-4" />
          </Button>
        )}
        <ProjectsPage />
      </div>
    </div>
  );
}

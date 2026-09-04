import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Code2,
  FileText,
  FolderKanban,
  Globe,
  Image as ImageIcon,
  PanelLeft,
  Sparkles,
  X,
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { db } from '@/lib/db';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { useIsMobile } from '@/hooks/use-mobile';
import { useFileUpload } from '@/hooks/useFileUpload';
import { toast as sonnerToast } from 'sonner';
import { AISidebar } from '@/components/ai/AISidebar';
import { AIComposer, type ComposerAttachment } from '@/components/ai/AIComposer';
import { AIMessageBubble, AIThinkingBubble } from '@/components/ai/AIMessageBubble';
import { AIArtifactPanel } from '@/components/ai/AIArtifactPanel';
import { AIConnectorsDialog } from '@/components/ai/AIConnectorsDialog';
import { AIGithubDialog } from '@/components/ai/AIGithubDialog';
import type {
  AIConversation,
  AIMessage,
  AIProject,
  AISource,
  AIToolEvent,
} from '@/components/ai/types';
import { extractArtifacts } from '@/lib/aiArtifacts';
import { streamAgent } from '@/lib/ai/agentClient';
import { buildRepoContext, detectRepoRefs, githubReady, githubRepoUrl } from '@/lib/ai/githubContext';
import {
  canRunGithubActions,
  detectGithubAction,
  githubActionLabel,
  githubActionsBlock,
  runGithubAction,
} from '@/lib/ai/githubActions';
import { buildBrainContext } from '@/lib/ai/brain';
import { captureMemories, syncMemories } from '@/lib/ai/memory';
import { toolLabel, type ModelId, type ToolGroupId } from '@/lib/ai/capabilities';

const PIN_KEY = 'alsamos.ai.pinned';
const TITLE_KEY = 'alsamos.ai.titles';
const PREFS_KEY = 'alsamos.ai.prefs';

const ALL_TOOL_GROUPS: ToolGroupId[] = [
  'web',
  'image',
  'video',
  'code',
  'alsamos',
  'connectors',
  'computer',
];

const readMap = (key: string): Record<string, string> => {
  try {
    return JSON.parse(localStorage.getItem(key) || '{}');
  } catch {
    return {};
  }
};

const writeMap = (key: string, value: Record<string, string>) => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // ignore storage failures
  }
};

const readPrefs = (): { model: ModelId; toolGroups: ToolGroupId[] } => {
  try {
    const parsed = JSON.parse(localStorage.getItem(PREFS_KEY) || '{}');
    const saved = Array.isArray(parsed.toolGroups) ? (parsed.toolGroups as ToolGroupId[]) : null;
    // Old preferences could silently omit video/image/code groups. Keep only the
    // deliberate web on/off choice and always restore the rest of the agent.
    const webEnabled = !saved || saved.length === 0 || saved.includes('web');
    return {
      model: (parsed.model as ModelId) || 'auto',
      toolGroups: ALL_TOOL_GROUPS.filter((group) => group !== 'web' || webEnabled),
    };
  } catch {
    return { model: 'auto', toolGroups: ALL_TOOL_GROUPS };
  }
};

function reviveMessages(raw: any[]): AIMessage[] {
  return (raw || []).map((message: any) => ({
    ...message,
    timestamp: new Date(message.timestamp || Date.now()),
  }));
}

function projectFromRow(row: any): AIProject {
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
    message.includes('schema cache') ||
    error?.code === '42P01' ||
    error?.code === '42703' ||
    error?.code === 'PGRST204'
  );
}

export default function AIPageV2() {
  const { user, profile } = useAuth();
  const { toast } = useToast();
  const isMobile = useIsMobile();
  const location = useLocation();
  const navigate = useNavigate();
  const initialPrefs = useMemo(readPrefs, []);

  const [messages, setMessages] = useState<AIMessage[]>([]);
  const [input, setInput] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [statusLabel, setStatusLabel] = useState("O'ylayapman…");
  const [conversations, setConversations] = useState<AIConversation[]>([]);
  const [projects, setProjects] = useState<AIProject[]>([]);
  const [projectsAvailable, setProjectsAvailable] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [currentConversationId, setCurrentConversationId] = useState<string | null>(null);
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(!isMobile);
  const [artifactsOpen, setArtifactsOpen] = useState(false);
  const [activeArtifactId, setActiveArtifactId] = useState<string | null>(null);
  const [attachments, setAttachments] = useState<ComposerAttachment[]>([]);
  const [connectorsOpen, setConnectorsOpen] = useState(false);
  const [githubOpen, setGithubOpen] = useState(false);
  const [model, setModel] = useState<ModelId>(initialPrefs.model);
  const [toolGroups, setToolGroups] = useState<ToolGroupId[]>(initialPrefs.toolGroups);
  const [activeModel, setActiveModel] = useState<string | null>(null);
  const [forwardedPost, setForwardedPost] = useState<{
    id: string;
    content?: string;
    authorName?: string;
    mediaUrl?: string;
  } | null>(null);

  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const mediaPollsRef = useRef<Map<string, boolean>>(new Map());
  const { uploadFileOrThrow, uploading, getFileType } = useFileUpload();
  const busy = isStreaming;

  const activeProject = useMemo(
    () => projects.find((project) => project.id === activeProjectId) ?? null,
    [activeProjectId, projects],
  );

  useEffect(() => setSidebarOpen(!isMobile), [isMobile]);

  useEffect(() => {
    try {
      localStorage.setItem(PREFS_KEY, JSON.stringify({ model, toolGroups }));
    } catch {
      // ignore
    }
  }, [model, toolGroups]);

  useEffect(() => {
    if (!user) return;
    void syncMemories();
  }, [user]);

  const deriveTitle = useCallback((items: AIMessage[], id?: string): string => {
    const overrides = readMap(TITLE_KEY);
    if (id && overrides[id]) return overrides[id];
    const first = items.find((message) => message.role === 'user');
    if (!first) return 'Yangi suhbat';
    return first.content.slice(0, 48) + (first.content.length > 48 ? '…' : '');
  }, []);

  useEffect(() => {
    const load = async () => {
      if (!user) {
        setHistoryLoading(false);
        return;
      }
      setHistoryLoading(true);

      const [conversationResult, projectResult] = await Promise.all([
        db.from('ai_conversations').select('*').eq('user_id', user.id).order('updated_at', { ascending: false }),
        db.from('ai_projects').select('*').eq('user_id', user.id).order('updated_at', { ascending: false }),
      ]);

      const projectSchemaReady = !projectResult.error;
      setProjectsAvailable(projectSchemaReady);
      if (!projectSchemaReady) {
        setActiveProjectId(null);
      }

      const pins = readMap(PIN_KEY);
      const loadedConversations: AIConversation[] = ((conversationResult.data as any[]) || []).map((row) => {
        const revived = reviveMessages(row.messages || []);
        return {
          id: String(row.id),
          title: deriveTitle(revived, String(row.id)),
          messages: revived,
          updatedAt: new Date(row.updated_at || Date.now()),
          pinned: Boolean(pins[row.id]),
          projectId: projectSchemaReady && row.project_id ? String(row.project_id) : null,
        };
      });

      setConversations(loadedConversations);
      setProjects(projectSchemaReady ? ((projectResult.data as any[]) || []).map(projectFromRow) : []);
      setHistoryLoading(false);
    };

    void load();
  }, [deriveTitle, user]);

  const saveConversation = async (newMessages: AIMessage[]): Promise<string | null> => {
    if (!user) return currentConversationId;

    const updatedAt = new Date().toISOString();
    const baseUpdate = {
      messages: newMessages as any,
      updated_at: updatedAt,
    };

    if (currentConversationId) {
      const updatePayload = projectsAvailable
        ? { ...baseUpdate, project_id: activeProjectId }
        : baseUpdate;
      let result = await db
        .from('ai_conversations')
        .update(updatePayload)
        .eq('id', currentConversationId)
        .eq('user_id', user.id);

      if (result.error && projectsAvailable && isProjectSchemaError(result.error)) {
        setProjectsAvailable(false);
        setProjects([]);
        setActiveProjectId(null);
        result = await db
          .from('ai_conversations')
          .update(baseUpdate)
          .eq('id', currentConversationId)
          .eq('user_id', user.id);
      }

      if (result.error) {
        console.error('AI conversation update failed:', result.error);
        return currentConversationId;
      }

      setConversations((previous) =>
        previous.map((conversation) =>
          conversation.id === currentConversationId
            ? {
                ...conversation,
                messages: newMessages,
                projectId: projectsAvailable ? activeProjectId : null,
                title: deriveTitle(newMessages, conversation.id),
                updatedAt: new Date(updatedAt),
              }
            : conversation,
        ),
      );
      return currentConversationId;
    }

    const baseInsert = {
      user_id: user.id,
      messages: newMessages as any,
      context: 'chat',
    };
    const insertPayload = projectsAvailable
      ? { ...baseInsert, project_id: activeProjectId }
      : baseInsert;

    let insertResult = await db
      .from('ai_conversations')
      .insert(insertPayload)
      .select('*')
      .single();

    if (insertResult.error && projectsAvailable && isProjectSchemaError(insertResult.error)) {
      setProjectsAvailable(false);
      setProjects([]);
      setActiveProjectId(null);
      insertResult = await db
        .from('ai_conversations')
        .insert(baseInsert)
        .select('*')
        .single();
    }

    const { data, error } = insertResult;
    if (error || !data) {
      console.error('AI conversation insert failed:', error);
      return null;
    }
    const id = String((data as any).id);
    setCurrentConversationId(id);
    setConversations((previous) => [
      {
        id,
        title: deriveTitle(newMessages, id),
        messages: newMessages,
        updatedAt: new Date(),
        projectId: projectsAvailable ? activeProjectId : null,
      },
      ...previous,
    ]);
    return id;
  };

  const patchConversationVideo = useCallback(
    async (conversationId: string, assistantId: string, videoUrl: string) => {
      const { data } = await db
        .from('ai_conversations')
        .select('messages')
        .eq('id', conversationId)
        .maybeSingle();
      const remoteMessages = reviveMessages(((data as any)?.messages as any[]) || []);
      if (!remoteMessages.length) return;
      const patched = remoteMessages.map((message) => {
        if (message.id !== assistantId) return message;
        const videos = [...(message.videos || []), videoUrl].filter(
          (url, index, all) => all.indexOf(url) === index,
        );
        return { ...message, videos };
      });
      await db
        .from('ai_conversations')
        .update({ messages: patched as any, updated_at: new Date().toISOString() })
        .eq('id', conversationId);

      setConversations((previous) =>
        previous.map((conversation) =>
          conversation.id === conversationId
            ? { ...conversation, messages: patched, updatedAt: new Date() }
            : conversation,
        ),
      );
      setMessages((previous) =>
        previous.map((message) => {
          if (message.id !== assistantId) return message;
          const videos = [...(message.videos || []), videoUrl].filter(
            (url, index, all) => all.indexOf(url) === index,
          );
          return { ...message, videos };
        }),
      );
    },
    [],
  );

  const pollVideoJob = useCallback(
    async (jobId: string, assistantId: string, conversationId: string) => {
      if (!jobId || mediaPollsRef.current.get(jobId)) return;
      mediaPollsRef.current.set(jobId, true);
      try {
        for (let attempt = 0; attempt < 28; attempt += 1) {
          const { data, error } = await db
            .from('ai_media_jobs')
            .select('status, output_url, error')
            .eq('id', jobId)
            .maybeSingle();

          if (error) {
            if (attempt === 0) {
              sonnerToast.error('Video holatini kuzatib bo‘lmadi', {
                description: 'AI media backend yangilanishi hali production bazaga qo‘llanmagan bo‘lishi mumkin.',
              });
            }
            return;
          }

          if (data) {
            const row = data as any;
            if (row.status === 'done' && row.output_url) {
              await patchConversationVideo(conversationId, assistantId, String(row.output_url));
              sonnerToast.success('Video tayyor');
              return;
            }
            if (row.status === 'failed') {
              sonnerToast.error('Video yaratilmadi', {
                description: String(row.error || 'Noma’lum xatolik'),
              });
              return;
            }
          }
          await new Promise((resolve) => window.setTimeout(resolve, 7000));
        }
      } finally {
        mediaPollsRef.current.delete(jobId);
      }
    },
    [patchConversationVideo],
  );

  useEffect(() => {
    const state = location.state as any;
    if (!state?.forwardedPost) return;
    const postData = state.forwardedPost;
    setMessages([]);
    setCurrentConversationId(null);

    supabase
      .from('posts')
      .select(`id, content, media_urls, media_type, profile:profiles!posts_user_id_fkey (display_name, username, avatar_url)`)
      .eq('id', postData.id)
      .single()
      .then(({ data }) => {
        if (data) {
          const postProfile = data.profile as any;
          setForwardedPost({
            id: data.id,
            content: data.content || '',
            authorName: postProfile?.display_name || postProfile?.username || 'Foydalanuvchi',
            mediaUrl: data.media_urls?.[0] || undefined,
          });
        } else {
          setForwardedPost({ id: postData.id, content: postData.content || '' });
        }
      });

    navigate(location.pathname, { replace: true, state: {} });
  }, [location.pathname, location.state, navigate]);

  useEffect(() => {
    const viewport = scrollAreaRef.current?.querySelector('[data-radix-scroll-area-viewport]');
    if (viewport) viewport.scrollTop = viewport.scrollHeight;
  }, [isStreaming, messages]);

  const startNew = useCallback(
    (projectId: string | null = activeProjectId) => {
      abortRef.current?.abort();
      setMessages([]);
      setCurrentConversationId(null);
      setActiveProjectId(projectsAvailable ? projectId : null);
      setInput('');
      setAttachments([]);
      setForwardedPost(null);
      if (isMobile) setSidebarOpen(false);
    },
    [activeProjectId, isMobile, projectsAvailable],
  );

  const selectConversation = (conversation: AIConversation) => {
    abortRef.current?.abort();
    setMessages(conversation.messages);
    setCurrentConversationId(conversation.id);
    setActiveProjectId(projectsAvailable ? conversation.projectId || null : null);
    if (isMobile) setSidebarOpen(false);
  };

  const selectProject = (projectId: string | null) => {
    if (!projectsAvailable) return;
    abortRef.current?.abort();
    setActiveProjectId(projectId);
    setMessages([]);
    setCurrentConversationId(null);
    setInput('');
    setAttachments([]);
    if (isMobile) setSidebarOpen(false);
  };

  const deleteConversation = async (id: string) => {
    if (user) await db.from('ai_conversations').delete().eq('id', id).eq('user_id', user.id);
    setConversations((previous) => previous.filter((conversation) => conversation.id !== id));
    if (currentConversationId === id) startNew(activeProjectId);
  };

  const renameConversation = (id: string, title: string) => {
    const map = readMap(TITLE_KEY);
    map[id] = title;
    writeMap(TITLE_KEY, map);
    setConversations((previous) =>
      previous.map((conversation) => (conversation.id === id ? { ...conversation, title } : conversation)),
    );
  };

  const togglePin = (id: string) => {
    const pins = readMap(PIN_KEY);
    if (pins[id]) delete pins[id];
    else pins[id] = '1';
    writeMap(PIN_KEY, pins);
    setConversations((previous) =>
      previous.map((conversation) =>
        conversation.id === id ? { ...conversation, pinned: Boolean(pins[id]) } : conversation,
      ),
    );
  };

  const requireProjects = () => {
    if (projectsAvailable) return true;
    sonnerToast.info('Loyihalar backend yangilanishini kutmoqda', {
      description: 'Oddiy AI chat ishlashda davom etadi. Production migratsiyasi qo‘llangach loyihalar avtomatik faollashadi.',
    });
    return false;
  };

  const createProject = async (value: { name: string; instructions: string }) => {
    if (!user || !requireProjects()) return;
    const { data, error } = await db
      .from('ai_projects')
      .insert({ user_id: user.id, name: value.name, instructions: value.instructions })
      .select('*')
      .single();
    if (error || !data) {
      if (isProjectSchemaError(error)) setProjectsAvailable(false);
      sonnerToast.error('Loyiha yaratilmadi', { description: error?.message || 'Ma’lumotlar bazasi tayyor emas.' });
      return;
    }
    const project = projectFromRow(data);
    setProjects((previous) => [project, ...previous]);
    startNew(project.id);
  };

  const updateProject = async (projectId: string, value: { name: string; instructions: string }) => {
    if (!user || !requireProjects()) return;
    const now = new Date().toISOString();
    const { error } = await db
      .from('ai_projects')
      .update({ name: value.name, instructions: value.instructions, updated_at: now })
      .eq('id', projectId)
      .eq('user_id', user.id);
    if (error) {
      if (isProjectSchemaError(error)) setProjectsAvailable(false);
      sonnerToast.error('Loyiha saqlanmadi', { description: error.message });
      return;
    }
    setProjects((previous) =>
      previous.map((project) =>
        project.id === projectId
          ? { ...project, name: value.name, instructions: value.instructions, updatedAt: new Date(now) }
          : project,
      ),
    );
  };

  const deleteProject = async (projectId: string) => {
    if (!user || !requireProjects()) return;
    const { error } = await db.from('ai_projects').delete().eq('id', projectId).eq('user_id', user.id);
    if (error) {
      if (isProjectSchemaError(error)) setProjectsAvailable(false);
      sonnerToast.error('Loyiha o‘chirilmadi', { description: error.message });
      return;
    }
    setProjects((previous) => previous.filter((project) => project.id !== projectId));
    setConversations((previous) =>
      previous.map((conversation) =>
        conversation.projectId === projectId ? { ...conversation, projectId: null } : conversation,
      ),
    );
    if (activeProjectId === projectId) startNew(null);
  };

  const moveConversation = async (conversationId: string, projectId: string | null) => {
    if (!user || !requireProjects()) return;
    const { error } = await db
      .from('ai_conversations')
      .update({ project_id: projectId, updated_at: new Date().toISOString() })
      .eq('id', conversationId)
      .eq('user_id', user.id);
    if (error) {
      if (isProjectSchemaError(error)) setProjectsAvailable(false);
      sonnerToast.error('Suhbat ko‘chirilmadi', { description: error.message });
      return;
    }
    setConversations((previous) =>
      previous.map((conversation) =>
        conversation.id === conversationId ? { ...conversation, projectId, updatedAt: new Date() } : conversation,
      ),
    );
    if (currentConversationId === conversationId) setActiveProjectId(projectId);
  };

  const uploadFiles = async (list: FileList | null) => {
    const files = Array.from(list || []);
    for (const file of files) {
      if (file.size > 20 * 1024 * 1024) {
        sonnerToast.error(`${file.name}: 20MB dan katta`);
        continue;
      }
      try {
        const result = await uploadFileOrThrow(file);
        setAttachments((previous) => [
          ...previous,
          {
            url: result.url,
            name: result.name,
            type: getFileType(result.type, result.name),
            size: result.size,
          },
        ]);
      } catch (error: any) {
        sonnerToast.error(`${file.name} yuklanmadi`, {
          description: error?.message || 'Noma’lum xatolik',
        });
      }
    }
  };

  const runAgent = async (baseMessages: AIMessage[]) => {
    setIsStreaming(true);
    setStatusLabel("O'ylayapman…");

    const controller = new AbortController();
    abortRef.current = controller;
    const assistantId = crypto.randomUUID();
    let content = '';
    const tools: AIToolEvent[] = [];
    const images: string[] = [];
    const videos: string[] = [];
    const sources: AISource[] = [];
    const pendingVideoJobs: string[] = [];
    let usedModel: string | null = null;
    let notice: string | undefined;
    let created = false;

    const flush = () => {
      const assistant: AIMessage = {
        id: assistantId,
        role: 'assistant',
        content,
        images: images.length ? [...images] : undefined,
        videos: videos.length ? [...videos] : undefined,
        sources: sources.length ? [...sources] : undefined,
        tools: tools.length ? tools.map((tool) => ({ ...tool })) : undefined,
        model: usedModel ?? undefined,
        mode: 'agent',
        notice,
        timestamp: new Date(),
      };
      setMessages(
        created
          ? (previous) => previous.map((message) => (message.id === assistantId ? assistant : message))
          : [...baseMessages, assistant],
      );
      created = true;
      return assistant;
    };

    try {
      const history = baseMessages.map((message) => ({ role: message.role, content: message.content }));

      if (forwardedPost && history.length > 0) {
        const firstUserIndex = history.findIndex((message) => message.role === 'user');
        if (firstUserIndex >= 0) {
          history[firstUserIndex] = {
            ...history[firstUserIndex],
            content: `${history[firstUserIndex].content}\n\n[FORWARDED POST]\nAuthor: ${forwardedPost.authorName || 'Noma’lum'}\nText: ${forwardedPost.content || '(matn yo‘q)'}${forwardedPost.mediaUrl ? `\nMedia: ${forwardedPost.mediaUrl}` : ''}`,
          };
        }
      }

      const lastUser = [...baseMessages].reverse().find((message) => message.role === 'user');
      const repoRefs = lastUser ? detectRepoRefs(lastUser.content) : [];

      if (repoRefs.length > 0 && history.length > 0) {
        if (!githubReady()) {
          notice = 'GitHub ulanmagan — repozitoriy kontekstini o‘qib bo‘lmadi.';
        } else {
          for (const ref of repoRefs.slice(0, 2)) {
            const toolId = crypto.randomUUID();
            tools.push({
              id: toolId,
              name: 'github_context',
              label: `${ref.fullName} o‘qilmoqda`,
              status: 'running',
              startedAt: Date.now(),
            });
            setStatusLabel('GitHub repozitoriysi o‘qilmoqda…');
            flush();
            try {
              const repoContext = await buildRepoContext(ref);
              const entry = tools.find((tool) => tool.id === toolId);
              if (entry) {
                entry.status = 'done';
                entry.summary = repoContext.summary;
                entry.data = { files: repoContext.fileCount, pages: repoContext.pageCount } as any;
                entry.finishedAt = Date.now();
              }
              if (!sources.some((source) => source.url === ref.url)) {
                sources.push({ title: ref.fullName, url: ref.url });
              }
              const index = history.length - 1;
              history[index] = {
                ...history[index],
                content: `${history[index].content}\n\n${repoContext.context}`,
              };
            } catch (error: any) {
              const entry = tools.find((tool) => tool.id === toolId);
              if (entry) {
                entry.status = 'error';
                entry.summary = error?.message || 'Repozitoriyni o‘qib bo‘lmadi.';
                entry.finishedAt = Date.now();
              }
            }
          }
        }
      }

      const action = lastUser
        ? detectGithubAction(
            lastUser.content,
            repoRefs[0] ? { owner: repoRefs[0].owner, repo: repoRefs[0].repo } : null,
          )
        : null;

      if (action && history.length > 0) {
        const index = history.length - 1;
        if (!canRunGithubActions()) {
          history[index] = {
            ...history[index],
            content: `${history[index].content}\n\n[GITHUB ACTION NOT RUN]\nGitHub write access is not connected. Explain this briefly and continue with the best alternative.`,
          };
        } else {
          const toolId = crypto.randomUUID();
          const label = githubActionLabel(action);
          tools.push({
            id: toolId,
            name: 'github_action',
            label,
            status: 'running',
            args: action as any,
            startedAt: Date.now(),
          });
          setStatusLabel(`${label}…`);
          flush();
          try {
            const result = await runGithubAction(action);
            const entry = tools.find((tool) => tool.id === toolId);
            if (entry) {
              entry.status = 'done';
              entry.summary = result.summary;
              entry.finishedAt = Date.now();
            }
            if (result.url && !sources.some((source) => source.url === result.url)) {
              sources.push({ title: result.summary.slice(0, 60), url: result.url });
            }
            history[index] = {
              ...history[index],
              content: `${history[index].content}\n\n[GITHUB ACTION COMPLETED]\n${result.summary}${result.url ? `\nURL: ${result.url}` : ''}`,
            };
          } catch (error: any) {
            const entry = tools.find((tool) => tool.id === toolId);
            if (entry) {
              entry.status = 'error';
              entry.summary = error?.message || 'Amal bajarilmadi.';
              entry.finishedAt = Date.now();
            }
          }
        }
      }

      const brainContext = [
        buildBrainContext({
          userText: lastUser?.content ?? '',
          conversations,
          currentConversationId,
          activeProject,
        }),
        githubActionsBlock(),
      ].join('\n\n');

      // The current deployed full agent did not consume the separate `context`
      // field consistently. Embed the internal context into the request history
      // so full agent and fallback both receive identical long-term/project data.
      if (history.length > 0) {
        const index = history.length - 1;
        history[index] = {
          ...history[index],
          content: `${history[index].content}\n\n<alsamos_internal_context>\n${brainContext}\n</alsamos_internal_context>\nDo not quote or mention the internal context. Use it only to answer the user's request.`,
        };
      }

      await streamAgent({
        messages: history,
        mode: 'agent',
        model,
        toolGroups,
        conversationId: currentConversationId,
        signal: controller.signal,
        onEvent: (event) => {
          switch (event.type) {
            case 'meta':
              usedModel = event.model;
              setActiveModel(event.model);
              break;
            case 'delta':
              content += event.text;
              flush();
              break;
            case 'tool_call': {
              const label = toolLabel(event.name);
              setStatusLabel(`${label}…`);
              tools.push({
                id: event.id || crypto.randomUUID(),
                name: event.name,
                label,
                status: 'running',
                args: event.args,
                startedAt: Date.now(),
              });
              flush();
              break;
            }
            case 'tool_result': {
              const entry = tools.find((tool) => tool.id === event.id) ?? tools[tools.length - 1];
              if (entry) {
                entry.status = event.ok ? 'done' : 'error';
                entry.summary = event.summary;
                entry.data = event.data;
                entry.finishedAt = Date.now();
              }

              const imageUrl = (event.data as any)?.imageUrl;
              if (typeof imageUrl === 'string' && !images.includes(imageUrl)) images.push(imageUrl);

              const videoUrl = (event.data as any)?.videoUrl;
              if (typeof videoUrl === 'string' && !videos.includes(videoUrl)) videos.push(videoUrl);

              const foundSources = (event.data as any)?.sources;
              if (Array.isArray(foundSources)) {
                for (const source of foundSources as AISource[]) {
                  if (source?.url && !sources.some((existing) => existing.url === source.url)) {
                    sources.push({ title: source.title, url: source.url });
                  }
                }
              }

              const jobId = (event.data as any)?.jobId;
              const jobStatus = (event.data as any)?.status;
              if (jobId && !videoUrl && (jobStatus === 'running' || event.name === 'generate_video')) {
                if (!pendingVideoJobs.includes(String(jobId))) pendingVideoJobs.push(String(jobId));
                sonnerToast.info('Video render qilinmoqda', {
                  description: 'Tayyor bo‘lgach shu suhbatda avtomatik ko‘rinadi.',
                });
              }

              const taskId = (event.data as any)?.taskId;
              if (taskId) {
                sonnerToast.warning('Kompyuter vazifasi tasdiq kutmoqda', {
                  description: 'Alsamos Bridge ilovasida tasdiqlang.',
                });
              }
              setStatusLabel('Javob tayyorlanmoqda…');
              flush();
              break;
            }
            case 'notice':
              notice = event.message;
              flush();
              break;
            case 'error':
              throw new Error(event.message);
          }
        },
      });

      if (!content && !images.length && !videos.length) {
        content = "Javob bo‘sh qaytdi. Iltimos, qaytadan urinib ko‘ring.";
      }
      const final = flush();
      const savedConversationId = await saveConversation([...baseMessages, final]);
      setForwardedPost(null);

      if (savedConversationId && pendingVideoJobs.length > 0) {
        pendingVideoJobs.forEach((jobId) => {
          void pollVideoJob(jobId, assistantId, savedConversationId);
        });
      }
    } catch (error: any) {
      if (error?.name === 'AbortError') {
        if (content || images.length || videos.length) {
          const partial = flush();
          await saveConversation([...baseMessages, partial]);
        }
        return;
      }
      const errorMessage: AIMessage = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: error?.message || 'Javob olishda xatolik. Qaytadan urinib ko‘ring.',
        error: true,
        tools: tools.length ? tools : undefined,
        timestamp: new Date(),
      };
      const next = [...baseMessages, errorMessage];
      setMessages(next);
      await saveConversation(next);
    } finally {
      abortRef.current = null;
      setIsStreaming(false);
    }
  };

  const send = async (overrideText?: string) => {
    const raw = (overrideText ?? input).trim();
    if ((!raw && attachments.length === 0) || busy) return;

    let content = raw;
    if (attachments.length > 0) {
      const attachmentText = attachments
        .map((attachment) => `[${attachment.type}] ${attachment.name}: ${attachment.url}`)
        .join('\n');
      content = content ? `${content}\n\n${attachmentText}` : attachmentText;
    }

    const remembered = captureMemories(raw, activeProject?.name);
    if (remembered.length > 0) {
      sonnerToast.success('Eslab qoldim', { description: remembered[0].text.slice(0, 90) });
    }

    const userMessage: AIMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content,
      attachments: attachments.length ? [...attachments] : undefined,
      timestamp: new Date(),
    };
    const base = [...messages, userMessage];
    setMessages(base);
    setInput('');
    setAttachments([]);
    await runAgent(base);
  };

  const regenerateFrom = async (index: number) => {
    const base = messages.slice(0, index);
    if (!base.some((message) => message.role === 'user')) return;
    setMessages(base);
    await runAgent(base);
  };

  const stop = () => {
    abortRef.current?.abort();
    abortRef.current = null;
    setIsStreaming(false);
  };

  const suggestions = useMemo(
    () => [
      {
        icon: <Code2 className="h-4.5 w-4.5" />,
        title: 'Kod yozib bering',
        prompt: 'JavaScriptda katta massivni tez saralaydigan funksiya yoz va test bilan tekshir.',
      },
      {
        icon: <ImageIcon className="h-4.5 w-4.5" />,
        title: 'Rasm yarating',
        prompt: 'Minimalistik texnologik poster yarating: oq-qora asos, nozik ko‘k aksent.',
      },
      {
        icon: <Globe className="h-4.5 w-4.5" />,
        title: 'Internetdan tekshiring',
        prompt: 'Internetdan tekshirib, bugungi eng muhim texnologiya yangiliklarini manbalar bilan qisqa tahlil qil.',
      },
      {
        icon: <FileText className="h-4.5 w-4.5" />,
        title: 'Hujjat tayyorlang',
        prompt: 'Kichik biznes uchun amaliy oylik moliyaviy hisobot shablonini tayyorla.',
      },
    ],
    [],
  );

  const greetingName = profile?.display_name || profile?.username || '';
  const artifacts = useMemo(() => extractArtifacts(messages), [messages]);
  const showArtifacts = artifactsOpen && artifacts.length > 0;

  const openArtifacts = () => {
    if (artifacts.length === 0) {
      sonnerToast.info('Hali artefakt yo‘q', {
        description: 'Alohida kod, hujjat, rasm yoki video yaratilganda shu yerda ko‘rinadi.',
      });
      return;
    }
    setArtifactsOpen(true);
    if (isMobile) setSidebarOpen(false);
  };

  useEffect(() => {
    if (!user && messages.length > 0) {
      toast({
        title: 'Tizimga kiring',
        description: 'Suhbatlar saqlanishi va vositalar ishlashi uchun hisobga kirish kerak.',
      });
    }
  }, [messages.length, toast, user]);

  const currentTitle = currentConversationId
    ? conversations.find((conversation) => conversation.id === currentConversationId)?.title || 'Suhbat'
    : 'Yangi suhbat';

  return (
    <div className="flex h-full min-h-0 min-w-0 overflow-hidden bg-background">
      <AnimatePresence>
        {sidebarOpen && (
          <>
            {isMobile && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 z-40 bg-black/55 backdrop-blur-sm"
                onClick={() => setSidebarOpen(false)}
              />
            )}
            <motion.aside
              initial={{ x: isMobile ? -320 : 0, opacity: isMobile ? 0 : 1 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: -320, opacity: 0 }}
              transition={{ type: 'spring', damping: 26, stiffness: 300 }}
              className={cn(
                'z-50 flex min-h-0 flex-col border-r border-border/50 bg-background',
                isMobile ? 'fixed bottom-0 left-0 top-0 w-[300px]' : 'relative h-full w-[280px] lg:w-[300px]',
              )}
            >
              <AISidebar
                conversations={conversations}
                loading={historyLoading}
                activeId={currentConversationId}
                isMobile={isMobile}
                onNew={() => startNew(activeProjectId)}
                onSelect={selectConversation}
                onDelete={deleteConversation}
                onRename={renameConversation}
                onTogglePin={togglePin}
                onClose={() => setSidebarOpen(false)}
                onOpenArtifacts={openArtifacts}
                onOpenConnectors={() => setConnectorsOpen(true)}
                onOpenGithub={() => setGithubOpen(true)}
                artifactCount={artifacts.length}
                projects={projectsAvailable ? projects : []}
                activeProjectId={projectsAvailable ? activeProjectId : null}
                onSelectProject={projectsAvailable ? selectProject : undefined}
                onCreateProject={projectsAvailable ? createProject : undefined}
                onUpdateProject={projectsAvailable ? updateProject : undefined}
                onDeleteProject={projectsAvailable ? deleteProject : undefined}
                onMoveConversation={projectsAvailable ? moveConversation : undefined}
              />
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      <div className="relative flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <header className="flex h-12 shrink-0 items-center gap-2 border-b border-border/40 bg-background/90 px-3 backdrop-blur-xl sm:h-14 sm:px-4">
          {!sidebarOpen && (
            <Button size="icon" variant="ghost" className="h-8 w-8 shrink-0 rounded-lg" onClick={() => setSidebarOpen(true)} aria-label="Yon panelni ochish">
              <PanelLeft className="h-4 w-4" />
            </Button>
          )}

          <div className="min-w-0 flex-1">
            {activeProject && (
              <div className="mb-0.5 flex min-w-0 items-center gap-1 text-[10px] text-muted-foreground">
                <FolderKanban className="h-3 w-3 shrink-0" />
                <span className="truncate">{activeProject.name}</span>
              </div>
            )}
            <h1 className="truncate text-sm font-semibold leading-tight">{currentTitle}</h1>
          </div>

          {artifacts.length > 0 && (
            <Button
              size="sm"
              variant={artifactsOpen ? 'secondary' : 'ghost'}
              className="h-8 gap-1.5 rounded-lg px-2.5 text-[11px]"
              onClick={() => setArtifactsOpen((value) => !value)}
            >
              <FileText className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Artefaktlar</span>
              <span className="rounded-full bg-muted px-1.5 text-[10px]">{artifacts.length}</span>
            </Button>
          )}
        </header>

        <ScrollArea ref={scrollAreaRef} className="min-h-0 min-w-0 flex-1 overflow-hidden">
          {messages.length === 0 ? (
            <div className="flex min-h-[26rem] h-full min-w-0 flex-col items-center justify-center px-4 py-8">
              <motion.div
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ type: 'spring', damping: 18 }}
                className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-border/70 bg-muted/40"
              >
                <Sparkles className="h-6 w-6" />
              </motion.div>

              <h2 className="mb-1.5 max-w-full break-words text-center text-2xl font-semibold sm:text-3xl">
                {activeProject ? activeProject.name : greetingName ? `Salom, ${greetingName}` : 'Alsamos AI'}
              </h2>
              <p className="mb-6 max-w-lg text-center text-sm leading-relaxed text-muted-foreground">
                {activeProject
                  ? activeProject.instructions || 'Bu loyiha ichidagi suhbatlar umumiy kontekst bilan ishlaydi.'
                  : 'Savol, vazifa yoki yaratmoqchi bo‘lgan narsangizni yozing. Kerakli vositani AI o‘zi tanlaydi.'}
              </p>

              {forwardedPost && (
                <div className="mb-5 w-full max-w-2xl overflow-hidden rounded-2xl border border-blue-500/20 bg-card/50">
                  <div className="flex items-center gap-2 border-b border-blue-500/15 bg-blue-500/5 px-4 py-2.5">
                    <Sparkles className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                    <span className="text-xs font-semibold text-blue-700 dark:text-blue-300">Post yuborildi</span>
                    <button type="button" onClick={() => setForwardedPost(null)} className="ml-auto text-muted-foreground hover:text-foreground" aria-label="Yopish">
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  <div className="p-4">
                    {forwardedPost.mediaUrl && <img src={forwardedPost.mediaUrl} alt="" className="mb-3 max-h-48 w-full rounded-xl object-cover" />}
                    <p className="mb-1 text-xs text-muted-foreground">@{forwardedPost.authorName}</p>
                    {forwardedPost.content && <p className="line-clamp-4 break-words text-sm [overflow-wrap:anywhere]">{forwardedPost.content}</p>}
                  </div>
                </div>
              )}

              <div className="grid w-full max-w-2xl grid-cols-2 gap-2">
                {suggestions.map((suggestion, index) => (
                  <motion.button
                    key={suggestion.title}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.035 }}
                    onClick={() => void send(suggestion.prompt)}
                    className="group flex min-w-0 items-center gap-2.5 rounded-xl border border-border/60 bg-card/40 p-3 text-left transition-colors hover:bg-muted/45"
                  >
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border bg-background text-muted-foreground">{suggestion.icon}</span>
                    <span className="min-w-0 truncate text-[13px] font-medium">{suggestion.title}</span>
                  </motion.button>
                ))}
              </div>
            </div>
          ) : (
            <div className="mx-auto w-full min-w-0 max-w-4xl overflow-hidden px-3 py-4 sm:px-5 sm:py-6">
              {messages.map((message, index) => (
                <AIMessageBubble
                  key={message.id}
                  message={message}
                  isStreaming={isStreaming && index === messages.length - 1 && message.role === 'assistant'}
                  onRegenerate={message.role === 'assistant' ? () => regenerateFrom(index) : undefined}
                />
              ))}
              {isStreaming && messages[messages.length - 1]?.role === 'user' && <AIThinkingBubble label={statusLabel} />}
            </div>
          )}
        </ScrollArea>

        <div className="shrink-0 bg-gradient-to-t from-background via-background to-background/0 pt-1">
          <AIComposer
            value={input}
            onChange={setInput}
            onSend={() => send()}
            onStop={stop}
            busy={busy}
            uploading={uploading}
            attachments={attachments}
            onPickFiles={uploadFiles}
            onDropFiles={uploadFiles}
            onRemoveAttachment={(url) => setAttachments((previous) => previous.filter((attachment) => attachment.url !== url))}
            model={model}
            onModelChange={setModel}
            activeModel={activeModel}
            toolGroups={toolGroups}
            onToolGroupsChange={(groups) => {
              // Only web is user-toggleable. Other capability groups stay on.
              const webEnabled = groups.includes('web');
              setToolGroups(ALL_TOOL_GROUPS.filter((group) => group !== 'web' || webEnabled));
            }}
            onOpenConnectors={() => setConnectorsOpen(true)}
            onOpenGithub={() => setGithubOpen(true)}
          />
        </div>
      </div>

      <AnimatePresence>
        {showArtifacts && (
          <motion.div
            initial={{ x: isMobile ? '100%' : 40, opacity: isMobile ? 1 : 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: isMobile ? '100%' : 40, opacity: isMobile ? 1 : 0 }}
            transition={{ type: 'spring', damping: 28, stiffness: 320 }}
            className={cn('z-50', isMobile ? 'fixed inset-0 bg-background' : 'relative h-full shrink-0')}
          >
            <AIArtifactPanel
              artifacts={artifacts}
              activeId={activeArtifactId}
              onSelect={setActiveArtifactId}
              onClose={() => setArtifactsOpen(false)}
              isMobile={isMobile}
            />
          </motion.div>
        )}
      </AnimatePresence>

      <AIConnectorsDialog open={connectorsOpen} onOpenChange={setConnectorsOpen} userId={user?.id} />

      <AIGithubDialog
        open={githubOpen}
        onOpenChange={setGithubOpen}
        onPickRepo={(repo) => {
          const prefix = input.trim() ? `${input.trim()} ` : '';
          setInput(`${prefix}${githubRepoUrl(repo.fullName)} `);
        }}
      />
    </div>
  );
}

import { useEffect, useMemo, useState, type ComponentProps } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

import { useAuth } from '@/contexts/AuthContext';
import {
  clearActiveLocalProject,
  createLocalProject,
  deleteLocalProject,
  listLocalProjects,
  projectForConversation,
  readActiveLocalProject,
  setActiveLocalProject,
  setConversationProject,
  updateLocalProject,
} from '@/lib/ai/projectsStore';
import { AISidebar as AISidebarV2 } from './AISidebarV2';
import type { AIConversation, AIProject } from './types';

type Props = ComponentProps<typeof AISidebarV2>;

/**
 * AI sidebar owns the project navigation surface. Database-backed projects are
 * preferred when available; otherwise the existing local project store keeps
 * the feature fully usable without losing project context.
 */
export function AISidebar(props: Props) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [localProjects, setLocalProjects] = useState<AIProject[]>([]);

  const useLocalProjects = Boolean(user?.id) && !props.onCreateProject;

  const refreshLocalProjects = () => {
    if (!user?.id) {
      setLocalProjects([]);
      return;
    }
    setLocalProjects(listLocalProjects(user.id));
  };

  const syncProjectQuery = (projectId: string | null) => {
    const next = new URLSearchParams(location.search);
    if (projectId) next.set('project', projectId);
    else next.delete('project');
    const query = next.toString();
    const target = `${location.pathname}${query ? `?${query}` : ''}`;
    const current = `${location.pathname}${location.search}`;
    if (target !== current) navigate(target, { replace: true });
  };

  useEffect(() => {
    if (!useLocalProjects) return;
    refreshLocalProjects();
  }, [useLocalProjects, user?.id, location.search]);

  const localActiveProjectId = useMemo(() => {
    if (!useLocalProjects || !user?.id) return null;
    const active = readActiveLocalProject();
    return active?.userId === user.id ? active.project.id : null;
  }, [localProjects, location.search, useLocalProjects, user?.id]);

  // Database-backed project links (/ai?project=<id>) used to activate only the
  // local fallback store. Apply the URL selection to the real AI project state
  // as soon as the database project list is available.
  useEffect(() => {
    if (useLocalProjects || !props.onSelectProject) return;
    const projectId = new URLSearchParams(location.search).get('project');
    if (!projectId || projectId === props.activeProjectId) return;
    if (!props.projects.some((project) => project.id === projectId)) return;
    props.onSelectProject(projectId);
  }, [
    location.search,
    props.activeProjectId,
    props.onSelectProject,
    props.projects,
    useLocalProjects,
  ]);

  // A newly created conversation inside a locally backed project is assigned
  // to that project as soon as its id exists. This keeps project history stable
  // even when the production ai_projects migration is not present yet.
  useEffect(() => {
    if (!useLocalProjects || !user?.id || !props.activeId || !localActiveProjectId) return;
    if (projectForConversation(user.id, props.activeId) === localActiveProjectId) return;
    setConversationProject(user.id, props.activeId, localActiveProjectId);
  }, [localActiveProjectId, props.activeId, useLocalProjects, user?.id]);

  const conversations = useMemo(() => {
    if (!useLocalProjects || !user?.id) return props.conversations;
    return props.conversations.map((conversation) => ({
      ...conversation,
      projectId: conversation.projectId || projectForConversation(user.id, conversation.id),
    }));
  }, [props.conversations, useLocalProjects, user?.id]);

  const selectLocalProject = (projectId: string | null) => {
    if (!user?.id) return;
    if (projectId) setActiveLocalProject(user.id, projectId);
    else clearActiveLocalProject();

    syncProjectQuery(projectId);

    // Claude-like behavior: selecting a project keeps the AI workspace open
    // and immediately opens its most recent conversation. Only a brand-new
    // project starts with an empty composer.
    if (projectId) {
      const latest = conversations
        .filter((conversation) => conversation.projectId === projectId)
        .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())[0];
      if (latest) props.onSelect(latest);
      else props.onNew();
    } else {
      props.onNew();
    }
    refreshLocalProjects();
  };

  const selectBackendProject = (projectId: string | null) => {
    syncProjectQuery(projectId);
    props.onSelectProject?.(projectId);
  };

  const selectConversation = (conversation: AIConversation) => {
    const projectId = conversation.projectId || null;

    if (useLocalProjects && user?.id) {
      const localProjectId = projectId || projectForConversation(user.id, conversation.id);
      if (localProjectId) setActiveLocalProject(user.id, localProjectId);
      else clearActiveLocalProject();
      syncProjectQuery(localProjectId);
    } else {
      syncProjectQuery(projectId);
    }

    props.onSelect(conversation);
  };

  const createLocal = async (value: { name: string; instructions: string }) => {
    if (!user?.id) return;
    const project = createLocalProject(user.id, value);
    refreshLocalProjects();
    selectLocalProject(project.id);
  };

  const updateLocal = async (projectId: string, value: { name: string; instructions: string }) => {
    if (!user?.id) return;
    updateLocalProject(user.id, projectId, value);
    refreshLocalProjects();
  };

  const deleteLocal = async (projectId: string) => {
    if (!user?.id) return;
    const wasActive = localActiveProjectId === projectId;
    deleteLocalProject(user.id, projectId);
    refreshLocalProjects();
    if (wasActive) selectLocalProject(null);
  };

  const deleteBackend = async (projectId: string) => {
    await props.onDeleteProject?.(projectId);
    const routeProjectId = new URLSearchParams(location.search).get('project');
    if (routeProjectId === projectId) syncProjectQuery(null);
  };

  const moveLocalConversation = async (conversationId: string, projectId: string | null) => {
    if (!user?.id) return;
    setConversationProject(user.id, conversationId, projectId);
    refreshLocalProjects();
  };

  return (
    <AISidebarV2
      {...props}
      conversations={conversations}
      onSelect={selectConversation}
      // Focus/session refreshes may re-request history, but existing chat rows
      // should never flash back to skeletons when the user returns to the app.
      loading={props.loading && conversations.length === 0}
      projects={useLocalProjects ? localProjects : props.projects}
      activeProjectId={useLocalProjects ? localActiveProjectId : props.activeProjectId}
      onSelectProject={useLocalProjects ? selectLocalProject : selectBackendProject}
      onCreateProject={useLocalProjects ? createLocal : props.onCreateProject}
      onUpdateProject={useLocalProjects ? updateLocal : props.onUpdateProject}
      onDeleteProject={useLocalProjects ? deleteLocal : deleteBackend}
      onMoveConversation={useLocalProjects ? moveLocalConversation : props.onMoveConversation}
    />
  );
}

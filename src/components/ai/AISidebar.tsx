import { useEffect, useMemo, useRef, useState, type ComponentProps } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

import { useAuth } from '@/contexts/AuthContext';
import { migrateLegacyLocalProjectsToCloud } from '@/lib/ai/migrateLegacyProjects';
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
import {
  buildAIWorkspaceHref,
  parseAIWorkspaceLocation,
} from '@/lib/ai/workspaceUrl';
import { AISidebar as AISidebarV2 } from './AISidebarV2';
import type { AIConversation, AIProject } from './types';

type Props = ComponentProps<typeof AISidebarV2>;

/**
 * Project navigation bridge.
 *
 * Cloud `ai_projects` is the canonical source. The local project store exists
 * only as a backwards-compatibility bridge for users who created projects
 * while the cloud schema was artificially disabled in the web client.
 */
export function AISidebar(props: Props) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [localProjects, setLocalProjects] = useState<AIProject[]>([]);
  const [pendingProjectNew, setPendingProjectNew] = useState<string | null>(null);
  const migrationStartedRef = useRef(false);
  const previousActiveIdRef = useRef<string | null>(props.activeId);

  const useLocalProjects = Boolean(user?.id) && !props.onCreateProject;

  const refreshLocalProjects = () => {
    if (!user?.id) {
      setLocalProjects([]);
      return;
    }
    setLocalProjects(listLocalProjects(user.id));
  };

  const syncWorkspaceQuery = (
    projectId: string | null,
    conversationId: string | null = null,
    replace = true,
  ) => {
    const target = buildAIWorkspaceHref('/ai', location.search, {
      projectId,
      conversationId,
    });
    const current = `${location.pathname}${location.search}`;
    if (target !== current) navigate(target, { replace });
  };

  useEffect(() => {
    refreshLocalProjects();
  }, [user?.id, location.pathname, location.search]);

  /**
   * One-time migration for legacy browser-only projects. The same helper is
   * also used by /ai/projects so users do not have to visit /ai first.
   */
  useEffect(() => {
    if (!user?.id || useLocalProjects || migrationStartedRef.current) return;
    if (listLocalProjects(user.id).length === 0) return;

    migrationStartedRef.current = true;
    let cancelled = false;

    const migrate = async () => {
      try {
        const migrated = await migrateLegacyLocalProjectsToCloud(user.id);
        refreshLocalProjects();
        if (migrated && !cancelled) {
          // Parent AI state was loaded before the migration. Reload once so
          // projects + project_id memberships rehydrate atomically.
          window.location.reload();
        }
      } catch (error) {
        console.error('Legacy AI project migration failed:', error);
        migrationStartedRef.current = false;
      }
    };

    void migrate();
    return () => {
      cancelled = true;
    };
  }, [user?.id, useLocalProjects]);

  const localActiveProjectId = useMemo(() => {
    if (!useLocalProjects || !user?.id) return null;
    const active = readActiveLocalProject();
    return active?.userId === user.id ? active.project.id : null;
  }, [localProjects, location.pathname, location.search, useLocalProjects, user?.id]);

  const conversations = useMemo(() => {
    if (!useLocalProjects || !user?.id) return props.conversations;
    return props.conversations.map((conversation) => ({
      ...conversation,
      projectId: conversation.projectId || projectForConversation(user.id, conversation.id),
    }));
  }, [props.conversations, useLocalProjects, user?.id]);

  // `/ai/projects/<project-id>` is the durable project root. Do not blank the workspace
  // first when a chat deep link is present; the chat hydration effect below owns
  // that state transition.
  useEffect(() => {
    if (useLocalProjects || !props.onSelectProject || props.loading) return;
    const route = parseAIWorkspaceLocation(location.pathname, location.search);
    if (route.conversationId) return;
    if (!route.projectId || route.projectId === props.activeProjectId) return;
    if (!props.projects.some((project) => project.id === route.projectId)) return;
    props.onSelectProject(route.projectId);
  }, [
    location.pathname,
    location.search,
    props.activeProjectId,
    props.loading,
    props.onSelectProject,
    props.projects,
    useLocalProjects,
  ]);

  // A chat URL is a real deep link. Hydrate it only from the user's already
  // RLS-filtered conversation list, then canonicalize project+chat together.
  useEffect(() => {
    if (props.loading) return;
    const route = parseAIWorkspaceLocation(location.pathname, location.search);
    if (!route.conversationId) return;

    const conversation = conversations.find((item) => item.id === route.conversationId);
    if (!conversation) {
      const projectExists = route.projectId
        ? (useLocalProjects ? localProjects : props.projects).some(
            (project) => project.id === route.projectId,
          )
        : false;
      syncWorkspaceQuery(projectExists ? route.projectId : null, null, true);
      return;
    }

    const mappedProjectId =
      conversation.projectId ||
      (useLocalProjects && user?.id
        ? projectForConversation(user.id, conversation.id)
        : null);
    const availableProjects = useLocalProjects ? localProjects : props.projects;
    const projectId = mappedProjectId && availableProjects.some((project) => project.id === mappedProjectId)
      ? mappedProjectId
      : null;

    if (useLocalProjects && user?.id) {
      if (projectId) setActiveLocalProject(user.id, projectId);
      else clearActiveLocalProject();
    }

    if (props.activeId !== conversation.id) props.onSelect(conversation);

    if (route.projectId !== projectId) {
      syncWorkspaceQuery(projectId, conversation.id, true);
    }
  }, [
    conversations,
    localProjects,
    location.pathname,
    location.search,
    props.activeId,
    props.loading,
    props.onSelect,
    props.projects,
    useLocalProjects,
    user?.id,
  ]);

  // When a brand-new chat receives its database id after the first response,
  // replace the project-root/new-chat URL with its durable address.
  useEffect(() => {
    const previousActiveId = previousActiveIdRef.current;
    previousActiveIdRef.current = props.activeId;
    if (previousActiveId === props.activeId) return;

    if (props.activeId) {
      const projectId = useLocalProjects ? localActiveProjectId : props.activeProjectId;
      syncWorkspaceQuery(projectId || null, props.activeId, true);
      return;
    }

    if (previousActiveId) {
      const route = parseAIWorkspaceLocation(location.pathname, location.search);
      if (route.conversationId === previousActiveId) {
        const projectId = useLocalProjects ? localActiveProjectId : props.activeProjectId;
        syncWorkspaceQuery(projectId || null, null, true);
      }
    }
  }, [
    localActiveProjectId,
    location.pathname,
    location.search,
    props.activeId,
    props.activeProjectId,
    useLocalProjects,
  ]);

  // If the current chat is moved into/out of a project, keep the same chat URL
  // but update its project scope instead of creating a second address.
  useEffect(() => {
    if (!props.activeId) return;
    const route = parseAIWorkspaceLocation(location.pathname, location.search);
    if (route.conversationId !== props.activeId) return;
    const projectId = useLocalProjects ? localActiveProjectId : props.activeProjectId;
    if (route.projectId !== (projectId || null)) {
      syncWorkspaceQuery(projectId || null, props.activeId, true);
    }
  }, [
    localActiveProjectId,
    location.pathname,
    location.search,
    props.activeId,
    props.activeProjectId,
    useLocalProjects,
  ]);

  // Legacy local fallback only. Cloud-backed projects persist membership in
  // ai_conversations.project_id directly inside AIPageV2.
  useEffect(() => {
    if (!useLocalProjects || !user?.id || !props.activeId || !localActiveProjectId) return;
    if (projectForConversation(user.id, props.activeId) === localActiveProjectId) return;
    setConversationProject(user.id, props.activeId, localActiveProjectId);
  }, [localActiveProjectId, props.activeId, useLocalProjects, user?.id]);

  const selectLocalProject = (projectId: string | null) => {
    if (!user?.id) return;
    if (projectId) setActiveLocalProject(user.id, projectId);
    else clearActiveLocalProject();

    syncWorkspaceQuery(projectId, null, false);

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
    syncWorkspaceQuery(projectId, null, false);
    props.onSelectProject?.(projectId);
  };

  const selectConversation = (conversation: AIConversation) => {
    const projectId = conversation.projectId || null;

    if (useLocalProjects && user?.id) {
      const localProjectId = projectId || projectForConversation(user.id, conversation.id);
      if (localProjectId) setActiveLocalProject(user.id, localProjectId);
      else clearActiveLocalProject();
      syncWorkspaceQuery(localProjectId, conversation.id, false);
    } else {
      syncWorkspaceQuery(projectId, conversation.id, false);
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
    const route = parseAIWorkspaceLocation(location.pathname, location.search);
    if (route.projectId === projectId) syncWorkspaceQuery(null, null, true);
  };

  const moveLocalConversation = async (conversationId: string, projectId: string | null) => {
    if (!user?.id) return;
    setConversationProject(user.id, conversationId, projectId);
    if (props.activeId === conversationId) {
      if (projectId) setActiveLocalProject(user.id, projectId);
      else clearActiveLocalProject();
      syncWorkspaceQuery(projectId, conversationId, true);
    }
    refreshLocalProjects();
  };

  const startNewConversation = () => {
    const projectId = useLocalProjects ? localActiveProjectId : props.activeProjectId;
    syncWorkspaceQuery(projectId || null, null, false);
    props.onNew();
  };

  const startLocalProjectConversation = (projectId: string) => {
    if (!user?.id) return;
    setActiveLocalProject(user.id, projectId);
    syncWorkspaceQuery(projectId, null, false);
    props.onNew();
    refreshLocalProjects();
  };

  const startBackendProjectConversation = (projectId: string) => {
    syncWorkspaceQuery(projectId, null, false);
    if (props.activeProjectId === projectId) {
      props.onNew();
      return;
    }
    setPendingProjectNew(projectId);
    props.onSelectProject?.(projectId);
  };

  // Wait for AIPageV2 to adopt the project before calling its `onNew` closure;
  // otherwise React's previous render would create a global chat with NULL
  // project_id.
  useEffect(() => {
    if (!pendingProjectNew || props.activeProjectId !== pendingProjectNew) return;
    setPendingProjectNew(null);
    props.onNew();
  }, [pendingProjectNew, props.activeProjectId, props.onNew]);

  return (
    <AISidebarV2
      {...props}
      conversations={conversations}
      onNew={startNewConversation}
      onSelect={selectConversation}
      onOpenProjects={() => navigate('/ai/projects')}
      loading={props.loading && conversations.length === 0}
      projects={useLocalProjects ? localProjects : props.projects}
      activeProjectId={useLocalProjects ? localActiveProjectId : props.activeProjectId}
      onSelectProject={useLocalProjects ? selectLocalProject : selectBackendProject}
      onNewProject={useLocalProjects ? startLocalProjectConversation : startBackendProjectConversation}
      onCreateProject={useLocalProjects ? createLocal : props.onCreateProject}
      onUpdateProject={useLocalProjects ? updateLocal : props.onUpdateProject}
      onDeleteProject={useLocalProjects ? deleteLocal : deleteBackend}
      onMoveConversation={useLocalProjects ? moveLocalConversation : props.onMoveConversation}
    />
  );
}

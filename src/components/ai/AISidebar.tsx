import { useEffect, useMemo, useRef, useState, type ComponentProps } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

import { useAuth } from '@/contexts/AuthContext';
import { db } from '@/lib/db';
import {
  clearActiveLocalProject,
  createLocalProject,
  deleteLocalProject,
  listLocalProjects,
  projectForConversation,
  readActiveLocalProject,
  readConversationProjectMap,
  setActiveLocalProject,
  setConversationProject,
  updateLocalProject,
} from '@/lib/ai/projectsStore';
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
    refreshLocalProjects();
  }, [user?.id, location.search]);

  /**
   * One-time migration for legacy browser-only projects.
   *
   * Older builds intentionally blocked `ai_projects` behind
   * VITE_AI_CLOUD_SCHEMA, so users could create a project that existed only in
   * localStorage while conversations stayed in Postgres with project_id=NULL.
   * Once the real cloud project callbacks are present, import those rows using
   * their UUIDs, restore conversation membership, then remove the local copy.
   */
  useEffect(() => {
    if (!user?.id || useLocalProjects || migrationStartedRef.current) return;

    const legacyProjects = listLocalProjects(user.id);
    if (legacyProjects.length === 0) return;

    migrationStartedRef.current = true;
    let cancelled = false;

    const migrate = async () => {
      const projectRows = legacyProjects.map((project) => ({
        id: project.id,
        user_id: user.id,
        name: project.name,
        instructions: project.instructions,
        created_at: project.createdAt.toISOString(),
        updated_at: project.updatedAt.toISOString(),
      }));

      const projectWrite = await db
        .from('ai_projects')
        .upsert(projectRows, { onConflict: 'id' });

      if (projectWrite.error) {
        console.error('Legacy AI project migration failed:', projectWrite.error);
        migrationStartedRef.current = false;
        return;
      }

      const projectIds = new Set(legacyProjects.map((project) => project.id));
      const mapping = readConversationProjectMap(user.id);
      const memberships = Object.entries(mapping).filter(([, projectId]) => projectIds.has(projectId));

      const membershipWrites = await Promise.all(
        memberships.map(([conversationId, projectId]) =>
          db
            .from('ai_conversations')
            .update({ project_id: projectId, updated_at: new Date().toISOString() })
            .eq('id', conversationId)
            .eq('user_id', user.id),
        ),
      );

      const membershipError = membershipWrites.find((result) => result.error)?.error;
      if (membershipError) {
        console.error('Legacy AI conversation membership migration failed:', membershipError);
        migrationStartedRef.current = false;
        return;
      }

      for (const project of legacyProjects) deleteLocalProject(user.id, project.id);
      refreshLocalProjects();

      // Parent AI state was loaded before the migration. One reload is the
      // cleanest way to rehydrate projects + project_id memberships atomically.
      if (!cancelled) window.location.reload();
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
  }, [localProjects, location.search, useLocalProjects, user?.id]);

  // `/ai?project=<id>` is the durable project URL. When the database project
  // list arrives, apply that URL to the real AI workspace state.
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

  // Legacy local fallback only. Cloud-backed projects persist membership in
  // ai_conversations.project_id directly inside AIPageV2.
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

  const startLocalProjectConversation = (projectId: string) => {
    if (!user?.id) return;
    setActiveLocalProject(user.id, projectId);
    syncProjectQuery(projectId);
    props.onNew();
    refreshLocalProjects();
  };

  const startBackendProjectConversation = (projectId: string) => {
    if (props.activeProjectId === projectId) {
      props.onNew();
      return;
    }
    setPendingProjectNew(projectId);
    selectBackendProject(projectId);
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
      onSelect={selectConversation}
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

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
import type { AIProject } from './types';

type Props = ComponentProps<typeof AISidebarV2>;

/**
 * AI sidebar owns the project navigation surface. Database-backed projects are
 * preferred when available; otherwise the existing local project store keeps
 * the feature fully usable without sending users to a separate /projects page.
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

  useEffect(() => {
    if (!useLocalProjects) return;
    refreshLocalProjects();
  }, [useLocalProjects, user?.id, location.search]);

  const localActiveProjectId = useMemo(() => {
    if (!useLocalProjects || !user?.id) return null;
    const active = readActiveLocalProject();
    return active?.userId === user.id ? active.project.id : null;
  }, [localProjects, location.search, useLocalProjects, user?.id]);

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

    const next = new URLSearchParams(location.search);
    if (projectId) next.set('project', projectId);
    else next.delete('project');
    navigate(`${location.pathname}${next.size ? `?${next.toString()}` : ''}`, { replace: true });
    props.onNew();
    refreshLocalProjects();
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

  const moveLocalConversation = async (conversationId: string, projectId: string | null) => {
    if (!user?.id) return;
    setConversationProject(user.id, conversationId, projectId);
    refreshLocalProjects();
  };

  return (
    <AISidebarV2
      {...props}
      conversations={conversations}
      // Focus/session refreshes may re-request history, but existing chat rows
      // should never flash back to skeletons when the user returns to the app.
      loading={props.loading && conversations.length === 0}
      projects={useLocalProjects ? localProjects : props.projects}
      activeProjectId={useLocalProjects ? localActiveProjectId : props.activeProjectId}
      onSelectProject={useLocalProjects ? selectLocalProject : props.onSelectProject}
      onCreateProject={useLocalProjects ? createLocal : props.onCreateProject}
      onUpdateProject={useLocalProjects ? updateLocal : props.onUpdateProject}
      onDeleteProject={useLocalProjects ? deleteLocal : props.onDeleteProject}
      onMoveConversation={useLocalProjects ? moveLocalConversation : props.onMoveConversation}
    />
  );
}

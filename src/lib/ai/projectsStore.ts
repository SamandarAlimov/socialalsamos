import type { AIProject } from '@/components/ai/types';

const PROJECTS_VERSION = 1;

const projectsKey = (userId: string) => `alsamos.ai.projects.v${PROJECTS_VERSION}:${userId}`;
const conversationMapKey = (userId: string) => `alsamos.ai.project-conversations.v${PROJECTS_VERSION}:${userId}`;

type StoredProject = {
  id: string;
  name: string;
  instructions: string;
  createdAt: string;
  updatedAt: string;
};

function safeParse<T>(value: string | null, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function toProject(row: StoredProject): AIProject {
  return {
    id: row.id,
    name: row.name || 'Loyiha',
    instructions: row.instructions || '',
    createdAt: new Date(row.createdAt || Date.now()),
    updatedAt: new Date(row.updatedAt || Date.now()),
  };
}

function toStored(project: AIProject): StoredProject {
  return {
    id: project.id,
    name: project.name,
    instructions: project.instructions,
    createdAt: project.createdAt.toISOString(),
    updatedAt: project.updatedAt.toISOString(),
  };
}

export function listLocalProjects(userId: string): AIProject[] {
  try {
    const rows = safeParse<StoredProject[]>(localStorage.getItem(projectsKey(userId)), []);
    return rows
      .filter((row) => row && typeof row.id === 'string')
      .map(toProject)
      .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
  } catch {
    return [];
  }
}

export function saveLocalProjects(userId: string, projects: AIProject[]) {
  try {
    localStorage.setItem(projectsKey(userId), JSON.stringify(projects.map(toStored)));
  } catch {
    // Browser storage can be unavailable in private/restricted environments.
  }
}

export function createLocalProject(
  userId: string,
  value: { name: string; instructions: string },
): AIProject {
  const now = new Date();
  const project: AIProject = {
    id: crypto.randomUUID(),
    name: value.name.trim() || 'Yangi loyiha',
    instructions: value.instructions.trim(),
    createdAt: now,
    updatedAt: now,
  };
  saveLocalProjects(userId, [project, ...listLocalProjects(userId)]);
  return project;
}

export function updateLocalProject(
  userId: string,
  projectId: string,
  value: { name: string; instructions: string },
): AIProject | null {
  let updated: AIProject | null = null;
  const next = listLocalProjects(userId).map((project) => {
    if (project.id !== projectId) return project;
    updated = {
      ...project,
      name: value.name.trim() || project.name,
      instructions: value.instructions.trim(),
      updatedAt: new Date(),
    };
    return updated;
  });
  saveLocalProjects(userId, next);
  return updated;
}

export function deleteLocalProject(userId: string, projectId: string) {
  saveLocalProjects(
    userId,
    listLocalProjects(userId).filter((project) => project.id !== projectId),
  );

  const mapping = readConversationProjectMap(userId);
  let changed = false;
  for (const [conversationId, mappedProjectId] of Object.entries(mapping)) {
    if (mappedProjectId === projectId) {
      delete mapping[conversationId];
      changed = true;
    }
  }
  if (changed) writeConversationProjectMap(userId, mapping);
}

export function readConversationProjectMap(userId: string): Record<string, string> {
  try {
    return safeParse<Record<string, string>>(localStorage.getItem(conversationMapKey(userId)), {});
  } catch {
    return {};
  }
}

function writeConversationProjectMap(userId: string, mapping: Record<string, string>) {
  try {
    localStorage.setItem(conversationMapKey(userId), JSON.stringify(mapping));
  } catch {
    // ignore storage failures
  }
}

export function projectForConversation(userId: string, conversationId: string): string | null {
  return readConversationProjectMap(userId)[conversationId] || null;
}

export function setConversationProject(
  userId: string,
  conversationId: string,
  projectId: string | null,
) {
  const mapping = readConversationProjectMap(userId);
  if (projectId) mapping[conversationId] = projectId;
  else delete mapping[conversationId];
  writeConversationProjectMap(userId, mapping);
}

export function countConversationsByProject(
  userId: string,
  conversationIds?: Iterable<string>,
): Record<string, number> {
  const allowed = conversationIds ? new Set(conversationIds) : null;
  const counts: Record<string, number> = {};
  for (const [conversationId, projectId] of Object.entries(readConversationProjectMap(userId))) {
    if (allowed && !allowed.has(conversationId)) continue;
    counts[projectId] = (counts[projectId] || 0) + 1;
  }
  return counts;
}

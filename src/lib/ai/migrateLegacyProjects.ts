import { db } from '@/lib/db';
import {
  deleteLocalProject,
  listLocalProjects,
  readConversationProjectMap,
} from '@/lib/ai/projectsStore';

/**
 * Move projects created by the old browser-only fallback into the canonical
 * RLS-backed Supabase project tables. This is intentionally idempotent: project
 * UUIDs are preserved and conversation membership can be retried safely.
 */
export async function migrateLegacyLocalProjectsToCloud(userId: string): Promise<boolean> {
  const legacyProjects = listLocalProjects(userId);
  if (legacyProjects.length === 0) return false;

  const projectRows = legacyProjects.map((project) => ({
    id: project.id,
    user_id: userId,
    name: project.name,
    instructions: project.instructions,
    created_at: project.createdAt.toISOString(),
    updated_at: project.updatedAt.toISOString(),
  }));

  const projectWrite = await db
    .from('ai_projects')
    .upsert(projectRows, { onConflict: 'id' });
  if (projectWrite.error) throw projectWrite.error;

  const projectIds = new Set(legacyProjects.map((project) => project.id));
  const memberships = Object.entries(readConversationProjectMap(userId)).filter(([, projectId]) =>
    projectIds.has(projectId),
  );

  const membershipWrites = await Promise.all(
    memberships.map(([conversationId, projectId]) =>
      db
        .from('ai_conversations')
        .update({ project_id: projectId, updated_at: new Date().toISOString() })
        .eq('id', conversationId)
        .eq('user_id', userId),
    ),
  );
  const membershipError = membershipWrites.find((result) => result.error)?.error;
  if (membershipError) throw membershipError;

  // Only remove the browser copy after both project rows and membership writes
  // have succeeded. A failure therefore remains fully retryable.
  for (const project of legacyProjects) deleteLocalProject(userId, project.id);
  return true;
}

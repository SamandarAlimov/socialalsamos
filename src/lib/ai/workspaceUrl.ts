export type AIWorkspaceRoute = {
  projectId: string | null;
  conversationId: string | null;
};

const cleanParam = (value: string | null): string | null => {
  const clean = value?.trim();
  return clean ? clean : null;
};

/**
 * Parse the durable AI workspace location from the query string.
 *
 * Project roots use `?project=<id>` and addressable chats add
 * `&chat=<conversation-id>`. Global chats use only `?chat=<id>`.
 */
export function parseAIWorkspaceSearch(search: string): AIWorkspaceRoute {
  const params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
  return {
    projectId: cleanParam(params.get('project')),
    conversationId: cleanParam(params.get('chat')),
  };
}

/**
 * Update only the AI workspace keys while preserving unrelated query params.
 */
export function buildAIWorkspaceSearch(
  currentSearch: string,
  route: AIWorkspaceRoute,
): string {
  const params = new URLSearchParams(
    currentSearch.startsWith('?') ? currentSearch.slice(1) : currentSearch,
  );

  if (route.projectId) params.set('project', route.projectId);
  else params.delete('project');

  if (route.conversationId) params.set('chat', route.conversationId);
  else params.delete('chat');

  const query = params.toString();
  return query ? `?${query}` : '';
}

export function buildAIWorkspaceHref(
  pathname: string,
  currentSearch: string,
  route: AIWorkspaceRoute,
): string {
  return `${pathname}${buildAIWorkspaceSearch(currentSearch, route)}`;
}

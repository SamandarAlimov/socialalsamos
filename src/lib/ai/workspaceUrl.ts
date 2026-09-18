export type AIWorkspaceRoute = {
  projectId: string | null;
  conversationId: string | null;
};

const cleanParam = (value: string | null): string | null => {
  const clean = value?.trim();
  return clean ? clean : null;
};

const decodeSegment = (value: string | undefined): string | null => {
  if (!value) return null;
  try {
    return cleanParam(decodeURIComponent(value));
  } catch {
    return cleanParam(value);
  }
};

const encodeSegment = (value: string): string => encodeURIComponent(value.trim());

/**
 * Legacy query parser kept for old shared links such as:
 * /ai?project=<id>&chat=<conversation-id>
 */
export function parseAIWorkspaceSearch(search: string): AIWorkspaceRoute {
  const params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
  return {
    projectId: cleanParam(params.get('project')),
    conversationId: cleanParam(params.get('chat')),
  };
}

/**
 * Parse the canonical AI workspace route.
 *
 * - /ai
 * - /ai/chats/:chatId
 * - /ai/projects/:projectId
 * - /ai/projects/:projectId/:chatId
 *
 * Old query-string links are still understood and are canonicalized by AIPage.
 */
export function parseAIWorkspaceLocation(
  pathname: string,
  search: string,
): AIWorkspaceRoute {
  const normalizedPath = (pathname || '/ai').replace(/\/+$/, '') || '/';

  const projectMatch = normalizedPath.match(/^\/ai\/projects\/([^/]+)(?:\/([^/]+))?$/);
  if (projectMatch) {
    return {
      projectId: decodeSegment(projectMatch[1]),
      conversationId: decodeSegment(projectMatch[2]),
    };
  }

  const chatMatch = normalizedPath.match(/^\/ai\/chats\/([^/]+)$/);
  if (chatMatch) {
    return {
      projectId: null,
      conversationId: decodeSegment(chatMatch[1]),
    };
  }

  return parseAIWorkspaceSearch(search);
}

/**
 * Preserve unrelated query params while removing the legacy AI routing keys.
 */
function preservedSearch(currentSearch: string): string {
  const params = new URLSearchParams(
    currentSearch.startsWith('?') ? currentSearch.slice(1) : currentSearch,
  );
  params.delete('project');
  params.delete('chat');
  const query = params.toString();
  return query ? `?${query}` : '';
}

/**
 * Build the canonical, shareable AI workspace URL.
 *
 * Project chat:
 * /ai/projects/<project-id>/<chat-id>
 *
 * Project root / new chat:
 * /ai/projects/<project-id>
 *
 * Global chat:
 * /ai/chats/<chat-id>
 */
export function buildAIWorkspaceHref(
  _pathname: string,
  currentSearch: string,
  route: AIWorkspaceRoute,
): string {
  const suffix = preservedSearch(currentSearch);

  if (route.projectId) {
    const projectPath = `/ai/projects/${encodeSegment(route.projectId)}`;
    return route.conversationId
      ? `${projectPath}/${encodeSegment(route.conversationId)}${suffix}`
      : `${projectPath}${suffix}`;
  }

  if (route.conversationId) {
    return `/ai/chats/${encodeSegment(route.conversationId)}${suffix}`;
  }

  return `/ai${suffix}`;
}

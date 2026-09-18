import { describe, expect, it } from 'vitest';

import {
  buildAIWorkspaceHref,
  parseAIWorkspaceLocation,
  parseAIWorkspaceSearch,
} from './workspaceUrl';

describe('AI workspace URLs', () => {
  it('keeps understanding legacy query-string project links', () => {
    expect(parseAIWorkspaceSearch('?project=project-1')).toEqual({
      projectId: 'project-1',
      conversationId: null,
    });

    expect(parseAIWorkspaceSearch('?project=project-1&chat=chat-9')).toEqual({
      projectId: 'project-1',
      conversationId: 'chat-9',
    });
  });

  it('parses canonical project roots and project chats', () => {
    expect(parseAIWorkspaceLocation('/ai/projects/project-1', '')).toEqual({
      projectId: 'project-1',
      conversationId: null,
    });

    expect(parseAIWorkspaceLocation('/ai/projects/project-1/chat-9', '')).toEqual({
      projectId: 'project-1',
      conversationId: 'chat-9',
    });
  });

  it('supports addressable global chats without a project', () => {
    expect(buildAIWorkspaceHref('/ai', '', { projectId: null, conversationId: 'chat-2' })).toBe(
      '/ai/chats/chat-2',
    );
  });

  it('keeps unrelated query params while building canonical project URLs', () => {
    expect(
      buildAIWorkspaceHref('/ai', '?source=share&project=old&chat=old-chat', {
        projectId: 'new project',
        conversationId: 'chat/7',
      }),
    ).toBe('/ai/projects/new%20project/chat%2F7?source=share');
  });

  it('clears a chat while keeping its project root', () => {
    expect(
      buildAIWorkspaceHref('/ai', '?project=project-1&chat=chat-1', {
        projectId: 'project-1',
        conversationId: null,
      }),
    ).toBe('/ai/projects/project-1');
  });

  it('clears both workspace ids for a fresh global chat', () => {
    expect(
      buildAIWorkspaceHref('/ai', '?project=project-1&chat=chat-1', {
        projectId: null,
        conversationId: null,
      }),
    ).toBe('/ai');
  });
});

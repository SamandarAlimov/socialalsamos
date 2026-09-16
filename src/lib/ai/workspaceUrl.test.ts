import { describe, expect, it } from 'vitest';

import {
  buildAIWorkspaceHref,
  buildAIWorkspaceSearch,
  parseAIWorkspaceSearch,
} from './workspaceUrl';

describe('AI workspace URLs', () => {
  it('parses project roots and project chats', () => {
    expect(parseAIWorkspaceSearch('?project=project-1')).toEqual({
      projectId: 'project-1',
      conversationId: null,
    });

    expect(parseAIWorkspaceSearch('?project=project-1&chat=chat-9')).toEqual({
      projectId: 'project-1',
      conversationId: 'chat-9',
    });
  });

  it('supports addressable global chats without a project', () => {
    expect(buildAIWorkspaceHref('/ai', '', { projectId: null, conversationId: 'chat-2' })).toBe(
      '/ai?chat=chat-2',
    );
  });

  it('keeps unrelated query params while replacing workspace ids', () => {
    expect(
      buildAIWorkspaceSearch('?source=share&project=old&chat=old-chat', {
        projectId: 'new project',
        conversationId: 'chat/7',
      }),
    ).toBe('?source=share&project=new+project&chat=chat%2F7');
  });

  it('clears a chat while keeping its project root', () => {
    expect(
      buildAIWorkspaceSearch('?project=project-1&chat=chat-1', {
        projectId: 'project-1',
        conversationId: null,
      }),
    ).toBe('?project=project-1');
  });

  it('clears both workspace params for a fresh global chat', () => {
    expect(
      buildAIWorkspaceSearch('?project=project-1&chat=chat-1', {
        projectId: null,
        conversationId: null,
      }),
    ).toBe('');
  });
});

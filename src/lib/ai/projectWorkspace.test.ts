import { describe, expect, it } from 'vitest';

import type { AIConversation } from '@/components/ai/types';
import {
  sidebarGeneralConversations,
  sidebarProjectConversations,
} from './projectWorkspace';

function conversation(id: string, title: string, projectId: string | null): AIConversation {
  return {
    id,
    title,
    projectId,
    updatedAt: new Date('2026-09-16T12:00:00Z'),
    messages: [
      {
        id: `${id}-message`,
        role: 'user',
        content: title,
        timestamp: new Date('2026-09-16T12:00:00Z'),
      },
    ],
  };
}

describe('AI project workspace sidebar scoping', () => {
  const rows = [
    conversation('general-1', 'Umumiy suhbat', null),
    conversation('project-a-1', 'Alsamos ichidagi chat', 'project-a'),
    conversation('project-b-1', 'Boshqa loyiha chati', 'project-b'),
    conversation('general-2', 'Yana umumiy chat', null),
  ];

  it('keeps the global recent list independent from the active project', () => {
    expect(sidebarGeneralConversations(rows).map((item) => item.id)).toEqual([
      'general-1',
      'general-2',
    ]);
  });

  it('returns only chats that belong to the requested project', () => {
    expect(sidebarProjectConversations(rows, 'project-a').map((item) => item.id)).toEqual([
      'project-a-1',
    ]);
  });

  it('searches global and project scopes without mixing them', () => {
    expect(sidebarGeneralConversations(rows, 'Alsamos')).toEqual([]);
    expect(sidebarProjectConversations(rows, 'project-a', 'Alsamos').map((item) => item.id)).toEqual([
      'project-a-1',
    ]);
  });
});

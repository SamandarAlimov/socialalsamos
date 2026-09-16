import { describe, expect, it } from 'vitest';

import type { AIConversation, AIProject } from '@/components/ai/types';
import { buildBrainContext } from './brain';

const project: AIProject = {
  id: 'project-a',
  name: 'Project A',
  instructions: 'Only use Project A context.',
  createdAt: new Date('2026-01-01T00:00:00Z'),
  updatedAt: new Date('2026-01-01T00:00:00Z'),
};

const conversations: AIConversation[] = [
  {
    id: 'inside',
    title: 'Inside project',
    projectId: 'project-a',
    updatedAt: new Date('2026-01-02T00:00:00Z'),
    messages: [
      { id: 'm1', role: 'user', content: 'project secret context', timestamp: new Date() },
    ],
  },
  {
    id: 'outside',
    title: 'Outside project',
    projectId: 'project-b',
    updatedAt: new Date('2026-01-03T00:00:00Z'),
    messages: [
      { id: 'm2', role: 'user', content: 'other project context', timestamp: new Date() },
    ],
  },
];

describe('Alsamos AI project context isolation', () => {
  it('uses project instructions and same-project chats without leaking global memory or other projects', () => {
    const context = buildBrainContext({
      userText: 'Continue',
      conversations,
      activeProject: project,
      memories: [
        {
          id: 'memory-1',
          text: 'global private memory',
          kind: 'fact',
          source: 'assistant',
          createdAt: new Date().toISOString(),
        },
      ],
    });

    expect(context).toContain('AKTIV LOYIHA: Project A');
    expect(context).toContain('Only use Project A context.');
    expect(context).toContain('project secret context');
    expect(context).not.toContain('other project context');
    expect(context).not.toContain('global private memory');
    expect(context).not.toContain('YAQIN SUHBATLAR KONTEKSTI:');
  });
});

import { describe, expect, it, vi } from 'vitest';

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    auth: {
      getSession: vi.fn(),
    },
  },
}));

import { shouldPreferServerAgent } from './agentClient';

const allTools = ['web', 'image', 'video', 'code', 'alsamos', 'connectors'] as const;

describe('Alsamos AI server routing', () => {
  it('sends coding requests to the server sandbox even when all default tools are enabled', () => {
    expect(
      shouldPreferServerAgent({
        model: 'auto',
        toolGroups: [...allTools],
        messages: [{ role: 'user', content: 'Python kodini ishga tushirib natijani tekshir' }],
      }),
    ).toBe(true);
  });

  it('keeps rich non-code requests on the existing full-tool agent', () => {
    expect(
      shouldPreferServerAgent({
        model: 'auto',
        toolGroups: [...allTools],
        messages: [{ role: 'user', content: 'Bugungi yangiliklarni internetdan topib ber' }],
      }),
    ).toBe(false);

    expect(
      shouldPreferServerAgent({
        model: 'auto',
        toolGroups: [...allTools],
        messages: [{ role: 'user', content: 'Menga yangi logo rasmini yarat' }],
      }),
    ).toBe(false);
  });

  it('always sends the explicit coding model to the server when code tools are enabled', () => {
    expect(
      shouldPreferServerAgent({
        model: 'coding',
        toolGroups: ['code'],
        messages: [{ role: 'user', content: 'Buni yaxshila' }],
      }),
    ).toBe(true);
  });

  it('never routes to the server sandbox when code tools are disabled', () => {
    expect(
      shouldPreferServerAgent({
        model: 'coding',
        toolGroups: ['web'],
        messages: [{ role: 'user', content: 'Python kod yoz' }],
      }),
    ).toBe(false);
  });
});

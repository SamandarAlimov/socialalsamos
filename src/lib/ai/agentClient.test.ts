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

describe('Alsamos AI browser routing', () => {
  it('never sends coding requests directly from the browser to the private agent', () => {
    expect(
      shouldPreferServerAgent({
        model: 'auto',
        toolGroups: [...allTools],
        messages: [{ role: 'user', content: 'Python kodini ishga tushirib natijani tekshir' }],
      }),
    ).toBe(false);
  });

  it('keeps rich non-code requests on the Supabase full-tool agent', () => {
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

  it('keeps the explicit coding model on the browser-to-Edge path', () => {
    expect(
      shouldPreferServerAgent({
        model: 'coding',
        toolGroups: ['code'],
        messages: [{ role: 'user', content: 'Buni yaxshila' }],
      }),
    ).toBe(false);
  });

  it('does not expose a private-server route when code tools are disabled', () => {
    expect(
      shouldPreferServerAgent({
        model: 'coding',
        toolGroups: ['web'],
        messages: [{ role: 'user', content: 'Python kod yoz' }],
      }),
    ).toBe(false);
  });
});

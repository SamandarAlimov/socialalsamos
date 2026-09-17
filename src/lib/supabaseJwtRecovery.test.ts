import { describe, expect, it } from 'vitest';

import {
  coordinateSupabaseJwtRefresh,
  isExpiredSupabaseJwtResponse,
  isTerminalRefreshTokenError,
} from './supabaseJwtRecovery';

describe('Supabase expired JWT recovery', () => {
  it('recognizes recoverable PostgREST JWT authentication failures', () => {
    expect(isExpiredSupabaseJwtResponse(401, '{"code":"PGRST303","message":"JWT expired"}')).toBe(true);
    expect(isExpiredSupabaseJwtResponse(401, 'JWT expired')).toBe(true);
    expect(isExpiredSupabaseJwtResponse(401, '{"code":"PGRST301","message":"Invalid JWT"}')).toBe(true);
  });

  it('does not retry unrelated authorization failures or missing-auth requests', () => {
    expect(isExpiredSupabaseJwtResponse(403, 'JWT expired')).toBe(false);
    expect(isExpiredSupabaseJwtResponse(401, '{"code":"42501","message":"permission denied"}')).toBe(false);
    expect(isExpiredSupabaseJwtResponse(401, '{"code":"PGRST302","message":"missing authorization"}')).toBe(false);
  });

  it('deduplicates simultaneous refreshes so one rotated token serves every waiter', async () => {
    let refreshCalls = 0;
    const refresh = async () => {
      refreshCalls += 1;
      await Promise.resolve();
      return 'fresh-access-token';
    };
    const [first, second, third] = await Promise.all([
      coordinateSupabaseJwtRefresh(refresh),
      coordinateSupabaseJwtRefresh(refresh),
      coordinateSupabaseJwtRefresh(refresh),
    ]);
    expect(refreshCalls).toBe(1);
    expect([first, second, third]).toEqual(['fresh-access-token', 'fresh-access-token', 'fresh-access-token']);
    await coordinateSupabaseJwtRefresh(refresh);
    expect(refreshCalls).toBe(2);
  });

  it('only treats invalid refresh tokens as terminal session failures', () => {
    expect(isTerminalRefreshTokenError('Invalid Refresh Token: Already Used')).toBe(true);
    expect(isTerminalRefreshTokenError('Refresh Token Not Found')).toBe(true);
    expect(isTerminalRefreshTokenError('Failed to fetch')).toBe(false);
  });
});

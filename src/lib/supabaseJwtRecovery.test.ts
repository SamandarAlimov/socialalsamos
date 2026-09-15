import { describe, expect, it } from 'vitest';

import {
  isExpiredSupabaseJwtResponse,
  isTerminalRefreshTokenError,
} from './supabaseJwtRecovery';

describe('Supabase expired JWT recovery', () => {
  it('recognizes the PostgREST expired JWT responses seen in production', () => {
    expect(isExpiredSupabaseJwtResponse(401, '{"code":"PGRST303","message":"JWT expired"}')).toBe(true);
    expect(isExpiredSupabaseJwtResponse(401, 'JWT expired')).toBe(true);
  });

  it('does not retry unrelated authorization failures', () => {
    expect(isExpiredSupabaseJwtResponse(403, 'JWT expired')).toBe(false);
    expect(isExpiredSupabaseJwtResponse(401, '{"message":"permission denied"}')).toBe(false);
  });

  it('only treats invalid refresh tokens as terminal session failures', () => {
    expect(isTerminalRefreshTokenError('Invalid Refresh Token: Already Used')).toBe(true);
    expect(isTerminalRefreshTokenError('Refresh Token Not Found')).toBe(true);
    expect(isTerminalRefreshTokenError('Failed to fetch')).toBe(false);
  });
});

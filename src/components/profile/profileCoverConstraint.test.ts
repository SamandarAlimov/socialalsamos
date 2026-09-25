import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migrationPath = resolve(
  process.cwd(),
  'supabase/migrations/20260925191500_profile_cover_preset_constraint_v2.sql',
);

describe('profile cover preset database contract', () => {
  it('does not duplicate the frontend preset catalog in a hard-coded database allowlist', () => {
    const migration = readFileSync(migrationPath, 'utf8');

    expect(migration).toContain('DROP CONSTRAINT IF EXISTS profiles_cover_preset_check');
    expect(migration).toContain("cover_preset ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'");
    expect(migration).toContain('char_length(cover_preset) BETWEEN 1 AND 64');
    expect(migration).not.toContain("'aurora-prism'");
    expect(migration).not.toContain("'blush-silk'");
  });
});

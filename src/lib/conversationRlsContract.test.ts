import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migrationPath = resolve(
  process.cwd(),
  'supabase/migrations/20260906150000_restore_conversation_creation_rls.sql',
);
const messagesPath = resolve(process.cwd(), 'src/hooks/useMessages.ts');

const migration = readFileSync(migrationPath, 'utf8').toLowerCase();
const messagesSource = readFileSync(messagesPath, 'utf8');

describe('conversation RLS bootstrap contract', () => {
  it('keeps the existing web bootstrap covered by owner-scoped RLS', () => {
    expect(messagesSource).toContain(".from('conversations')");
    expect(messagesSource).toContain(".from('conversation_participants')");

    expect(migration).toContain('create policy "conversations_insert_owner"');
    expect(migration).toContain('owner_id = auth.uid()');
    expect(migration).toContain(
      'create policy "conversations_select_member_or_owner"',
    );
    expect(migration).toContain(
      'create policy "conversation_participants_insert_owner_bootstrap"',
    );
  });

  it('does not reopen conversations globally', () => {
    expect(migration).not.toContain('with check (true)');
    expect(migration).not.toContain('using (true)');
    expect(migration).toContain('to authenticated');
    expect(migration).toContain('security definer');
  });

  it('preserves DM privacy and duplicate-participant protections', () => {
    expect(migration).toContain("coalesce(v_type, 'private') <> 'private'");
    expect(migration).toContain('v_participant_count >= 2');
    expect(migration).toContain("to_regprocedure('public.can_dm_user(uuid,uuid)')");
    expect(migration).toContain("to_regclass('public.user_blocks')");
  });

  it('allows failed bootstrap cleanup only for the owner', () => {
    expect(migration).toContain('create policy "conversations_delete_owner"');
    expect(migration).toContain('for delete');
    expect(migration).toContain('using (owner_id = auth.uid())');
  });
});

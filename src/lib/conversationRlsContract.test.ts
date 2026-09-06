import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const migrationUrl = new URL(
  '../../supabase/migrations/20260906150000_restore_conversation_creation_rls.sql',
  import.meta.url,
);
const messagesUrl = new URL('../hooks/useMessages.ts', import.meta.url);

const migration = readFileSync(migrationUrl, 'utf8').toLowerCase();
const messagesSource = readFileSync(messagesUrl, 'utf8');

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

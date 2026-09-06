-- =============================================================================
-- Restore safe client conversation creation after RLS hardening
--
-- The web client creates a conversation first and then adds its participants.
-- A stricter conversations SELECT/INSERT policy made the first
-- `.insert(...).select()` fail before the creator could add themselves as a
-- participant, producing:
--   new row violates row-level security policy for table "conversations"
--
-- Keep RLS enabled and restore the intended bootstrap path without reopening
-- conversations globally:
--   * only the authenticated owner may create a conversation;
--   * the owner can see the row immediately so INSERT ... RETURNING works;
--   * only the owner may bootstrap participants directly;
--   * private conversations stay capped at two participants;
--   * blocked user pairs cannot be added to a private conversation;
--   * participants can read the participant list only for conversations they
--     belong to (needed for existing-DM discovery);
--   * failed bootstrap cleanup may delete only an owned conversation.
--
-- SECURITY DEFINER helpers avoid recursive RLS policy evaluation while always
-- binding authorization to auth.uid().
-- =============================================================================

begin;

alter table public.conversations enable row level security;
alter table public.conversation_participants enable row level security;

-- True only when the current authenticated user owns or participates in the
-- requested conversation. No arbitrary user id is accepted, avoiding a
-- participant-membership side channel.
create or replace function public.is_my_conversation(p_conversation_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select auth.uid() is not null
    and exists (
      select 1
      from public.conversations c
      where c.id = p_conversation_id
        and (
          c.owner_id = auth.uid()
          or exists (
            select 1
            from public.conversation_participants cp
            where cp.conversation_id = c.id
              and cp.user_id = auth.uid()
          )
        )
    );
$$;

-- The direct web bootstrap inserts both participant rows after creating the
-- conversation. Authorize that narrowly: the actor must own the conversation.
-- For a private DM, only one other user may be added and blocked pairs fail.
create or replace function public.can_owner_add_conversation_participant(
  p_conversation_id uuid,
  p_target_user_id uuid
)
returns boolean
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid := auth.uid();
  v_type text;
  v_owner uuid;
  v_participant_count integer := 0;
  v_can_dm boolean := true;
begin
  if v_actor is null or p_target_user_id is null then
    return false;
  end if;

  select c.type, c.owner_id
    into v_type, v_owner
  from public.conversations c
  where c.id = p_conversation_id;

  if v_owner is null or v_owner <> v_actor then
    return false;
  end if;

  -- Group/channel owners keep their existing member-management bootstrap.
  if coalesce(v_type, 'private') <> 'private' then
    return true;
  end if;

  -- Re-inserting an existing participant is harmless from an authorization
  -- perspective (the UNIQUE constraint still prevents duplicates).
  if exists (
    select 1
    from public.conversation_participants cp
    where cp.conversation_id = p_conversation_id
      and cp.user_id = p_target_user_id
  ) then
    return true;
  end if;

  select count(*)::integer
    into v_participant_count
  from public.conversation_participants cp
  where cp.conversation_id = p_conversation_id;

  if v_participant_count >= 2 then
    return false;
  end if;

  if p_target_user_id <> v_actor then
    -- Batch-1 deployments expose can_dm_user(). Dynamic SQL keeps this
    -- compatibility migration safe on older Lovable snapshots as well.
    if to_regprocedure('public.can_dm_user(uuid,uuid)') is not null then
      execute 'select public.can_dm_user($1, $2)'
        into v_can_dm
        using v_actor, p_target_user_id;
    elsif to_regclass('public.user_blocks') is not null then
      execute $blocked$
        select not exists (
          select 1
          from public.user_blocks b
          where (b.blocker_id = $1 and b.blocked_user_id = $2)
             or (b.blocker_id = $2 and b.blocked_user_id = $1)
        )
      $blocked$
        into v_can_dm
        using v_actor, p_target_user_id;
    end if;
  end if;

  return coalesce(v_can_dm, false);
end;
$$;

revoke all on function public.is_my_conversation(uuid) from public;
revoke all on function public.can_owner_add_conversation_participant(uuid, uuid) from public;
grant execute on function public.is_my_conversation(uuid) to authenticated;
grant execute on function public.can_owner_add_conversation_participant(uuid, uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- conversations
-- -----------------------------------------------------------------------------

-- Replace the historical open INSERT policy with an owner-bound policy. The
-- explicit owner SELECT branch is important: PostgREST `.insert().select()`
-- must be able to return the newly-created row before participant rows exist.
drop policy if exists "Users can create conversations" on public.conversations;
drop policy if exists "conversations_insert_owner" on public.conversations;
create policy "conversations_insert_owner"
  on public.conversations
  for insert
  to authenticated
  with check (
    auth.uid() is not null
    and owner_id = auth.uid()
  );

drop policy if exists "Users can view their conversations" on public.conversations;
drop policy if exists "conversations_select_member_or_owner" on public.conversations;
create policy "conversations_select_member_or_owner"
  on public.conversations
  for select
  to authenticated
  using (
    owner_id = auth.uid()
    or public.is_my_conversation(id)
  );

-- useMessages() best-effort cleanup deletes the just-created row if participant
-- bootstrap fails. Permit only the owner to perform that cleanup.
drop policy if exists "conversations_delete_owner" on public.conversations;
create policy "conversations_delete_owner"
  on public.conversations
  for delete
  to authenticated
  using (owner_id = auth.uid());

-- -----------------------------------------------------------------------------
-- conversation_participants
-- -----------------------------------------------------------------------------

-- Existing-DM discovery reads the other participant after first reading the
-- caller's conversation ids. Members therefore need the participant roster of
-- their own conversations, but nothing outside those conversations.
drop policy if exists "Participants can view participation" on public.conversation_participants;
drop policy if exists "conversation_participants_select_members" on public.conversation_participants;
create policy "conversation_participants_select_members"
  on public.conversation_participants
  for select
  to authenticated
  using (public.is_my_conversation(conversation_id));

-- The historical self-only INSERT policy cannot bootstrap the second DM user.
-- Replace it with the narrow owner helper above. Invite/join SECURITY DEFINER
-- RPCs remain unaffected by this client-facing policy.
drop policy if exists "Users can join conversations" on public.conversation_participants;
drop policy if exists "conversation_participants_insert_owner_bootstrap" on public.conversation_participants;
create policy "conversation_participants_insert_owner_bootstrap"
  on public.conversation_participants
  for insert
  to authenticated
  with check (
    public.can_owner_add_conversation_participant(conversation_id, user_id)
  );

commit;

notify pgrst, 'reload schema';

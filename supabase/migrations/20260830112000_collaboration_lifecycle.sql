-- =============================================================================
-- Professional post collaboration lifecycle
-- Canonical flow: invite -> pending -> accepted/declined -> remove/leave/reinvite.
-- Direct client UPDATE/DELETE is intentionally disabled; state transitions use RPCs.
-- =============================================================================

-- Only active invitations count toward the 10 collaborator cap.
create or replace function public.enforce_collaborator_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count int;
begin
  if new.status not in ('pending', 'accepted') then
    return new;
  end if;

  select count(*) into v_count
  from public.post_collaborators
  where post_id = new.post_id
    and status in ('pending', 'accepted')
    and id is distinct from new.id;

  if v_count >= 10 then
    raise exception 'Bitta postga eng ko''pi bilan 10 nafar faol hammuallif qo''shish mumkin';
  end if;

  return new;
end
$$;

drop trigger if exists post_collaborators_limit on public.post_collaborators;
create trigger post_collaborators_limit
  before insert or update of status on public.post_collaborators
  for each row execute function public.enforce_collaborator_limit();

-- Tighten RLS. SELECT can expose accepted collaborators to legitimate post viewers,
-- while pending/declined state remains visible only to involved users/owner.
drop policy if exists "Users can view their collaborations" on public.post_collaborators;
drop policy if exists "Post owners can invite collaborators" on public.post_collaborators;
drop policy if exists "Invited users can respond" on public.post_collaborators;
drop policy if exists "Post owners can remove collaborators" on public.post_collaborators;
drop policy if exists "collaborators_select" on public.post_collaborators;
drop policy if exists "collaborators_insert" on public.post_collaborators;
drop policy if exists "collaborators_update" on public.post_collaborators;
drop policy if exists "collaborators_delete" on public.post_collaborators;

create policy "collaborators_select"
  on public.post_collaborators
  for select
  to authenticated
  using (
    public.owns_post(post_id)
    or user_id = auth.uid()
    or invited_by = auth.uid()
    or (status = 'accepted' and public.can_view_post(post_id))
  );

create policy "collaborators_insert"
  on public.post_collaborators
  for insert
  to authenticated
  with check (
    invited_by = auth.uid()
    and user_id <> auth.uid()
    and public.owns_post(post_id)
    and status = 'pending'
  );

-- No direct UPDATE/DELETE policies: use the SECURITY DEFINER RPCs below.

-- Reinvite must create a notification too, not only first insert.
create or replace function public.notify_on_collaboration_invite()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  inviter_name text;
begin
  if new.status <> 'pending' then
    return new;
  end if;

  if tg_op = 'UPDATE' and old.status = 'pending' then
    return new;
  end if;

  select display_name into inviter_name
  from public.profiles
  where id = new.invited_by;

  insert into public.notifications (user_id, type, title, body, data)
  values (
    new.user_id,
    'collaboration_invite',
    'Hammualliflik taklifi',
    coalesce(inviter_name, 'Foydalanuvchi') || ' sizni postga hammuallif sifatida taklif qildi',
    jsonb_build_object(
      'post_id', new.post_id,
      'collaboration_id', new.id,
      'inviter_id', new.invited_by
    )
  );

  return new;
end
$$;

drop trigger if exists on_collaboration_invite on public.post_collaborators;
create trigger on_collaboration_invite
  after insert or update of status on public.post_collaborators
  for each row execute function public.notify_on_collaboration_invite();

-- Owner can invite/reinvite after publishing.
create or replace function public.invite_post_collaborator(
  p_post_id uuid,
  p_user_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_id uuid;
begin
  if v_actor is null then
    raise exception 'Autentifikatsiya talab qilinadi';
  end if;

  if not public.owns_post(p_post_id) then
    raise exception 'Faqat post egasi hammuallif taklif qilishi mumkin';
  end if;

  if p_user_id = v_actor then
    raise exception 'O''zingizni hammuallif sifatida taklif qilib bo''lmaydi';
  end if;

  if not exists (select 1 from public.profiles where id = p_user_id) then
    raise exception 'Foydalanuvchi topilmadi';
  end if;

  insert into public.post_collaborators (
    post_id, user_id, invited_by, status, responded_at
  )
  values (
    p_post_id, p_user_id, v_actor, 'pending', null
  )
  on conflict (post_id, user_id)
  do update set
    invited_by = excluded.invited_by,
    status = 'pending',
    responded_at = null,
    created_at = now()
  returning id into v_id;

  return v_id;
end
$$;

revoke all on function public.invite_post_collaborator(uuid, uuid) from public, anon;
grant execute on function public.invite_post_collaborator(uuid, uuid) to authenticated;

-- Invited collaborator accepts or declines exactly once from pending.
create or replace function public.respond_post_collaboration(
  p_collaboration_id uuid,
  p_accept boolean
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_row public.post_collaborators;
  v_status text;
  v_actor_name text;
begin
  if v_actor is null then
    raise exception 'Autentifikatsiya talab qilinadi';
  end if;

  select * into v_row
  from public.post_collaborators
  where id = p_collaboration_id
  for update;

  if v_row.id is null then
    raise exception 'Hammualliflik taklifi topilmadi';
  end if;

  if v_row.user_id <> v_actor then
    raise exception 'Bu taklifga javob berish huquqi yo''q';
  end if;

  if v_row.status <> 'pending' then
    raise exception 'Bu taklifga allaqachon javob berilgan';
  end if;

  v_status := case when p_accept then 'accepted' else 'declined' end;

  update public.post_collaborators
  set status = v_status,
      responded_at = now()
  where id = p_collaboration_id;

  update public.notifications
  set is_read = true
  where user_id = v_actor
    and type = 'collaboration_invite'
    and data ->> 'collaboration_id' = p_collaboration_id::text;

  if not p_accept then
    select display_name into v_actor_name
    from public.profiles
    where id = v_actor;

    insert into public.notifications (user_id, type, title, body, data)
    values (
      v_row.invited_by,
      'collaboration_declined',
      'Hammualliflik rad etildi',
      coalesce(v_actor_name, 'Foydalanuvchi') || ' hammualliflik taklifini rad etdi',
      jsonb_build_object(
        'post_id', v_row.post_id,
        'collaboration_id', v_row.id,
        'collaborator_id', v_actor
      )
    );
  end if;

  return v_status;
end
$$;

revoke all on function public.respond_post_collaboration(uuid, boolean) from public, anon;
grant execute on function public.respond_post_collaboration(uuid, boolean) to authenticated;

-- Post owner can revoke a pending invite or remove an accepted collaborator.
create or replace function public.remove_post_collaborator(
  p_collaboration_id uuid
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_row public.post_collaborators;
  v_kind text;
begin
  if v_actor is null then
    raise exception 'Autentifikatsiya talab qilinadi';
  end if;

  select * into v_row
  from public.post_collaborators
  where id = p_collaboration_id
  for update;

  if v_row.id is null then
    raise exception 'Hammuallif topilmadi';
  end if;

  if not public.owns_post(v_row.post_id) then
    raise exception 'Faqat post egasi hammuallifni olib tashlashi mumkin';
  end if;

  v_kind := case when v_row.status = 'pending'
    then 'collaboration_revoked'
    else 'collaboration_removed'
  end;

  delete from public.post_collaborators
  where id = p_collaboration_id;

  insert into public.notifications (user_id, type, title, body, data)
  values (
    v_row.user_id,
    v_kind,
    case when v_kind = 'collaboration_revoked'
      then 'Hammualliflik taklifi bekor qilindi'
      else 'Hammualliflik tugatildi'
    end,
    case when v_kind = 'collaboration_revoked'
      then 'Post egasi hammualliflik taklifini bekor qildi'
      else 'Post egasi sizni hammualliflikdan olib tashladi'
    end,
    jsonb_build_object(
      'post_id', v_row.post_id,
      'collaboration_id', v_row.id,
      'actor_id', v_actor
    )
  );

  return v_kind;
end
$$;

revoke all on function public.remove_post_collaborator(uuid) from public, anon;
grant execute on function public.remove_post_collaborator(uuid) to authenticated;

-- Accepted collaborator can leave the post without deleting the post itself.
create or replace function public.leave_post_collaboration(
  p_collaboration_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_row public.post_collaborators;
  v_actor_name text;
begin
  if v_actor is null then
    raise exception 'Autentifikatsiya talab qilinadi';
  end if;

  select * into v_row
  from public.post_collaborators
  where id = p_collaboration_id
  for update;

  if v_row.id is null then
    raise exception 'Hammualliflik topilmadi';
  end if;

  if v_row.user_id <> v_actor or v_row.status <> 'accepted' then
    raise exception 'Bu hammualliflikdan chiqish huquqi yo''q';
  end if;

  delete from public.post_collaborators
  where id = p_collaboration_id;

  select display_name into v_actor_name
  from public.profiles
  where id = v_actor;

  insert into public.notifications (user_id, type, title, body, data)
  values (
    v_row.invited_by,
    'collaboration_left',
    'Hammuallif postdan chiqdi',
    coalesce(v_actor_name, 'Foydalanuvchi') || ' hammualliflikdan chiqdi',
    jsonb_build_object(
      'post_id', v_row.post_id,
      'collaboration_id', v_row.id,
      'collaborator_id', v_actor
    )
  );

  return true;
end
$$;

revoke all on function public.leave_post_collaboration(uuid) from public, anon;
grant execute on function public.leave_post_collaboration(uuid) to authenticated;

-- Trigger-only helpers must not be directly callable.
revoke execute on function public.notify_on_collaboration_invite() from public, anon, authenticated;
revoke execute on function public.notify_on_collaboration_accepted() from public, anon, authenticated;

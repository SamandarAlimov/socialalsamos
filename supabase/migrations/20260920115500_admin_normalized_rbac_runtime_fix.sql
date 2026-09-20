-- Normalized RBAC runtime hardening.
-- Internal audit writes must work for any active admin staff member, while
-- protected profile fields remain permission-specific.

create or replace function public.admin_write_audit(
  p_action text,
  p_target_user_id uuid default null,
  p_entity_type text default 'user',
  p_entity_id text default null,
  p_reason text default null,
  p_before jsonb default '{}'::jsonb,
  p_after jsonb default '{}'::jsonb,
  p_metadata jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_actor uuid := auth.uid();
begin
  if v_actor is null or not public.is_admin_staff(v_actor) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  insert into public.admin_audit_log(
    actor_id, target_user_id, action, entity_type, entity_id, reason,
    before_state, after_state, metadata
  ) values (
    v_actor, p_target_user_id, p_action,
    coalesce(nullif(trim(p_entity_type), ''), 'user'),
    p_entity_id, nullif(trim(p_reason), ''),
    coalesce(p_before, '{}'::jsonb),
    coalesce(p_after, '{}'::jsonb),
    coalesce(p_metadata, '{}'::jsonb)
  )
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.admin_write_audit(text,uuid,text,text,text,jsonb,jsonb,jsonb)
  from public, anon, authenticated;

create or replace function public.prevent_admin_self_escalation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
begin
  if new.is_admin is distinct from old.is_admin
     or new.role is distinct from old.role then
    if v_actor is null
       or not public.has_admin_permission(v_actor, 'admin.roles.manage') then
      new.is_admin := old.is_admin;
      new.role := old.role;
    end if;
  end if;

  if new.is_verified is distinct from old.is_verified then
    if v_actor is null
       or not public.has_admin_permission(v_actor, 'verification.review') then
      new.is_verified := old.is_verified;
    end if;
  end if;

  return new;
end;
$$;

notify pgrst, 'reload schema';

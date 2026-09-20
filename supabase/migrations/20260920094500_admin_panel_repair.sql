-- Repair admin control center runtime access, verification workflows, moderation RLS
-- and the legacy user_roles -> profiles relationship used by PostgREST embeds.
--
-- This migration is intentionally additive/non-destructive apart from replacing
-- the user_roles user_id FK target with profiles(id). profiles.id is itself tied
-- to auth.users(id), so referential integrity remains strict while the REST API
-- can resolve the profile relationship used by the admin UI.

alter table public.user_roles
  drop constraint if exists user_roles_user_id_fkey;

alter table public.user_roles
  add constraint user_roles_user_id_fkey
  foreign key (user_id)
  references public.profiles(id)
  on delete cascade;

-- The legacy trigger protected privileged profile flags only for enum-based
-- admins. Normalized RBAC staff (including super_admin) must be recognized too.
create or replace function public.prevent_admin_self_escalation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.admin_control_authorized(null) then
    new.is_admin := old.is_admin;
    new.role := old.role;
    new.is_verified := old.is_verified;
  end if;
  return new;
end;
$$;

-- Keep profile writes least-privilege: the client only needs the verification
-- column here. Non-admin self-updates cannot escalate because the trigger above
-- restores the protected value.
grant update (is_verified) on public.profiles to authenticated;

drop policy if exists "RBAC admins can update verification state" on public.profiles;
create policy "RBAC admins can update verification state"
  on public.profiles
  for update
  to authenticated
  using ((select public.has_admin_permission((select auth.uid()), 'verification.review')))
  with check ((select public.has_admin_permission((select auth.uid()), 'verification.review')));

drop policy if exists "RBAC admins can view verification requests" on public.verification_requests;
create policy "RBAC admins can view verification requests"
  on public.verification_requests
  for select
  to authenticated
  using ((select public.has_admin_permission((select auth.uid()), 'verification.review')));

drop policy if exists "RBAC admins can update verification requests" on public.verification_requests;
create policy "RBAC admins can update verification requests"
  on public.verification_requests
  for update
  to authenticated
  using ((select public.has_admin_permission((select auth.uid()), 'verification.review')))
  with check ((select public.has_admin_permission((select auth.uid()), 'verification.review')));

drop policy if exists "RBAC admins can send verification notifications" on public.notifications;
create policy "RBAC admins can send verification notifications"
  on public.notifications
  for insert
  to authenticated
  with check (
    (select public.has_admin_permission((select auth.uid()), 'verification.review'))
    and type = 'verification'
    and user_id is not null
  );

-- Compatibility for the old Admin Team surface while normalized RBAC remains
-- the source of truth for authorization.
drop policy if exists "RBAC admins can manage legacy roles" on public.user_roles;
create policy "RBAC admins can manage legacy roles"
  on public.user_roles
  for all
  to authenticated
  using ((select public.has_admin_permission((select auth.uid()), 'admin.roles.manage')))
  with check ((select public.has_admin_permission((select auth.uid()), 'admin.roles.manage')));

-- Admin content management needs to see and moderate content beyond the
-- currently signed-in user's own rows.
drop policy if exists "RBAC admins can view all posts" on public.posts;
create policy "RBAC admins can view all posts"
  on public.posts
  for select
  to authenticated
  using ((select public.has_admin_permission((select auth.uid()), 'content.view')));

drop policy if exists "RBAC admins can moderate posts" on public.posts;
create policy "RBAC admins can moderate posts"
  on public.posts
  for delete
  to authenticated
  using ((select public.has_admin_permission((select auth.uid()), 'content.moderate')));

drop policy if exists "RBAC admins can view all comments" on public.comments;
create policy "RBAC admins can view all comments"
  on public.comments
  for select
  to authenticated
  using ((select public.has_admin_permission((select auth.uid()), 'content.view')));

drop policy if exists "RBAC admins can moderate comments" on public.comments;
create policy "RBAC admins can moderate comments"
  on public.comments
  for delete
  to authenticated
  using ((select public.has_admin_permission((select auth.uid()), 'content.moderate')));

-- These SECURITY DEFINER RPCs all perform their own admin_control_authorized()
-- checks. A later production grants hardening pass removed the authenticated
-- EXECUTE grants and caused the 403s visible in the admin panel.
grant execute on function public.admin_list_users_v3(text,text,integer,integer) to authenticated;
grant execute on function public.admin_get_user_details_v3(uuid) to authenticated;
grant execute on function public.admin_update_user_profile_v3(uuid,jsonb,text) to authenticated;
grant execute on function public.admin_list_mailbox_aliases_v3(uuid) to authenticated;
grant execute on function public.admin_delete_mailbox_alias_v3(uuid,text,text) to authenticated;
grant execute on function public.admin_set_user_account_status_v3(uuid,text,text,timestamptz) to authenticated;
grant execute on function public.admin_user_audit_v3(uuid,integer) to authenticated;
grant execute on function public.admin_recent_audit_v3(integer) to authenticated;
grant execute on function public.admin_region_summary_v3() to authenticated;
grant execute on function public.admin_system_health_v3() to authenticated;
grant execute on function public.admin_prepare_user_deletion_v3(uuid,text) to authenticated;
grant execute on function public.admin_finalize_user_deletion_v3(uuid,boolean,text) to authenticated;

notify pgrst, 'reload schema';

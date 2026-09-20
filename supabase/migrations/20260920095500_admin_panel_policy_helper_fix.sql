-- Production follow-up for 20260920094500_admin_panel_repair.
-- RLS policy expressions execute as the caller, so they must use the public
-- RBAC helper that is already designed for policy evaluation.

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

drop policy if exists "RBAC admins can manage legacy roles" on public.user_roles;
create policy "RBAC admins can manage legacy roles"
  on public.user_roles
  for all
  to authenticated
  using ((select public.has_admin_permission((select auth.uid()), 'admin.roles.manage')))
  with check ((select public.has_admin_permission((select auth.uid()), 'admin.roles.manage')));

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

notify pgrst, 'reload schema';

-- Least-privilege follow-up for Admin Operations Suite v2.
-- Powerful profile/Auth mutation permissions stay super_admin-only by default.

delete from public.admin_role_permissions
where (role_key, permission_key) in (
  ('support', 'admin.users.edit'),
  ('support', 'admin.users.email.manage'),
  ('trust_safety', 'admin.users.edit')
);

notify pgrst, 'reload schema';

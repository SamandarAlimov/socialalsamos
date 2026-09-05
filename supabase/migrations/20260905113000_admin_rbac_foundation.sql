-- Professional admin RBAC foundation.
--
-- Keep legacy public.user_roles/app_role for backwards compatibility, but do not
-- grow the enum forever. Platform administration uses normalized role and
-- permission tables so future roles can be added without enum migrations.

CREATE TABLE IF NOT EXISTS public.admin_roles (
  key text PRIMARY KEY,
  label text NOT NULL,
  description text NOT NULL DEFAULT '',
  rank smallint NOT NULL DEFAULT 100,
  is_system boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.admin_permissions (
  key text PRIMARY KEY,
  category text NOT NULL,
  label text NOT NULL,
  description text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.admin_role_permissions (
  role_key text NOT NULL REFERENCES public.admin_roles(key) ON UPDATE CASCADE ON DELETE CASCADE,
  permission_key text NOT NULL REFERENCES public.admin_permissions(key) ON UPDATE CASCADE ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (role_key, permission_key)
);

CREATE TABLE IF NOT EXISTS public.admin_role_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  role_key text NOT NULL REFERENCES public.admin_roles(key) ON UPDATE CASCADE ON DELETE RESTRICT,
  granted_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  granted_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,
  revoked_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE UNIQUE INDEX IF NOT EXISTS admin_role_assignments_one_active_role
  ON public.admin_role_assignments(user_id, role_key)
  WHERE revoked_at IS NULL;

CREATE INDEX IF NOT EXISTS admin_role_assignments_user_active_idx
  ON public.admin_role_assignments(user_id, revoked_at);

CREATE INDEX IF NOT EXISTS admin_role_assignments_role_active_idx
  ON public.admin_role_assignments(role_key, revoked_at);

INSERT INTO public.admin_roles (key, label, description, rank, is_system) VALUES
  ('super_admin', 'Super Admin', 'Platformaning barcha funksiyalari va admin rollarini boshqaradi.', 0, true),
  ('trust_safety', 'Trust & Safety', 'Reportlar, moderatsiya, enforcement va appeal oqimlarini boshqaradi.', 10, true),
  ('support', 'Support', 'Foydalanuvchi yordam oqimlari va hisob ma’lumotlarini ko‘radi.', 20, true),
  ('finance', 'Finance', 'To‘lovlar, wallet, buyurtmalar va moliyaviy operatsiyalarni boshqaradi.', 20, true),
  ('ads_reviewer', 'Ads Reviewer', 'Reklama materiallari va kampaniyalarni ko‘rib chiqadi.', 30, true),
  ('marketplace_reviewer', 'Marketplace Reviewer', 'Mahsulotlar va seller moderatsiyasini boshqaradi.', 30, true),
  ('mini_apps_reviewer', 'Mini Apps Reviewer', 'Mini ilovalar va publisher submissionlarini ko‘rib chiqadi.', 30, true),
  ('security_analyst', 'Security Analyst', 'Security eventlar, sessiyalar va xavf signallarini tekshiradi.', 15, true),
  ('analytics_viewer', 'Analytics Viewer', 'Platform analitikasi va operatsion metrikalarni faqat ko‘radi.', 50, true)
ON CONFLICT (key) DO UPDATE SET
  label = EXCLUDED.label,
  description = EXCLUDED.description,
  rank = EXCLUDED.rank,
  is_system = EXCLUDED.is_system,
  updated_at = now();

INSERT INTO public.admin_permissions (key, category, label, description) VALUES
  ('admin.console.access', 'admin', 'Admin konsoliga kirish', 'Admin application shell va ruxsat etilgan bo‘limlarga kirish.'),
  ('admin.roles.view', 'admin', 'Admin rollarini ko‘rish', 'Admin jamoasi va role assignmentlarni ko‘rish.'),
  ('admin.roles.manage', 'admin', 'Admin rollarini boshqarish', 'Admin role berish, almashtirish va bekor qilish.'),
  ('audit.view', 'admin', 'Audit logni ko‘rish', 'Admin amallari va security audit izlarini ko‘rish.'),
  ('analytics.view', 'analytics', 'Analitikani ko‘rish', 'Platform KPI va analitika hisobotlarini ko‘rish.'),
  ('content.view', 'content', 'Kontentni ko‘rish', 'Post, izoh va moderation metadata ko‘rish.'),
  ('content.moderate', 'content', 'Kontentni moderatsiya qilish', 'Kontentni yashirish, olib tashlash yoki tiklash.'),
  ('users.view', 'users', 'Foydalanuvchilarni ko‘rish', 'Profil va admin uchun ruxsat etilgan hisob metadata ko‘rish.'),
  ('users.support', 'users', 'Support amallari', 'Support workflow va foydalanuvchi yordam amallarini bajarish.'),
  ('users.restrict', 'users', 'Hisobni cheklash', 'Account restriction va enforcement qo‘llash.'),
  ('verification.review', 'trust_safety', 'Verifikatsiyani ko‘rib chiqish', 'Verification requestlarni approve/reject qilish.'),
  ('reports.view', 'trust_safety', 'Reportlarni ko‘rish', 'Report queue va evidence ko‘rish.'),
  ('reports.review', 'trust_safety', 'Reportlarni ko‘rib chiqish', 'Moderation decision chiqarish.'),
  ('appeals.review', 'trust_safety', 'Appeallarni ko‘rib chiqish', 'Enforcement appeal oqimlarini ko‘rib chiqish.'),
  ('security.view', 'security', 'Security eventlarni ko‘rish', 'Risk signallari, login va security eventlarni ko‘rish.'),
  ('security.lock', 'security', 'Security lock qo‘llash', 'Xavfli account yoki sessionga himoya cheklovi qo‘llash.'),
  ('sessions.view', 'security', 'Sessiyalarni ko‘rish', 'Admin uchun ruxsat etilgan session/device metadata ko‘rish.'),
  ('payments.view', 'finance', 'To‘lovlarni ko‘rish', 'Payment va transaction metadata ko‘rish.'),
  ('payments.manage', 'finance', 'To‘lovlarni boshqarish', 'Refund, review va payment workflow amallarini bajarish.'),
  ('wallets.manage', 'finance', 'Walletlarni boshqarish', 'Wallet top-up va ledger workflow amallarini bajarish.'),
  ('orders.view', 'finance', 'Buyurtmalarni ko‘rish', 'Marketplace order va settlement holatini ko‘rish.'),
  ('ads.view', 'ads', 'Reklamalarni ko‘rish', 'Ads va campaign review ma’lumotlarini ko‘rish.'),
  ('ads.review', 'ads', 'Reklamalarni ko‘rib chiqish', 'Reklama moderation qarorlarini chiqarish.'),
  ('marketplace.view', 'marketplace', 'Marketplace ma’lumotlarini ko‘rish', 'Seller va product moderation ma’lumotlarini ko‘rish.'),
  ('marketplace.review', 'marketplace', 'Marketplace moderatsiyasi', 'Product va marketplace listinglarni approve/reject qilish.'),
  ('sellers.review', 'marketplace', 'Sellerlarni ko‘rib chiqish', 'Seller verification va enforcement oqimlarini boshqarish.'),
  ('mini_apps.view', 'mini_apps', 'Mini Appsni ko‘rish', 'Mini app submission va publisher ma’lumotlarini ko‘rish.'),
  ('mini_apps.review', 'mini_apps', 'Mini Appsni ko‘rib chiqish', 'Mini app versionlarini approve/reject qilish.')
ON CONFLICT (key) DO UPDATE SET
  category = EXCLUDED.category,
  label = EXCLUDED.label,
  description = EXCLUDED.description;

-- Super admin is handled as an implicit wildcard in has_admin_permission().
-- Other roles receive least-privilege permissions explicitly.
INSERT INTO public.admin_role_permissions (role_key, permission_key) VALUES
  ('trust_safety', 'admin.console.access'),
  ('trust_safety', 'analytics.view'),
  ('trust_safety', 'content.view'),
  ('trust_safety', 'content.moderate'),
  ('trust_safety', 'users.view'),
  ('trust_safety', 'users.restrict'),
  ('trust_safety', 'verification.review'),
  ('trust_safety', 'reports.view'),
  ('trust_safety', 'reports.review'),
  ('trust_safety', 'appeals.review'),
  ('support', 'admin.console.access'),
  ('support', 'users.view'),
  ('support', 'users.support'),
  ('finance', 'admin.console.access'),
  ('finance', 'payments.view'),
  ('finance', 'payments.manage'),
  ('finance', 'wallets.manage'),
  ('finance', 'orders.view'),
  ('finance', 'marketplace.view'),
  ('ads_reviewer', 'admin.console.access'),
  ('ads_reviewer', 'ads.view'),
  ('ads_reviewer', 'ads.review'),
  ('marketplace_reviewer', 'admin.console.access'),
  ('marketplace_reviewer', 'marketplace.view'),
  ('marketplace_reviewer', 'marketplace.review'),
  ('marketplace_reviewer', 'sellers.review'),
  ('mini_apps_reviewer', 'admin.console.access'),
  ('mini_apps_reviewer', 'mini_apps.view'),
  ('mini_apps_reviewer', 'mini_apps.review'),
  ('security_analyst', 'admin.console.access'),
  ('security_analyst', 'users.view'),
  ('security_analyst', 'security.view'),
  ('security_analyst', 'security.lock'),
  ('security_analyst', 'sessions.view'),
  ('security_analyst', 'audit.view'),
  ('analytics_viewer', 'admin.console.access'),
  ('analytics_viewer', 'analytics.view')
ON CONFLICT (role_key, permission_key) DO NOTHING;

CREATE OR REPLACE FUNCTION public.has_admin_role(_user_id uuid, _role_key text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.admin_role_assignments ara
    WHERE ara.user_id = _user_id
      AND ara.role_key = _role_key
      AND ara.revoked_at IS NULL
  );
$$;

CREATE OR REPLACE FUNCTION public.is_admin_staff(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    EXISTS (
      SELECT 1
      FROM public.admin_role_assignments ara
      WHERE ara.user_id = _user_id
        AND ara.revoked_at IS NULL
    )
    OR public.has_role(_user_id, 'admin'::public.app_role);
$$;

CREATE OR REPLACE FUNCTION public.has_admin_permission(_user_id uuid, _permission_key text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.has_admin_role(_user_id, 'super_admin')
    OR public.has_role(_user_id, 'admin'::public.app_role)
    OR EXISTS (
      SELECT 1
      FROM public.admin_role_assignments ara
      JOIN public.admin_role_permissions arp ON arp.role_key = ara.role_key
      WHERE ara.user_id = _user_id
        AND ara.revoked_at IS NULL
        AND arp.permission_key = _permission_key
    );
$$;

ALTER TABLE public.admin_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_role_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_role_assignments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admin staff can view admin roles" ON public.admin_roles;
CREATE POLICY "Admin staff can view admin roles"
  ON public.admin_roles FOR SELECT TO authenticated
  USING (public.is_admin_staff(auth.uid()));

DROP POLICY IF EXISTS "Admin staff can view admin permissions" ON public.admin_permissions;
CREATE POLICY "Admin staff can view admin permissions"
  ON public.admin_permissions FOR SELECT TO authenticated
  USING (public.is_admin_staff(auth.uid()));

DROP POLICY IF EXISTS "Admin staff can view role permissions" ON public.admin_role_permissions;
CREATE POLICY "Admin staff can view role permissions"
  ON public.admin_role_permissions FOR SELECT TO authenticated
  USING (public.is_admin_staff(auth.uid()));

DROP POLICY IF EXISTS "Admins can view role assignments" ON public.admin_role_assignments;
CREATE POLICY "Admins can view role assignments"
  ON public.admin_role_assignments FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR public.has_admin_permission(auth.uid(), 'admin.roles.view')
    OR public.has_admin_role(auth.uid(), 'super_admin')
  );

GRANT SELECT ON public.admin_roles TO authenticated;
GRANT SELECT ON public.admin_permissions TO authenticated;
GRANT SELECT ON public.admin_role_permissions TO authenticated;
GRANT SELECT ON public.admin_role_assignments TO authenticated;

CREATE OR REPLACE FUNCTION public.grant_admin_role_v2(
  p_target_user_id uuid,
  p_role_key text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_assignment_id uuid;
BEGIN
  IF v_actor IS NULL OR NOT public.has_admin_permission(v_actor, 'admin.roles.manage') THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.admin_roles WHERE key = p_role_key) THEN
    RAISE EXCEPTION 'unknown_admin_role';
  END IF;

  IF p_role_key = 'super_admin' AND NOT public.has_admin_role(v_actor, 'super_admin') THEN
    RAISE EXCEPTION 'super_admin_required';
  END IF;

  SELECT id INTO v_assignment_id
  FROM public.admin_role_assignments
  WHERE user_id = p_target_user_id
    AND role_key = p_role_key
    AND revoked_at IS NULL
  LIMIT 1;

  IF v_assignment_id IS NULL THEN
    INSERT INTO public.admin_role_assignments (user_id, role_key, granted_by)
    VALUES (p_target_user_id, p_role_key, v_actor)
    RETURNING id INTO v_assignment_id;
  END IF;

  INSERT INTO public.admin_actions (admin_id, action, target_id, details)
  VALUES (
    v_actor,
    'admin_role_granted',
    p_target_user_id,
    jsonb_build_object('role', p_role_key, 'assignment_id', v_assignment_id)
  );

  RETURN v_assignment_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.revoke_admin_role_v2(
  p_target_user_id uuid,
  p_role_key text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_changed integer := 0;
  v_super_admin_count integer := 0;
BEGIN
  IF v_actor IS NULL OR NOT public.has_admin_permission(v_actor, 'admin.roles.manage') THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  IF p_target_user_id = v_actor THEN
    RAISE EXCEPTION 'self_role_revocation_not_allowed';
  END IF;

  IF p_role_key = 'super_admin' THEN
    IF NOT public.has_admin_role(v_actor, 'super_admin') THEN
      RAISE EXCEPTION 'super_admin_required';
    END IF;

    SELECT count(*)::integer INTO v_super_admin_count
    FROM public.admin_role_assignments
    WHERE role_key = 'super_admin' AND revoked_at IS NULL;

    IF v_super_admin_count <= 1 THEN
      RAISE EXCEPTION 'cannot_remove_last_super_admin';
    END IF;
  END IF;

  UPDATE public.admin_role_assignments
  SET revoked_at = now(), revoked_by = v_actor
  WHERE user_id = p_target_user_id
    AND role_key = p_role_key
    AND revoked_at IS NULL;

  GET DIAGNOSTICS v_changed = ROW_COUNT;

  IF v_changed > 0 THEN
    INSERT INTO public.admin_actions (admin_id, action, target_id, details)
    VALUES (
      v_actor,
      'admin_role_revoked',
      p_target_user_id,
      jsonb_build_object('role', p_role_key)
    );
  END IF;

  RETURN v_changed > 0;
END;
$$;

REVOKE ALL ON FUNCTION public.grant_admin_role_v2(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.revoke_admin_role_v2(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.grant_admin_role_v2(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.revoke_admin_role_v2(uuid, text) TO authenticated;

-- Bootstrap the two platform co-owners by verified login email.
-- This is intentionally email-based rather than username-based: usernames are
-- public/profile mutable while auth email is the login identity.
WITH founders AS (
  SELECT p.id
  FROM auth.users u
  JOIN public.profiles p ON p.id = u.id
  WHERE lower(u.email) IN ('samandar@alsamos.com', 'alsamos@alsamos.com')
)
INSERT INTO public.admin_role_assignments (user_id, role_key, granted_by, metadata)
SELECT f.id, 'super_admin', f.id, jsonb_build_object('bootstrap', true, 'source', 'founder_email')
FROM founders f
WHERE NOT EXISTS (
  SELECT 1
  FROM public.admin_role_assignments ara
  WHERE ara.user_id = f.id
    AND ara.role_key = 'super_admin'
    AND ara.revoked_at IS NULL
);

-- Keep current production clients/RLS working while they migrate from the
-- legacy enum-based admin role to the normalized RBAC tables.
WITH founders AS (
  SELECT p.id
  FROM auth.users u
  JOIN public.profiles p ON p.id = u.id
  WHERE lower(u.email) IN ('samandar@alsamos.com', 'alsamos@alsamos.com')
)
INSERT INTO public.user_roles (user_id, role, granted_by)
SELECT f.id, 'admin'::public.app_role, f.id
FROM founders f
ON CONFLICT (user_id, role) DO NOTHING;

UPDATE public.profiles p
SET is_admin = true
FROM auth.users u
WHERE p.id = u.id
  AND lower(u.email) IN ('samandar@alsamos.com', 'alsamos@alsamos.com');

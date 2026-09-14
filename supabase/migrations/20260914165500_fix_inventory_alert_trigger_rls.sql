-- Product INSERT/UPDATE fires check_inventory_alerts(), which maintains the
-- internal inventory_alerts table. That table intentionally has no client
-- INSERT/UPDATE RLS policy, so the trigger must execute with its owner rights.
-- The products table remains protected by its existing seller RLS policies.

ALTER FUNCTION public.check_inventory_alerts() SECURITY DEFINER;
ALTER FUNCTION public.check_inventory_alerts() SET search_path TO public, pg_temp;

-- This function is trigger-only. Keep SECURITY DEFINER from becoming a public
-- RPC surface; trigger execution continues to work without caller EXECUTE.
REVOKE ALL ON FUNCTION public.check_inventory_alerts() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.check_inventory_alerts() FROM anon;
REVOKE ALL ON FUNCTION public.check_inventory_alerts() FROM authenticated;

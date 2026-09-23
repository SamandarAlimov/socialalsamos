-- Harden promo-code helper functions surfaced by Supabase security advisors.
-- Trigger functions never need direct client EXECUTE access, and immutable
-- normalization should resolve only trusted pg_catalog functions.

alter function public.marketplace_normalize_promo_code(text)
  set search_path = pg_catalog;

revoke all on function public.marketplace_void_promo_redemption_when_orders_cancelled()
  from public, anon, authenticated;

notify pgrst, 'reload schema';

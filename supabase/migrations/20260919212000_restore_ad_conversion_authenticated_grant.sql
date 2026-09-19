-- Restore the authenticated client grant for the public ads conversion wrapper.
-- The wrapper pins attribution to auth.uid(); arbitrary-user attribution remains
-- private in record_ad_conversion_for_user_v4.

revoke all on function public.record_ad_conversion_v2(text, numeric, text, text, text, jsonb) from public;
revoke all on function public.record_ad_conversion_v2(text, numeric, text, text, text, jsonb) from anon;
grant execute on function public.record_ad_conversion_v2(text, numeric, text, text, text, jsonb) to authenticated;

-- Restore EXECUTE privileges required by authenticated web clients.
-- Each function performs its own authorization checks and/or derives auth.uid().

grant execute on function public.ensure_my_wallet() to authenticated;
grant execute on function public.get_eligible_ads_v5(text, integer, text, jsonb) to authenticated;
grant execute on function public.my_contact_suggestions(integer) to authenticated;
grant execute on function public.mini_apps_feed(text, text, text, text, boolean, text, text, text, integer, integer) to authenticated;

-- Restore direct PostgREST privileges needed by the authenticated client.
-- RLS remains the row-level authority; these grants only make the API surface
-- callable. Keep this list intentionally limited to first-party client tables.

do $$
declare
  rel text;
begin
  foreach rel in array array[
    'call_invites','channels','conversation_participants','conversations',
    'follows','notifications','orders','posts','product_likes',
    'product_reviews','products','reposts','sellers','stories',
    'story_highlights','user_activity_logs','user_sessions','user_settings'
  ] loop
    if to_regclass('public.' || rel) is not null then
      execute format('grant select, insert, update, delete on table public.%I to authenticated', rel);
    end if;
  end loop;
end
$$;

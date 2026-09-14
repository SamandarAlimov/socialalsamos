-- Provide a working TURN fallback when the account-scoped Metered credential
-- is unavailable or rejected by the relay service.
--
-- Metered's Open Relay documents staticauth.openrelay.metered.ca with the
-- public shared static-auth secret used below. coturn REST authentication
-- derives a time-limited browser credential from an expiry timestamp using
-- HMAC-SHA1. The generated credential is refreshed every 12 hours and expires
-- after 48 hours, so clients always receive a fresh relay credential without
-- exposing any account-scoped provider secret.

create or replace function public.refresh_call_openrelay_fallback()
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, extensions
as $$
declare
  v_expiry bigint := floor(extract(epoch from clock_timestamp() + interval '48 hours'))::bigint;
  v_username text := v_expiry::text || ':alsamos';
  v_credential text;
  v_next jsonb;
begin
  v_credential := encode(
    extensions.hmac(
      convert_to(v_username, 'UTF8'),
      convert_to('openrelayprojectsecret', 'UTF8'),
      'sha1'
    ),
    'base64'
  );

  v_next := jsonb_build_array(
    jsonb_build_object('urls', 'stun:stun.relay.metered.ca:80'),
    jsonb_build_object('urls', 'stun:stun.l.google.com:19302'),
    jsonb_build_object('urls', 'stun:stun1.l.google.com:19302'),
    jsonb_build_object('urls', 'turn:staticauth.openrelay.metered.ca:80', 'username', v_username, 'credential', v_credential),
    jsonb_build_object('urls', 'turn:staticauth.openrelay.metered.ca:80?transport=tcp', 'username', v_username, 'credential', v_credential),
    jsonb_build_object('urls', 'turn:staticauth.openrelay.metered.ca:443', 'username', v_username, 'credential', v_credential),
    jsonb_build_object('urls', 'turn:staticauth.openrelay.metered.ca:443?transport=tcp', 'username', v_username, 'credential', v_credential),
    jsonb_build_object('urls', 'turns:staticauth.openrelay.metered.ca:443?transport=tcp', 'username', v_username, 'credential', v_credential)
  );

  insert into public.call_webrtc_config(key, value, updated_at)
  values ('ice_servers', v_next, now())
  on conflict (key) do update
  set value = excluded.value,
      updated_at = excluded.updated_at;
end;
$$;

revoke all on function public.refresh_call_openrelay_fallback() from public, anon, authenticated;

select public.refresh_call_openrelay_fallback();

do $$
declare
  v_jobid bigint;
begin
  for v_jobid in
    select jobid from cron.job where jobname = 'refresh-call-openrelay-fallback'
  loop
    perform cron.unschedule(v_jobid);
  end loop;
end;
$$;

select cron.schedule(
  'refresh-call-openrelay-fallback',
  '0 */12 * * *',
  $cron$select public.refresh_call_openrelay_fallback();$cron$
);

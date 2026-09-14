do $$
begin
  if exists (select 1 from cron.job where jobname = 'refresh-call-openrelay-fallback') then
    perform cron.unschedule('refresh-call-openrelay-fallback');
  end if;
end
$$;

drop function if exists public.refresh_call_openrelay_fallback();

create or replace function public.refresh_call_metered_ice_servers()
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public, extensions, vault
as $$
declare
  v_app_name text;
  v_api_key text;
  v_response extensions.http_response;
  v_payload jsonb;
  v_valid_turn_count integer := 0;
begin
  select decrypted_secret
    into v_app_name
  from vault.decrypted_secrets
  where name = 'metered_turn_app_name'
  limit 1;

  select decrypted_secret
    into v_api_key
  from vault.decrypted_secrets
  where name = 'metered_turn_credential_api_key'
  limit 1;

  v_app_name := lower(btrim(coalesce(v_app_name, '')));
  v_api_key := btrim(coalesce(v_api_key, ''));

  if v_app_name = '' or v_api_key = '' then
    return false;
  end if;

  if v_app_name !~ '^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$' then
    raise exception 'Invalid Metered app name';
  end if;

  -- Credential-scoped API keys are expected to be URL-safe. Reject anything
  -- else instead of interpolating an unescaped secret into the request URL.
  if v_api_key !~ '^[A-Za-z0-9_-]+$' then
    raise exception 'Invalid Metered TURN credential API key format';
  end if;

  begin
    v_response := extensions.http_get(
      ('https://' || v_app_name || '.metered.live/api/v1/turn/credentials?apiKey=' || v_api_key)::varchar
    );
  exception
    when others then
      return false;
  end;

  if v_response.status <> 200 then
    return false;
  end if;

  begin
    v_payload := v_response.content::jsonb;
  exception
    when others then
      return false;
  end;

  if jsonb_typeof(v_payload) <> 'array' then
    return false;
  end if;

  select count(*)
    into v_valid_turn_count
  from jsonb_array_elements(v_payload) as elem
  where jsonb_typeof(elem) = 'object'
    and nullif(elem->>'username', '') is not null
    and nullif(elem->>'credential', '') is not null
    and (
      (jsonb_typeof(elem->'urls') = 'string'
        and ((elem->>'urls') like 'turn:%' or (elem->>'urls') like 'turns:%'))
      or
      (jsonb_typeof(elem->'urls') = 'array'
        and exists (
          select 1
          from jsonb_array_elements_text(elem->'urls') as u(url)
          where u.url like 'turn:%' or u.url like 'turns:%'
        ))
    );

  if v_valid_turn_count < 1 then
    return false;
  end if;

  update public.call_webrtc_config
  set value = v_payload,
      updated_at = now()
  where key = 'ice_servers';

  return found;
end;
$$;

revoke all on function public.refresh_call_metered_ice_servers() from public, anon, authenticated;
grant execute on function public.refresh_call_metered_ice_servers() to service_role;

-- Retire the non-browser staticauth fallback. Until a real Metered credential
-- API key is provisioned, expose only working STUN servers rather than claiming
-- TURN availability and triggering futile relay probes/restarts.
update public.call_webrtc_config
set value = jsonb_build_array(
      jsonb_build_object('urls', 'stun:stun.relay.metered.ca:80'),
      jsonb_build_object('urls', 'stun:stun.l.google.com:19302'),
      jsonb_build_object('urls', 'stun:stun1.l.google.com:19302')
    ),
    updated_at = now()
where key = 'ice_servers';

do $$
begin
  if exists (select 1 from cron.job where jobname = 'refresh-call-metered-ice-servers') then
    perform cron.unschedule('refresh-call-metered-ice-servers');
  end if;

  perform cron.schedule(
    'refresh-call-metered-ice-servers',
    '0 */6 * * *',
    'select public.refresh_call_metered_ice_servers();'
  );
end
$$;

-- Safe no-op while the two Vault secrets are absent. Once provisioned, this
-- immediately replaces the STUN-only config with Metered's official ICE array.
select public.refresh_call_metered_ice_servers();

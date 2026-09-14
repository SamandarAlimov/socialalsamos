-- Migrate the live WebRTC relay configuration away from deprecated Metered
-- Open Relay hostnames while preserving the existing account-scoped credential.
--
-- Metered's current free-plan TURN endpoint is standard.relay.metered.ca.
-- The previous openrelay.metered.ca / a.relay.metered.ca entries produced
-- TURN ALLOCATE failures in production and never yielded relay candidates.
--
-- Do not hard-code credentials in source control. This migration extracts the
-- already-provisioned account credential from call_webrtc_config and reuses it
-- on the current endpoint.

do $$
declare
  v_existing jsonb;
  v_account_credential jsonb;
  v_username text;
  v_credential text;
  v_next jsonb;
begin
  select value
    into v_existing
  from public.call_webrtc_config
  where key = 'ice_servers'
  for update;

  if v_existing is null or jsonb_typeof(v_existing) <> 'array' then
    raise exception 'call_webrtc_config.ice_servers must be a JSON array';
  end if;

  select elem
    into v_account_credential
  from jsonb_array_elements(v_existing) as elem
  where coalesce(elem->>'username', '') <> ''
    and elem->>'username' <> 'openrelayproject'
    and coalesce(elem->>'credential', '') <> ''
  limit 1;

  if v_account_credential is null then
    raise exception 'No account-scoped TURN credential found to migrate';
  end if;

  v_username := v_account_credential->>'username';
  v_credential := v_account_credential->>'credential';

  v_next := jsonb_build_array(
    jsonb_build_object('urls', 'stun:stun.relay.metered.ca:80'),
    jsonb_build_object('urls', 'stun:stun.l.google.com:19302'),
    jsonb_build_object('urls', 'stun:stun1.l.google.com:19302'),
    jsonb_build_object('urls', 'turn:standard.relay.metered.ca:80', 'username', v_username, 'credential', v_credential),
    jsonb_build_object('urls', 'turn:standard.relay.metered.ca:80?transport=tcp', 'username', v_username, 'credential', v_credential),
    jsonb_build_object('urls', 'turn:standard.relay.metered.ca:443', 'username', v_username, 'credential', v_credential),
    jsonb_build_object('urls', 'turn:standard.relay.metered.ca:443?transport=tcp', 'username', v_username, 'credential', v_credential),
    jsonb_build_object('urls', 'turns:standard.relay.metered.ca:443?transport=tcp', 'username', v_username, 'credential', v_credential)
  );

  update public.call_webrtc_config
  set value = v_next,
      updated_at = now()
  where key = 'ice_servers';
end
$$;

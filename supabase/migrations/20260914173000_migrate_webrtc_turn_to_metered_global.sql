-- Metered recommends global.relay.metered.ca for general TURN traffic.
-- Preserve the already-provisioned account-scoped credential and only migrate
-- the relay hostname. No TURN secrets are stored in source control.
--
-- This migration supports both historical JSON array values and the wrapped
-- {"iceServers": [...]} shape used by some deployments.

do $$
declare
  v_existing jsonb;
  v_servers jsonb;
  v_next_servers jsonb;
  v_next jsonb;
begin
  select value
    into v_existing
  from public.call_webrtc_config
  where key = 'ice_servers'
  for update;

  if v_existing is null then
    raise exception 'call_webrtc_config.ice_servers is missing';
  end if;

  if jsonb_typeof(v_existing) = 'array' then
    v_servers := v_existing;
  elsif jsonb_typeof(v_existing) = 'object'
    and jsonb_typeof(v_existing->'iceServers') = 'array' then
    v_servers := v_existing->'iceServers';
  else
    raise exception 'call_webrtc_config.ice_servers must be a JSON array or an object containing iceServers';
  end if;

  select coalesce(
    jsonb_agg(
      case
        when jsonb_typeof(elem) = 'object' and elem ? 'urls' then
          jsonb_set(
            elem,
            '{urls}',
            to_jsonb(replace(elem->>'urls', 'standard.relay.metered.ca', 'global.relay.metered.ca')),
            false
          )
        else elem
      end
      order by ord
    ),
    '[]'::jsonb
  )
  into v_next_servers
  from jsonb_array_elements(v_servers) with ordinality as t(elem, ord);

  if jsonb_typeof(v_existing) = 'array' then
    v_next := v_next_servers;
  else
    v_next := jsonb_set(v_existing, '{iceServers}', v_next_servers, false);
  end if;

  update public.call_webrtc_config
  set value = v_next,
      updated_at = now()
  where key = 'ice_servers';
end
$$;

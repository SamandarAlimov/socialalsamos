-- Make the production TURN configuration visible to authenticated WebRTC clients.
--
-- Audit on 2026-09-14 found that public.call_webrtc_config had RLS enabled and
-- table-level SELECT granted to authenticated, but no SELECT policy. With RLS,
-- that is an implicit deny, so the browser silently received no ice_servers row
-- and fell back to STUN-only candidates.
--
-- Keep anonymous access denied and expose only the single client-required
-- ice_servers row. TURN credentials necessarily have to reach the authenticated
-- browser in order for RTCPeerConnection to allocate relay candidates.
--
-- Normalize the stored payload to the legacy top-level array shape as a hotfix
-- for the currently deployed production bundle. The current frontend accepts
-- both this array shape and RTCConfiguration-style { iceServers: [...] }.

grant select on table public.call_webrtc_config to authenticated;
revoke all on table public.call_webrtc_config from anon;

drop policy if exists "Authenticated users can read call ICE servers" on public.call_webrtc_config;
create policy "Authenticated users can read call ICE servers"
on public.call_webrtc_config
for select
to authenticated
using (key = 'ice_servers');

update public.call_webrtc_config
set value = value -> 'iceServers'
where key = 'ice_servers'
  and jsonb_typeof(value) = 'object'
  and jsonb_typeof(value -> 'iceServers') = 'array';

-- Keep call lifecycle rows consistent when video_calls reaches a terminal end.
--
-- Production audit found an ended direct call with one call_participants row
-- still left_at IS NULL. That stale row can make one browser continue showing
-- the call after the other side has already ended it, and it also confuses
-- refresh/recovery logic that intentionally treats an open participant row as
-- evidence that the user is still in a call.

create or replace function public.sync_ended_video_call_participants()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.ended_at is not null and old.ended_at is null then
    update public.call_participants
    set left_at = coalesce(left_at, new.ended_at),
        connection_state = case
          when left_at is null then 'left'
          else connection_state
        end,
        last_seen_at = greatest(coalesce(last_seen_at, new.ended_at), new.ended_at)
    where call_id = new.id
      and left_at is null;

    update public.call_room_members
    set left_at = coalesce(left_at, new.ended_at),
        connection_state = case
          when left_at is null then 'left'
          else connection_state
        end,
        updated_at = greatest(coalesce(updated_at, new.ended_at), new.ended_at)
    where call_id = new.id
      and left_at is null;
  end if;

  return new;
end;
$$;

revoke all on function public.sync_ended_video_call_participants() from public, anon, authenticated;

drop trigger if exists trg_sync_ended_video_call_participants on public.video_calls;
create trigger trg_sync_ended_video_call_participants
after update of ended_at on public.video_calls
for each row
when (new.ended_at is not null and old.ended_at is null)
execute function public.sync_ended_video_call_participants();

-- Repair already-inconsistent historical/current rows at deployment time.
update public.call_participants as cp
set left_at = vc.ended_at,
    connection_state = 'left',
    last_seen_at = greatest(coalesce(cp.last_seen_at, vc.ended_at), vc.ended_at)
from public.video_calls as vc
where vc.id = cp.call_id
  and vc.ended_at is not null
  and cp.left_at is null;

update public.call_room_members as crm
set left_at = vc.ended_at,
    connection_state = 'left',
    updated_at = greatest(coalesce(crm.updated_at, vc.ended_at), vc.ended_at)
from public.video_calls as vc
where vc.id = crm.call_id
  and vc.ended_at is not null
  and crm.left_at is null;

comment on function public.sync_ended_video_call_participants() is
  'Closes all still-open participant/member rows when a video call receives ended_at.';

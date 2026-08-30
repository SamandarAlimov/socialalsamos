-- =============================================================================
-- Message draft monotonic tombstones
--
-- A sent draft is cleared by writing content='' with a newer updated_at instead
-- of deleting the row. This preserves ordering information across web, mobile,
-- desktop and delayed/offline requests.
-- =============================================================================

create or replace function public.guard_message_draft_monotonic_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if new.updated_at < old.updated_at then
    return old;
  end if;

  return new;
end;
$$;

drop trigger if exists message_drafts_monotonic_updated_at
  on public.message_drafts;

create trigger message_drafts_monotonic_updated_at
before update on public.message_drafts
for each row
execute function public.guard_message_draft_monotonic_updated_at();

comment on column public.message_drafts.content is
  'Per-user draft. Empty content is a versioned clear tombstone; do not delete it during normal draft clearing.';

-- Alsamos groups/channels: Boost is intentionally disabled for now.
-- Keep legacy columns/table for forward compatibility, but expose no client write path.

drop policy if exists boosts_manage_own on public.conversation_boosts;
drop policy if exists boosts_select on public.conversation_boosts;

delete from public.conversation_boosts;

update public.conversations
set boost_level = 0,
    boosts_count = 0
where coalesce(boost_level, 0) <> 0
   or coalesce(boosts_count, 0) <> 0;

alter table public.conversation_boosts enable row level security;

-- =============================================================================
-- Telegram-style per-chat message drafts
-- Drafts are private to the authenticated user and sync across devices.
-- =============================================================================

create table if not exists public.message_drafts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  content text not null default '' check (char_length(content) <= 10000),
  updated_at timestamptz not null default now(),
  unique (user_id, conversation_id)
);

create index if not exists message_drafts_user_updated_idx
  on public.message_drafts (user_id, updated_at desc);

alter table public.message_drafts enable row level security;

drop policy if exists "Users can read own message drafts" on public.message_drafts;
create policy "Users can read own message drafts"
  on public.message_drafts
  for select
  to authenticated
  using (user_id = auth.uid());

drop policy if exists "Users can create own message drafts" on public.message_drafts;
create policy "Users can create own message drafts"
  on public.message_drafts
  for insert
  to authenticated
  with check (user_id = auth.uid());

drop policy if exists "Users can update own message drafts" on public.message_drafts;
create policy "Users can update own message drafts"
  on public.message_drafts
  for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "Users can delete own message drafts" on public.message_drafts;
create policy "Users can delete own message drafts"
  on public.message_drafts
  for delete
  to authenticated
  using (user_id = auth.uid());

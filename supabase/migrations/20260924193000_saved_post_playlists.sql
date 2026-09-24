-- Saved post playlists: every bookmark automatically belongs to the canonical
-- Saved playlist, while users can create additional private playlists.

create table if not exists public.saved_post_playlists (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  name text not null,
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  constraint saved_post_playlists_name_length_check
    check (char_length(btrim(name)) between 1 and 80),
  constraint saved_post_playlists_default_name_check
    check (not is_default or name = 'Saved'),
  constraint saved_post_playlists_reserved_default_name_check
    check (is_default or lower(btrim(name)) <> 'saved'),
  constraint saved_post_playlists_id_user_key unique (id, user_id)
);

create unique index if not exists saved_post_playlists_one_default_per_user_idx
  on public.saved_post_playlists (user_id)
  where is_default;

create unique index if not exists saved_post_playlists_unique_name_per_user_idx
  on public.saved_post_playlists (user_id, lower(btrim(name)));

create index if not exists saved_post_playlists_user_created_idx
  on public.saved_post_playlists (user_id, created_at);

create table if not exists public.saved_post_playlist_items (
  id uuid primary key default gen_random_uuid(),
  playlist_id uuid not null,
  user_id uuid not null,
  post_id uuid not null,
  created_at timestamptz not null default now(),
  constraint saved_post_playlist_items_playlist_post_key unique (playlist_id, post_id),
  constraint saved_post_playlist_items_playlist_user_fkey
    foreign key (playlist_id, user_id)
    references public.saved_post_playlists(id, user_id)
    on delete cascade,
  constraint saved_post_playlist_items_bookmark_fkey
    foreign key (user_id, post_id)
    references public.bookmarks(user_id, post_id)
    on delete cascade
);

create index if not exists saved_post_playlist_items_user_playlist_created_idx
  on public.saved_post_playlist_items (user_id, playlist_id, created_at desc);

create index if not exists saved_post_playlist_items_user_post_idx
  on public.saved_post_playlist_items (user_id, post_id);

alter table public.saved_post_playlists enable row level security;
alter table public.saved_post_playlist_items enable row level security;

revoke all on table public.saved_post_playlists from anon;
revoke all on table public.saved_post_playlist_items from anon;
grant select, insert, update, delete on table public.saved_post_playlists to authenticated;
grant select, insert, delete on table public.saved_post_playlist_items to authenticated;
grant all on table public.saved_post_playlists to service_role;
grant all on table public.saved_post_playlist_items to service_role;

drop policy if exists saved_post_playlists_select_own on public.saved_post_playlists;
create policy saved_post_playlists_select_own
  on public.saved_post_playlists
  for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists saved_post_playlists_insert_own on public.saved_post_playlists;
create policy saved_post_playlists_insert_own
  on public.saved_post_playlists
  for insert
  to authenticated
  with check (auth.uid() = user_id and is_default = false);

drop policy if exists saved_post_playlists_update_own_custom on public.saved_post_playlists;
create policy saved_post_playlists_update_own_custom
  on public.saved_post_playlists
  for update
  to authenticated
  using (auth.uid() = user_id and is_default = false)
  with check (auth.uid() = user_id and is_default = false);

drop policy if exists saved_post_playlists_delete_own_custom on public.saved_post_playlists;
create policy saved_post_playlists_delete_own_custom
  on public.saved_post_playlists
  for delete
  to authenticated
  using (auth.uid() = user_id and is_default = false);

drop policy if exists saved_post_playlist_items_select_own on public.saved_post_playlist_items;
create policy saved_post_playlist_items_select_own
  on public.saved_post_playlist_items
  for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists saved_post_playlist_items_insert_own on public.saved_post_playlist_items;
create policy saved_post_playlist_items_insert_own
  on public.saved_post_playlist_items
  for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists saved_post_playlist_items_delete_own on public.saved_post_playlist_items;
create policy saved_post_playlist_items_delete_own
  on public.saved_post_playlist_items
  for delete
  to authenticated
  using (auth.uid() = user_id);

create or replace function public.attach_bookmark_to_default_saved_playlist()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_playlist_id uuid;
begin
  select id
  into v_playlist_id
  from public.saved_post_playlists
  where user_id = new.user_id
    and is_default = true
  limit 1;

  if v_playlist_id is null then
    insert into public.saved_post_playlists (user_id, name, is_default)
    values (new.user_id, 'Saved', true)
    on conflict do nothing;

    select id
    into v_playlist_id
    from public.saved_post_playlists
    where user_id = new.user_id
      and is_default = true
    limit 1;
  end if;

  if v_playlist_id is not null then
    insert into public.saved_post_playlist_items (playlist_id, user_id, post_id, created_at)
    values (v_playlist_id, new.user_id, new.post_id, coalesce(new.created_at, now()))
    on conflict (playlist_id, post_id) do nothing;
  end if;

  return new;
end;
$$;

revoke execute on function public.attach_bookmark_to_default_saved_playlist() from public, anon, authenticated;

drop trigger if exists bookmarks_attach_default_saved_playlist on public.bookmarks;
create trigger bookmarks_attach_default_saved_playlist
after insert on public.bookmarks
for each row
execute function public.attach_bookmark_to_default_saved_playlist();

-- Backfill the canonical Saved playlist and membership for existing bookmarks.
insert into public.saved_post_playlists (user_id, name, is_default)
select distinct b.user_id, 'Saved', true
from public.bookmarks b
where not exists (
  select 1
  from public.saved_post_playlists p
  where p.user_id = b.user_id
    and p.is_default = true
);

insert into public.saved_post_playlist_items (playlist_id, user_id, post_id, created_at)
select p.id, b.user_id, b.post_id, coalesce(b.created_at, now())
from public.bookmarks b
join public.saved_post_playlists p
  on p.user_id = b.user_id
 and p.is_default = true
on conflict (playlist_id, post_id) do nothing;

-- Saved tab should reflect bookmark and playlist changes without a page reload.
-- FULL identity keeps user_id/post_id available for filtered DELETE events.
alter table public.bookmarks replica identity full;
alter table public.saved_post_playlists replica identity full;
alter table public.saved_post_playlist_items replica identity full;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'bookmarks'
  ) then
    alter publication supabase_realtime add table public.bookmarks;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'saved_post_playlists'
  ) then
    alter publication supabase_realtime add table public.saved_post_playlists;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'saved_post_playlist_items'
  ) then
    alter publication supabase_realtime add table public.saved_post_playlist_items;
  end if;
end;
$$;

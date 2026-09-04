-- Durable Alsamos AI memory + asynchronous media jobs.
-- This migration is deliberately additive so it is safe on projects where an
-- earlier experimental ai_memories table already exists.

create table if not exists public.ai_memories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  content text,
  kind text not null default 'fact',
  "key" text,
  "value" text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.ai_memories add column if not exists content text;
alter table public.ai_memories add column if not exists kind text not null default 'fact';
alter table public.ai_memories add column if not exists "key" text;
alter table public.ai_memories add column if not exists "value" text;
alter table public.ai_memories add column if not exists created_at timestamptz not null default now();
alter table public.ai_memories add column if not exists updated_at timestamptz not null default now();

-- Keep both the older agent key/value contract and the newer UI content/kind
-- contract alive during the rollout. Either side can write; the other side can
-- immediately read the same memory.
create or replace function public.sync_ai_memory_shapes()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if (new.content is null or btrim(new.content) = '') and new."value" is not null then
    new.content := concat_ws(': ', nullif(btrim(coalesce(new."key", '')), ''), btrim(new."value"));
  end if;

  if (new."value" is null or btrim(new."value") = '') and new.content is not null then
    new."value" := new.content;
  end if;

  if (new."key" is null or btrim(new."key") = '') and new.content is not null then
    new."key" := left(coalesce(nullif(new.kind, ''), 'memory') || '-' || md5(lower(btrim(new.content))), 80);
  end if;

  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists sync_ai_memory_shapes_trigger on public.ai_memories;
create trigger sync_ai_memory_shapes_trigger
before insert or update on public.ai_memories
for each row execute function public.sync_ai_memory_shapes();

update public.ai_memories
set
  content = coalesce(nullif(content, ''), concat_ws(': ', nullif("key", ''), nullif("value", ''))),
  "value" = coalesce(nullif("value", ''), content),
  "key" = coalesce(
    nullif("key", ''),
    left(coalesce(nullif(kind, ''), 'memory') || '-' || md5(lower(btrim(coalesce(content, "value", 'memory')))), 80)
  );

create index if not exists ai_memories_user_created_idx
  on public.ai_memories (user_id, created_at desc);
create unique index if not exists ai_memories_user_key_idx
  on public.ai_memories (user_id, "key")
  where "key" is not null;

alter table public.ai_memories enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'ai_memories' and policyname = 'Users can read own AI memories'
  ) then
    create policy "Users can read own AI memories"
      on public.ai_memories for select
      using (auth.uid() = user_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'ai_memories' and policyname = 'Users can create own AI memories'
  ) then
    create policy "Users can create own AI memories"
      on public.ai_memories for insert
      with check (auth.uid() = user_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'ai_memories' and policyname = 'Users can update own AI memories'
  ) then
    create policy "Users can update own AI memories"
      on public.ai_memories for update
      using (auth.uid() = user_id)
      with check (auth.uid() = user_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'ai_memories' and policyname = 'Users can delete own AI memories'
  ) then
    create policy "Users can delete own AI memories"
      on public.ai_memories for delete
      using (auth.uid() = user_id);
  end if;
end $$;

create table if not exists public.ai_media_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null default 'video',
  status text not null default 'queued',
  prompt text,
  params jsonb not null default '{}'::jsonb,
  output_url text,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ai_media_jobs_kind_check check (kind in ('image', 'video')),
  constraint ai_media_jobs_status_check check (status in ('queued', 'running', 'done', 'failed'))
);

create index if not exists ai_media_jobs_user_created_idx
  on public.ai_media_jobs (user_id, created_at desc);
create index if not exists ai_media_jobs_running_idx
  on public.ai_media_jobs (status, created_at)
  where status in ('queued', 'running');

alter table public.ai_media_jobs enable row level security;

do $$
begin
  -- The edge function writes with the service role. The browser only needs to
  -- read the authenticated user's own job while an async render finishes.
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'ai_media_jobs' and policyname = 'Users can read own AI media jobs'
  ) then
    create policy "Users can read own AI media jobs"
      on public.ai_media_jobs for select
      using (auth.uid() = user_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'ai_media_jobs' and policyname = 'Users can delete own AI media jobs'
  ) then
    create policy "Users can delete own AI media jobs"
      on public.ai_media_jobs for delete
      using (auth.uid() = user_id);
  end if;
end $$;

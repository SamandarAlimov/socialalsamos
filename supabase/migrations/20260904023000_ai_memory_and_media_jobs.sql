-- Durable Alsamos AI memory + asynchronous media jobs.
-- This migration is deliberately additive so it is safe on projects where an
-- earlier experimental ai_memories table already exists.

create table if not exists public.ai_memories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  content text,
  kind text not null default 'fact',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.ai_memories add column if not exists content text;
alter table public.ai_memories add column if not exists kind text not null default 'fact';
alter table public.ai_memories add column if not exists created_at timestamptz not null default now();
alter table public.ai_memories add column if not exists updated_at timestamptz not null default now();

-- Migrate legacy key/value memories when those columns are present.
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'ai_memories' and column_name = 'key'
  ) and exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'ai_memories' and column_name = 'value'
  ) then
    execute $sql$
      update public.ai_memories
      set content = coalesce(nullif(content, ''), concat_ws(': ', nullif("key", ''), nullif("value", '')))
      where content is null or content = ''
    $sql$;
  end if;
end $$;

create index if not exists ai_memories_user_created_idx
  on public.ai_memories (user_id, created_at desc);

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

-- Alsamos AI runtime drift repair.
--
-- The first AI project/media migrations may be recorded as applied while an
-- older production database is still missing one of the runtime objects. This
-- migration is deliberately idempotent and reasserts only the schema the live
-- AI workspace needs for Projects and real video generation.

create table if not exists public.ai_projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  instructions text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists ai_projects_user_updated_idx
  on public.ai_projects (user_id, updated_at desc);

alter table public.ai_projects enable row level security;

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
  updated_at timestamptz not null default now()
);

-- If an experimental table existed, make sure every column required by
-- _shared/aiTools.ts / geminiMedia.ts exists.
alter table public.ai_media_jobs add column if not exists kind text not null default 'video';
alter table public.ai_media_jobs add column if not exists status text not null default 'queued';
alter table public.ai_media_jobs add column if not exists prompt text;
alter table public.ai_media_jobs add column if not exists params jsonb not null default '{}'::jsonb;
alter table public.ai_media_jobs add column if not exists output_url text;
alter table public.ai_media_jobs add column if not exists error text;
alter table public.ai_media_jobs add column if not exists created_at timestamptz not null default now();
alter table public.ai_media_jobs add column if not exists updated_at timestamptz not null default now();

create index if not exists ai_media_jobs_user_created_idx
  on public.ai_media_jobs (user_id, created_at desc);
create index if not exists ai_media_jobs_running_idx
  on public.ai_media_jobs (status, created_at)
  where status in ('queued', 'running');

alter table public.ai_media_jobs enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'ai_projects'
      and policyname = 'Users can read own AI projects'
  ) then
    create policy "Users can read own AI projects"
      on public.ai_projects for select using (auth.uid() = user_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'ai_projects'
      and policyname = 'Users can create own AI projects'
  ) then
    create policy "Users can create own AI projects"
      on public.ai_projects for insert with check (auth.uid() = user_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'ai_projects'
      and policyname = 'Users can update own AI projects'
  ) then
    create policy "Users can update own AI projects"
      on public.ai_projects for update
      using (auth.uid() = user_id)
      with check (auth.uid() = user_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'ai_projects'
      and policyname = 'Users can delete own AI projects'
  ) then
    create policy "Users can delete own AI projects"
      on public.ai_projects for delete using (auth.uid() = user_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'ai_media_jobs'
      and policyname = 'Users can read own AI media jobs'
  ) then
    create policy "Users can read own AI media jobs"
      on public.ai_media_jobs for select using (auth.uid() = user_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'ai_media_jobs'
      and policyname = 'Users can delete own AI media jobs'
  ) then
    create policy "Users can delete own AI media jobs"
      on public.ai_media_jobs for delete using (auth.uid() = user_id);
  end if;
end $$;

do $$
begin
  if to_regclass('public.ai_conversations') is not null then
    alter table public.ai_conversations
      add column if not exists project_id uuid references public.ai_projects(id) on delete set null;
    create index if not exists ai_conversations_project_idx
      on public.ai_conversations (project_id, updated_at desc);
  end if;
end $$;

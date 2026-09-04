-- Persistent Alsamos AI projects: a real project is no longer just a pinned chat.
-- Projects own instructions and group multiple conversations so the agent can
-- carry project context across chats.

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

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'ai_projects' and policyname = 'Users can read own AI projects'
  ) then
    create policy "Users can read own AI projects"
      on public.ai_projects for select
      using (auth.uid() = user_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'ai_projects' and policyname = 'Users can create own AI projects'
  ) then
    create policy "Users can create own AI projects"
      on public.ai_projects for insert
      with check (auth.uid() = user_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'ai_projects' and policyname = 'Users can update own AI projects'
  ) then
    create policy "Users can update own AI projects"
      on public.ai_projects for update
      using (auth.uid() = user_id)
      with check (auth.uid() = user_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'ai_projects' and policyname = 'Users can delete own AI projects'
  ) then
    create policy "Users can delete own AI projects"
      on public.ai_projects for delete
      using (auth.uid() = user_id);
  end if;
end $$;

alter table if exists public.ai_conversations
  add column if not exists project_id uuid references public.ai_projects(id) on delete set null;

create index if not exists ai_conversations_project_idx
  on public.ai_conversations (project_id, updated_at desc);

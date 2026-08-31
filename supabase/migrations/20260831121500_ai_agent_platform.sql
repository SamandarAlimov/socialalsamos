-- Alsamos AI agent platformasi: konnektorlar (MCP pluginlar), qurilmalar,
-- kompyuter boshqaruv vazifalari, uzoq muddatli xotira va media navbati.
-- Barcha jadvallar RLS bilan yopilgan: har bir foydalanuvchi faqat o'z yozuvlarini ko'radi.

-- ============================================================ ai_connectors
create table if not exists public.ai_connectors (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  kind text not null default 'mcp' check (kind in ('mcp', 'http')),
  base_url text not null,
  auth_type text check (auth_type in ('none', 'bearer', 'header')),
  auth_token text,
  description text,
  enabled boolean not null default true,
  last_ok_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, name)
);

create index if not exists ai_connectors_user_idx on public.ai_connectors (user_id, enabled);

alter table public.ai_connectors enable row level security;

drop policy if exists "ai_connectors_select_own" on public.ai_connectors;
create policy "ai_connectors_select_own" on public.ai_connectors
  for select using (auth.uid() = user_id);

drop policy if exists "ai_connectors_insert_own" on public.ai_connectors;
create policy "ai_connectors_insert_own" on public.ai_connectors
  for insert with check (auth.uid() = user_id);

drop policy if exists "ai_connectors_update_own" on public.ai_connectors;
create policy "ai_connectors_update_own" on public.ai_connectors
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "ai_connectors_delete_own" on public.ai_connectors;
create policy "ai_connectors_delete_own" on public.ai_connectors
  for delete using (auth.uid() = user_id);

-- =============================================================== ai_devices
-- "Alsamos Bridge" lokal agenti ro'yxatdan o'tadigan qurilmalar.
create table if not exists public.ai_devices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  platform text,
  agent_version text,
  capabilities jsonb not null default '[]'::jsonb,
  paired_at timestamptz not null default now(),
  last_seen_at timestamptz,
  revoked boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists ai_devices_user_idx on public.ai_devices (user_id, revoked);

alter table public.ai_devices enable row level security;

drop policy if exists "ai_devices_all_own" on public.ai_devices;
create policy "ai_devices_all_own" on public.ai_devices
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ======================================================= ai_computer_tasks
-- Har bir vazifa foydalanuvchi qurilmada tasdiqlamaguncha bajarilmaydi.
create table if not exists public.ai_computer_tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  device_id uuid references public.ai_devices(id) on delete set null,
  conversation_id uuid,
  action text not null check (
    action in (
      'shell', 'read_file', 'write_file', 'list_dir',
      'open', 'screenshot', 'click', 'type_text', 'key'
    )
  ),
  payload jsonb not null default '{}'::jsonb,
  reason text not null,
  status text not null default 'pending_approval' check (
    status in ('pending_approval', 'approved', 'running', 'done', 'failed', 'rejected', 'expired')
  ),
  result jsonb,
  error text,
  approved_at timestamptz,
  started_at timestamptz,
  finished_at timestamptz,
  expires_at timestamptz not null default (now() + interval '15 minutes'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists ai_computer_tasks_user_idx
  on public.ai_computer_tasks (user_id, status, created_at desc);
create index if not exists ai_computer_tasks_device_idx
  on public.ai_computer_tasks (device_id, status);

alter table public.ai_computer_tasks enable row level security;

drop policy if exists "ai_computer_tasks_select_own" on public.ai_computer_tasks;
create policy "ai_computer_tasks_select_own" on public.ai_computer_tasks
  for select using (auth.uid() = user_id);

-- Foydalanuvchi faqat tasdiqlash / rad etish uchun yozadi; yaratish server tomonida.
drop policy if exists "ai_computer_tasks_update_own" on public.ai_computer_tasks;
create policy "ai_computer_tasks_update_own" on public.ai_computer_tasks
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "ai_computer_tasks_delete_own" on public.ai_computer_tasks;
create policy "ai_computer_tasks_delete_own" on public.ai_computer_tasks
  for delete using (auth.uid() = user_id);

-- ============================================================== ai_memories
create table if not exists public.ai_memories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  key text not null,
  value text not null,
  source text default 'assistant',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, key)
);

create index if not exists ai_memories_user_idx on public.ai_memories (user_id, updated_at desc);

alter table public.ai_memories enable row level security;

drop policy if exists "ai_memories_all_own" on public.ai_memories;
create policy "ai_memories_all_own" on public.ai_memories
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ============================================================ ai_media_jobs
create table if not exists public.ai_media_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  conversation_id uuid,
  kind text not null check (kind in ('video', 'image', 'audio')),
  status text not null default 'queued' check (
    status in ('queued', 'running', 'done', 'failed', 'canceled')
  ),
  prompt text not null,
  params jsonb not null default '{}'::jsonb,
  output_url text,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists ai_media_jobs_user_idx
  on public.ai_media_jobs (user_id, status, created_at desc);

alter table public.ai_media_jobs enable row level security;

drop policy if exists "ai_media_jobs_select_own" on public.ai_media_jobs;
create policy "ai_media_jobs_select_own" on public.ai_media_jobs
  for select using (auth.uid() = user_id);

drop policy if exists "ai_media_jobs_update_own" on public.ai_media_jobs;
create policy "ai_media_jobs_update_own" on public.ai_media_jobs
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "ai_media_jobs_delete_own" on public.ai_media_jobs;
create policy "ai_media_jobs_delete_own" on public.ai_media_jobs
  for delete using (auth.uid() = user_id);

-- ================================================================ triggers
create or replace function public.ai_touch_updated_at()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists ai_connectors_touch on public.ai_connectors;
create trigger ai_connectors_touch before update on public.ai_connectors
  for each row execute function public.ai_touch_updated_at();

drop trigger if exists ai_computer_tasks_touch on public.ai_computer_tasks;
create trigger ai_computer_tasks_touch before update on public.ai_computer_tasks
  for each row execute function public.ai_touch_updated_at();

drop trigger if exists ai_memories_touch on public.ai_memories;
create trigger ai_memories_touch before update on public.ai_memories
  for each row execute function public.ai_touch_updated_at();

drop trigger if exists ai_media_jobs_touch on public.ai_media_jobs;
create trigger ai_media_jobs_touch before update on public.ai_media_jobs
  for each row execute function public.ai_touch_updated_at();

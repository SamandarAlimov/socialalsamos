-- GitHub konnektori: foydalanuvchining shaxsiy access token'i (PAT yoki OAuth bearer).
-- Token faqat egasiga ko'rinadi (RLS) va edge funksiyada service role orqali ishlatiladi.

create table if not exists public.ai_github_connections (
  user_id uuid primary key references auth.users (id) on delete cascade,
  token text not null,
  login text,
  scopes text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.ai_github_connections enable row level security;

drop policy if exists "github_conn_select_own" on public.ai_github_connections;
create policy "github_conn_select_own"
  on public.ai_github_connections for select
  using (auth.uid() = user_id);

drop policy if exists "github_conn_insert_own" on public.ai_github_connections;
create policy "github_conn_insert_own"
  on public.ai_github_connections for insert
  with check (auth.uid() = user_id);

drop policy if exists "github_conn_update_own" on public.ai_github_connections;
create policy "github_conn_update_own"
  on public.ai_github_connections for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "github_conn_delete_own" on public.ai_github_connections;
create policy "github_conn_delete_own"
  on public.ai_github_connections for delete
  using (auth.uid() = user_id);

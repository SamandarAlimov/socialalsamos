-- User-owned Activity / digital-wellbeing preferences.
-- Replaces the old hard-coded 120 minute demo goal with a real persisted setting.

create table if not exists public.user_activity_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  daily_limit_minutes integer not null default 120
    check (daily_limit_minutes between 15 and 1440),
  reminder_enabled boolean not null default true,
  reminder_threshold_percent integer not null default 80
    check (reminder_threshold_percent between 25 and 100),
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

alter table public.user_activity_preferences enable row level security;

revoke all on table public.user_activity_preferences from anon;
grant select, insert, update, delete on table public.user_activity_preferences to authenticated;

drop policy if exists activity_preferences_select_own on public.user_activity_preferences;
create policy activity_preferences_select_own
on public.user_activity_preferences
for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists activity_preferences_insert_own on public.user_activity_preferences;
create policy activity_preferences_insert_own
on public.user_activity_preferences
for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists activity_preferences_update_own on public.user_activity_preferences;
create policy activity_preferences_update_own
on public.user_activity_preferences
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists activity_preferences_delete_own on public.user_activity_preferences;
create policy activity_preferences_delete_own
on public.user_activity_preferences
for delete
to authenticated
using (auth.uid() = user_id);

create or replace function public.ensure_my_activity_preferences()
returns public.user_activity_preferences
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_row public.user_activity_preferences;
begin
  if v_user_id is null then
    raise exception 'auth_required';
  end if;

  insert into public.user_activity_preferences (user_id)
  values (v_user_id)
  on conflict (user_id) do nothing;

  select * into v_row
  from public.user_activity_preferences
  where user_id = v_user_id;

  return v_row;
end;
$$;

create or replace function public.update_my_activity_preferences(
  p_daily_limit_minutes integer default null,
  p_reminder_enabled boolean default null,
  p_reminder_threshold_percent integer default null
)
returns public.user_activity_preferences
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_row public.user_activity_preferences;
begin
  if v_user_id is null then
    raise exception 'auth_required';
  end if;

  if p_daily_limit_minutes is not null and (p_daily_limit_minutes < 15 or p_daily_limit_minutes > 1440) then
    raise exception 'invalid_daily_limit';
  end if;

  if p_reminder_threshold_percent is not null and (p_reminder_threshold_percent < 25 or p_reminder_threshold_percent > 100) then
    raise exception 'invalid_reminder_threshold';
  end if;

  insert into public.user_activity_preferences (
    user_id,
    daily_limit_minutes,
    reminder_enabled,
    reminder_threshold_percent
  ) values (
    v_user_id,
    coalesce(p_daily_limit_minutes, 120),
    coalesce(p_reminder_enabled, true),
    coalesce(p_reminder_threshold_percent, 80)
  )
  on conflict (user_id) do update
  set
    daily_limit_minutes = coalesce(p_daily_limit_minutes, user_activity_preferences.daily_limit_minutes),
    reminder_enabled = coalesce(p_reminder_enabled, user_activity_preferences.reminder_enabled),
    reminder_threshold_percent = coalesce(p_reminder_threshold_percent, user_activity_preferences.reminder_threshold_percent),
    updated_at = now()
  returning * into v_row;

  return v_row;
end;
$$;

grant execute on function public.ensure_my_activity_preferences() to authenticated;
grant execute on function public.update_my_activity_preferences(integer, boolean, integer) to authenticated;
revoke execute on function public.ensure_my_activity_preferences() from anon;
revoke execute on function public.update_my_activity_preferences(integer, boolean, integer) from anon;

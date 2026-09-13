grant update (username, display_name, avatar_url, cover_url, bio, location, website, is_online, last_seen, preferences, country, birth_date, signatures, email_filters, notification_preferences, last_seen_at) on table public.profiles to authenticated;

insert into public.user_settings (user_id)
select u.id
from auth.users u
on conflict (user_id) do nothing;

drop policy if exists "Users can update their own story views" on public.story_views;
create policy "Users can update their own story views"
on public.story_views
for update
to authenticated
using (viewer_id = auth.uid())
with check (viewer_id = auth.uid());

drop policy if exists "Story owners can view story viewers" on public.story_views;
create policy "Story owners can view story viewers"
on public.story_views
for select
to authenticated
using (
  viewer_id = auth.uid()
  or exists (
    select 1
    from public.stories s
    where s.id = story_views.story_id
      and s.user_id = auth.uid()
  )
);

create or replace function public.finalize_primary_signup(
  p_user_id uuid,
  p_email text,
  p_username text,
  p_display_name text,
  p_phone text,
  p_tos_version text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_preflight jsonb;
  v_identity_id uuid;
  v_profile_ok boolean;
  v_identity_ok boolean;
  v_account_ok boolean;
  v_wallet_ok boolean;
  v_settings_ok boolean;
  v_sqlstate text;
  v_constraint text;
  v_error text;
begin
  if not exists (
    select 1 from auth.users u
    where u.id = p_user_id
      and lower(coalesce(u.email, '')) = lower(btrim(coalesce(p_email, '')))
  ) then
    return jsonb_build_object('ok', false, 'code', 'AUTH_USER_MISSING');
  end if;

  v_preflight := public.signup_preflight(p_email, p_username, p_phone, p_user_id);
  if not coalesce((v_preflight->>'ok')::boolean, false) then
    return v_preflight;
  end if;

  begin
    insert into public.profiles (id, username, display_name)
    values (
      p_user_id,
      lower(btrim(p_username)),
      left(coalesce(nullif(btrim(p_display_name), ''), lower(btrim(p_username))), 100)
    )
    on conflict (id) do update
      set username = excluded.username,
          display_name = excluded.display_name;

    insert into public.auth_identities (
      alsamos_email,
      phone,
      primary_user_id,
      migration_status,
      tos_version,
      tos_accepted_at
    )
    values (
      lower(btrim(p_email)),
      btrim(p_phone),
      p_user_id,
      'migrated',
      nullif(btrim(p_tos_version), ''),
      case when nullif(btrim(p_tos_version), '') is null then null else now() end
    )
    on conflict (primary_user_id) do update
      set alsamos_email = excluded.alsamos_email,
          phone = excluded.phone,
          migration_status = 'migrated',
          tos_version = excluded.tos_version,
          tos_accepted_at = coalesce(public.auth_identities.tos_accepted_at, excluded.tos_accepted_at),
          updated_at = now()
    returning id into v_identity_id;

    insert into public.identity_accounts (
      identity_id,
      user_id,
      slot_no,
      login_email,
      is_primary,
      status,
      deleted_at
    )
    values (
      v_identity_id,
      p_user_id,
      1,
      lower(btrim(p_email)),
      true,
      'active',
      null
    )
    on conflict (user_id) do update
      set identity_id = excluded.identity_id,
          slot_no = 1,
          login_email = excluded.login_email,
          is_primary = true,
          status = 'active',
          deleted_at = null,
          updated_at = now();

    insert into public.wallets (user_id, balance)
    values (p_user_id, 0)
    on conflict (user_id) do nothing;

    insert into public.user_settings (user_id)
    values (p_user_id)
    on conflict (user_id) do nothing;

  exception when others then
    get stacked diagnostics
      v_sqlstate = returned_sqlstate,
      v_constraint = constraint_name,
      v_error = message_text;

    v_preflight := public.signup_preflight(p_email, p_username, p_phone, p_user_id);
    if not coalesce((v_preflight->>'ok')::boolean, false) then
      return v_preflight || jsonb_build_object('sqlstate', v_sqlstate, 'constraint', nullif(v_constraint, ''));
    end if;

    if coalesce(v_error, '') like 'username_reserved:%' then
      return jsonb_build_object(
        'ok', false,
        'code', 'USERNAME_UNAVAILABLE',
        'reason', 'reserved',
        'sqlstate', v_sqlstate,
        'constraint', nullif(v_constraint, '')
      );
    end if;

    return jsonb_build_object(
      'ok', false,
      'code', 'FINALIZE_FAILED',
      'sqlstate', v_sqlstate,
      'constraint', nullif(v_constraint, '')
    );
  end;

  select exists(select 1 from public.profiles p where p.id = p_user_id) into v_profile_ok;
  select exists(select 1 from public.auth_identities ai where ai.primary_user_id = p_user_id) into v_identity_ok;
  select exists(select 1 from public.identity_accounts ia where ia.user_id = p_user_id and ia.status <> 'deleted') into v_account_ok;
  select exists(select 1 from public.wallets w where w.user_id = p_user_id) into v_wallet_ok;
  select exists(select 1 from public.user_settings us where us.user_id = p_user_id) into v_settings_ok;

  if not (v_profile_ok and v_identity_ok and v_account_ok and v_wallet_ok and v_settings_ok) then
    return jsonb_build_object(
      'ok', false,
      'code', 'INCOMPLETE_BOOTSTRAP',
      'state', jsonb_build_object(
        'profile_ok', v_profile_ok,
        'identity_ok', v_identity_ok,
        'account_ok', v_account_ok,
        'wallet_ok', v_wallet_ok,
        'settings_ok', v_settings_ok
      )
    );
  end if;

  return jsonb_build_object(
    'ok', true,
    'code', 'OK',
    'state', jsonb_build_object(
      'profile_ok', true,
      'identity_ok', true,
      'account_ok', true,
      'wallet_ok', true,
      'settings_ok', true
    )
  );
end;
$$;

revoke all on function public.finalize_primary_signup(uuid,text,text,text,text,text) from public, anon, authenticated;
grant execute on function public.finalize_primary_signup(uuid,text,text,text,text,text) to service_role;

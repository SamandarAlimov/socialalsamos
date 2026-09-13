-- Make primary signup independent from fragile auth.users bootstrap triggers.
-- account-signup marks managed Auth users, then finalizes profile/identity/account/wallet
-- atomically through service-role-only RPCs. Existing non-managed Auth flows keep
-- the legacy trigger behavior.

create or replace function public.signup_preflight(
  p_email text,
  p_username text,
  p_phone text,
  p_user_id uuid default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_username text := lower(btrim(coalesce(p_username, '')));
  v_phone text := btrim(coalesce(p_phone, ''));
  v_username_check jsonb;
begin
  if v_email = '' or v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' or v_email like '%@accounts.alsamos.com' then
    return jsonb_build_object('ok', false, 'code', 'INVALID_EMAIL');
  end if;

  if v_phone = '' or v_phone !~ '^\+[1-9][0-9]{7,14}$' then
    return jsonb_build_object('ok', false, 'code', 'INVALID_PHONE');
  end if;

  v_username_check := public.check_username_availability(v_username, p_user_id);
  if not coalesce((v_username_check->>'available')::boolean, false) then
    return jsonb_build_object(
      'ok', false,
      'code', 'USERNAME_UNAVAILABLE',
      'reason', coalesce(v_username_check->>'reason', 'unavailable')
    );
  end if;

  if exists (
    select 1 from auth.users u
    where lower(coalesce(u.email, '')) = v_email
      and (p_user_id is null or u.id <> p_user_id)
  ) or exists (
    select 1 from public.auth_identities ai
    where lower(coalesce(ai.alsamos_email, '')) = v_email
      and (p_user_id is null or ai.primary_user_id <> p_user_id)
  ) then
    return jsonb_build_object('ok', false, 'code', 'EMAIL_TAKEN');
  end if;

  if exists (
    select 1 from public.auth_identities ai
    where ai.phone = v_phone
      and (p_user_id is null or ai.primary_user_id <> p_user_id)
  ) or exists (
    select 1 from auth.users u
    where u.phone = v_phone
      and (p_user_id is null or u.id <> p_user_id)
  ) then
    return jsonb_build_object('ok', false, 'code', 'PHONE_TAKEN');
  end if;

  return jsonb_build_object('ok', true, 'code', 'OK');
end;
$$;

revoke all on function public.signup_preflight(text,text,text,uuid) from public, anon, authenticated;
grant execute on function public.signup_preflight(text,text,text,uuid) to service_role;

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

  if not (v_profile_ok and v_identity_ok and v_account_ok and v_wallet_ok) then
    return jsonb_build_object(
      'ok', false,
      'code', 'INCOMPLETE_BOOTSTRAP',
      'state', jsonb_build_object(
        'profile_ok', v_profile_ok,
        'identity_ok', v_identity_ok,
        'account_ok', v_account_ok,
        'wallet_ok', v_wallet_ok
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
      'wallet_ok', true
    )
  );
end;
$$;

revoke all on function public.finalize_primary_signup(uuid,text,text,text,text,text) from public, anon, authenticated;
grant execute on function public.finalize_primary_signup(uuid,text,text,text,text,text) to service_role;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  v_username text := lower(coalesce(nullif(btrim(new.raw_user_meta_data ->> 'username'), ''), split_part(new.email, '@', 1)));
  v_display_name text := coalesce(nullif(btrim(new.raw_user_meta_data ->> 'display_name'), ''), v_username);
begin
  if coalesce(new.raw_user_meta_data ->> 'signup_managed', '') = 'account-signup-v2' then
    return new;
  end if;

  insert into public.profiles (id, username, display_name, avatar_url)
  values (new.id, v_username, v_display_name, new.raw_user_meta_data ->> 'avatar_url')
  on conflict do nothing;
  return new;
end;
$$;

create or replace function public.handle_new_identity()
returns trigger
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  v_email text := lower(coalesce(new.email, ''));
  v_identity_id uuid;
  v_slot smallint;
  v_primary_email text;
  v_phone text := nullif(trim(new.raw_user_meta_data ->> 'phone'), '');
begin
  if coalesce(new.raw_user_meta_data ->> 'signup_managed', '') = 'account-signup-v2' then
    return new;
  end if;

  if v_phone is not null and v_phone !~ '^\+[1-9][0-9]{7,14}$' then
    v_phone := null;
  end if;

  begin
    v_identity_id := nullif(new.raw_user_meta_data ->> 'identity_id', '')::uuid;
  exception when invalid_text_representation then
    v_identity_id := null;
  end;

  if v_identity_id is not null then
    if not exists (select 1 from public.auth_identities ai where ai.id = v_identity_id) then
      return new;
    end if;

    begin
      v_slot := nullif(new.raw_user_meta_data ->> 'slot_no', '')::smallint;
    exception when invalid_text_representation or numeric_value_out_of_range then
      v_slot := null;
    end;

    if v_slot is null then
      select min(s.n)::smallint into v_slot
      from generate_series(1, 10) as s(n)
      where not exists (
        select 1 from public.identity_accounts ia
        where ia.identity_id = v_identity_id
          and ia.slot_no = s.n
          and ia.status <> 'deleted'
      );
    end if;

    if v_slot is null or v_slot < 1 or v_slot > 10 then
      return new;
    end if;

    insert into public.identity_accounts (identity_id, user_id, slot_no, login_email, is_primary)
    values (v_identity_id, new.id, v_slot, v_email, false)
    on conflict do nothing;
    return new;
  end if;

  v_primary_email := case
    when v_email <> '' and v_email not like '%@accounts.alsamos.com' then v_email
    else null
  end;

  insert into public.auth_identities (
    alsamos_email,
    phone,
    primary_user_id,
    migration_status,
    tos_version,
    tos_accepted_at
  )
  values (
    v_primary_email,
    v_phone,
    new.id,
    case when v_primary_email is null then 'legacy' else 'migrated' end,
    nullif(new.raw_user_meta_data ->> 'tos_version', ''),
    case when nullif(new.raw_user_meta_data ->> 'tos_version', '') is null then null else now() end
  )
  on conflict do nothing
  returning id into v_identity_id;

  if v_identity_id is null then
    select ai.id into v_identity_id
    from public.auth_identities ai
    where ai.primary_user_id = new.id;
  end if;

  if v_identity_id is null then
    return new;
  end if;

  insert into public.identity_accounts (identity_id, user_id, slot_no, login_email, is_primary)
  values (v_identity_id, new.id, 1, v_email, true)
  on conflict do nothing;

  return new;
end;
$$;

create or replace function public.bootstrap_alsamos_wallet()
returns trigger
language plpgsql
security definer
set search_path = 'public'
as $$
begin
  if coalesce(new.raw_user_meta_data ->> 'signup_managed', '') = 'account-signup-v2' then
    return new;
  end if;

  if exists (select 1 from public.profiles p where p.id = new.id) then
    insert into public.wallets (user_id, balance)
    values (new.id, 0)
    on conflict do nothing;
  end if;
  return new;
end;
$$;

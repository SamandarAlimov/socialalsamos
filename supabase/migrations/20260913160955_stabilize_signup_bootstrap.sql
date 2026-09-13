create or replace function public.signup_conflict_code(p_email text, p_username text, p_phone text)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_username text := lower(btrim(coalesce(p_username, '')));
  v_phone text := btrim(coalesce(p_phone, ''));
begin
  if v_email <> '' and (
    exists (select 1 from auth.users u where lower(coalesce(u.email, '')) = v_email)
    or exists (select 1 from public.auth_identities ai where lower(coalesce(ai.alsamos_email, '')) = v_email)
  ) then
    return 'EMAIL_TAKEN';
  end if;

  if v_username <> '' and exists (
    select 1 from public.profiles p where lower(coalesce(p.username, '')) = v_username
  ) then
    return 'USERNAME_TAKEN';
  end if;

  if v_phone <> '' and (
    exists (select 1 from public.auth_identities ai where ai.phone = v_phone)
    or exists (select 1 from auth.users u where u.phone = v_phone)
  ) then
    return 'PHONE_TAKEN';
  end if;

  return null;
end;
$$;

revoke all on function public.signup_conflict_code(text, text, text) from public, anon, authenticated;
grant execute on function public.signup_conflict_code(text, text, text) to service_role;

create or replace function public.signup_bootstrap_state(p_user_id uuid)
returns table(profile_ok boolean, identity_ok boolean, account_ok boolean, wallet_ok boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select
    exists(select 1 from public.profiles p where p.id = p_user_id),
    exists(select 1 from public.auth_identities ai where ai.primary_user_id = p_user_id),
    exists(select 1 from public.identity_accounts ia where ia.user_id = p_user_id and ia.status <> 'deleted'),
    exists(select 1 from public.wallets w where w.user_id = p_user_id);
$$;

revoke all on function public.signup_bootstrap_state(uuid) from public, anon, authenticated;
grant execute on function public.signup_bootstrap_state(uuid) to service_role;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_username text := lower(coalesce(nullif(btrim(new.raw_user_meta_data ->> 'username'), ''), split_part(new.email, '@', 1)));
  v_display_name text := coalesce(nullif(btrim(new.raw_user_meta_data ->> 'display_name'), ''), v_username);
begin
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
set search_path = public
as $$
declare
  v_email text := lower(coalesce(new.email, ''));
  v_identity_id uuid;
  v_slot smallint;
  v_primary_email text;
  v_phone text := nullif(trim(new.raw_user_meta_data ->> 'phone'), '');
begin
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
set search_path = public
as $$
begin
  if exists (select 1 from public.profiles p where p.id = new.id) then
    insert into public.wallets (user_id, balance)
    values (new.id, 0)
    on conflict do nothing;
  end if;
  return new;
end;
$$;

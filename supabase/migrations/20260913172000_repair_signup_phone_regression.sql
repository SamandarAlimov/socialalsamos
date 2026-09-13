-- Repair the signup regression introduced by writing an unverified phone into
-- Supabase Auth during admin.createUser(). Phone login/OTP is not enabled yet,
-- so the application keeps the normalized phone in public.auth_identities and
-- user metadata until a real OTP flow can verify it.

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

  v_identity_id := nullif(new.raw_user_meta_data ->> 'identity_id', '')::uuid;

  if v_identity_id is not null then
    v_slot := nullif(new.raw_user_meta_data ->> 'slot_no', '')::smallint;
    if v_slot is null then
      select coalesce(min(s.n), 1) into v_slot
      from generate_series(1, 10) as s(n)
      where not exists (
        select 1 from public.identity_accounts ia
        where ia.identity_id = v_identity_id
          and ia.slot_no = s.n
          and ia.status <> 'deleted'
      );
    end if;

    insert into public.identity_accounts (identity_id, user_id, slot_no, login_email, is_primary)
    values (v_identity_id, new.id, v_slot, v_email, false)
    on conflict (user_id) do nothing;
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
  on conflict (primary_user_id) do nothing
  returning id into v_identity_id;

  if v_identity_id is null then
    select id into v_identity_id
    from public.auth_identities
    where primary_user_id = new.id;
  end if;

  insert into public.identity_accounts (identity_id, user_id, slot_no, login_email, is_primary)
  values (v_identity_id, new.id, 1, v_email, true)
  on conflict (user_id) do nothing;

  return new;
end;
$$;

-- Backfill the application identity phone from metadata where it is safe to do
-- so. This does not mark any phone as verified and does not create a phone Auth
-- identity.
update public.auth_identities ai
set phone = nullif(trim(u.raw_user_meta_data ->> 'phone'), '')
from auth.users u
where ai.primary_user_id = u.id
  and ai.phone is null
  and nullif(trim(u.raw_user_meta_data ->> 'phone'), '') ~ '^\+[1-9][0-9]{7,14}$'
  and not exists (
    select 1
    from public.auth_identities other
    where other.id <> ai.id
      and other.phone = nullif(trim(u.raw_user_meta_data ->> 'phone'), '')
  );

-- Remove the emergency trigger that mutates auth.users.phone after insert. It
-- bypasses the normal Auth phone lifecycle and is unnecessary once
-- handle_new_identity persists the phone in the application identity row.
drop trigger if exists zz_sync_identity_phone_trg on auth.users;
drop function if exists public.sync_identity_phone();

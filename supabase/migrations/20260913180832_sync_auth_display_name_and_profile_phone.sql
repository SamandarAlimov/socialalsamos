create or replace function public.sync_profile_display_name_to_auth()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_display_name text := nullif(btrim(new.display_name), '');
begin
  update auth.users u
  set raw_user_meta_data = case
        when v_display_name is null then coalesce(u.raw_user_meta_data, '{}'::jsonb) - 'display_name'
        else coalesce(u.raw_user_meta_data, '{}'::jsonb) || jsonb_build_object('display_name', v_display_name)
      end,
      updated_at = now()
  where u.id = new.id
    and coalesce(u.raw_user_meta_data ->> 'display_name', '') is distinct from coalesce(v_display_name, '');

  return new;
end;
$$;

drop trigger if exists sync_profile_display_name_to_auth_trg on public.profiles;
create trigger sync_profile_display_name_to_auth_trg
after insert or update of display_name on public.profiles
for each row execute function public.sync_profile_display_name_to_auth();

-- Backfill existing users so the Supabase Auth dashboard display name matches profiles.
update auth.users u
set raw_user_meta_data = coalesce(u.raw_user_meta_data, '{}'::jsonb)
    || jsonb_build_object('display_name', nullif(btrim(p.display_name), '')),
    updated_at = now()
from public.profiles p
where p.id = u.id
  and nullif(btrim(p.display_name), '') is not null
  and coalesce(u.raw_user_meta_data ->> 'display_name', '') is distinct from btrim(p.display_name);

create or replace function public.get_my_identity_phone()
returns table(phone text, phone_verified_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select ai.phone, ai.phone_verified_at
  from public.auth_identities ai
  join public.identity_accounts ia on ia.identity_id = ai.id
  where ia.user_id = auth.uid()
    and ia.status <> 'deleted'
  order by ia.is_primary desc, ia.slot_no asc
  limit 1;
$$;

create or replace function public.update_my_identity_phone(p_phone text)
returns table(phone text, phone_verified_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_identity_id uuid;
  v_phone text;
  v_verified_at timestamptz;
begin
  if v_user_id is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;

  if p_phone is null or btrim(p_phone) = '' then
    v_phone := null;
  else
    v_phone := public.normalize_phone(p_phone);
    if v_phone is null then
      raise exception 'invalid_phone' using errcode = '22023';
    end if;
  end if;

  select ia.identity_id
    into v_identity_id
  from public.identity_accounts ia
  where ia.user_id = v_user_id
    and ia.status <> 'deleted'
  order by ia.is_primary desc, ia.slot_no asc
  limit 1;

  if v_identity_id is null then
    raise exception 'identity_not_found' using errcode = 'P0002';
  end if;

  begin
    update public.auth_identities ai
    set phone = v_phone,
        phone_verified_at = case
          when ai.phone is distinct from v_phone then null
          else ai.phone_verified_at
        end,
        updated_at = case
          when ai.phone is distinct from v_phone then now()
          else ai.updated_at
        end
    where ai.id = v_identity_id
    returning ai.phone, ai.phone_verified_at
      into v_phone, v_verified_at;
  exception
    when unique_violation then
      raise exception 'phone_taken' using errcode = '23505';
  end;

  return query select v_phone, v_verified_at;
end;
$$;

revoke all on function public.get_my_identity_phone() from public, anon;
revoke all on function public.update_my_identity_phone(text) from public, anon;
grant execute on function public.get_my_identity_phone() to authenticated;
grant execute on function public.update_my_identity_phone(text) to authenticated;

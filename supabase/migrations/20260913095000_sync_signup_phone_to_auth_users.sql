-- Keep the canonical Supabase Auth phone column in sync with the phone
-- collected by the account-signup flow. Older account-signup deployments
-- stored the phone in raw_user_meta_data, which left auth.users.phone null.
--
-- We intentionally do not mark the phone as confirmed here. Verification must
-- remain false until a real SMS/OTP verification flow confirms the number.

create or replace function public.sync_identity_phone()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_phone text;
begin
  v_phone := nullif(trim(new.raw_user_meta_data ->> 'phone'), '');

  if v_phone is not null and v_phone ~ '^\+[1-9][0-9]{7,14}$' then
    update public.auth_identities
    set phone = v_phone
    where primary_user_id = new.id
      and phone is null;

    if new.phone is null
       and not exists (
         select 1
         from auth.users existing
         where existing.id <> new.id
           and existing.phone = v_phone
       )
    then
      update auth.users
      set phone = v_phone
      where id = new.id
        and phone is null;
    end if;
  end if;

  return new;
end;
$$;

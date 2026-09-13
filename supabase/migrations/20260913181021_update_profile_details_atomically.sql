create or replace function public.update_my_profile_details(
  p_display_name text,
  p_username text,
  p_bio text,
  p_location text,
  p_website text,
  p_country text,
  p_birth_date date,
  p_phone text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_identity_id uuid;
  v_phone text;
  v_profile public.profiles%rowtype;
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
    where ai.id = v_identity_id;
  exception
    when unique_violation then
      raise exception 'phone_taken' using errcode = '23505';
  end;

  update public.profiles p
  set display_name = btrim(coalesce(p_display_name, '')),
      username = btrim(coalesce(p_username, '')),
      bio = btrim(coalesce(p_bio, '')),
      location = btrim(coalesce(p_location, '')),
      website = btrim(coalesce(p_website, '')),
      country = nullif(btrim(coalesce(p_country, '')), ''),
      birth_date = p_birth_date,
      updated_at = now()
  where p.id = v_user_id
  returning p.* into v_profile;

  if v_profile.id is null then
    raise exception 'profile_not_found' using errcode = 'P0002';
  end if;

  return jsonb_build_object(
    'display_name', v_profile.display_name,
    'username', v_profile.username,
    'bio', v_profile.bio,
    'location', v_profile.location,
    'website', v_profile.website,
    'country', v_profile.country,
    'birth_date', v_profile.birth_date,
    'phone', v_phone
  );
end;
$$;

revoke all on function public.update_my_profile_details(text,text,text,text,text,text,date,text) from public, anon;
grant execute on function public.update_my_profile_details(text,text,text,text,text,text,date,text) to authenticated;

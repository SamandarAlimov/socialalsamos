create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_requested_username text := nullif(lower(btrim(coalesce(new.raw_user_meta_data ->> 'username', ''))), '');
  v_email_local text := lower(split_part(coalesce(new.email, ''), '@', 1));
  v_username text;
  v_display_name text;
  v_check jsonb;
  v_id_hex text := replace(new.id::text, '-', '');
begin
  if coalesce(new.raw_user_meta_data ->> 'signup_managed', '') = 'account-signup-v2' then
    return new;
  end if;

  -- Auth/Dashboard/OAuth user creation must not fail just because a derived
  -- profile handle is invalid, reserved, too short/long, or already taken.
  v_username := coalesce(v_requested_username, v_email_local, '');
  v_username := regexp_replace(v_username, '[^a-z0-9_]+', '_', 'g');
  v_username := btrim(v_username, '_');
  v_username := left(v_username, 32);

  if v_username = '' then
    v_username := 'user_' || left(v_id_hex, 16);
  end if;

  v_check := public.check_username_availability(v_username, new.id);
  if not coalesce((v_check ->> 'available')::boolean, false) then
    v_username := 'user_' || left(v_id_hex, 16);
    v_check := public.check_username_availability(v_username, new.id);
  end if;

  if not coalesce((v_check ->> 'available')::boolean, false) then
    v_username := 'u_' || left(v_id_hex, 30);
  end if;

  v_display_name := left(
    coalesce(
      nullif(btrim(new.raw_user_meta_data ->> 'display_name'), ''),
      nullif(v_email_local, ''),
      v_username
    ),
    100
  );

  insert into public.profiles (id, username, display_name, avatar_url)
  values (new.id, v_username, v_display_name, new.raw_user_meta_data ->> 'avatar_url')
  on conflict do nothing;

  return new;
end;
$function$;

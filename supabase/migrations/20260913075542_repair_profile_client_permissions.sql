-- profiles contains both client-safe and server/admin-only fields. Avoid a
-- table-wide grant: expose only the columns the web client actually needs.

do $$
declare
  select_cols text;
  update_cols text;
begin
  if to_regclass('public.profiles') is null then
    return;
  end if;

  revoke all on table public.profiles from anon, authenticated;

  select string_agg(quote_ident(column_name), ', ' order by ordinal_position)
  into select_cols
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'profiles'
    and column_name = any(array[
      'id','user_id','username','display_name','avatar_url','cover_url','bio',
      'website','location','is_verified','is_online','last_seen',
      'followers_count','following_count','posts_count','created_at','updated_at'
    ]);

  if select_cols is not null then
    execute format(
      'grant select (%s) on table public.profiles to anon, authenticated',
      select_cols
    );
  end if;

  select string_agg(quote_ident(column_name), ', ' order by ordinal_position)
  into update_cols
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'profiles'
    and column_name = any(array[
      'username','display_name','avatar_url','cover_url','bio','website',
      'location','is_online','last_seen'
    ]);

  if update_cols is not null then
    execute format(
      'grant update (%s) on table public.profiles to authenticated',
      update_cols
    );
  end if;
end
$$;

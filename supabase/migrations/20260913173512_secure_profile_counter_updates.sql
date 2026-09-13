create or replace function public.enforce_profile_counter_truth()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.followers_count := (
    select count(*)::integer
    from public.follows f
    where f.following_id = new.id
  );
  new.following_count := (
    select count(*)::integer
    from public.follows f
    where f.follower_id = new.id
  );
  new.posts_count := (
    select count(*)::integer
    from public.posts p
    where p.user_id = new.id
  );
  return new;
end;
$$;

drop trigger if exists enforce_profile_counter_truth_trg on public.profiles;
create trigger enforce_profile_counter_truth_trg
before update of followers_count, following_count, posts_count on public.profiles
for each row
execute function public.enforce_profile_counter_truth();

grant update (followers_count, following_count, posts_count) on table public.profiles to authenticated;

update public.profiles p
set followers_count = (select count(*)::integer from public.follows f where f.following_id = p.id),
    following_count = (select count(*)::integer from public.follows f where f.follower_id = p.id),
    posts_count = (select count(*)::integer from public.posts po where po.user_id = p.id);

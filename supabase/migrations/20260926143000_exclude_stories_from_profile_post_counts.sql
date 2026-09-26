-- Stories use canonical rows in public.posts for shared media/engagement plumbing,
-- but those rows are not profile posts and must not inflate profile counters.

begin;

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
      and coalesce(p.post_kind, 'post') <> 'story'
      and p.profile_hidden_at is null
  );

  return new;
end;
$$;

-- Repair counters that may already include canonical Story-linked post rows.
update public.profiles
set posts_count = posts_count;

commit;

notify pgrst, 'reload schema';

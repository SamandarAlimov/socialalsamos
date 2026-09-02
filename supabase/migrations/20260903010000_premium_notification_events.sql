-- Premium notification semantics: reply/comment-like context + richer mention payloads.
-- UI is backward-compatible with older rows; these events become available once
-- this migration reaches the production Supabase project.

alter table public.notifications
  drop constraint if exists notifications_type_check;

alter table public.notifications
  add constraint notifications_type_check
  check (
    type in (
      'message', 'like', 'comment', 'follow', 'mention',
      'reply', 'comment_like', 'comment_mention',
      'collaboration_invite', 'collaboration_accepted', 'collaboration_declined',
      'collaboration_revoked', 'collaboration_removed', 'collaboration_left'
    )
  );

create or replace function public.notify_on_comment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_commenter_name text;
  v_post_owner uuid;
  v_parent_author uuid;
  v_preview text;
begin
  select display_name into v_commenter_name from public.profiles where id = new.user_id;
  select user_id into v_post_owner from public.posts where id = new.post_id;
  v_preview := left(regexp_replace(new.content, '\s+', ' ', 'g'), 180);

  -- Post egasi o'zidan boshqa comment uchun notification oladi.
  if v_post_owner is distinct from new.user_id
     and coalesce((select notify_comments from public.user_settings where user_id = v_post_owner), true)
  then
    insert into public.notifications (user_id, type, title, body, data)
    values (
      v_post_owner,
      'comment',
      'Yangi izoh',
      coalesce(v_commenter_name, 'Foydalanuvchi') || ' postingizga izoh qoldirdi',
      jsonb_build_object(
        'post_id', new.post_id,
        'comment_id', new.id,
        'parent_comment_id', new.parent_id,
        'commenter_id', new.user_id,
        'content_preview', v_preview
      )
    );
  end if;

  -- Reply muallifi ham aniq javob notification oladi.
  if new.parent_id is not null then
    select user_id into v_parent_author from public.comments where id = new.parent_id;

    if v_parent_author is not null
       and v_parent_author is distinct from new.user_id
       and v_parent_author is distinct from v_post_owner
       and coalesce((select notify_comments from public.user_settings where user_id = v_parent_author), true)
    then
      insert into public.notifications (user_id, type, title, body, data)
      values (
        v_parent_author,
        'reply',
        'Izohingizga javob',
        coalesce(v_commenter_name, 'Foydalanuvchi') || ' izohingizga javob berdi',
        jsonb_build_object(
          'post_id', new.post_id,
          'comment_id', new.id,
          'parent_comment_id', new.parent_id,
          'replier_id', new.user_id,
          'content_preview', v_preview
        )
      );
    end if;
  end if;

  return new;
end
$$;

create or replace function public.notify_on_mention()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_username text;
  v_user_id uuid;
  v_author_name text;
  v_preview text;
begin
  select display_name into v_author_name from public.profiles where id = new.user_id;
  v_preview := left(regexp_replace(new.content, '\s+', ' ', 'g'), 180);

  for v_username in
    select distinct (regexp_matches(new.content, '@([a-zA-Z0-9_]+)', 'g'))[1]
  loop
    select id into v_user_id from public.profiles where lower(username) = lower(v_username);

    if v_user_id is not null
       and v_user_id is distinct from new.user_id
       and coalesce((select notify_mentions from public.user_settings where user_id = v_user_id), true)
    then
      insert into public.notifications (user_id, type, title, body, data)
      values (
        v_user_id,
        'mention',
        'Izohda eslatish',
        coalesce(v_author_name, 'Foydalanuvchi') || ' izohda sizni belgiladi',
        jsonb_build_object(
          'post_id', new.post_id,
          'comment_id', new.id,
          'parent_comment_id', new.parent_id,
          'mentioner_id', new.user_id,
          'mention_context', case when new.parent_id is null then 'comment' else 'reply' end,
          'content_preview', v_preview
        )
      );
    end if;
  end loop;

  return new;
end
$$;

create or replace function public.notify_on_post_mention()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_username text;
  v_user_id uuid;
  v_author_name text;
  v_preview text;
begin
  select display_name into v_author_name from public.profiles where id = new.user_id;
  v_preview := left(regexp_replace(coalesce(new.content, ''), '\s+', ' ', 'g'), 180);

  for v_username in
    select distinct (regexp_matches(coalesce(new.content, ''), '@([a-zA-Z0-9_]+)', 'g'))[1]
  loop
    select id into v_user_id from public.profiles where lower(username) = lower(v_username);

    if v_user_id is not null
       and v_user_id is distinct from new.user_id
       and coalesce((select notify_mentions from public.user_settings where user_id = v_user_id), true)
    then
      insert into public.notifications (user_id, type, title, body, data)
      values (
        v_user_id,
        'mention',
        'Postda eslatish',
        coalesce(v_author_name, 'Foydalanuvchi') || ' postda sizni belgiladi',
        jsonb_build_object(
          'post_id', new.id,
          'mentioner_id', new.user_id,
          'mention_context', 'post',
          'content_preview', v_preview
        )
      );
    end if;
  end loop;

  return new;
end
$$;

create or replace function public.notify_on_comment_like()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_comment public.comments;
  v_liker_name text;
begin
  select * into v_comment from public.comments where id = new.comment_id;
  if v_comment.id is null or v_comment.user_id = new.user_id then
    return new;
  end if;

  if not coalesce((select notify_comments from public.user_settings where user_id = v_comment.user_id), true) then
    return new;
  end if;

  select display_name into v_liker_name from public.profiles where id = new.user_id;

  insert into public.notifications (user_id, type, title, body, data)
  values (
    v_comment.user_id,
    'comment_like',
    'Izoh yoqtirildi',
    coalesce(v_liker_name, 'Foydalanuvchi') || ' izohingizni yoqtirdi',
    jsonb_build_object(
      'post_id', v_comment.post_id,
      'comment_id', v_comment.id,
      'liker_id', new.user_id,
      'content_preview', left(regexp_replace(v_comment.content, '\s+', ' ', 'g'), 180)
    )
  );

  return new;
end
$$;

drop trigger if exists on_comment_like_notification on public.comment_likes;
create trigger on_comment_like_notification
  after insert on public.comment_likes
  for each row execute function public.notify_on_comment_like();

revoke execute on function public.notify_on_comment_like() from public, anon, authenticated;

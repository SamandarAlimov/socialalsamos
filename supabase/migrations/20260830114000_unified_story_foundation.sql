-- =============================================================================
-- Unified Story foundation
-- New stories use posts/post_media as source-of-truth and keep public.stories
-- as the viewer/archive compatibility index.
-- =============================================================================

alter table public.stories
  add column if not exists post_id uuid references public.posts(id) on delete cascade,
  add column if not exists media_id uuid references public.post_media(id) on delete set null,
  add column if not exists storage_bucket text,
  add column if not exists storage_key text;

create unique index if not exists stories_post_id_uniq
  on public.stories (post_id)
  where post_id is not null;

create index if not exists stories_active_post_idx
  on public.stories (expires_at desc, post_id)
  where is_active is distinct from false;

-- Legacy rows remain readable as before. New linked rows inherit canonical post
-- visibility, including friends/private and pending collaboration preview.
do $$
declare
  v_policy record;
begin
  for v_policy in
    select policyname
    from pg_policies
    where schemaname = 'public'
      and tablename = 'stories'
      and cmd = 'SELECT'
  loop
    execute format('drop policy if exists %I on public.stories', v_policy.policyname);
  end loop;
end $$;

create policy "stories_select_visible"
  on public.stories
  for select
  using (
    post_id is null
    or public.can_view_post(post_id)
  );

-- Interactive sticker metadata must follow the same visibility as its post.
do $$
declare
  v_policy record;
begin
  for v_policy in
    select policyname
    from pg_policies
    where schemaname = 'public'
      and tablename = 'story_stickers'
      and cmd = 'SELECT'
  loop
    execute format('drop policy if exists %I on public.story_stickers', v_policy.policyname);
  end loop;
end $$;

create policy "story_stickers_select_visible"
  on public.story_stickers
  for select
  using (public.can_view_post(post_id));

-- Atomically create the post graph + compatibility story row.
create or replace function public.publish_story_draft(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_payload jsonb;
  v_post_id uuid;
  v_media_id uuid;
  v_media jsonb;
  v_kind text;
  v_story_id uuid;
begin
  if v_user is null then
    raise exception 'Autentifikatsiya talab qilinadi';
  end if;

  if jsonb_typeof(coalesce(p_payload -> 'media', '[]'::jsonb)) <> 'array'
     or jsonb_array_length(coalesce(p_payload -> 'media', '[]'::jsonb)) <> 1 then
    raise exception 'Story uchun aynan bitta rasm yoki video kerak';
  end if;

  v_media := p_payload -> 'media' -> 0;
  v_kind := coalesce(v_media ->> 'kind', '');

  if v_kind not in ('image', 'video') then
    raise exception 'Story faqat rasm yoki video bo''lishi mumkin';
  end if;

  if nullif(p_payload ->> 'scheduledAt', '') is not null then
    raise exception 'Story scheduling hali qo''llanmaydi';
  end if;

  v_payload :=
    p_payload
    || jsonb_build_object(
      'postKind', 'story',
      'scheduledAt', null
    );

  v_post_id := public.publish_post_draft(v_payload);

  select pm.id
    into v_media_id
  from public.post_media pm
  where pm.post_id = v_post_id
  order by pm.position asc
  limit 1;

  insert into public.stories (
    user_id,
    post_id,
    media_id,
    media_url,
    storage_bucket,
    storage_key,
    media_type,
    caption,
    duration,
    expires_at,
    is_active
  )
  values (
    v_user,
    v_post_id,
    v_media_id,
    v_media ->> 'storageUrl',
    nullif(v_media ->> 'storageBucket', ''),
    nullif(v_media ->> 'storageKey', ''),
    v_kind,
    nullif(p_payload ->> 'content', ''),
    nullif(v_media ->> 'durationSeconds', '')::numeric,
    now() + interval '24 hours',
    true
  )
  returning id into v_story_id;

  return jsonb_build_object(
    'storyId', v_story_id,
    'postId', v_post_id,
    'mediaId', v_media_id
  );
end
$$;

revoke all on function public.publish_story_draft(jsonb) from public, anon;
grant execute on function public.publish_story_draft(jsonb) to authenticated;

-- SECURITY DEFINER sticker writes/results must not bypass post visibility.
create or replace function public.respond_story_sticker(
  p_sticker_id uuid,
  p_option_index integer default null,
  p_numeric_value numeric default null,
  p_text_answer text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_id uuid;
  v_post_id uuid;
begin
  if v_user is null then
    raise exception 'Avtorizatsiya talab qilinadi';
  end if;

  select post_id into v_post_id
  from public.story_stickers
  where id = p_sticker_id;

  if v_post_id is null or not public.can_view_post(v_post_id) then
    raise exception 'Bu stikerga kirish huquqi yo''q';
  end if;

  insert into public.story_sticker_responses (
    sticker_id, user_id, option_index, numeric_value, text_answer
  )
  values (p_sticker_id, v_user, p_option_index, p_numeric_value, p_text_answer)
  on conflict (sticker_id, user_id) do update
    set option_index = excluded.option_index,
        numeric_value = excluded.numeric_value,
        text_answer = excluded.text_answer,
        created_at = now()
  returning id into v_id;

  return v_id;
end
$$;

create or replace function public.story_sticker_results(p_sticker_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_type story_sticker_type;
  v_config jsonb;
  v_is_owner boolean;
  v_post_id uuid;
  v_total integer;
  v_result jsonb;
begin
  select s.type, s.config, s.post_id, (p.user_id = v_user)
  into v_type, v_config, v_post_id, v_is_owner
  from public.story_stickers s
  join public.posts p on p.id = s.post_id
  where s.id = p_sticker_id;

  if v_type is null then
    raise exception 'Stiker topilmadi';
  end if;

  if not public.can_view_post(v_post_id) then
    raise exception 'Bu stiker natijalarini ko''rish huquqi yo''q';
  end if;

  select count(*) into v_total
  from public.story_sticker_responses
  where sticker_id = p_sticker_id;

  if v_type in ('poll', 'quiz') then
    select jsonb_build_object(
      'type', v_type,
      'total', v_total,
      'counts', coalesce(jsonb_object_agg(option_index::text, cnt), '{}'::jsonb),
      'myChoice', (
        select option_index from public.story_sticker_responses
        where sticker_id = p_sticker_id and user_id = v_user
      ),
      'correctIndex', case
        when v_type = 'quiz' then v_config -> 'correctIndex'
        else null
      end
    )
    into v_result
    from (
      select option_index, count(*) as cnt
      from public.story_sticker_responses
      where sticker_id = p_sticker_id
      group by option_index
    ) grouped;

  elsif v_type = 'slider' then
    select jsonb_build_object(
      'type', 'slider',
      'total', v_total,
      'average', round(coalesce(avg(numeric_value), 0), 1),
      'myValue', (
        select numeric_value from public.story_sticker_responses
        where sticker_id = p_sticker_id and user_id = v_user
      )
    )
    into v_result
    from public.story_sticker_responses
    where sticker_id = p_sticker_id;

  elsif v_type = 'question' then
    v_result := jsonb_build_object(
      'type', 'question',
      'total', v_total,
      'answers', case
        when v_is_owner then (
          select coalesce(jsonb_agg(jsonb_build_object(
            'userId', user_id,
            'text', text_answer,
            'createdAt', created_at
          ) order by created_at desc), '[]'::jsonb)
          from public.story_sticker_responses
          where sticker_id = p_sticker_id
        )
        else '[]'::jsonb
      end
    );

  else
    v_result := jsonb_build_object('type', v_type, 'total', 0);
  end if;

  return coalesce(v_result, jsonb_build_object('type', v_type, 'total', v_total));
end
$$;

revoke all on function public.respond_story_sticker(uuid, integer, numeric, text) from public, anon;
revoke all on function public.story_sticker_results(uuid) from public, anon;
grant execute on function public.respond_story_sticker(uuid, integer, numeric, text) to authenticated;
grant execute on function public.story_sticker_results(uuid) to authenticated;

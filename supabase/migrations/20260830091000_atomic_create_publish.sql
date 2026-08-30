-- =============================================================================
-- Atomic Create publishing
--
-- Binary uploads happen before this RPC. Everything that belongs to the
-- database post graph is written in one PostgreSQL transaction: post, media,
-- poll/options, location/place, music and collaboration invitations.
-- Any database error aborts the whole graph instead of leaving a half-post.
-- =============================================================================

create or replace function public.publish_post_draft(p_payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_post_id uuid;
  v_poll_id uuid;
  v_place_id uuid;
  v_track_id uuid;
  v_item jsonb;
  v_location jsonb := p_payload -> 'location';
  v_music jsonb := p_payload -> 'music';
  v_poll jsonb := p_payload -> 'poll';
  v_place jsonb;
  v_track jsonb;
  v_correct_index int;
  v_position int := 0;
  v_source_index int := 0;
  v_option_id uuid;
  v_scheduled_at timestamptz;
  v_visibility text := coalesce(nullif(p_payload ->> 'visibility', ''), 'public');
  v_post_kind text := coalesce(nullif(p_payload ->> 'postKind', ''), 'post');
begin
  if v_user_id is null then
    raise exception 'Autentifikatsiya talab qilinadi';
  end if;

  if v_visibility not in ('public', 'friends', 'private') then
    raise exception 'Noto''g''ri visibility';
  end if;

  if v_post_kind not in ('post', 'reel', 'story', 'location', 'poll', 'file') then
    raise exception 'Noto''g''ri post turi';
  end if;

  if nullif(p_payload ->> 'scheduledAt', '') is not null then
    v_scheduled_at := (p_payload ->> 'scheduledAt')::timestamptz;
  end if;

  insert into public.posts (
    user_id,
    content,
    media_urls,
    media_type,
    visibility,
    post_kind,
    status,
    scheduled_at,
    published_at,
    edit_state
  )
  values (
    v_user_id,
    coalesce(p_payload ->> 'content', ''),
    coalesce(
      (select array_agg(value order by ordinality)
       from jsonb_array_elements_text(coalesce(p_payload -> 'mediaUrls', '[]'::jsonb))
       with ordinality as urls(value, ordinality)),
      array[]::text[]
    ),
    coalesce(nullif(p_payload ->> 'mediaType', ''), 'text'),
    v_visibility,
    v_post_kind,
    case when v_scheduled_at is null then 'published' else 'scheduled' end,
    v_scheduled_at,
    case when v_scheduled_at is null then now() else null end,
    p_payload -> 'editState'
  )
  returning id into v_post_id;

  -- Structured media metadata
  v_position := 0;
  for v_item in
    select value
    from jsonb_array_elements(coalesce(p_payload -> 'media', '[]'::jsonb))
  loop
    insert into public.post_media (
      post_id, position, kind, storage_url, thumbnail_url, mime_type,
      file_name, file_size, width, height, duration_seconds, aspect_ratio,
      alt_text, edit_state
    )
    values (
      v_post_id,
      v_position,
      coalesce(nullif(v_item ->> 'kind', ''), 'other')::public.media_kind,
      v_item ->> 'storageUrl',
      nullif(v_item ->> 'thumbnailUrl', ''),
      nullif(v_item ->> 'mimeType', ''),
      nullif(v_item ->> 'fileName', ''),
      nullif(v_item ->> 'fileSize', '')::bigint,
      nullif(v_item ->> 'width', '')::int,
      nullif(v_item ->> 'height', '')::int,
      nullif(v_item ->> 'durationSeconds', '')::numeric,
      nullif(v_item ->> 'aspectRatio', ''),
      nullif(v_item ->> 'altText', ''),
      v_item -> 'editState'
    );
    v_position := v_position + 1;
  end loop;

  -- Poll + options
  if v_poll is not null and jsonb_typeof(v_poll) = 'object' then
    if length(trim(coalesce(v_poll ->> 'question', ''))) = 0 then
      raise exception 'So''rovnoma savoli bo''sh';
    end if;

    insert into public.polls (
      post_id, question, allow_multiple, max_choices, is_anonymous,
      show_results_before_vote, quiz_mode, explanation, closes_at, poll_type
    )
    values (
      v_post_id,
      trim(v_poll ->> 'question'),
      coalesce((v_poll ->> 'allowMultiple')::boolean, false),
      case
        when coalesce((v_poll ->> 'allowMultiple')::boolean, false)
          then nullif(v_poll ->> 'maxChoices', '')::int
        else null
      end,
      coalesce((v_poll ->> 'isAnonymous')::boolean, false),
      coalesce((v_poll ->> 'showResultsBeforeVote')::boolean, false),
      coalesce((v_poll ->> 'quizMode')::boolean, false),
      nullif(v_poll ->> 'explanation', ''),
      nullif(v_poll ->> 'closesAt', '')::timestamptz,
      case when coalesce((v_poll ->> 'quizMode')::boolean, false)
        then 'quiz'::public.poll_type
        else 'standard'::public.poll_type
      end
    )
    returning id into v_poll_id;

    v_correct_index := nullif(v_poll ->> 'correctOptionIndex', '')::int;
    v_position := 0;
    v_source_index := 0;

    for v_item in
      select value
      from jsonb_array_elements(coalesce(v_poll -> 'options', '[]'::jsonb))
    loop
      if length(trim(coalesce(v_item ->> 'label', ''))) > 0 then
        insert into public.poll_options (
          poll_id, position, label, emoji, image_url
        )
        values (
          v_poll_id,
          v_position,
          trim(v_item ->> 'label'),
          nullif(v_item ->> 'emoji', ''),
          nullif(v_item ->> 'imageUrl', '')
        )
        returning id into v_option_id;

        if v_correct_index is not null and v_correct_index = v_source_index then
          update public.polls
          set correct_option_id = v_option_id
          where id = v_poll_id;
        end if;

        v_position := v_position + 1;
      end if;

      v_source_index := v_source_index + 1;
    end loop;

    if v_position < 2 then
      raise exception 'So''rovnomada kamida 2 ta variant bo''lishi kerak';
    end if;

    if v_position > 12 then
      raise exception 'So''rovnomada ko''pi bilan 12 ta variant bo''lishi mumkin';
    end if;

    if coalesce((v_poll ->> 'quizMode')::boolean, false)
       and (
         v_correct_index is null
         or not exists (
           select 1 from public.polls
           where id = v_poll_id and correct_option_id is not null
         )
       ) then
      raise exception 'Viktorina uchun to''g''ri javob belgilanmagan';
    end if;
  end if;

  -- Location + optional reusable place
  if v_location is not null and jsonb_typeof(v_location) = 'object' then
    v_place := v_location -> 'place';
    v_place_id := null;

    if v_place is not null and jsonb_typeof(v_place) = 'object' then
      if nullif(v_place ->> 'externalSource', '') is not null
         and nullif(v_place ->> 'externalId', '') is not null then
        select id into v_place_id
        from public.places
        where external_source = v_place ->> 'externalSource'
          and external_id = v_place ->> 'externalId'
        limit 1;
      end if;

      if v_place_id is null then
        begin
          insert into public.places (
            name, address, category, latitude, longitude,
            external_source, external_id, created_by
          )
          values (
            coalesce(nullif(v_place ->> 'name', ''), coalesce(v_location ->> 'label', 'Joylashuv')),
            nullif(v_place ->> 'address', ''),
            nullif(v_place ->> 'category', ''),
            (v_location ->> 'latitude')::double precision,
            (v_location ->> 'longitude')::double precision,
            nullif(v_place ->> 'externalSource', ''),
            nullif(v_place ->> 'externalId', ''),
            v_user_id
          )
          returning id into v_place_id;
        exception when unique_violation then
          select id into v_place_id
          from public.places
          where external_source = v_place ->> 'externalSource'
            and external_id = v_place ->> 'externalId'
          limit 1;
        end;
      end if;
    end if;

    insert into public.post_locations (
      post_id, place_id, mode, label, latitude, longitude,
      accuracy_m, live_until
    )
    values (
      v_post_id,
      v_place_id,
      coalesce(nullif(v_location ->> 'mode', ''), 'place')::public.post_location_mode,
      coalesce(nullif(v_location ->> 'label', ''), nullif(v_place ->> 'name', '')),
      (v_location ->> 'latitude')::double precision,
      (v_location ->> 'longitude')::double precision,
      nullif(v_location ->> 'accuracyM', '')::double precision,
      case
        when coalesce(v_location ->> 'mode', 'place') = 'live'
          then nullif(v_location ->> 'liveUntil', '')::timestamptz
        else null
      end
    );
  end if;

  -- Music: existing catalog track or newly uploaded device track
  if v_music is not null and jsonb_typeof(v_music) = 'object' then
    v_track_id := nullif(v_music ->> 'trackId', '')::uuid;
    v_track := v_music -> 'track';

    if v_track_id is null and v_track is not null and jsonb_typeof(v_track) = 'object' then
      insert into public.music_tracks (
        title, artist, audio_url, cover_url, duration_seconds, source,
        external_id, license, attribution, owner_id, is_public
      )
      values (
        v_track ->> 'title',
        nullif(v_track ->> 'artist', ''),
        v_track ->> 'audioUrl',
        nullif(v_track ->> 'coverUrl', ''),
        nullif(v_track ->> 'durationSeconds', '')::numeric,
        coalesce(nullif(v_track ->> 'source', ''), 'device')::public.music_source,
        nullif(v_track ->> 'externalId', ''),
        nullif(v_track ->> 'license', ''),
        nullif(v_track ->> 'attribution', ''),
        coalesce(nullif(v_track ->> 'ownerId', '')::uuid, v_user_id),
        coalesce((v_track ->> 'isPublic')::boolean, false)
      )
      returning id into v_track_id;
    end if;

    if v_track_id is not null then
      insert into public.post_music (
        post_id, track_id, start_seconds, end_seconds, volume, muted_original
      )
      values (
        v_post_id,
        v_track_id,
        coalesce(nullif(v_music ->> 'startSeconds', '')::numeric, 0),
        nullif(v_music ->> 'endSeconds', '')::numeric,
        coalesce(nullif(v_music ->> 'volume', '')::numeric, 1),
        coalesce((v_music ->> 'mutedOriginal')::boolean, false)
      );
    end if;
  end if;

  -- Collaboration invitations: deduplicated and hard-capped at ten.
  insert into public.post_collaborators (post_id, user_id, invited_by, status)
  select
    v_post_id,
    collaborator_id,
    v_user_id,
    'pending'
  from (
    select distinct value::uuid as collaborator_id
    from jsonb_array_elements_text(coalesce(p_payload -> 'collaboratorIds', '[]'::jsonb))
    where value::uuid <> v_user_id
    limit 10
  ) collaborators;

  return v_post_id;
end
$$;

revoke all on function public.publish_post_draft(jsonb) from public;
grant execute on function public.publish_post_draft(jsonb) to authenticated;

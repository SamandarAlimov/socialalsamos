-- =============================================================================
-- Story draft lifecycle
-- Draft stays invisible while the owner configures interactive stickers.
-- =============================================================================

drop policy if exists "stories_select_visible" on public.stories;

create policy "stories_select_visible"
  on public.stories
  for select
  using (
    user_id = auth.uid()
    or (
      is_active is distinct from false
      and (
        post_id is null
        or public.can_view_post(post_id)
      )
    )
  );

create or replace function public.create_story_draft(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_result jsonb;
  v_story_id uuid;
begin
  v_result := public.publish_story_draft(p_payload);
  v_story_id := (v_result ->> 'storyId')::uuid;

  update public.stories
  set is_active = false
  where id = v_story_id
    and user_id = auth.uid();

  return v_result;
end
$$;

revoke all on function public.create_story_draft(jsonb) from public, anon;
grant execute on function public.create_story_draft(jsonb) to authenticated;

create or replace function public.activate_story_draft(p_story_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_post_id uuid;
begin
  select s.post_id into v_post_id
  from public.stories s
  where s.id = p_story_id
    and s.user_id = auth.uid()
  for update;

  if v_post_id is null then
    raise exception 'Story qoralamasi topilmadi';
  end if;

  if not exists (
    select 1
    from public.posts p
    where p.id = v_post_id
      and p.user_id = auth.uid()
      and p.post_kind = 'story'
  ) then
    raise exception 'Story post topilmadi';
  end if;

  update public.stories
  set is_active = true,
      expires_at = now() + interval '24 hours'
  where id = p_story_id;

  update public.posts
  set published_at = now(),
      updated_at = now()
  where id = v_post_id;

  return true;
end
$$;

revoke all on function public.activate_story_draft(uuid) from public, anon;
grant execute on function public.activate_story_draft(uuid) to authenticated;

create or replace function public.discard_story_draft(p_story_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_post_id uuid;
  v_is_active boolean;
begin
  select s.post_id, coalesce(s.is_active, true)
  into v_post_id, v_is_active
  from public.stories s
  where s.id = p_story_id
    and s.user_id = auth.uid()
  for update;

  if v_post_id is null then
    return true;
  end if;

  if v_is_active then
    raise exception 'Live Story qoralama sifatida o''chirilmaydi';
  end if;

  delete from public.stories
  where id = p_story_id;

  delete from public.posts
  where id = v_post_id
    and user_id = auth.uid()
    and post_kind = 'story';

  return true;
end
$$;

revoke all on function public.discard_story_draft(uuid) from public, anon;
grant execute on function public.discard_story_draft(uuid) to authenticated;

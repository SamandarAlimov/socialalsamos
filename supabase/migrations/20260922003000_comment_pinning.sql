-- Premium comment pinning.
-- Only the post owner may pin/unpin top-level comments. Direct client UPDATE
-- access is intentionally not granted; all mutations go through the guarded RPC.

alter table public.comments
  add column if not exists is_pinned boolean not null default false,
  add column if not exists pinned_at timestamptz,
  add column if not exists pinned_by uuid references public.profiles(id) on delete set null;

create index if not exists comments_post_pinned_idx
  on public.comments (post_id, is_pinned desc, pinned_at desc nulls last, created_at asc)
  where parent_id is null;

create or replace function public.toggle_comment_pin(
  p_comment_id uuid,
  p_pinned boolean
)
returns public.comments
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_comment public.comments;
  v_post_owner uuid;
  v_pinned_count integer;
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  select c.*
  into v_comment
  from public.comments c
  where c.id = p_comment_id;

  if not found then
    raise exception 'Comment not found' using errcode = 'P0002';
  end if;

  if v_comment.parent_id is not null then
    raise exception 'Only top-level comments can be pinned' using errcode = '22023';
  end if;

  select p.user_id
  into v_post_owner
  from public.posts p
  where p.id = v_comment.post_id;

  if v_post_owner is distinct from auth.uid() then
    raise exception 'Only the post owner can pin comments' using errcode = '42501';
  end if;

  if coalesce(p_pinned, false) and not coalesce(v_comment.is_pinned, false) then
    select count(*)::integer
    into v_pinned_count
    from public.comments c
    where c.post_id = v_comment.post_id
      and c.parent_id is null
      and c.is_pinned = true
      and c.id <> v_comment.id;

    if v_pinned_count >= 3 then
      raise exception 'A post can have at most 3 pinned comments' using errcode = '22023';
    end if;
  end if;

  update public.comments
  set
    is_pinned = coalesce(p_pinned, false),
    pinned_at = case when coalesce(p_pinned, false) then now() else null end,
    pinned_by = case when coalesce(p_pinned, false) then auth.uid() else null end
  where id = p_comment_id
  returning * into v_comment;

  return v_comment;
end;
$$;

revoke all on function public.toggle_comment_pin(uuid, boolean) from public;
revoke all on function public.toggle_comment_pin(uuid, boolean) from anon;
grant execute on function public.toggle_comment_pin(uuid, boolean) to authenticated;

comment on function public.toggle_comment_pin(uuid, boolean) is
  'Allows a post owner to pin or unpin up to three top-level comments.';

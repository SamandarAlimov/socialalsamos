-- Marketplace seller response stats.
-- Only aggregate data is exposed; message/conversation contents remain private.
-- Fewer than 3 buyer conversations intentionally returns NULL rate/time.

create or replace function public.get_seller_response_stats(_seller_user_id uuid)
returns table (
  response_rate numeric,
  average_response_minutes integer,
  conversations_count bigint,
  is_online boolean,
  last_seen timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  with seller_profile as (
    select
      p.id,
      coalesce(p.is_online, false) as is_online,
      p.last_seen
    from public.profiles p
    where p.id = _seller_user_id
  ),
  private_conversations as (
    select distinct c.id
    from public.conversations c
    join public.conversation_participants cp
      on cp.conversation_id = c.id
     and cp.user_id = _seller_user_id
    where c.type = 'private'
  ),
  first_buyer_messages as (
    select
      pc.id as conversation_id,
      min(m.created_at) as first_buyer_at
    from private_conversations pc
    join public.messages m on m.conversation_id = pc.id
    where m.sender_id is distinct from _seller_user_id
      and coalesce(m.is_deleted, false) = false
      and m.created_at >= now() - interval '90 days'
    group by pc.id
  ),
  response_pairs as (
    select
      fb.conversation_id,
      fb.first_buyer_at,
      (
        select min(reply.created_at)
        from public.messages reply
        where reply.conversation_id = fb.conversation_id
          and reply.sender_id = _seller_user_id
          and coalesce(reply.is_deleted, false) = false
          and reply.created_at > fb.first_buyer_at
      ) as first_reply_at
    from first_buyer_messages fb
  ),
  aggregate_stats as (
    select
      count(*)::bigint as conversations_count,
      count(first_reply_at)::bigint as responded_count,
      avg(
        extract(epoch from (first_reply_at - first_buyer_at)) / 60.0
      ) filter (where first_reply_at is not null) as average_minutes
    from response_pairs
  )
  select
    case
      when a.conversations_count >= 3
        then round((a.responded_count::numeric / nullif(a.conversations_count, 0)) * 100, 0)
      else null
    end as response_rate,
    case
      when a.responded_count >= 3
        then round(a.average_minutes)::integer
      else null
    end as average_response_minutes,
    a.conversations_count,
    sp.is_online,
    sp.last_seen
  from seller_profile sp
  cross join aggregate_stats a;
$$;

revoke all on function public.get_seller_response_stats(uuid) from public;
grant execute on function public.get_seller_response_stats(uuid) to authenticated;

-- Search-engine discoverability for public Alsamos entities.
-- Exposes only intentionally public metadata through SECURITY DEFINER RPCs.
-- Private/friends posts, private groups/channels and inactive products are excluded.

create or replace function public.seo_public_sitemap(
  p_kind text,
  p_limit integer default 50000,
  p_offset integer default 0
)
returns table (
  url_path text,
  lastmod timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_limit integer := greatest(1, least(coalesce(p_limit, 50000), 50000));
  v_offset integer := greatest(0, coalesce(p_offset, 0));
begin
  case lower(coalesce(p_kind, ''))
    when 'profiles' then
      return query
      select '/user/' || p.username,
             coalesce(p.updated_at, p.created_at, now())
      from public.profiles p
      where p.username is not null and length(trim(p.username)) > 0
      order by coalesce(p.updated_at, p.created_at) desc nulls last
      limit v_limit offset v_offset;

    when 'posts' then
      return query
      select '/post/' || p.id::text,
             coalesce(p.updated_at, p.created_at, now())
      from public.posts p
      where p.visibility = 'public'
        and coalesce(p.is_hidden, false) = false
      order by coalesce(p.updated_at, p.created_at) desc nulls last
      limit v_limit offset v_offset;

    when 'channels' then
      return query
      select '/channel/' || coalesce(nullif(c.username, ''), c.id::text),
             coalesce(c.updated_at, c.created_at, now())
      from public.channels c
      where c.channel_type = 'public'
      order by coalesce(c.updated_at, c.created_at) desc
      limit v_limit offset v_offset;

    when 'groups' then
      return query
      select '/group/' || coalesce(nullif(c.username, ''), c.id::text),
             coalesce(c.last_message_at, c.created_at, now())
      from public.conversations c
      where c.type = 'group'
        and c.is_public is true
      order by coalesce(c.last_message_at, c.created_at) desc nulls last
      limit v_limit offset v_offset;

    when 'products' then
      return query
      select '/marketplace/product/' || p.id::text,
             coalesce(p.updated_at, p.created_at, now())
      from public.products p
      where p.status = 'active'
        and (p.moderation_status is null or p.moderation_status = 'approved')
      order by coalesce(p.updated_at, p.created_at) desc
      limit v_limit offset v_offset;

    when 'hashtags' then
      return query
      select '/hashtag/' || h.tag,
             coalesce(h.last_used_at, now())
      from public.hashtags h
      where h.posts_count > 0
      order by h.last_used_at desc nulls last, h.posts_count desc
      limit v_limit offset v_offset;

    else
      return;
  end case;
end;
$$;

revoke all on function public.seo_public_sitemap(text, integer, integer) from public;
grant execute on function public.seo_public_sitemap(text, integer, integer) to anon, authenticated;

create or replace function public.seo_public_entity(
  p_kind text,
  p_value text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  result jsonb;
  v_kind text := lower(coalesce(p_kind, ''));
  v_value text := trim(coalesce(p_value, ''));
begin
  if v_value = '' then return null; end if;

  if v_kind = 'profile' then
    select jsonb_build_object(
      'kind', 'profile',
      'canonicalPath', '/user/' || p.username,
      'title', coalesce(nullif(p.display_name, ''), '@' || p.username),
      'description', coalesce(nullif(p.bio, ''), '@' || p.username || ' — Alsamos profili.'),
      'image', p.avatar_url,
      'username', p.username,
      'followersCount', coalesce(p.followers_count, 0),
      'postsCount', coalesce(p.posts_count, 0),
      'updatedAt', coalesce(p.updated_at, p.created_at)
    )
    into result
    from public.profiles p
    where p.username is not null
      and lower(p.username) = lower(v_value)
    limit 1;

  elsif v_kind = 'post' then
    select jsonb_build_object(
      'kind', 'post',
      'canonicalPath', '/post/' || p.id::text,
      'title', coalesce(
        nullif(left(regexp_replace(coalesce(p.content, ''), E'\\s+', ' ', 'g'), 90), ''),
        coalesce(nullif(pr.display_name, ''), '@' || pr.username, 'Alsamos posti')
      ),
      'description', coalesce(
        nullif(left(regexp_replace(coalesce(p.content, ''), E'\\s+', ' ', 'g'), 300), ''),
        'Alsamos dagi ommaviy post.'
      ),
      'image', coalesce(p.thumbnail_url, case when p.media_urls is not null then p.media_urls[1] else null end),
      'authorName', coalesce(nullif(pr.display_name, ''), pr.username),
      'authorUsername', pr.username,
      'createdAt', p.created_at,
      'updatedAt', p.updated_at,
      'likesCount', coalesce(p.likes_count, 0),
      'commentsCount', coalesce(p.comments_count, 0),
      'viewsCount', coalesce(p.views_count, 0),
      'hashtags', coalesce(to_jsonb(p.hashtags), '[]'::jsonb)
    )
    into result
    from public.posts p
    left join public.profiles pr on pr.id = p.user_id
    where p.id::text = v_value
      and p.visibility = 'public'
      and coalesce(p.is_hidden, false) = false
    limit 1;

  elsif v_kind = 'channel' then
    select jsonb_build_object(
      'kind', 'channel',
      'canonicalPath', '/channel/' || coalesce(nullif(c.username, ''), c.id::text),
      'title', c.name,
      'description', coalesce(nullif(c.description, ''), c.name || ' — Alsamos ommaviy kanali.'),
      'image', c.avatar_url,
      'username', c.username,
      'subscriberCount', coalesce(c.subscriber_count, 0),
      'postsCount', coalesce(c.posts_count, 0),
      'updatedAt', c.updated_at
    )
    into result
    from public.channels c
    where c.channel_type = 'public'
      and (lower(coalesce(c.username, '')) = lower(v_value) or c.id::text = v_value)
    limit 1;

  elsif v_kind = 'group' then
    select jsonb_build_object(
      'kind', 'group',
      'canonicalPath', '/group/' || coalesce(nullif(c.username, ''), c.id::text),
      'title', coalesce(nullif(c.name, ''), 'Alsamos guruhi'),
      'description', coalesce(nullif(c.description, ''), coalesce(nullif(c.name, ''), 'Alsamos guruhi') || ' — ommaviy Alsamos guruhi.'),
      'image', c.avatar_url,
      'username', c.username,
      'memberCount', greatest(coalesce(c.subscriber_count, 0), coalesce(c.subscribers_count, 0)),
      'updatedAt', coalesce(c.last_message_at, c.created_at)
    )
    into result
    from public.conversations c
    where c.type = 'group'
      and c.is_public is true
      and (lower(coalesce(c.username, '')) = lower(v_value) or c.id::text = v_value)
    limit 1;

  elsif v_kind = 'product' then
    select jsonb_build_object(
      'kind', 'product',
      'canonicalPath', '/marketplace/product/' || p.id::text,
      'title', p.title,
      'description', coalesce(nullif(p.description, ''), p.title || ' — Alsamos Bozor mahsuloti.'),
      'image', pm.url,
      'price', p.price,
      'currency', coalesce(p.currency, 'USD'),
      'availability', case when coalesce(p.quantity, 0) > 0 then 'InStock' else 'OutOfStock' end,
      'sellerName', s.business_name,
      'updatedAt', p.updated_at
    )
    into result
    from public.products p
    left join public.sellers s on s.id = p.seller_id
    left join lateral (
      select m.url
      from public.product_media m
      where m.product_id = p.id
      order by m.sort_order asc nulls last, m.created_at asc
      limit 1
    ) pm on true
    where p.id::text = v_value
      and p.status = 'active'
      and (p.moderation_status is null or p.moderation_status = 'approved')
    limit 1;

  elsif v_kind = 'hashtag' then
    select jsonb_build_object(
      'kind', 'hashtag',
      'canonicalPath', '/hashtag/' || h.tag,
      'title', '#' || h.tag,
      'description', '#' || h.tag || ' bo‘yicha Alsamos dagi ommaviy postlar.',
      'postsCount', h.posts_count,
      'updatedAt', h.last_used_at
    )
    into result
    from public.hashtags h
    where lower(h.tag) = lower(trim(both '#' from v_value))
      and h.posts_count > 0
    limit 1;
  end if;

  return result;
end;
$$;

revoke all on function public.seo_public_entity(text, text) from public;
grant execute on function public.seo_public_entity(text, text) to anon, authenticated;

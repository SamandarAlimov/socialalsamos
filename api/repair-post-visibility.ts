const PROJECT_REF = 'mbhjganbihamoiqmankv';

function env(name: string): string {
  return String(process.env[name] ?? '').trim();
}

function setNoCache(res: any) {
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
}

const REPAIR_SQL = `
begin;

update public.posts
set visibility = 'public'
where visibility is null or btrim(visibility) = '';

update public.posts
set visibility = lower(btrim(visibility))
where visibility is not null
  and lower(btrim(visibility)) in ('public', 'friends', 'private')
  and visibility <> lower(btrim(visibility));

alter table public.posts
  alter column visibility set default 'public',
  alter column visibility set not null;

create or replace function public.can_view_post(p_post_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.posts p
    where p.id = p_post_id
      and (
        coalesce(nullif(btrim(p.visibility), ''), 'public') = 'public'
        or p.user_id = auth.uid()
        or (
          coalesce(nullif(btrim(p.visibility), ''), 'public') = 'friends'
          and auth.uid() is not null
          and exists (
            select 1 from public.follows f
            where f.follower_id = auth.uid()
              and f.following_id = p.user_id
          )
          and exists (
            select 1 from public.follows f
            where f.follower_id = p.user_id
              and f.following_id = auth.uid()
          )
        )
        or exists (
          select 1
          from public.post_collaborators pc
          where pc.post_id = p.id
            and pc.user_id = auth.uid()
            and pc.status = 'accepted'
        )
      )
  );
$$;

drop policy if exists "Public posts viewable by everyone" on public.posts;
drop policy if exists "posts_select_visible" on public.posts;

create policy "posts_select_visible"
  on public.posts
  for select
  using (public.can_view_post(id));

create index if not exists posts_visibility_created_at_idx
  on public.posts (visibility, created_at desc);

commit;

notify pgrst, 'reload schema';
`;

async function runManagementRepair(accessToken: string) {
  const response = await fetch(
    `https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query: REPAIR_SQL, read_only: false }),
    },
  );

  const text = await response.text();
  if (!response.ok) {
    throw new Error(`management_query_${response.status}:${text.slice(0, 500)}`);
  }
  return text;
}

async function runServiceRoleRepair(url: string, serviceKey: string) {
  const patch = async (filter: string) => {
    const response = await fetch(`${url}/rest/v1/posts?${filter}`, {
      method: 'PATCH',
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal',
      },
      body: JSON.stringify({ visibility: 'public' }),
    });
    if (!response.ok) {
      throw new Error(`posts_patch_${response.status}:${(await response.text()).slice(0, 300)}`);
    }
  };

  await patch('visibility=is.null');
  await patch('visibility=eq.');
}

/**
 * Temporary fixed-purpose endpoint. It accepts no SQL or mutation payload from
 * the caller. It is removed immediately after the one-shot repair attempt.
 */
export default async function handler(req: any, res: any) {
  setNoCache(res);
  if (req.method !== 'GET') {
    res.statusCode = 405;
    res.end(JSON.stringify({ ok: false, error: 'method_not_allowed' }));
    return;
  }

  const url = (env('SUPABASE_URL') || env('VITE_SUPABASE_URL')).replace(/\/+$/, '');
  const serviceKey = env('SUPABASE_SERVICE_ROLE_KEY') || env('SUPABASE_SERVICE_KEY');
  const accessToken = env('SUPABASE_ACCESS_TOKEN');
  const dbPassword = env('SUPABASE_DB_PASSWORD');
  const databaseUrl = env('DATABASE_URL') || env('POSTGRES_URL');

  try {
    if (accessToken) {
      const result = await runManagementRepair(accessToken);
      res.statusCode = 200;
      res.end(JSON.stringify({ ok: true, repaired: true, via: 'management-api', result: result.slice(0, 200) }));
      return;
    }

    if (url && serviceKey) {
      await runServiceRoleRepair(url, serviceKey);
      res.statusCode = 200;
      res.end(JSON.stringify({ ok: true, repaired: true, via: 'service-role-rest' }));
      return;
    }

    res.statusCode = 503;
    res.end(JSON.stringify({
      ok: false,
      error: 'production_database_credentials_missing',
      hasUrl: Boolean(url),
      hasServiceRole: Boolean(serviceKey),
      hasAccessToken: Boolean(accessToken),
      hasDbPassword: Boolean(dbPassword),
      hasDatabaseUrl: Boolean(databaseUrl),
    }));
  } catch (error) {
    console.error('[repair-post-visibility]', error);
    res.statusCode = 500;
    res.end(JSON.stringify({
      ok: false,
      error: error instanceof Error ? error.message : 'repair_failed',
    }));
  }
}

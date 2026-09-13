-- PostgREST .insert(...).select('*') uses INSERT ... RETURNING.
-- The existing SELECT policy delegates to can_view_post(id). During the same
-- INSERT statement that helper cannot reliably observe the just-created row,
-- so the INSERT WITH CHECK succeeds but RETURNING is denied with 42501.
--
-- Keep the existing visibility helper for followers/private rules, and add a
-- direct permissive SELECT path for cases that are already intended to be
-- visible: public posts and the signed-in user's own posts.

drop policy if exists "Posts are directly visible when public or owned" on public.posts;

create policy "Posts are directly visible when public or owned"
on public.posts
for select
to public
using (
  visibility = 'public'
  or (auth.uid() is not null and user_id = auth.uid())
);

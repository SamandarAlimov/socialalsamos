-- Avoid per-row auth.uid() re-evaluation in Saved playlist RLS policies.

DROP POLICY IF EXISTS saved_post_playlists_select_own ON public.saved_post_playlists;
CREATE POLICY saved_post_playlists_select_own
  ON public.saved_post_playlists
  FOR SELECT
  TO authenticated
  USING ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS saved_post_playlists_insert_own ON public.saved_post_playlists;
CREATE POLICY saved_post_playlists_insert_own
  ON public.saved_post_playlists
  FOR INSERT
  TO authenticated
  WITH CHECK ((SELECT auth.uid()) = user_id AND is_default = false);

DROP POLICY IF EXISTS saved_post_playlists_update_own_custom ON public.saved_post_playlists;
CREATE POLICY saved_post_playlists_update_own_custom
  ON public.saved_post_playlists
  FOR UPDATE
  TO authenticated
  USING ((SELECT auth.uid()) = user_id AND is_default = false)
  WITH CHECK ((SELECT auth.uid()) = user_id AND is_default = false);

DROP POLICY IF EXISTS saved_post_playlists_delete_own_custom ON public.saved_post_playlists;
CREATE POLICY saved_post_playlists_delete_own_custom
  ON public.saved_post_playlists
  FOR DELETE
  TO authenticated
  USING ((SELECT auth.uid()) = user_id AND is_default = false);

DROP POLICY IF EXISTS saved_post_playlist_items_select_own ON public.saved_post_playlist_items;
CREATE POLICY saved_post_playlist_items_select_own
  ON public.saved_post_playlist_items
  FOR SELECT
  TO authenticated
  USING ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS saved_post_playlist_items_insert_own ON public.saved_post_playlist_items;
CREATE POLICY saved_post_playlist_items_insert_own
  ON public.saved_post_playlist_items
  FOR INSERT
  TO authenticated
  WITH CHECK ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS saved_post_playlist_items_delete_own ON public.saved_post_playlist_items;
CREATE POLICY saved_post_playlist_items_delete_own
  ON public.saved_post_playlist_items
  FOR DELETE
  TO authenticated
  USING ((SELECT auth.uid()) = user_id);

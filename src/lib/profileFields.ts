/**
 * Columns of `profiles` that are safe to read for any user.
 *
 * `profiles.id` is the auth user id in the current schema. There is no
 * separate `profiles.user_id` column.
 *
 * Sensitive columns (birth_date, country, preferences, signatures,
 * email_filters, notification_preferences, is_admin, role) are no longer
 * granted to the `anon`/`authenticated` roles. Use the
 * `get_profile_private` RPC (owner or admin only) to read them.
 */
export const PROFILE_PUBLIC_COLUMNS =
  'id, username, display_name, avatar_url, cover_url, bio, website, location, is_verified, is_online, last_seen, followers_count, following_count, posts_count, created_at, updated_at' as const;

# Database Schema Ownership Contract

**Status:** normative. Duplicated verbatim in both client repos.

Both clients talk to **one shared Supabase project**. There is no second
database, no staging split, and no per-client schema. Every table is therefore a
cross-client contract.

Related contracts:

- `docs/CONTRACTS/message-protocol.md`
- `docs/CONTRACTS/feature-parity.md`

---

## 1. Where migrations live

There are currently **three** places SQL has been authored. Only one of them is
authoritative.

| Location | Count | Status |
|---|---|---|
| `alsamos-superapp/supabase/migrations/` | ~120 files | **Source of truth.** CLI-managed, timestamp-ordered, applied with `supabase db push`. |
| `socialalsamos/supabase/migrations/` | small, recent | Secondary. Reconcile against the Flutter set before applying. |
| `alsamos-superapp/*.sql` at repo root | 6 files | Ad-hoc operational scripts. Not migrations. Deprecated. |

### Rule

> New migrations are authored in `alsamos-superapp/supabase/migrations/` using
> the `YYYYMMDDHHMMSS_description.sql` convention.

If a schema change is driven by web work, it still belongs in that directory.
The web repo may keep a **copy** for its own tooling, but the Flutter directory
is the one that defines the applied state.

### Root-level scripts

`ADMIN_DIAGNOSTIC_COMPLETE.sql`, `ADMIN_FIX_UNIFIED.sql`,
`APPLY_MIGRATION_NOW.sql`, `APPLY_NOW_PRODUCTION.sql`, `DEPLOY_ADMIN_NOW.sql`,
`INTROSPECT_SCHEMA_NOW.sql`.

These are one-off repair and introspection scripts. They are **not** part of the
migration chain, are not timestamp-ordered, and may contain destructive
statements. Action: audit each one, fold anything still needed into a proper
timestamped migration, then move the originals to `docs/legacy-sql/`.

---

## 2. Migration style rules

Every migration must be safe to run twice, because the same file may be applied
by the CLI and by hand in the Supabase SQL editor.

- `CREATE TABLE IF NOT EXISTS`
- `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`, one column per statement
- `CREATE INDEX IF NOT EXISTS`
- `CREATE OR REPLACE FUNCTION`
- `DROP POLICY IF EXISTS` immediately before every `CREATE POLICY`
- Guard realtime publication changes rather than assuming state
- End with `NOTIFY pgrst, 'reload schema';`
- Never `DROP TABLE`, never `DROP COLUMN`, never rename. Add and deprecate.

### The index-before-column trap

This is the single most expensive mistake made in this project so far. It has
now caused two separate failures.

```
ERROR:  42703: column "collection" does not exist
ERROR:  42703: column "is_public" does not exist
```

Cause: `CREATE TABLE IF NOT EXISTS x (...)` is a **no-op** when `x` already
exists. None of the new columns are created. The `CREATE INDEX` or
`CREATE POLICY` that follows then references a column that was never added, and
the whole migration aborts.

> Whenever a migration creates a table with `IF NOT EXISTS`, it must also issue
> `ADD COLUMN IF NOT EXISTS` for every column it depends on, **before** any
> index or policy that references them.

And more fundamentally:

> Search the authoritative migration directory for the table name before
> writing `CREATE TABLE`. Assume it already exists.

---

## 3. Domain map

Derived from the migration filenames in the authoritative directory.

| Domain | Representative migrations |
|---|---|
| Chat core | `phase2_message_interactions`, `phase3_realtime_presence`, `phase4_chat_list`, `group_a_chat_list_discovery`, `add_client_message_id`, `fix_message_reads_upsert_policy`, `speed_up_messages_initial_load` |
| Groups and channels | `group_b_groups_channels`, `channel_discussion_groups` |
| Chat media and location | `group_c_media_location`, `chat_voice_video_messages`, `messages_map_integration` |
| Mentions and hashtags | `message_mentions`, `message_hashtags` |
| Stickers | `telegram_stickers`, `reconcile_sticker_schema`, `seed_stickers.sql` |
| Calls | `group_e_calls_live`, `batch2_calls_live`, `fix_calls_realtime`, `add_default_turn_servers`, `fix_call_room_members_rls`, `fix_call_accept_rpc`, `realtime_calls_telegram_grade`, `repair_realtime_calls_runtime_contract`, `harden_realtime_calls_professional_runtime`, `repair_video_calls_status_contract`, `repair_call_runtime_contract_gaps`, `repair_heartbeat_video_call_rpc_signature`, `lovable_rtc_realtime_repair` |
| Map | `map_p0_features`, `social_map_features`, `advanced_routing`, `messages_map_integration`, `reconcile_map_schema` |
| Marketplace | `marketplace_tables`, `marketplace_p0_payments_escrow`, `marketplace_p1_seller_verification`, `marketplace_p2_search_notifications`, `marketplace_p3_analytics_inventory` |
| Posts and content | `content_engine_foundation`, `harden_post_collaboration`, `harden_post_poll_votes`, `fix_posts_schema_mismatches`, `fix_post_hashtag_extraction_trigger`, `trending_public_posts` |
| Search | `global_search`, `add_search_indexes_and_tags`, `add_search_tags_rpc`, `discovery_modernization` |
| Admin | `add_admin_role_system`, `admin_and_history_tables`, `batch4_admin_reliability` |
| Settings and privacy | `settings_backend_columns`, `granular_privacy_settings`, `privacy_features`, `notification_settings`, `data_storage_settings`, `user_settings_sync_columns`, `show_deleted_messages_setting` |
| Identity | `username_reservation_system`, `seed_reserved_usernames`, `username_change_rules`, `profile_photo_history`, `active_session_devices` |
| Views and analytics | `view_history`, `fix_unique_view_counts`, `fix_post_views_profile_lookup` |
| Appearance | `chat_wallpaper_system` |
| Test fixtures | `test_messages_data`, `create_test_conversations` |

---

## 4. Resolved schema collisions

**Status: verified by reading both sides.** The web client authored map and
sticker migrations without knowing the canonical set already covered those
domains. Every one of the colliding files has been neutralised to a no-op and
replaced by a reconciliation migration.

| Deprecated web migration | Collides with | Replacement |
|---|---|---|
| `20260828193000_sticker_packs.sql` | `20260716000000_telegram_stickers.sql` | `20260831052300_reconcile_sticker_schema.sql` |
| `20260828230000_map_premium.sql` | `20260712200000_map_p0_features.sql` | `20260831053000_reconcile_map_schema.sql` |
| `20260829010000_map_premium_fix.sql` | `20260712200000_map_p0_features.sql`, `20260803020000_social_map_features.sql` | `20260831053000_reconcile_map_schema.sql` |

### 4.1 `sticker_packs` and `stickers`

| Canonical | Web assumed |
|---|---|
| `sticker_packs(title, cover_url, cover_lottie_url, created_by, is_animated)` | `sticker_packs(slug, title, author_id, cover_url, is_public, sticker_count, install_count)` |
| `stickers(emoji NOT NULL, image_url, lottie_url, video_url, thumbnail_url, type NOT NULL CHECK, position)` | `stickers(file_url NOT NULL, thumb_url, emoji, width, height, position)` |
| `user_sticker_packs(user_id, pack_id, updated_at)` | `sticker_pack_installs(user_id, pack_id, position, installed_at)` |
| `recent_stickers(user_id, sticker_id NOT NULL, use_count, last_used)` | `sticker_usage(user_id, file_url, kind, use_count, last_used_at)` |

Resolution:

- Canonical tables stay authoritative.
- `slug`, `is_public`, `sticker_count`, `install_count` added to `sticker_packs`.
- `file_url`, `thumb_url`, `width`, `height` added to `stickers` and backfilled
  from `image_url` / `video_url` / `lottie_url` / `thumbnail_url`. A trigger
  keeps both namings in sync in either direction.
- `stickers.type` is `NOT NULL` with no default, which would break any web
  insert. It now defaults to `'static'`.
- `user_sticker_packs` is the single install table. It gained `position`.
  **The web client must stop writing `sticker_pack_installs`.**
- `sticker_usage` was kept, because it is the only genuinely new capability:
  `recent_stickers.sticker_id` is a required foreign key, so externally hosted
  GIFs have no row to point at. `touch_sticker_usage()` writes `sticker_usage`
  and mirrors into `recent_stickers` when the item is a real sticker, so the
  Flutter client keeps working unchanged.

Also note: the deprecated web migration ended with a `DO` block that dropped
every check constraint on `messages` matching `message_type`. It was a no-op,
because the column is called `media_type`, but it was dangerous and is gone.

### 4.2 `saved_places`

| Canonical | Web assumed |
|---|---|
| `list_id uuid -> saved_place_lists(id)` | `collection text` |
| `name, latitude, longitude, address, notes, icon, is_favorite, visited_at` | `name, latitude, longitude, address, category, place_key` |

Grouping is canonically done through a real `saved_place_lists` table, not a
free-text label. This mismatch produced the `collection` error.

Resolution: `collection`, `category`, `place_key` added. A trigger derives
`collection` from the linked list name and `place_key` from the coordinates, so
rows created by either client group correctly on both.

### 4.3 `place_reviews`

| Canonical | Web assumed |
|---|---|
| `place_id TEXT NOT NULL`, `place_name TEXT NOT NULL` | `place_key TEXT` |
| `review_text` | `comment` |
| `categories[]`, `category_ratings`, `photo_urls[]`, `helpful_count`, `visit_date` | none |
| `UNIQUE(user_id, place_id)` | `UNIQUE(user_id, place_key)` |

Resolution: `place_key` and `comment` added as aliases and backfilled. A
`BEFORE INSERT OR UPDATE` trigger fills the `NOT NULL` `place_id` and
`place_name` from them, so web inserts no longer violate the constraints.

The canonical set also already provides richer review features the web client
does not use yet: `review_helpful_votes` with an automatic `helpful_count`
trigger, and `get_place_reviews(place_id_param, limit_count)`.

### 4.4 Ratings

The web client calls `place_rating_summary(p_place_key)`. The canonical
equivalent is the `place_statistics` **materialized view**, refreshed only when
`refresh_place_statistics()` runs. The reconciliation migration defines
`place_rating_summary` against the base table so it stays live, and it matches
on either `place_key` or `place_id`.

### 4.5 Genuinely new, kept

- `place_visits` plus `track_place_visit()` - passive dwell tracking. Distinct
  from `check_ins`, which is deliberate and social. `track_place_visit` extends
  a recent nearby visit rather than inserting duplicates.
- `taxi_providers` - external operators we deep-link into. Distinct from
  `taxi_live_locations`, which tracks our own drivers. We are not running a
  fleet, so deep-link templates and tariffs stay in the client and only the
  enable/disable state and ordering are stored.
- `products.latitude` / `products.longitude` plus `products_geo_idx`.

### 4.6 Still to verify

- `20260803030000_messages_map_integration.sql` against the location fields in
  `message-protocol.md`.
- `20260803000000_advanced_routing.sql` against `src/lib/routing.ts`.
- The map tables use the `earthdistance` extension (`ll_to_earth`, `earth_box`,
  `earth_distance`). The web client uses plain bounding-box arithmetic. Not a
  conflict, but the two produce slightly different results near the poles, which
  is irrelevant for Uzbekistan.

---

## 5. Test data in the migration chain

`20260625000001_test_messages_data.sql` and
`20260625000002_create_test_conversations.sql` insert fixture rows. They are
part of the ordered chain, so they run against production on a full replay.

Action: confirm both are idempotent and either gate them behind an environment
check or move them out of `migrations/` into a seed script.

---

## 6. Procedure for a schema change

1. Search the authoritative directory for the domain first. Assume it already
   exists.
2. If it exists, write an `ADD COLUMN IF NOT EXISTS` migration. Do not write a
   new `CREATE TABLE`.
3. If a naming mismatch is unavoidable, add the alias column and a sync trigger
   rather than renaming anything.
4. Add the columns and RPCs to section 3 of this file.
5. If chat payloads are affected, update `message-protocol.md` in both repos.
6. Ship the read path on both clients before enabling any writer.
7. Apply with `supabase db push`, or paste into the SQL editor in filename order.

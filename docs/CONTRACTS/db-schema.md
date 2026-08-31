# Database Schema Ownership Contract

**Status:** normative. Duplicated verbatim in both client repos.

Both clients talk to **one shared Supabase project**. There is no second
database, no staging split, and no per-client schema. Every table is therefore a
cross-client contract.

Related contracts:

- `docs/CONTRACTS/message-protocol.md`
- `docs/CONTRACTS/feature-parity.md`

---

## 1. Two migration streams, one database

**Correction.** An earlier version of this document claimed
`alsamos-superapp/supabase/migrations/` was the single source of truth. That was
wrong and caused real damage: work was authored against a schema that another
active stream had already replaced. Both repositories carry large, actively
maintained migration sets, and **neither is a superset of the other**.

| Stream | Location | Size | Character |
|---|---|---|---|
| **A - Flutter** | `alsamos-superapp/supabase/migrations/` | ~120 files | Hand-authored, descriptive filenames, timestamp-ordered. Owns the older foundational schema. |
| **B - Web** | `socialalsamos/supabase/migrations/` | ~110 files | Mixed: ~60 tool-generated UUID filenames (2025-12 to 2026-08), then ~45 hand-named files from `20260708` onward. Owns most recent feature work. |
| Deprecated | `alsamos-superapp/*.sql` at repo root | 6 files | Ad-hoc operational scripts, not migrations. |

### Rule

> Before writing any migration, list **both** directories and search for the
> table name in each. Assume the table already exists in the other stream.

Ownership is per domain, not per repository. Section 3 records which stream owns
which domain. Author new migrations in the stream that already owns the domain.

### Known stream hazards

**Duplicate timestamps in stream B.** Three timestamps are used by two files
each, so their relative order is undefined:

| Timestamp | Files |
|---|---|
| `20260828230000` | `create_flow_foundation.sql`, `map_premium.sql` |
| `20260829010000` | `user_stickers.sql`, `map_premium_fix.sql` |
| `20260830110000` | `publish_formatted_content.sql`, `verified_product_reviews.sql` |

In each pair one file is now a retracted stub, so the ambiguity is currently
harmless. Do not reintroduce it.

**Root-level scripts (stream A).**
`ADMIN_DIAGNOSTIC_COMPLETE.sql`, `ADMIN_FIX_UNIFIED.sql`,
`APPLY_MIGRATION_NOW.sql`, `APPLY_NOW_PRODUCTION.sql`, `DEPLOY_ADMIN_NOW.sql`,
`INTROSPECT_SCHEMA_NOW.sql`. One-off repair and introspection scripts, not
timestamp-ordered, possibly destructive. Fold anything still needed into a
proper migration, then move these to `docs/legacy-sql/`.

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

### Trap 1: index before column

The most expensive recurring mistake in this project.

```
ERROR:  42703: column "collection" does not exist
ERROR:  42703: column "is_public" does not exist
```

`CREATE TABLE IF NOT EXISTS x (...)` is a **no-op** when `x` already exists. None
of the new columns are created. The following `CREATE INDEX` or `CREATE POLICY`
then references a column that was never added, and the migration aborts.

> When a migration creates a table with `IF NOT EXISTS`, it must also issue
> `ADD COLUMN IF NOT EXISTS` for every column it depends on, **before** any
> index or policy referencing them.

### Trap 2: competing compatibility triggers

When two streams name the same concept differently, the fix is a bridge: alias
columns plus a `BEFORE INSERT OR UPDATE` trigger that mirrors them. But **only
one bridge per table**. Two triggers mirroring overlapping column sets on the
same row fight each other and the outcome depends on trigger name ordering.

> Before adding a compatibility trigger, check `pg_trigger` and both migration
> streams for an existing bridge on that table.

### Trap 3: partial unique indexes and upserts

PostgREST `onConflict: 'a,b'` becomes `ON CONFLICT (a, b)`, which Postgres can
only infer from a **non-partial** unique index on exactly those columns. A
partial unique index (`WHERE b IS NOT NULL`) does not satisfy inference and
fails with `42P10`. NULLs are distinct in unique indexes, so a full unique index
is normally safe.

---

## 3. Domain ownership

| Domain | Owner | Notes |
|---|---|---|
| Chat core, groups, channels | A | `phase2_message_interactions`, `group_b_groups_channels`, `speed_up_messages_initial_load` |
| Mentions, hashtags | A, patched by B | B adds `hashtag_normalization_compat` |
| Chat media and location | A | `group_c_media_location`, `messages_map_integration`; B adds `live_location_resume` |
| Message drafts | **B** | `message_drafts`, `message_draft_tombstones` |
| Polls | A, extended by B | B adds `poll_types_video_jobs_music_ingest`, `create_p0_poll_storage`. Tallies live in `message_poll_votes`. |
| **Stickers** | **B (entirely)** | See 4.1. A's `telegram_stickers` is the historical base only. |
| Calls | A, **canonicalised by B** | See 4.6. B adds `call_invite_lifecycle`, `canonical_call_history`. |
| Map | **A** | `map_p0_features`, `social_map_features`, `advanced_routing`. B's map migrations are retracted. |
| Marketplace | A, **actively extended by B** | B owns checkout, order lifecycle, variants, wallet top-ups, seller stats |
| Posts, stories, create flow | **B** | `create_flow_foundation`, `unified_story_foundation`, `collaboration_lifecycle`, `scheduled_post_publisher` |
| Search | split | A `global_search`, `discovery_modernization`; B `first_party_global_search` |
| Auth and identity | **B** | `auth_alsamos_identity`, `auth_identifier_login`, `auth_2fa_devices`, `profile_photos` |
| Admin | A | `add_admin_role_system`, `batch4_admin_reliability` |
| Settings and privacy | A | `settings_backend_columns`, `privacy_features`, `notification_settings` |
| Storage buckets | **B** | `media_storage_bucket`, `post_music_private_storage` |
| Test fixtures | A | `test_messages_data`, `create_test_conversations` |

---

## 4. Collisions: resolved and retracted

### 4.1 Stickers - RECONCILIATION RETRACTED

**Stream B owns stickers completely.** Do not author sticker schema in stream A.

B's sticker stack:

| Migration | Adds |
|---|---|
| `20260829000500_sticker_system.sql` | `slug`, `name`, `icon_url`, `default_kind`, `source`, `owner_id`, `is_premium`, `is_public`, `review_status` on packs; `kind`, `full_url`, `preview_url`, `keywords` on stickers |
| `20260829010000_user_stickers.sql` | user-uploaded stickers |
| `20260829020000_sticker_pack_sharing.sql` | pack sharing |
| `20260829030000_story_stickers.sql` | story stickers |
| `20260829040000_sticker_trends_moderation.sql` | `sticker_usage_events`, `sticker_reports`, `sticker_moderators`, `log_sticker_usage()`, `trending_stickers()`, NSFW fields |
| `20260830162000_sticker_schema_compat.sql` | **the bridge**: triggers `sticker_pack_compat_columns`, `sticker_compat_columns` |

A's `20260716000000_telegram_stickers.sql` remains the historical base
(`title`, `cover_url`, `created_by`, `is_animated`; `emoji`, `image_url`,
`lottie_url`, `video_url`, `type`; `user_sticker_packs`, `recent_stickers`).

**Retracted:** `20260831052300_reconcile_sticker_schema.sql` (stream A) is now a
no-op stub. It duplicated B's columns, added a **second** pair of compat
triggers to the same tables (Trap 2), created a third parallel recents table,
and was unaware of the constraint `stickers_public_requires_nsfw_check`
(`is_public = false OR nsfw_checked_at IS NOT NULL`).

**Also retracted:** `socialalsamos/.../20260828193000_sticker_packs.sql`.

**Kept:** `20260831060000_sticker_usage_bridge.sql` defines only
`touch_sticker_usage(file_url, kind, sticker_id)`, the entry point
`src/lib/stickerRecents.ts` calls. It creates no tables and fans out to
`sticker_usage_events` and `recent_stickers`, guarded with `to_regclass` and
`EXECUTE` so a missing table degrades to a no-op instead of failing a message
send.

### 4.2 `saved_places`

| Canonical (A) | Web assumed |
|---|---|
| `list_id uuid -> saved_place_lists(id)` | `collection text` |
| `notes` | `note` |
| no such columns | `external_id`, `external_source` |

Grouping is canonically a real `saved_place_lists` table, not a free-text label.
This produced the original `column "collection" does not exist` error.

**Resolved** by `20260831053000_reconcile_map_schema.sql`: adds `collection`,
`category`, `place_key`; a trigger derives `collection` from the linked list name
and `place_key` from coordinates. External references are carried by `place_key`;
`external_id` / `external_source` were never added and must not be used.

### 4.3 `place_reviews`

| Canonical (A) | Web assumed |
|---|---|
| `place_id TEXT NOT NULL`, `place_name TEXT NOT NULL` | `place_key TEXT` |
| `review_text` | `comment` |
| no such columns | `latitude`, `longitude` |
| `UNIQUE (user_id, place_id)` | upsert on `(user_id, place_key)` |

**Resolved** by `20260831053000_reconcile_map_schema.sql` (alias columns plus a
trigger filling the `NOT NULL` canonical fields) and
`20260831061000_place_reviews_upsert_key.sql` (full unique index on
`(user_id, place_key)`, required for upsert inference - Trap 3).

Coordinates are **not** stored on reviews. `place_key` encodes them
(`geo:<lat>,<lng>` at 5 decimals) or an external id (`<source>:<id>`,
`alsamos:<canonicalId>`).

B's richer review features are unused by the web map so far:
`review_helpful_votes` with an automatic `helpful_count` trigger, plus
`get_place_reviews(place_id_param, limit_count)`.

### 4.4 Ratings

The web client calls `place_rating_summary(p_place_key)`. The canonical
equivalent is the `place_statistics` **materialized view**, refreshed only by
`refresh_place_statistics()`. The reconciliation defines
`place_rating_summary` against the base table so it stays live, matching on
either `place_key` or `place_id`.

### 4.5 Genuinely new, kept

- `place_visits` plus `track_place_visit()` - passive dwell tracking, distinct
  from the deliberate social `check_ins`. Extends a recent nearby visit rather
  than inserting duplicates (6 hour / 0.0015 degree window).
- `taxi_providers` - external operators we deep-link into, distinct from
  `taxi_live_locations` (our own drivers). Deep-link templates and tariffs stay
  in `src/lib/taxiProviders.ts`; only enable state and ordering are stored.
- `products.latitude` / `products.longitude` plus `products_geo_idx`.

### 4.6 `call_history` - VERIFIED ALIGNED

`20260830172000_canonical_call_history.sql` (stream B) makes the **database**
the author of call history. A trigger on `video_calls` writes exactly one
`call_history` row and one chat bubble per finished call, deduplicated by a
partial unique index on `messages(call_id)`.

The bubble's `content` is JSON:

```json
{
  "call_id": "uuid",
  "type": "audio | video",
  "status": "ended | missed | declined | cancelled",
  "duration": 42,
  "timestamp": "...",
  "caller_id": "uuid",
  "callee_id": "uuid"
}
```

This **matches** the shape already implemented in
`message_payload_compat.dart` (`canonicalCallHistoryPayload`). Two notes:

- `duration` is integer **seconds** and is `null` for calls that never started.
- `call_id` is an additional field; clients should tolerate and ignore it.
- `messages.call_id` is a real column now. Clients must not write
  `call_history` messages themselves; the trigger owns that.

---

## 5. Client alignment log

Schema fixes are only half a change. Recorded here so the other client can
follow.

| Change | File | Status |
|---|---|---|
| Read stickers via `full_url` with `file_url` fallback | `src/hooks/useStickerPacks.ts` | already handled by B |
| Stop using `sticker_pack_installs`; use `user_sticker_packs` | web sticker install path | **open** |
| `notes` not `note`; drop `external_id` / `external_source` | `src/hooks/useSavedPlaces.ts` | done |
| Drop `latitude` / `longitude` / `updated_at` from review payload | `src/hooks/usePlaceReviews.ts` | done |
| Render `sticker` / `gif` without a bubble background | Flutter presentation | **open** |
| Render `Message.callHistory` as a system row | Flutter presentation | **open** |
| Confirm `location_payload` and `metadata.location` are written together | `messages_repository.dart` | **open (D4)** |

---

## 6. Test data in the migration chain

`20260625000001_test_messages_data.sql` and
`20260625000002_create_test_conversations.sql` (stream A) insert fixture rows and
are part of the ordered chain, so they run against production on a full replay.
Confirm both are idempotent, then gate them behind an environment check or move
them out of `migrations/`.

---

## 7. Procedure for a schema change

1. List **both** migration directories. Search for the domain in each.
2. Identify the owning stream from section 3. Author there.
3. If the table exists, write `ADD COLUMN IF NOT EXISTS`. Never a new
   `CREATE TABLE`.
4. If a naming mismatch is unavoidable, check for an existing compatibility
   bridge first. Extend it rather than adding a second one.
5. If the client upserts, ensure a non-partial unique index matches the
   conflict target exactly.
6. Record the domain, columns and RPCs in section 3, and any client work in
   section 5.
7. If chat payloads are affected, update `message-protocol.md` in both repos.
8. Ship the read path on both clients before enabling any writer.

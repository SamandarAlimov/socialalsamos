# Legacy media incident: 2026-09-06

## Correction of the previous diagnosis

Commit `1261376` incorrectly treated a failed public media URL as grounds to
remove a saved reference and delete its `post_media` row. It also downgraded
video/reel/short posts with empty URL arrays to text, including rows unrelated
to the single reported video. That SQL was not an appropriate media repair.

The subsequent `611e164` commit replaced that migration with a no-op marker and
merged structured and legacy playback candidates. This work builds on that
commit; it does not revert other contributors' changes.

The production REST API returned both records for the reported post during this
investigation (read-only requests on 2026-09-06):

- Post `938df40f-0d8c-4a8e-86d9-c84299057803` still has `media_type = video` and
  its original `media_urls` entry.
- Media row `d1033ca1-dacb-4a3b-833f-b74f0322c8de` still has the same URL at
  position zero; `storage_bucket` and `storage_key` are null.

This confirms preservation of these specific records. It is not a historical
audit of every user record, nor proof that the underlying binary is missing or
present. No production database writes or object mutations were performed.

## History and observable failure

| Change | Effect relevant to the incident |
| --- | --- |
| `d734c91` (2026-08-22) | Added legacy storage reads only for paths containing `/create/post/`, `/create/story/`, or `/create/reel/`. Older `user-id/timestamp.mp4` paths do not match. |
| `4dab97c` (2026-08-25 snapshot) | Home passed `posts.media_urls` directly to the carousel. |
| `3091703` (2026-08-28) | Structured media took precedence; any `post_media` row suppressed the entire legacy URL array. A partial backfill could hide additional original attachments. |
| `09de145`, `c686bcc` (2026-09-02) | Bucket migrations set `message-attachments` and `chat-media` to private. Existing `/object/public/` URLs do not become signed automatically. Owner/participant reads do not cover every viewer of a public post. |
| `1261376` (2026-09-05) | Added destructive metadata cleanup and hid failed carousel media. |
| `611e164` (2026-09-06) | Neutralized cleanup and added signed candidates, but disabled failed album positions and still needed appropriate Storage SELECT access. |

The public REST response exposed 26 posts with 35 media references. All 35
referenced the current Supabase project. Bounded range requests returned 12
successful responses and 23 `NoSuchBucket` responses. This sample includes only
records visible to the anonymous role, not all private user data.

The successful legacy responses had `CF-Cache-Status: HIT`, with cached ages of
roughly 9-14 days. Crucially, the following exact video paths returned 206 at
the cached URL but 400 with a JSON `NoSuchBucket` body on a fresh query-string
request:

- `message-attachments/e71015f8-3c32-4359-afa8-b118ed7f8fac/1768572257426-3l5qi.mp4`
- `message-attachments/e938d731-122f-4c10-912e-5cbd1bb325a0/1769446755938-5dxmp.mp4`

That explains how some older posts can still play while others fail without
establishing that individual objects were deleted. The evidence is consistent
with a private or inaccessible origin bucket. Confirm bucket state and object
inventory through the read-only SQL audit before applying the policy.

Supabase documents that `NoSuchBucket` can indicate missing permission to an
existing bucket: https://supabase.com/docs/guides/storage/debugging/error-codes

Git history records SQL intent, not proof of when an operator ran it. Exact
production bucket state and the time it changed remain unverified.

## Changes and verification

- Every album position remains navigable after image/video failure, with retry
  on that position. No automatic removal or skip of the failed item.
- Retry refreshes structured and legacy signed URL candidates.
- Metadata identifying the external `alsamos-media` provider uses the dedicated
  signer instead of accidentally requesting a Supabase bucket of that name.
- `20260906010535_legacy_post_storage_read_access.sql` adds a SELECT-only policy
  for legacy objects referenced by a visible, published post. Author-folder
  matching prevents publishing another user's object key to gain access. The
  existing post and post_media RLS remain in force. Buckets stay private.
- The policy recognizes this project's historical object URLs and explicit
  structured keys. It does not guess ownership for foreign URLs, relocate data,
  or change stored references. Unrecognized legacy formats require inspection.

All 19 targeted regression tests passed. They cover candidate preservation, image/video errors, partial and
complete album failures, retries, provider routing and foreign-project URLs.
An isolated PGlite fixture executes the no-op marker and the policy twice,
asserts unchanged posts/media/objects/buckets, and verifies public/friends/private,
draft, unrelated-chat and forged-reference access. It never connects to Supabase.

Playwright checks with the real carousel and video player passed at 1366x900 and
390x844: failed positions remain selectable, retry works, no horizontal overflow
or uncaught browser errors occurred. The temporary browser fixture was removed.

The production build and targeted ESLint checks passed. Full TypeScript checking
still reports pre-existing errors in `MiniAppViewer.tsx`, `useAdminAccess.ts`,
`useHomeRecommendations.ts`, `AdminAdsIntegrityPage.tsx`, and
`PostPermalinkPage.tsx`. None of those files were changed in this repair.

Run the SQL fixture with an external PGlite installation, without adding a
production dependency:

```text
node scripts/test-legacy-media-access.mjs <path-to-@electric-sql/pglite/dist/index.js>
```

## Deployment and access limits

At investigation time, GitHub reported Vercel failure for `611e164`, linking to
the build-rate-limit page. The known earlier successful frontend deploy therefore
does not prove the corrective code is live.

The connected Supabase account lists a different, inactive project and denies
SQL access to production `mbhjganbihamoiqmankv`. SSH to `92.4.76.166:22` times
out. The dedicated media API independently returns HTTP 530. These prevent
production Storage verification and infrastructure repair in this session.

Do not claim full playback recovery until the read-only inventory audit,
authorized signed playback, and a successful frontend deploy have been checked.
Do not run SQL from historical commit `1261376`. If it was previously executed
elsewhere, use a verified pre-change record snapshot to plan restoration;
rewriting a migration file cannot undo already-executed SQL.

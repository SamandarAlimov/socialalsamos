# Prompt for Lovable — Alsamos production sync

> **Purpose:** Lovable must NOT write, redesign, replace, or refactor application code. All code, SQL, UI/UX and security logic are already maintained in this GitHub repository. Lovable is only used as the authorized Supabase/Lovable execution environment to apply the repository state to production.
>
> We have a very limited credit budget. Perform this as **one coordinated deployment/smoke-test session**. Do not spend credits asking broad questions or generating alternative implementations.

## Immediate Main Deploy / SQL Repair

Use GitHub `main` as the source. Codex has already pushed the runtime repairs.

- Repository: `SamandarAlimov/socialalsamos`
- Branch: `main`

Apply this SQL repair first if production still shows `post_views`,
`increment_post_views`, or `get_eligible_ads_*` 404/403 errors:

```text
https://raw.githubusercontent.com/SamandarAlimov/socialalsamos/main/supabase/migrations/20260905214000_feed_runtime_repair.sql
```

The historical legacy-video migration below is now intentionally
**non-destructive**. Before applying it, confirm the GitHub version contains no
`DELETE`, no removal from `posts.media_urls`, and no `media_type` downgrade. It
is a migration-history marker only; legacy media recovery is handled by the
latest runtime code, which merges all historical media references and retries
fallback candidates without deleting user data.

```text
https://raw.githubusercontent.com/SamandarAlimov/socialalsamos/main/supabase/migrations/20260905224500_repair_broken_legacy_video_urls.sql
```

If production still shows `publish_post_draft`, wallet ledger/top-up, or story
draft RPC/table 404 errors, continue applying every pending migration from
GitHub in filename order. Do not hand-edit the SQL in Lovable.

### Dedicated media server — mandatory

All **new** binary uploads, including Messages audio/video/voice notes,
attachments, post media and story media, must go to the dedicated Alsamos media
server. Supabase Storage is legacy-read compatibility only. Do not enable or
reintroduce a silent Supabase upload fallback.

Deploy the latest `main` frontend/serverless API files and configure:

```text
MEDIA_API_URL=https://api.alsamos.com
VITE_MEDIA_API_URL=https://api.alsamos.com
VITE_MEDIA_PUBLIC_BASE_URL=https://media.alsamos.com/media
VITE_MEDIA_ALLOW_SUPABASE_FALLBACK=false
```

Then verify the infrastructure behind `https://api.alsamos.com/api/media/presign`
and `https://media.alsamos.com/media` is healthy. The same-origin frontend route
`/api/media-presign` must return a successful upstream response for an
authenticated upload. If it returns `530`, `502`, DNS, TLS or origin errors,
report the exact infrastructure error and fix/deploy the existing media service;
**do not** route the upload to Supabase Storage and do not rewrite application
code in Lovable.

For a Messages audio/video smoke test, confirm the resulting new media URL/key is
from `media.alsamos.com` / the `alsamos-media` provider and that no new object is
written to Supabase legacy buckets such as `media`, `media-private`,
`message-attachments`, `chat-video` or `chat-audio` as a fallback.

Lovable must not redesign or rewrite this feature. Codex already wrote the code.
Use Lovable credits only to run/deploy the repository state and report exact
errors if the deployment environment blocks something.

### Real AI Sandbox Test Deployment

Goal: make AI code execution real for testing now, even before production launch.

Deploy these files exactly from the branch:

- `supabase/functions/_shared/sandbox.ts`
- `supabase/functions/_shared/aiTools.ts`
- `supabase/functions/code-sandbox/index.ts`
- `supabase/config.toml`
- `sandbox/server/**`

Set Supabase Edge Function secrets for testing:

```text
SANDBOX_API_URL=https://sandbox.alsamos.com
SANDBOX_API_KEY=alsamos-dev-sandbox-change-before-production
```

If `sandbox.alsamos.com` is not configured in Lovable's environment yet, deploy
the sandbox server from `sandbox/server` to any HTTPS-capable runtime Lovable can
use for a Docker/Node service, then set `SANDBOX_API_URL` to that HTTPS URL.
If Lovable cannot host Docker services, do not spend credits trying to rewrite
the sandbox. Report exactly: `Docker/Node service hosting unavailable`, and
still deploy the Supabase functions so they are ready once the URL exists.

After setting secrets, deploy:

```text
supabase functions deploy ai-agent
supabase functions deploy code-sandbox
```

Do one minimal sandbox smoke test only:

```json
{"language":"python","code":"print(2 + 2)","timeoutMs":5000}
```

Expected result: `stdout` contains `4`, `exitCode` is `0`, and the response does
not say demo/mock/fallback.

## Repository / production rules

1. Use the connected Alsamos production Supabase project.
2. Read the repository's existing `supabase/migrations` and Supabase migration history first.
3. Apply **only migrations that exist in GitHub and are not yet applied**, in filename order.
4. Never reset the database, never drop production data, never recreate the project, never replace existing auth users, and never run destructive "clean start" operations.
5. Never delete or rewrite a user's post/media metadata merely because a media URL returns 403/404 or playback fails. Preserve both `posts.media_urls` and `post_media` history.
6. If one migration fails, stop at that migration and return the exact PostgreSQL error, filename and statement context. Do **not** invent a replacement migration.
7. Do not edit SQL from Lovable. The source of truth is GitHub.
8. Do not create demo/sample users, fake wallet balances, fake ads, fake marketplace orders, fake feedback cases or fake analytics.

## Migrations that are especially important to verify

The repository contains multiple platform upgrades that production may still be missing because GitHub deployment credentials were previously unavailable. Verify migration history and apply every pending file, including the current platform layers for:

- scalable Admin RBAC / `super_admin` and granular permissions;
- Trust & Safety / moderation, account restrictions and audit foundations;
- Ads normalized campaign hierarchy, delivery, fraud/integrity, attribution and experiments;
- Feedback & Support Center tables/RLS/RPC hardening;
- Wallet / P2P ledger and transfer RPCs;
- AI personalization / explicit recommendation interests;
- Marketplace/commerce integrations;
- Mini Apps platform migrations;
- **`20260905183500_mini_app_wallet_settlement.sql`** — explicit Mini App payment intent + Wallet settlement;
- **`20260905185000_search_activity_events.sql`** — private append-only search activity ledger, real search frequency, clear-history RPC and AI/search insight support.

Do not re-run already recorded migrations merely because they are listed here.

## Edge Functions / server functions

After migrations are synchronized, deploy the repository versions of the functions that are newer than production. At minimum verify and deploy when changed:

- `ai-agent`
- `code-sandbox`
- `mini-app-init-data`
- any Mini Apps proxy/runtime function used by the current repository
- `wallet-payme-create`
- any payment/provider callback function required by the current Wallet implementation

Do not rewrite these functions in Lovable. Deploy the GitHub source exactly.

### AI requirement

`ai-agent` must run with the repository's current first-party tools. The deployed version must recognize the user-scoped tools for:

- own search insights based on the real append-only search activity ledger when available;
- own payment / Wallet history;
- own Marketplace orders and purchased line items;
- own saved Map places and real stored coordinates;
- reading recommendation preferences;
- updating real Home/Videos recommendation preferences;
- normal Alsamos tools such as posts/marketplace;
- `run_code` through the real sandbox path.

The AI must never receive a service-role key in the browser. User-private data must stay server-scoped. The service-role Edge Function must still explicitly scope every private query to the authenticated `userId`.

### Search activity requirement

After `20260905185000_search_activity_events.sql` is applied:

1. Repeated searches for the same text must create separate `search_activity_events` rows even though the visible `search_history` list is de-duplicated.
2. `my_search_insights` in the deployed `ai-agent` must prefer `search_activity_events` and only use legacy `search_history` as a compatibility fallback.
3. AI must not call legacy recent-history counts "exact frequency" when the V2 event table is unavailable.
4. `clear_my_search_history()` must delete both the visible recent history and private activity ledger for the authenticated user.
5. Anonymous access to search activity/insight RPCs must be rejected.
6. One user must never be able to read another user's search activity through RLS or RPCs.

### Mini App payment requirement

After `20260905183500_mini_app_wallet_settlement.sql` is applied:

1. `requestPayment()` may create a **pending** payment intent, but that alone must not debit the Wallet.
2. Verify RPCs exist for:
   - `mini_app_payment_create`
   - `mini_app_payment_confirm`
   - `mini_app_payment_cancel`
3. Confirm only the authenticated payer can confirm/cancel their intent.
4. Confirm the merchant is derived from the approved Mini App owner; the browser must not be able to substitute another recipient.
5. Confirm settlement uses the canonical Wallet transfer/ledger logic and creates debit/credit ledger history.
6. Confirm insufficient balance does not move money.
7. Confirm cancelling an intent does not move money.
8. Confirm a paid intent cannot be charged twice when the same confirmation is retried.

## Secrets / configuration

Do not print secret values back to chat/logs. Only report whether each required secret/config is present or missing.

Verify the production environment has the secrets actually referenced by the deployed repository functions. Important examples may include:

- AI provider key(s), e.g. `GEMINI_API_KEYS` and/or the configured Lovable AI fallback key;
- Supabase URL/service-role values that Edge Functions receive through the platform environment;
- Payme merchant secrets if Payme is intended to be live;
- Mini Apps proxy/runtime origin/config if that deployment requires it;
- dedicated media service/MinIO credentials referenced by the existing media server runtime.

If a secret is missing, do not fabricate a value. Report the exact environment variable name only.

## Smoke tests after deployment

Run non-destructive smoke tests with an authenticated test/admin account already present in production. Do not create artificial production records beyond a temporary pending object that you immediately cancel when required by a test.

Verify:

1. Existing login still works.
2. Admin access/RBAC queries do not error.
3. `/feedback` backend can create/read the current user's case under RLS.
4. Wallet can load and `ensure_my_wallet`/ledger calls do not error.
5. P2P recipient lookup/transfer RPCs exist (do not transfer real money just for testing).
6. AI agent function responds and exposes its current tool list.
7. AI `run_code` reaches the real sandbox function rather than returning a demo result.
8. AI private data tools reject anonymous calls and scope authenticated calls to the current user.
9. AI can read the current user's search insights, Marketplace orders and saved Map places without accessing another user's records.
10. Repeating one harmless search query twice increases its V2 search frequency twice; then clean up that test activity with `clear_my_search_history()` only if using a dedicated test account.
11. Home/Videos recommendation preference tables/RPC access do not error.
12. Marketplace product/read APIs still work.
13. Mini App init-data function works for an approved app with correct permissions.
14. Mini App payment create -> cancel flow works without changing Wallet balance.
15. Mini App payment confirmation path is present; do not perform a real-value payment merely for smoke testing unless a dedicated zero-risk test merchant/account already exists.
16. An old Home post with a historical media URL remains in the feed even if its first media candidate fails; no post/media row is deleted.
17. A new Messages audio/video upload uses the dedicated media server and does not create a Supabase Storage fallback object.
18. `/api/media-presign` succeeds without 530/502/DNS/TLS errors; if it does not, report the media infrastructure blocker exactly and stop that upload test rather than falling back to Supabase.

## Final response format

Return only a concise deployment report containing:

- production project identifier/name used;
- migrations applied (filenames);
- migrations already applied/skipped;
- Edge Functions deployed;
- media server health (`presign`, upload, public/private read) and whether any Supabase upload fallback occurred;
- smoke tests passed/failed;
- missing secret/config **names only**;
- any exact blocker/error requiring a GitHub code change or media-server infrastructure change.

Do not propose or generate new UI/code unless a concrete repository error is found. We will fix code in GitHub ourselves.

# Alsamos Supabase production deployment

The production backend is deployed from one workflow:

- `.github/workflows/deploy-supabase.yml`

It is the single deployment path for versioned database migrations, hosted Auth
configuration, Supabase runtime secrets that are present in GitHub Actions,
all Edge Functions, and post-deploy backend health checks.

## Required GitHub Actions secrets

Configure these in **Repository Settings -> Secrets and variables -> Actions**:

- `SUPABASE_ACCESS_TOKEN`
- `SUPABASE_DB_PASSWORD`
- `SUPABASE_PROJECT_REF`

No production credential belongs in `.env`, `supabase/config.toml`, source code,
or a committed workflow file.

Optional third-party credentials may also be stored as GitHub Actions secrets.
The workflow currently syncs the known Alsamos search, crawler, cron, Giphy,
OpenAI, and Payme values when they are configured. Every deploy also scans all
Edge Function source files and uploads a names-only runtime-secret inventory;
secret values are never printed.

## First deployment to a fresh Supabase project

Run **Deploy Supabase Production** manually with `mode=auto`.

`auto` queries the remote database through the Supabase Management API. If the
public schema is truly empty, the workflow uses the committed deterministic
fresh bootstrap under `supabase/bootstrap/generated/`. That bootstrap contains
the historical Alsamos migration union from `alsamos-superapp` and
`socialalsamos`. It then reconciles the `socialalsamos` migration history and
runs any newer migrations from `supabase/migrations`.

Fresh mode is deliberately refused when the database is not empty. A partially
populated (`mixed`) schema also fails closed rather than attempting a destructive
repair.

The fresh bootstrap does **not** call `db reset` and does not intentionally drop
remote data.

## Normal long-term deployment

After the first successful bootstrap, pushes to `main` that change Supabase
schema/functions/config/deployment tooling automatically use incremental mode:

1. link the production project using GitHub Secrets;
2. run pending versioned migrations with `supabase db push`;
3. push `supabase/config.toml` (Auth and function configuration);
4. sync configured runtime secrets;
5. auto-discover every `supabase/functions/*/index.ts` function and deploy it;
6. derive each function's `verify_jwt` behavior from `supabase/config.toml`;
7. verify social tables, Marketplace foundation, Global Search index, wallet
   RPC, Auth-to-profile trigger/backfill, and core RLS;
8. print the final migration state.

Adding a new Edge Function does not require editing the workflow: a directory
with `index.ts` is discovered automatically. Shared directories beginning with
`_` are not deployed as functions.

## SQL policy

Production executes **versioned migrations**, not every `.sql` file in the
repository blindly. `supabase/manual/` contains manual/audit/legacy scripts and
is intentionally excluded from automatic production execution. Test-fixture
migrations excluded by the bootstrap manifest are marked as applied without
loading test data into production.

## Auth users created before the schema existed

`20260913090000_backfill_existing_auth_profiles.sql` creates missing
`public.profiles` rows for Auth users that already existed before the public
schema was restored. Future Auth users are handled by the normal
`auth.users -> public.handle_new_user() -> public.profiles` trigger.

## Cloudinary

Cloudinary is separate from the Supabase deployment. The current media adapter
runs in the server API/Vercel layer and expects a server-only `CLOUDINARY_URL`
containing the cloud name, API key, and API secret. Do not expose it through a
`VITE_` variable and do not store it in the public repository.

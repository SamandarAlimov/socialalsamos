# Alsamos Infra Status

Updated: 2026-07-08

## Stage 1 - Ecosystem Consolidation

| Phase | Status | Proof / Blocker |
| --- | --- | --- |
| 0 - Secrets hygiene | PARTIAL | `apps/accounts/docs/oauth-clients-config.json` removed, `apps/accounts/.gitignore` now ignores `.env*` and the OAuth client registry, hardcoded `social_secret_2024_secure_key_abc123` replaced with `import.meta.env.VITE_ALSAMOS_OAUTH_CLIENT_SECRET`. Targeted scan found no remaining literal OAuth client secrets; remaining `client_secret` hits are type/UI field names. Committed and pushed in `apps/accounts` as `91f4e32`. BLOCKED: needs human approval and secure out-of-band storage location before rotating and distributing all external OAuth client secrets. |
| A - Merge schemas into social Supabase | PARTIAL | Social remote verified as `https://github.com/SamandarAlimov/socialalsamos.git`. Pushed `alsamos-web` commit `4a99084` with consolidation migration, ported Supabase functions, and `supabase/config.toml`. Static validation found no `DROP TABLE` or `CREATE TABLE profiles/notifications/user_roles/user_sessions`; only `ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS` is used for profile additions. All `auth.users` FKs in the consolidation migration use `ON DELETE CASCADE`; no `public.profiles` FK was found. BLOCKED: needs social Supabase service role key and DB connection string only for CLI `db push`; Lovable SQL editor can apply the printed SQL without CLI keys. |
| B - Unified auth | PARTIAL | Accounts, mail, and social now use shared `.alsamos.com` cookie-backed Supabase storage and point at canonical project `mbhjganbihamoiqmankv`; pushed social commit `1f33d63`, accounts commit `6680ea2`, and mail commit `fe47414` for shared auth/env examples. Cookie round-trip simulation verified an 11,038-byte auth value split into 3 chunks, read back exactly, and removed cleanly. Local production builds passed for social, accounts, and mail with Node `v24.18.0` / npm `11.16.0`. BLOCKED: real browser test on `*.alsamos.com` waits for Cloudflare/public deploy. |
| C - Storage consolidation | NEXT | Needs social Supabase service role key to create/verify buckets and policies. |
| D - Oracle public deploy | PARTIAL | Pushed frontend Docker/nginx commits: social `01ffbe4`, accounts `cb950b4`, mail `c05843b`. Root local commit `23942ac` added frontend Deployment/Service/Ingress and cloudflared Secret/ConfigMap/Deployment artifacts. BLOCKED: Cloudflare Tunnel token pending; no deploy run. |
| E - AI service | PARTIAL | Root local commit `1841582` added `services/ai` FastAPI gateway using `python:3.12-slim`, Pollinations and OpenRouter `:free` routing only, plus `infra/k8s/apps/ai-gateway.yaml` for `ai.alsamos.com` TLS. Local Python compile/run was not possible because only the Microsoft Store Python stub is installed. BLOCKED: OPENROUTER_API_KEY pending for OpenRouter free models. |
| F - Monorepo + CI/CD | PARTIAL | Root local commit `d4062e2` added `packages/auth`, `deploy/README.md`, and GitHub Actions buildx ARM64 -> GHCR plus manual K3s deploy scaffolding. Root repo has local git history but no remote. BLOCKED: GHCR/K3S secrets and root remote/push target required. |

| Phase | Status | Notes |
| --- | --- | --- |
| B - Domain, TLS, ingress, Cloudflare | PARTIAL | cert-manager v1.20.3 installed and verified. Let's Encrypt staging/prod ClusterIssuers are Ready with alsamos.company@gmail.com. Cloudflare Tunnel/DNS is blocked because alsamos.com still uses rdns1/rdns2.ahost.uz and no tunnel token was provided. |
| C - Alsamos ID (SSO) | PARTIAL | Accounts frontend and internal identity-api are deployed as ClusterIP. OIDC schema is loaded, RS256 JWKS works, and an internal PKCE code-to-token test passed. Full login UI and leaked client secret rotation still need user confirmation/work. |
| D - Supabase migration | BLOCKED | Prep scripts added. Needs Supabase project ref, DB connection string, service role key, and cutover confirmation. |
| E - Super-app first launch | PARTIAL | Social PWA deployed internally as ClusterIP and serves app/manifest/service worker. SSO wiring and public routing are not complete. |
| F - Mail | PARTIAL | Mail frontend deployed internally as ClusterIP. SSO wiring and public routing are not complete. |
| G - AI free models | PARTIAL | Pollinations-only internal AI gateway deployed with X-API-Key Secret and OpenAI-compatible endpoints. OpenRouter integration needs API key. |
| H - CI/CD | PARTIAL | GHCR build workflow and manual deploy workflow added. Needs registry/K3S secrets before use. |
| I - Monitoring and backups | DONE | kube-prometheus-stack, Loki, and promtail are deployed internally. PostgreSQL daily MinIO backup CronJob was created and manually verified. |
| J - Security hardening | DONE | fail2ban enabled. SSH password auth and root login disabled; port 22 preserved. |

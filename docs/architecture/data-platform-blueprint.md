# Alsamos Data Platform Blueprint

## Maqsad

Alsamos ma'lumotlar qatlamini bitta katta `public` schema ichidagi tasodifiy jadvallar to'plami sifatida emas, balki yirik ijtimoiy platformalarda uchraydigan domenlarga bo'lingan operatsion tizim sifatida qurish.

Aniq Instagram, Facebook, Telegram, YouTube yoki Apple ichki sxemalari ochiq emas. Shu sabab bu hujjat ularning yopiq implementatsiyasini nusxalashga urinmaydi. Ular ommaga ko'rsatgan arxitektura tamoyillari va katta consumer platformalarda ishlatiladigan standart patternlarni Alsamos ehtiyojlariga moslashtiradi:

1. transactional source of truth;
2. append-only event log;
3. derived counters / materialized aggregates;
4. search va recommendation uchun alohida index/model;
5. trust & safety uchun case-management;
6. immutable admin audit;
7. sensitive ma'lumotlarni public profildan ajratish;
8. media faylni DB'da emas, external object storage'da saqlash;
9. analytics va operational DB workloadlarini ajratish.

---

# 1. Asosiy arxitektura qatlamlari

## A. OLTP / source of truth

Postgres/Supabase'da saqlanadi:
- account/profile;
- follows/block/mute;
- posts/comments/messages;
- channels/groups;
- marketplace orders/payments metadata;
- verification;
- moderation cases;
- admin permissions;
- security state;
- settings.

Bu qatlamda har bir obyektning canonical holati turadi.

## B. Event stream

Append-only eventlar:
- page_view;
- post_impression;
- video_start/video_progress/video_complete;
- search_performed;
- profile_view;
- follow/unfollow;
- message_send/read;
- ad_impression/ad_click;
- marketplace_view/add_to_cart/purchase;
- login/security events;
- moderation/admin actions.

Yuqori hajmga chiqqanda bu eventlar Postgres'dan ClickHouse/BigQuery/Kafka pipeline tomon ko'chiriladi. Postgres faqat qisqa retention, reliable queue yoki rollup uchun ishlatiladi.

## C. Derived data

Raw obyektga qo'shib hisoblangan qiymatlarni source of truth sifatida ko'rmaslik kerak:
- follower count;
- post likes/comments/views;
- video watch time;
- DAU/MAU;
- trending score;
- seller rating;
- risk score.

Ular worker/materialized view/cache orqali qayta tiklanadigan bo'lishi kerak.

## D. External systems

- Media bytes: `api.alsamos.com` + MinIO/S3/CDN.
- DB: faqat provider, bucket/key, mime, size, checksum, dimensions, duration, ownership, moderation holati.
- Search: keyinchalik Meilisearch/OpenSearch/Typesense.
- Analytics: keyinchalik ClickHouse/BigQuery.
- Queue: worker jobs uchun Redis/Kafka/SQS-compatible layer.

---

# 2. Identity va account domain

## Mavjudni saqlash
- `profiles`
- auth users
- `user_roles`
- sessions / settings tables

## Kengaytirish

### `account_status`
Bitta user uchun bitta canonical enforcement holati:
- user_id PK/FK
- state: active / limited / suspended / disabled / deleted
- reason_code
- effective_at
- expires_at
- set_by
- source_case_id
- updated_at

`profiles.is_admin`, `profiles.role` kabi parallel authority flaglarni vaqt o'tishi bilan deprecate qilish kerak. Role source of truth `user_roles` bo'lishi kerak.

### `account_restrictions`
Bir vaqtning o'zida bir nechta capability restriction:
- id
- user_id
- capability: post / comment / message / live / ads / marketplace / payments / mini_apps
- restriction_type: block / rate_limit / review_required
- reason_code
- starts_at
- ends_at
- case_id
- created_by

### `user_identifiers`
Username/email/phone external identity mappingni audit bilan boshqarish:
- user_id
- type
- normalized_value_hash
- verified_at
- added_at
- removed_at

Raw sensitive qiymatlarni public schema'da ko'paytirmaslik kerak.

### `identity_change_history`
- username changes
- display name changes
- recovery changes
- verification-sensitive changes

---

# 3. Social graph domain

## Canonical tables
- follows
- blocks
- mutes
- close friends
- saved/bookmarks

## Qo'shimcha

### `relationship_edges`
Kelajakda relationship turlarini yagona graph sifatida analytics/recommendation uchun normalize qilish mumkin:
- actor_id
- target_id
- edge_type
- created_at
- removed_at
- metadata

Operational feature tablesni darhol o'chirmaslik kerak; bu graph layer recommendation uchun derivative bo'ladi.

### `profile_view_events`
Privacy setting bilan:
- viewer_id nullable
- profile_id
- source
- session_id
- created_at

Raw history limited retention; profile analytics rollup uzoq muddat saqlanadi.

---

# 4. Home / Posts / Stories / Channels / Comments

## Canonical content model

### `content_items`
Barcha user-generated content uchun global registry:
- id UUID
- content_type: post / story / comment / channel_post / video / marketplace_listing / mini_app_review
- owner_id
- visibility
- lifecycle_state: draft / published / archived / deleted
- created_at
- updated_at
- deleted_at

Har bir domen o'z specific jadvalini saqlaydi. `content_items` trust-safety, reports, search va analytics uchun global target beradi.

### `content_media`
- content_id
- media_asset_id
- position
- role: primary / thumbnail / attachment / preview

### `media_assets`
DB'da bytes emas, metadata:
- id
- owner_id
- provider
- bucket
- object_key
- public_url nullable
- mime_type
- bytes
- width/height
- duration_ms
- checksum_sha256
- processing_state
- moderation_state
- created_at
- deleted_at

### `content_edit_history`
- content_id
- version
- previous_payload / patch
- edited_by
- edited_at

### `content_visibility_history`
- content_id
- old_visibility
- new_visibility
- changed_by
- changed_at

Bu moderation va auditda juda muhim.

---

# 5. Videos domain

YouTube/TikTok tipidagi video tizim uchun postga bitta `media_type=video` yetarli emas.

### `videos`
- id
- content_id
- media_asset_id
- title
- description
- duration_ms
- aspect_ratio
- processing_status
- publish_status
- age_rating
- language
- category
- created_at

### `video_variants`
- video_id
- codec
- width
- height
- bitrate
- object_key
- playlist_url
- status

### `video_thumbnails`
- video_id
- media_asset_id
- type
- timestamp_ms

### `video_view_sessions`
- id
- video_id
- viewer_id nullable
- session_id
- started_at
- last_position_ms
- watch_ms
- completed
- source

### `video_engagement_rollups`
- video_id
- bucket_date
- views
- unique_viewers
- watch_ms
- completions
- likes
- comments
- shares

Raw progress eventni cheksiz Postgres'da saqlamaslik kerak.

---

# 6. Messages / Telegram-style communication

## Existing conversation/message tables remain canonical.

### `message_delivery_receipts`
Per recipient:
- message_id
- user_id
- delivered_at
- read_at
- failed_at

### `message_reactions`
- message_id
- user_id
- reaction
- created_at

### `message_edits`
- message_id
- version
- content
- edited_at

### `message_deletions`
- message_id
- actor_id
- scope: self / everyone
- deleted_at

### `conversation_member_state`
- conversation_id
- user_id
- role
- joined_at
- left_at
- muted_until
- archived_at
- last_read_message_id
- last_read_at

### `conversation_moderation_state`
Groups/channels uchun:
- slow mode
- permissions
- content filtering
- join mode
- anti-spam settings

Private message bodylarni admin analytics eventlariga ko'chirmaslik kerak. Analytics uchun faqat metadata/counters.

---

# 7. Search / Discover / Recommendation

Mavjud `recommendation_events`, ranking va search history foundation sifatida ishlatiladi.

### `content_impression_events`
- event_id
- user_id nullable
- content_id
- surface: home / discover / search / profile / videos
- position
- request_id
- algorithm_version
- shown_at

### `content_engagement_events`
- event_id
- user_id
- content_id
- event_type
- dwell_ms
- source
- algorithm_version
- created_at

### `recommendation_requests`
Debug/audit uchun sampled:
- request_id
- user_id
- surface
- model_version
- candidate_count
- created_at

### `trending_snapshots`
- scope
- entity_type
- entity_id/tag
- score
- window
- calculated_at

Algorithm version har bir recommendation/impression bilan bog'lanishi kerak. Aks holda ranking regressiyasini tahlil qilib bo'lmaydi.

---

# 8. Notifications

Mavjud `notifications` user inbox bo'lib qoladi.

### `notification_deliveries`
- notification_id
- channel: in_app / push / email / sms
- provider
- status
- attempted_at
- delivered_at
- opened_at
- failure_code

### `notification_preferences_v2`
Normalized preference:
- user_id
- event_type
- channel
- enabled
- quiet_hours

### `push_devices`
- user_id
- device_id
- platform
- push_token encrypted/secured
- app_version
- locale
- last_seen_at
- revoked_at

---

# 9. Marketplace / Commerce

Mavjud products/orders/sellers/payment gateway jadvallari foundation sifatida ishlatiladi.

### `payment_intents`
Orderdan alohida payment lifecycle:
- id
- user_id
- amount
- currency
- purpose
- provider
- status
- idempotency_key
- created_at

### `payment_attempts`
- payment_intent_id
- provider_reference
- status
- error_code
- raw_response redacted
- created_at

### `refunds`
- payment_intent_id
- amount
- reason
- status
- created_by

### `disputes`
- order/payment
- opened_by
- reason
- status
- evidence
- resolved_by

### `seller_risk_events`
- seller_id
- event_type
- score_delta
- source
- created_at

PCI/payment secretlarini Supabase public tables'da saqlamaslik kerak.

---

# 10. Map / Places

Mavjud saved places foundation.

### `places`
Canonical place registry:
- id
- provider
- provider_place_id
- name
- category
- lat/lng
- address
- country/city
- metadata

### `place_activity`
- user_id
- place_id
- type: view / save / visit / share / route
- created_at

### `live_location_sessions`
- id
- user_id
- audience_type
- expires_at
- status

### `live_location_points`
Short retention only:
- session_id
- timestamp
- lat/lng
- accuracy

Location — sensitive data. Retention va RLS juda qat'iy bo'lishi kerak.

---

# 11. AI domain

### `ai_conversations`
Canonical conversation metadata.

### `ai_messages`
Large JSON message arraydan ko'ra row-per-message:
- conversation_id
- role
- content
- model
- created_at

### `ai_runs`
Har bir agent execution:
- user_id
- conversation_id
- request_id
- model
- tool_mode
- status
- input_tokens
- output_tokens
- latency_ms
- cost_estimate
- created_at

### `ai_tool_calls`
- run_id
- tool_name
- arguments_redacted
- status
- duration_ms
- error_code

### `sandbox_runs`
- run_id
- sandbox_provider
- runtime
- cpu_limit
- memory_limit
- timeout_ms
- exit_code
- started_at
- finished_at

### `ai_safety_events`
- run_id
- classifier
- category
- action
- score
- created_at

User prompt yoki secretlarni analytics metadata ichiga avtomatik ko'chirmaslik kerak.

---

# 12. Mini Apps / Publishers

Mavjud publisher, mini_apps, versions, sessions, reviews tables yaxshi foundation.

### `mini_app_permissions_grants`
Per-user permission grant:
- app_id
- user_id
- permission
- granted_at
- revoked_at

### `mini_app_installations`
- app_id
- user_id
- installed_at
- removed_at
- source

### `mini_app_runtime_events`
Sampled/aggregated:
- app_id
- version_id
- event_type
- duration_ms
- error_code
- created_at

### `publisher_enforcement`
- publisher_id
- state
- reason
- case_id
- starts_at
- ends_at

---

# 13. Ads domain

Mavjud ads, impressions, clicks, reach tablesni campaign-grade modelga ko'tarish kerak.

### `ad_accounts`
- owner_id / business_id
- status
- currency
- timezone
- risk_state

### `ad_campaigns`
- account_id
- objective
- budget
- status
- starts_at/ends_at

### `ad_sets`
- campaign_id
- targeting
- placement
- bid strategy
- budget

### `ad_creatives`
- ad_set_id
- media_asset_id
- copy
- destination
- review_status

### `ad_review_cases`
- creative_id
- policy_code
- status
- reviewer
- reason

### `ad_billing_ledger`
Append-only debit/credit ledger. `spent` kabi mutable total faqat derived value.

---

# 14. Trust & Safety / Moderation — eng katta yetishmayotgan qatlam

Mavjud `reports` juda tor: faqat post/user va oddiy status. Uni universal case-managementga aylantirish kerak.

### `reports_v2`
- id
- reporter_id nullable
- target_type
- target_id
- reason_code
- subreason_code
- description
- source_surface
- evidence_snapshot_id
- priority
- status
- created_at

### `moderation_cases`
Bir yoki ko'p reportni bitta investigationga birlashtiradi:
- id
- case_type
- subject_type
- subject_id
- severity
- priority
- status
- assigned_team
- assigned_admin_id
- opened_at
- due_at
- resolved_at

### `moderation_case_reports`
- case_id
- report_id

### `moderation_evidence`
Immutable snapshot/reference:
- case_id
- evidence_type
- object_type
- object_id
- snapshot_json
- media_asset_id
- captured_at

### `moderation_decisions`
- case_id
- decision
- policy_code
- rationale
- decided_by
- created_at

### `enforcement_actions`
- id
- case_id
- target_type
- target_id
- action_type: remove_content / warning / feature_limit / temporary_suspend / permanent_disable / demonetize / age_restrict
- starts_at
- ends_at
- created_by
- status

### `appeals`
- enforcement_action_id
- appellant_id
- reason
- status
- assigned_admin_id
- decision
- resolved_at

### `policy_catalog`
- code
- title
- category
- severity_default
- version
- active_from
- active_to

### `moderation_queues`
- queue name
- routing rule
- SLA

### `moderation_assignments`
- case_id
- admin_id
- assigned_at
- released_at

Bu qatlam Instagram/Facebook/YouTube kabi katta platformalardagi trust-safety operatsiyasiga eng yaqin industry pattern hisoblanadi: report -> case -> evidence -> decision -> enforcement -> appeal.

---

# 15. Admin / RBAC / Audit

Mavjud `admin_actions` foundation, lekin audit uchun yetarlicha strict emas.

### `admin_roles`
- id
- key
- name
- description
- system_role

### `admin_permissions`
- key
- description
- risk_level

### `admin_role_permissions`
- role_id
- permission_key

### `admin_memberships`
- user_id
- role_id
- granted_by
- granted_at
- expires_at

`user_roles` bilan migration-compatible bo'lishi mumkin.

### `admin_sessions`
High-risk admin session:
- user_id
- session_id
- auth_strength
- ip
- device
- started_at
- last_seen_at
- revoked_at

### `admin_audit_log`
APPEND ONLY, update/delete taqiqlanadi:
- id
- actor_id
- actor_session_id
- action
- target_type
- target_id
- request_id
- reason
- before_snapshot
- after_snapshot
- ip_hash
- user_agent_hash
- created_at

### `admin_action_approvals`
High-risk actionlar uchun four-eyes approval:
- action_request_id
- requested_by
- approved_by
- status
- expires_at

Permanent account disable, large refund, role escalation kabi amallar uchun ishlatiladi.

---

# 16. Security / Abuse / Risk

Mavjud `security_events` va rate-limit events foundation.

### `security_incidents`
- id
- user_id nullable
- incident_type
- severity
- status
- first_seen_at
- last_seen_at
- assigned_to

### `risk_signals`
- subject_type
- subject_id
- signal_type
- score
- source
- expires_at
- created_at

### `login_attempts`
- user_id nullable
- identifier_hash
- result
- ip_prefix/hash
- device_fingerprint_hash
- created_at

### `session_risk`
- session_id
- risk_score
- challenge_required
- reason_codes

### `abuse_rate_limits`
Policy-driven limits, faqat raw event emas.

### `security_actions`
- force logout
- password reset required
- MFA challenge required
- account lock

---

# 17. System / Release / Operations

Existing `app_releases` va release health foundationdan foydalanish.

### `service_registry`
- service
- owner
- environment
- criticality

### `service_health_events`
- service
- environment
- status
- latency_ms
- error_rate
- checked_at

### `deployments`
- service
- git_sha
- environment
- deployed_at
- status
- actor

### `release_rollouts`
- release_id
- cohort
- percentage
- started_at
- paused_at
- completed_at

### `incident_timeline`
- incident_id
- event_type
- message
- actor
- created_at

Admin System Health sahifasi shu source'lardan ishlaydi.

---

# 18. Analytics data model

## Do not use OLTP tables directly for every dashboard.

### Raw event envelope
Har event bir xil envelope bilan:
- event_id
- event_name
- occurred_at
- user_id nullable
- anonymous_id nullable
- session_id
- request_id
- page/surface
- app_version
- platform
- locale
- country coarse
- properties jsonb

## Rollups
- daily_user_metrics
- daily_content_metrics
- daily_video_metrics
- daily_marketplace_metrics
- daily_ads_metrics
- daily_ai_metrics
- daily_security_metrics

Admin dashboard avvalo rollupdan o'qishi kerak.

## Retention
- raw high-volume events: 30-90 days operational store;
- rollups: long-term;
- audit/security/legal: policy bo'yicha uzoqroq;
- precise location: minimal retention;
- deleted-user identifiers: anonymize/purge workflow.

---

# 19. Har bir page -> data contract

| Page/surface | Canonical data | Events | Admin visibility |
|---|---|---|---|
| Home | posts, content_items, media_assets | impression, dwell, like, share, hide | ranking + moderation |
| Discover/Search | search index, recommendations | query, result impression, click | trend/quality/spam |
| Videos | videos, variants | start/progress/complete | watch health + moderation |
| Messages | conversations/messages | delivery/read metadata | abuse reports only, no bulk private-content analytics |
| Profile | profiles/social graph | profile view, follow | account state/risk |
| Stories | stories/content | impression/complete/reply | moderation |
| Channels/Groups | channels/members/messages | join/view/post | moderation + owner/admin actions |
| Marketplace | products/orders/sellers | view/cart/purchase | commerce risk/disputes |
| Map | places/saved/live sessions | place view/save | privacy-safe abuse/security only |
| Payment | intents/ledger/refunds | payment lifecycle | finance/risk |
| AI | conversations/runs/tool calls | latency/tokens/errors | safety/cost/health |
| Mini Apps | apps/versions/installations | open/error/permission | review/security |
| Ads | accounts/campaigns/creatives | impression/click/conversion | policy/billing |
| Settings | normalized preferences | preference changes | audit only for security-sensitive settings |
| Admin | cases/actions/roles/audit | admin action event | immutable audit |

---

# 20. Data governance

## Sensitive data classification

### Public
- username
- display name
- avatar
- public bio
- public content

### Private
- birth date
- email/phone
- precise location
- sessions/devices
- payment identifiers

### Restricted
- ID verification documents
- moderation evidence
- security incident data
- admin audit details
- legal requests

Restricted data uchun alohida schema yoki service-role-only tables ishlatish kerak.

## Required rules
- RLS default deny;
- service role faqat backendda;
- append-only audit;
- soft delete + legal purge workflow;
- idempotency keys for payments/admin actions;
- request_id correlation;
- timestamps UTC;
- enums/status transitions DB constraints bilan;
- FK + indexes every hot relationship;
- PII JSON ichida yashirilmasin;
- media URL canonical identity sifatida ishlatilmasin; provider/bucket/key ishlatilsin.

---

# 21. Rollout tartibi

## Phase 1 — Trust & Safety core
1. `content_items`
2. `reports_v2`
3. `moderation_cases`
4. `moderation_evidence`
5. `moderation_decisions`
6. `enforcement_actions`
7. `appeals`
8. `account_status`
9. `account_restrictions`
10. `admin_audit_log`

Eski `reports`ni birdan o'chirmaslik; dual-write/backfill orqali migratsiya.

## Phase 2 — Admin RBAC + Security
- roles/permissions;
- admin sessions;
- security incidents;
- risk signals;
- four-eyes approvals.

## Phase 3 — Content/media normalization
- content registry;
- media_assets;
- edit/visibility history;
- video-specific model.

## Phase 4 — Event platform
- unified event envelope;
- partitioning;
- daily rollups;
- recommendation request/version tracking.

## Phase 5 — Commerce/Ads/AI operations
- payment ledger/refunds/disputes;
- ad account/campaign/review model;
- AI runs/tool/sandbox/safety telemetry.

## Phase 6 — Warehouse/search split
Scale talab qilganda:
- high-volume events -> ClickHouse/BigQuery;
- full-text/search -> OpenSearch/Meilisearch/Typesense;
- OLTP Postgres faqat canonical state uchun.

---

# 22. Muhim prinsip

Alsamos uchun maqsad "ko'proq jadval" emas. Maqsad har bir product surface uchun uchta narsani ajratish:

1. **State** — hozirgi canonical holat.
2. **Event** — nima sodir bo'ldi.
3. **Decision/Audit** — kim, nima sababdan, qaysi versiya/policy asosida o'zgartirdi.

Shu uchlik admin, analytics, recommendation, security, moderation va legal talablarni bir-biridan buzmasdan rivojlantirish imkonini beradi.

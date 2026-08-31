# Feature Parity Matrix

**Status:** living document. Duplicated verbatim in both client repos.

- `SamandarAlimov/socialalsamos` - React + TypeScript + Vite web client
- `SamandarAlimov/alsamos-superapp` - Flutter client (Android / Web / Windows)

The two clients are **not** forks of each other. They are independent
implementations over **one shared Supabase project**. That shared database is
the only hard coupling, so the rule is:

> A feature may ship on one client first, but the **schema** it depends on must
> be documented in `db-schema.md` before it ships anywhere.

Related contracts:

- `docs/CONTRACTS/message-protocol.md` - chat payload format (`alsamos.message.v1`)
- `docs/CONTRACTS/db-schema.md` - migration ownership and schema rules

---

## 1. Repository boundaries

| Concern | Owner | Rule |
|---|---|---|
| SQL migrations | `alsamos-superapp/supabase/migrations/` | **Source of truth**, ~120 CLI-managed files. See `db-schema.md`. |
| Web-side migrations | `socialalsamos/supabase/migrations/` | Secondary. Reconcile against the Flutter set before applying. |
| Loose root-level `*.sql` scripts | `alsamos-superapp/` | Operational one-offs, not migrations. Deprecated. |
| Message payload format | this contract set | Changed in both repos in the same session. |
| Design language | per client | Native platform feel may differ. Data must not. |

---

## 2. Module map

Flutter organizes by feature (`lib/features/<name>/`), the web client by page
(`src/pages/`) plus component folders. Names below are normalized.

| Domain | Web | Flutter |
|---|---|---|
| Auth | yes | yes |
| Home feed | yes | yes |
| Search | yes | yes |
| Discover | yes | yes |
| Videos / reels | yes | yes |
| Messages / chat | yes | yes |
| Calls | yes | yes |
| Marketplace | yes | yes |
| Map | yes | yes |
| Payment | yes | yes |
| AI assistant | yes | yes |
| Mini apps | yes | yes |
| Create / composer | yes | yes |
| Profile | yes | yes |
| Notifications | yes | yes |
| Settings | yes | yes |
| Channels | yes | yes |
| Stories | **no** | yes |
| Live | **no** | yes |
| Admin | **no** | yes |
| Ads | **no** | yes |
| Orders | **no** | yes |
| Comments (standalone) | **no** | yes |
| Activity | **no** | yes |
| Sticker packs | yes | **partial** |
| Premium map layer | yes | **no** |
| Link preview aspect-ratio engine | yes | **no** |
| Telegram bubble tail | yes | **no** |

---

## 3. Gaps, web side

Flutter ships these; the web client has no equivalent page. Each one already
reads or writes shared tables, so the web client is currently blind to data
that exists in production.

| Feature | Flutter location | Web action |
|---|---|---|
| Stories | `lib/features/stories/` | Needs a page. Story replies already exist in chat (`StoryReplyPreview`), so the read path is half-built. |
| Live | `lib/features/live/` | Needs a page. Backed by `group_e_calls_live` and `batch2_calls_live`. |
| Admin | `lib/features/admin/` | Highest risk: admin actions taken on Flutter are invisible on web. Backed by `add_admin_role_system`. |
| Ads | `lib/features/ads/` | Needs a page. |
| Orders | `lib/features/orders/` | Marketplace on web has cart but no order history. Backed by `marketplace_p0_payments_escrow`. |
| Comments | `lib/features/comments/` | Web handles comments inline; verify both use the same table and counters. |
| Activity | `lib/features/activity/` | Overlaps with web notifications. Decide whether these are one domain or two before building. |

---

## 4. Gaps, Flutter side

The web client shipped these recently; Flutter has no equivalent UI. Note that
in several cases the **schema already exists** in the Flutter migration set, so
this is a UI gap rather than a data gap.

| Feature | Web location | Shared schema |
|---|---|---|
| Sticker packs | `StickerPacksPage`, `useStickerPacks`, `stickerRecents` | `telegram_stickers` migration already exists |
| Premium map layer | `src/lib/mapPlaces|transit|taxiProviders|routing|mapLayers`, `src/components/map/**` | `map_p0_features`, `social_map_features`, `advanced_routing` already exist |
| Place reviews / ratings | `PlaceReviews`, `usePlaceReviews` | verify against `social_map_features` |
| Visit history (dwell tracking) | `useVisitTracking`, `usePlaceVisits` | verify against `social_map_features` |
| Nearby marketplace listings | `useNearbyListings`, `NearbyListingsCard` | `products` geo columns |
| Link preview aspect-ratio engine | `src/lib/linkEmbed.ts`, `TelegramLinkPreview` | none, pure client |
| Bubble tail | `BubbleTail.tsx` | none, pure client |

**Priority order for porting to Flutter:** premium map layer, then sticker
packs, then nearby listings. The last two rows are cosmetic and can wait.

---

## 5. Hygiene issues to resolve

| Issue | Where | Action |
|---|---|---|
| `discover/` and `discovery/` both exist | `alsamos-superapp/lib/features/` | Pick one, delete the other. Duplicate feature folders drift silently. |
| Six loose `*.sql` scripts at repo root | `alsamos-superapp/` | Audit, fold into timestamped migrations, then move to `docs/legacy-sql/`. |
| Test fixtures inside the migration chain | `alsamos-superapp/supabase/migrations/` | `test_messages_data`, `create_test_conversations` run against production on replay. |
| Duplicate map / sticker schema | both `supabase/migrations/` dirs | See section 4 of `db-schema.md`. Diff before applying anything. |
| `_stubs` and `not_found` feature folders | `alsamos-superapp/lib/features/` | Confirm they are intentional placeholders, not dead code. |
| Superseded map components | `socialalsamos/src/components/map/` | Old directions and history panels remain after the MapPage rewrite. |
| `VideoCallOverlay.tsx` not yet redesigned | `socialalsamos/src/components/messages/` | Only remaining piece of the premium call-UI pass. |

---

## 6. Shared schema touchpoints

Changing any of these affects both clients. Treat every one as a contract.

- `messages`, `message_reactions`, `message_poll_votes`, `conversations`,
  `conversation_participants`
- `profiles`, `user_settings`
- `products`, `product_images`, `product_categories`, `sellers`,
  `product_likes`, `cart_items`, `user_addresses`, `user_stores`
- `sticker_packs`, `stickers`, `sticker_pack_installs`, `sticker_usage`
- `saved_places`, `place_visits`, `place_reviews`, `taxi_providers`
- Edge functions `link-preview`, `media-proxy`, `giphy-search`

---

## 7. Procedure for a new cross-client feature

1. Search `alsamos-superapp/supabase/migrations/` first. Assume the schema
   already exists.
2. Write an additive, idempotent migration there if it does not.
3. Record it in `db-schema.md`.
4. If it touches chat, update `message-protocol.md` in **both** repos first.
5. Implement the read path on both clients before enabling any writer.
6. Add the row to the module map above and note which client is still missing it.
7. Never let a feature exist in production data with no reader on one client.
   That is exactly how the gaps in sections 3 and 4 appeared.

# Message Protocol Contract - `alsamos.message.v1`

**Status:** normative. This file is duplicated verbatim in both client repos:

- `SamandarAlimov/socialalsamos` (React + TypeScript web client)
- `SamandarAlimov/alsamos-superapp` (Flutter client: Android / Web / Windows)

Both clients read and write the **same Supabase `messages` table**. Any change to
this document must land in both repos in the same working session, or chat
messages will render differently per platform.

Reference implementations:

| Repo | File |
|---|---|
| socialalsamos | `src/lib/messageStructuredPayload.ts` |
| socialalsamos | `src/components/messages/EnhancedMessageBubble.tsx` |
| alsamos-superapp | `lib/features/messages/data/models/message_payload_compat.dart` |
| alsamos-superapp | `lib/features/messages/data/models/message_model.dart` |

---

## 1. Schema constant

```
alsamos.message.v1
```

| Client | Symbol |
|---|---|
| TS | `MESSAGE_PAYLOAD_SCHEMA` |
| Dart | `alsamosMessagePayloadSchema` |

Every canonical payload written into `metadata` MUST carry `schema` with this
exact value. Readers MUST NOT reject a payload only because `schema` is absent -
legacy rows predate it.

---

## 2. Storage columns

| Column | Type | Purpose |
|---|---|---|
| `content` | text | Human-readable transport text. Never the only source of truth. |
| `media_type` | text | Discriminator. See the registry in section 5. |
| `media_url` | text | Media file URL. For location types: `"<latitude>,<longitude>"`. |
| `metadata` | jsonb | Canonical structured payload. Primary source of truth. |
| `location_payload` | jsonb | Denormalized canonical location. Mirror of `metadata.location`. |
| `live_location_expires_at` | timestamptz | Live location expiry. |
| `live_location_stopped_at` | timestamptz | Set when the sender stops sharing early. |

`metadata` may arrive as a JSON **string** instead of an object. Both clients
already tolerate this (`asRecord` in TS, `decodeMessageMetadata` in Dart).
Keep that tolerance.

---

## 3. Canonical location payload

Written to both `metadata.location` and the `location_payload` column.

```json
{
  "schema": "alsamos.message.v1",
  "latitude": 41.279966,
  "longitude": 69.233194,
  "address": "Sa'di Sirojiddinov Street 52, Tashkent",
  "label": "Rahimjan-Ata Friday Mosque",
  "live": false,
  "expiresAt": null
}
```

Rules:

- `latitude` finite, `abs(latitude) <= 90`. `longitude` finite, `abs(longitude) <= 180`.
  Anything else means "no location" - return null, do not clamp.
- `address` is the postal / descriptive string. `label` is the place name.
  Both optional. Empty or whitespace-only strings MUST normalize to absent.
- `live: true` requires `media_type = 'live_location'`.

### Accepted input aliases (read side)

Readers MUST accept all of these when normalizing:

| Canonical | Accepted aliases |
|---|---|
| `latitude` | `lat` |
| `longitude` | `lng` |
| `label` | `name`, `location_label` |
| `live` | `is_live` |
| `expiresAt` | `expires_at`, `live_until` |

Writers MUST emit **only** the canonical key names.

### Read precedence

1. `metadata.location`
2. `metadata.location_payload`
3. `location_payload` column
4. `media_url` parsed as `lat,lng` - only when `media_type` is `location` or `live_location`
5. `content` legacy text protocol (section 4)
6. `content` bare `lat,lng` regex - only when `media_type` is `location` or `live_location`

Coordinate regex, identical in both clients:

```
(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)
```

---

## 4. Legacy text location protocol

Older rows and share links encode location inside `content`:

```
<pushpin> LOCATION:<lat>,<lng>|<address>
<pushpin> LOCATION:<lat>,<lng>|<address>|LIVE:<expiresAt>
```

The prefix is literally the round-pushpin emoji (U+1F4CD), a space, then
`LOCATION:`.

**This is a data protocol, not UI text.** It MUST NOT be shown to the user raw.

Both clients now parse it **independently of `media_type`**, because legacy rows
frequently carry a null or `text` media type:

| Client | Entry point |
|---|---|
| TS | `parseMessageLocation()` |
| Dart | `parseLegacyLocationContent()`, wired into `hydrateStructuredMessageMetadata()` and `normalizeLocationContentForLegacyRenderer()` |

The `LIVE:<expiresAt>` segment maps to `live: true` and `expiresAt`.

New writers MUST NOT emit this format. Write the canonical payload instead.
The parser stays for backward compatibility only.

> Was tracked as **D1**. Resolved.

---

## 5. `media_type` registry

Adding a value here without implementing it in both clients is a protocol break.

| `media_type` | Source of truth | Web | Flutter |
|---|---|---|---|
| `text` | `content` | yes | yes |
| `image` | `media_url` | yes | yes |
| `video` | `media_url` | yes | yes |
| `audio` | `media_url` | yes | yes |
| `document` | `media_url` | yes | yes |
| `location` | `metadata.location` | yes | yes |
| `live_location` | `metadata.location` with `live: true` | yes | yes |
| `poll` | `metadata.poll` | yes | yes |
| `sticker` | `media_url` | yes | model ok |
| `gif` | `media_url` | yes | model ok |
| `call_history` | `content` as JSON | yes | **missing** |

### `sticker` and `gif`

No structured payload. The renderer needs only:

- `media_type` = `sticker` or `gif`
- `media_url` = the sticker / GIF file URL

`content` is unused and MUST be ignored for these types. Both are rendered
without a bubble background and without a tail. On the web this is
`StickerMessage`; on Flutter `Message.mediaUrl` and `Message.mediaType` carry
everything needed, so only the presentation layer has to opt into the
background-less style.

Optional metadata, additive and non-breaking: `metadata.sticker_pack_id`,
`metadata.sticker_emoji`, `metadata.width`, `metadata.height`.

### `call_history`

`content` holds a JSON document, not prose:

```json
{
  "type": "audio",
  "status": "ended",
  "duration": 154,
  "timestamp": "2026-08-31T04:12:00.000Z",
  "caller_id": "<uuid>",
  "callee_id": "<uuid>"
}
```

- `type`: `audio` or `video`
- `duration`: seconds, optional
- "mine" is decided by `caller_id == currentUserId`, **not** by `sender_id`

Legacy fallback, still accepted on read: a human-readable string beginning with
the telephone-receiver emoji (U+1F4DE), where `video` anywhere in the string
means a video call and the first `mm:ss` or `hh:mm:ss` match is the duration.

> **Open item D2.** The Dart `Message` model has no `call_history` parser, so
> such a row currently surfaces as raw JSON text on Flutter. Required fix,
> Dart side: add a `callHistory` getter mirroring the shape above plus the
> legacy fallback, and render it as a system-style row rather than a bubble.

---

## 6. Canonical poll payload

```json
{
  "schema": "alsamos.message.v1",
  "question": "Qachon uchrashamiz?",
  "options": [
    { "id": "opt_0", "text": "Ertaga", "votes": 0 },
    { "id": "opt_1", "text": "Indinga", "votes": 0 }
  ],
  "multiple": false,
  "anonymous": false
}
```

Rules:

- Minimum 2 valid options. Fewer means "not a poll" - return null.
- Option `id` defaults to `opt_<index>` when absent.
- `votes` defaults to `0` and must parse to a finite integer.
- `multiple` accepts aliases `allowMultiple`, `allows_multiple`.
  `anonymous` accepts `isAnonymous`, `is_anonymous`.

Live vote counts are **not** stored in `metadata`. They live in the
`message_poll_votes` table, keyed by `message_id`, `user_id`, `option_id`.
The `votes` field in the payload is a placeholder and MUST NOT be trusted as a
tally.

### Read precedence

1. `metadata.poll`
2. `content` legacy block: `[POLL]{...json...}[/POLL]`
3. `content` plain text, only when `media_type = 'poll'`: first line is the
   question, following lines are options with a leading `-`, `*` or bullet
   stripped. Requires at least 3 non-empty lines.

### Transport text suppression

When a canonical poll resolves, the native poll widget is authoritative and
`content` MUST NOT be rendered as a second text bubble.

Both clients satisfy this today:

- **Web**: `EnhancedMessageBubble` renders the `MessagePoll` branch instead of
  the text branch, and the text branch is additionally gated on `!pollData`.
- **Flutter**: `normalizeLocationContentForLegacyRenderer()` returns an empty
  string once a poll is recognized.

> Was tracked as **D3**. Not a real divergence - closed after inspecting the
> web bubble. Do not "fix" it again.

---

## 7. Write contract

A writer MUST set, in one insert:

**Location**

| Field | Value |
|---|---|
| `content` | `address` or `label`, else `"Joylashuv"` / `"Jonli joylashuv"` |
| `media_type` | `location`, or `live_location` when live |
| `media_url` | `"<latitude>,<longitude>"` |
| `metadata` | `{ schema, location, live_location_expires_at? }` |
| `location_payload` | the canonical location object |
| `live_location_expires_at` | ISO-8601 when live |

TS reference: `buildLocationMessageFields()`.

**Poll**

| Field | Value |
|---|---|
| `content` | question, then one `- option` line per option |
| `media_type` | `poll` |
| `metadata` | `{ schema, poll }` |

TS reference: `buildPollMessageFields()`.

> **Open item D4.** The Dart write path lives in
> `lib/features/messages/data/repositories/messages_repository.dart`, which
> `AGENTS.md` marks as fragile. It has not been audited against this section.
> It must be confirmed that Flutter writes `location_payload` **and**
> `metadata.location` together, not one of the two.

---

## 8. Change procedure

1. Update this file in both repos in the same session.
2. Implement the read path first, in both clients, and ship it.
3. Only after both read paths are live, enable the new writer.
   A writer that ships ahead of a reader produces broken bubbles on the other
   platform.
4. Never repurpose an existing `media_type` value. Add a new one.
5. Never delete a legacy parser. Old rows live forever.
6. Before recording a divergence here, read the actual renderer on both sides.
   D3 was recorded from an assumption and turned out to be already handled.

---

## 9. Open items

| ID | Side | Status | Item |
|---|---|---|---|
| D1 | Dart | **done** | Parse the legacy `LOCATION:` content protocol, including `LIVE:` |
| D2 | Dart | open | `call_history` parser and renderer. `sticker` / `gif` need only presentation styling |
| D3 | - | **not an issue** | Poll transport text was already suppressed on both sides |
| D4 | Dart | open | Audit `messages_repository.dart` against the write contract |

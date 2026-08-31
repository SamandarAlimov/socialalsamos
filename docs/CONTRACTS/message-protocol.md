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
| alsamos-superapp | `lib/features/messages/data/models/message_payload_compat.dart` |

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
| `media_url` | text | For location types: `"<latitude>,<longitude>"`. |
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
\u{1F4CD} LOCATION:<lat>,<lng>|<address>
\u{1F4CD} LOCATION:<lat>,<lng>|<address>|LIVE:<expiresAt>
```

The prefix is literally the round-pushpin emoji, a space, then `LOCATION:`.

**This is a data protocol, not UI text.** It MUST NOT be shown to the user raw.

> **Known divergence D1.** The TS client parses this prefix explicitly, including
> the `LIVE:` segment. The Dart client does not: it only regex-scans `content`
> for `lat,lng`, and only when `media_type` is already `location` or
> `live_location`. Consequences on Flutter:
> - a legacy row with `media_type` null or `text` renders as raw
>   `LOCATION:...` text
> - the `LIVE:` segment is ignored, so a live location degrades to static
>
> Required fix, Dart side: add a `LOCATION:` prefix branch to the location
> resolution that runs regardless of `media_type`, and read the `LIVE:` segment
> into `expiresAt` / `live: true`.

New writers MUST NOT emit this format. Write the canonical payload instead.
The parser stays for backward compatibility only.

---

## 5. `media_type` registry

Adding a value here without implementing it in both clients is a protocol break.

| `media_type` | Canonical payload | TS | Dart |
|---|---|---|---|
| `text` | - | yes | yes |
| `image` | - | yes | yes |
| `video` | - | yes | yes |
| `audio` | - | yes | yes |
| `document` | - | yes | yes |
| `location` | `metadata.location` | yes | yes |
| `live_location` | `metadata.location` with `live: true` | yes | yes |
| `poll` | `metadata.poll` | yes | yes |
| `sticker` | `metadata.sticker` | yes | **unverified** |
| `gif` | `metadata.gif` | yes | **unverified** |
| `call_history` | `metadata.call` | yes | **unverified** |

> **Open item D2.** `sticker`, `gif` and `call_history` are produced by the web
> client but their canonical payload shape is not yet defined in this document
> and the Dart read path has not been confirmed. Until that is closed, a sticker
> or GIF sent from web may render as a plain image or plain text on Flutter.
> Next step: define the payload shapes below and verify
> `lib/features/messages/data/models/message_model.dart` handles them.

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

### Read precedence

1. `metadata.poll`
2. `content` legacy block: `[POLL]{...json...}[/POLL]`
3. `content` plain text, only when `media_type = 'poll'`: first line is the
   question, following lines are options with a leading `-`, `*` or bullet
   stripped. Requires at least 3 non-empty lines.

### Transport text suppression

When `media_type = 'poll'` and a canonical poll resolves, the native poll widget
is authoritative and `content` MUST NOT be rendered as a second text bubble.

> **Known divergence D3.** The Dart client enforces this in
> `normalizeLocationContentForLegacyRenderer`, which returns an empty string for
> a recognized poll. The TS client has no equivalent suppression helper, so the
> web bubble can render the question and option lines as text in addition to the
> poll widget.
>
> Required fix, TS side: suppress `content` in the bubble when
> `parseMessagePoll()` returns non-null.

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

---

## 9. Open items summary

| ID | Side | Item |
|---|---|---|
| D1 | Dart | Parse the legacy `LOCATION:` content protocol, including `LIVE:` |
| D2 | Both | Define `sticker`, `gif`, `call_history` payload shapes; verify Dart read path |
| D3 | TS | Suppress poll transport text when a canonical poll resolves |
| D4 | Dart | Audit `messages_repository.dart` against the write contract |

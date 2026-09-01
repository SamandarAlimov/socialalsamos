# Alsamos Mini App Developer API (v1.0.0)

**Muhim:** Alsamos'da mini apps — mustaqil, professional bo'lim. Telegram'da mini app
faqat bot orqali ishlaydi, chunki u yerda boshqa kirish nuqtasi yo'q. Alsamos'da esa
**har bir mini app o'zining API kalitlarini oladi** va bevosita ulanadi. Bot — faqat
ixtiyoriy qo'shimcha kanal (`bot-api.md`).

## Ulanish darajalari

| Tur | API talab qiladimi | Kim uchun |
| --- | --- | --- |
| `link` | Yo'q | Junior dasturchilar, portfolio, oddiy foydalanuvchi — manzil kifoya |
| `webapp` | Ha (client_id + secret) | To'liq mini app: SDK, update, bildirishnoma, to'lov |
| `bot` | Ha (bot token) | Suhbat orqali ishlaydigan qo'shimcha kanal |

## 1. Kalit olish

UI: **Mini ilovalar -> ilovani tahrirlash -> API ulanishi -> Kalit yaratish.**
RPC: `select public.mini_app_credential_create('<app_id>', 'production', 'live');`

```json
{
  "credential_id": "...",
  "client_id": "app_4f2c1ab9d0e3f781_9ac31b",
  "secret": "sk_live_...",
  "environment": "live"
}
```

`secret` **faqat bir marta** qaytariladi; bazada `sha256` hash saqlanadi.
`test` muhiti uchun `p_environment => 'test'`.

## 2. Chaqirish

```bash
BASE="https://<project-ref>.supabase.co/functions/v1/mini-app-api"

curl -X POST "$BASE/app.get" \
  -H "Authorization: Bearer $CLIENT_ID:$SECRET"

# yoki alohida sarlavhalar bilan
curl -X POST "$BASE/app.get" \
  -H "X-Alsamos-Client-Id: $CLIENT_ID" \
  -H "X-Alsamos-Client-Secret: $SECRET"
```

Javob: `{ "ok": true, "result": … }` / `{ "ok": false, "error_code": 401, "description": "UNAUTHORIZED_CLIENT" }`

## 3. Metodlar

| Metod | Parametrlar | Vazifasi |
| --- | --- | --- |
| `app.get` | — | Ilova ma'lumoti, muhit, scope'lar |
| `app.stats` | — | 30 kunlik ochilish, foydalanuvchi, reyting, install |
| `updates.get` | `offset`, `limit` | Navbatdagi update'lar (max 100) |
| `notifications.send` | `user_id`, `title`, `body`, `action_url` | Foydalanuvchiga bildirishnoma |
| `webhook.set` | `url` (https), `secret` | Update'larni real vaqtda olish |
| `webhook.delete` / `webhook.info` | — | Webhook boshqaruvi |
| `user.verify` | `init_data` | Mini app ichidagi foydalanuvchini tasdiqlash |
| `updates.push` | `app_id`, `type`, `payload` | **Superapp tomoni**, foydalanuvchi JWT bilan |

## 4. Update turlari

`app_open`, `app_close`, `web_app_data`, `install`, `uninstall`, `payment`,
`notification_reply`, `custom`

```json
{
  "update_id": 128,
  "type": "app_open",
  "user_id": "uuid",
  "payload": { "from_user_id": "uuid", "platform": "web" },
  "date": "2026-09-01T11:40:00Z"
}
```

## 5. Webhook imzosi

```
X-Alsamos-Signature: sha256=<HMAC_SHA256(webhook_secret, body)>
```

Imzoni tekshirish SHART. Faqat `https://` manzillar qabul qilinadi.

## 6. Xavfsizlik

- Secret bazada faqat `sha256` hash sifatida (`mini_app_credentials.secret_hash`).
- `mini_app_api_authenticate`, `mini_app_dequeue_updates`, `mini_app_notify_user`
  faqat service role (edge function) uchun.
- `notifications.send` faqat ilovani o'rnatgan/ochgan foydalanuvchiga ruxsat beradi
  (`USER_NOT_LINKED`).
- RLS: kalitlarni faqat `mini_app_can_manage(app_id)` bo'lgan egasi ko'radi.
- `user.verify` `MINI_APP_SDK_SECRET` bilan imzolangan `initData`ni tekshiradi.

## 7. Deploy

```bash
supabase functions deploy mini-app-api
```

Migratsiya: `supabase/migrations/20260901050000_mini_app_developer_api.sql`

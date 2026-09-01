# Alsamos Bot API (v1.0.0)

Telegram modeli: **bot yaratiladi -> token beriladi -> mini app shu bot orqali ishlaydi.**
Bot egasi Alsamos ichidagi mini appni o'z serveri bilan API orqali bog'laydi.

Baza manzili:

```
https://<project-ref>.supabase.co/functions/v1/bot-api
```

## 1. Bot yaratish (UI yoki RPC)

UI: **Mini ilovalar -> Qo'shish -> Ilova turi: Bot -> Yangi bot yaratish.**
RPC: `select public.bot_create('mybot', 'My Bot', 'Tavsif');`

Javob token bilan qaytadi va token **faqat bir marta** ko'rsatiladi:

```json
{ "bot_id": "...", "username": "mybot", "token": "a1b2c3d4e5f6:<secret>" }
```

Tokenni yo'qotsangiz: `select public.bot_revoke_token('<bot_id>');` (eski token darhol ishlamaydi).

## 2. Chaqirish shakllari

```bash
# Telegram uslubi: token path ichida
curl -X POST "$BASE/bot-api/bot$TOKEN/getMe"

# yoki header bilan
curl -X POST "$BASE/bot-api/getMe" -H "X-Bot-Token: $TOKEN"
```

Javob formati Telegram bilan bir xil:

```json
{ "ok": true, "result": { "username": "mybot", "is_bot": true } }
{ "ok": false, "error_code": 401, "description": "UNAUTHORIZED_BOT" }
```

## 3. Metodlar

| Metod | Parametrlar | Vazifasi |
| --- | --- | --- |
| `getMe` | — | Bot ma'lumotlari |
| `getUpdates` | `offset`, `limit` | Navbatdagi update'larni olish (max 100) |
| `sendMessage` | `user_id`, `text`, `payload`, `kind` | Foydalanuvchiga xabar |
| `answerWebAppQuery` | `user_id`, `text` | Mini app ichidagi so'rovga javob |
| `setWebhook` | `url` (https), `secret_token` | Update'larni webhook orqali olish |
| `deleteWebhook` | — | Webhook'ni o'chirish |
| `getWebhookInfo` | — | Webhook holati |
| `setMyCommands` | `commands` | Bot komandalar ro'yxati |
| `getMiniApp` / `setMiniApp` | `mini_app_id`, `url` | Botni mini app bilan bog'lash |

## 4. Update turlari

`message`, `mini_app_open`, `web_app_data`, `callback_query`, `payment`

Update namunasi:

```json
{
  "update_id": 42,
  "type": "mini_app_open",
  "payload": { "from_user_id": "uuid", "app_id": "uuid", "platform": "web" },
  "date": "2026-09-01T11:20:00Z"
}
```

## 5. Webhook imzosi

Har bir webhook so'rovi quyidagi sarlavhalar bilan keladi:

```
X-Alsamos-Bot-Signature: sha256=<HMAC_SHA256(secret, body)>
X-Alsamos-Bot-Secret-Token: <secret>
```

Serveringiz imzoni tekshirishi SHART. `setWebhook` faqat `https://` qabul qiladi.

## 6. Superapp -> bot (foydalanuvchi tomonidan)

Mini app ochilganda yoki foydalanuvchi botga yozganda superapp shu metodni chaqiradi
(foydalanuvchi JWT bilan):

```bash
curl -X POST "$BASE/bot-api/pushUpdate" \
  -H "Authorization: Bearer $USER_JWT" \
  -H "Content-Type: application/json" \
  -d '{"bot_username":"mybot","type":"mini_app_open","payload":{"app_id":"..."}}'
```

Update navbatga yoziladi va webhook sozlangan bo'lsa darhol yetkaziladi.

## 7. Xavfsizlik

- Token bazada faqat `sha256` hash sifatida saqlanadi (`bots.token_hash`).
- `bot_authenticate`, `bot_dequeue_updates`, `bot_send_message` faqat service role
  (edge function) uchun ochiq.
- RLS: bot egasi faqat o'z botlari, update va xabarlarini ko'radi.
- Mini app SDK imzosi (`initData` HMAC) `sdk.md` da hujjatlashtirilgan.

## 8. Deploy

```bash
supabase functions deploy bot-api
```

Migratsiya: `supabase/migrations/20260901040000_alsamos_bot_api.sql`

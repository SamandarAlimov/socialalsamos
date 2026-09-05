# Mini App SDK protokoli

Mini app Alsamos ichida iframe (web) yoki WebView (mobil) sifatida ochiladi.
Aloqa `postMessage` orqali, so'rov/javob juftligi bilan boradi.

Hozirgi web host SDK versiyasi: **2.1.0**.

## So'rov formati (mini app -> host)

```json
{
  "source": "alsamos-mini-app",
  "id": "unikal-id",
  "method": "getInitData",
  "params": {}
}
```

## Javob formati (host -> mini app)

```json
{
  "source": "alsamos-host",
  "id": "unikal-id",
  "result": { },
  "error": null
}
```

## Metodlar

| Metod | Ruxsat | Natija |
| --- | --- | --- |
| `ready` | — | `{ sdkVersion, platform, permissions, theme }` |
| `getInitData` | `profile` | imzolangan `initData` (quyida) |
| `close` | — | `{ closed: true }` |
| `openLink` | — | `{ opened: true }` (URL normalizatsiya qilinadi) |
| `share` | — | `{ shared: true }` |
| `requestPayment` | `payments` | foydalanuvchi tasdig'idan keyin final `{ paymentId, status, amount, currency, transferId, error }` |

Ruxsat berilmagan metod chaqirilsa `error: "PERMISSION_DENIED"` qaytadi.

## `requestPayment` — xavfsiz Wallet checkout

Mini app hech qachon Wallet balansini o'zi debit qilmaydi va qabul qiluvchi user/account id'ni yubormaydi.
Merchant server tomonidan **tasdiqlangan mini app egasidan** aniqlanadi.

Mini app misol so'rovi:

```json
{
  "source": "alsamos-mini-app",
  "id": "pay-123",
  "method": "requestPayment",
  "params": {
    "amount": 25000,
    "currency": "UZS",
    "description": "Premium obuna — 1 oy"
  }
}
```

Host oqimi:

1. `mini_app_payment_create` faqat `pending` intent yaratadi. **Bu bosqichda pul ko'chmaydi.**
2. Alsamos app nomi, summa, izoh va Wallet balansini o'z confirmation oynasida ko'rsatadi.
3. Foydalanuvchi `Tasdiqlash`ni bosgandagina `mini_app_payment_confirm` chaqiriladi.
4. Server merchantni qayta tekshiradi va canonical `wallet_transfer`/ledger orqali atomik settlement qiladi.
5. Faqat settlement muvaffaqiyatli bo'lgach iframe so'rovi `status: "paid"` bilan resolve bo'ladi.
6. Foydalanuvchi bekor qilsa `mini_app_payment_cancel` ishlaydi va pul ko'chmaydi.
7. Intent muddati tugasa `expired` qaytadi.
8. Confirmation retry idempotency key bilan himoyalangan; bitta intent ikki marta yechilmaydi.

Muvaffaqiyatli javob:

```json
{
  "source": "alsamos-host",
  "id": "pay-123",
  "result": {
    "paymentId": "uuid",
    "status": "paid",
    "amount": 25000,
    "currency": "UZS",
    "transferId": "uuid",
    "error": null
  },
  "error": null
}
```

Bekor qilingan javob:

```json
{
  "source": "alsamos-host",
  "id": "pay-123",
  "result": {
    "paymentId": "uuid",
    "status": "cancelled",
    "amount": 25000,
    "currency": "UZS",
    "transferId": null,
    "error": null
  },
  "error": null
}
```

Mini app biznes logikasi **faqat `status === "paid"`** bo'lganda mahsulot/xizmatni yetkazilgan deb hisoblashi kerak. `pending`, `cancelled`, `expired` yoki `failed` hech qachon paid sifatida qabul qilinmaydi.

## initData va imzo

`getInitData` `mini-app-init-data` edge funksiyasidan quyidagini oladi:

```
app_id=<uuid>&auth_date=<unix>&exp=<unix>&nonce=<uuid>&platform=web&user=<json>&hash=<hex>
```

Imzo Telegram Web App uslubida:

```
secretKey = HMAC_SHA256(key: "WebAppData", message: MINI_APP_SDK_SECRET)
hash      = HMAC_SHA256(key: secretKey,    message: dataCheckString)
```

`dataCheckString` — `hash` dan tashqari barcha kalitlar alifbo tartibida,
har biri `kalit=qiymat` ko'rinishida, `\n` bilan birlashtiriladi.

### Mini app backend'i imzoni qanday tekshiradi

1. O'zi hisoblaydi (`MINI_APP_SDK_SECRET` faqat Alsamos'da bo'lgani uchun tavsiya etilmaydi), yoki
2. Alsamos'ga so'rov yuboradi:

```
POST /functions/v1/mini-app-init-data?verify=1
{ "initData": "<yuqoridagi qator>" }
```

Javob: `{ ok: true, appId, userId, firstUse }`.

Qoidalar:

- `exp` muddati o'tgan initData rad etiladi (amal qilish muddati 1 soat).
- Har bir `nonce` bir marta ishlatiladi (`consumed_at` yoziladi) — replay hujumidan himoya.
- `user` obyektida faqat `id`, `username`, `name`, `photo_url` bo'ladi.
  **Email va telefon hech qachon uzatilmaydi.**

## Xavfsizlik eslatmalari

- Iframe `allow-same-origin` olmaydi, shuning uchun uning origin'i `null`.
  Host xabar manbasini `event.source === iframe.contentWindow` bo'yicha tekshiradi.
- Host hech qachon foydalanuvchi tokenini (JWT), Wallet credentialini, karta ma'lumotini yoki service-role key'ni mini app'ga bermaydi.
- To'lov faqat `payments` ruxsati bo'lgan, `approved` holatidagi ilova uchun ochiladi.
- Mini app client tomonidan merchant almashtirilmaydi; merchant `mini_apps.owner_id` orqali serverda olinadi.
- Pul harakati faqat canonical Wallet ledger/RPC ichida bajariladi.
- Payment intentni yaratish to'lovni amalga oshirish degani emas.

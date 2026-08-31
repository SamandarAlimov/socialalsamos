# Mini App SDK protokoli

Mini app Alsamos ichida iframe (web) yoki WebView (mobil) sifatida ochiladi.
Aloqa `postMessage` orqali, so'rov/javob juftligi bilan boradi.

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
| `requestPayment` | `payments` | `{ paymentId, status: "pending" }` |

Ruxsat berilmagan metod chaqirilsa `error: "PERMISSION_DENIED"` qaytadi.

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
- Host hech qachon foydalanuvchi tokenini (JWT) mini app'ga bermaydi.
- To'lov faqat `payments` ruxsati bo'lgan va moderatsiyadan o'tgan ilova uchun ochiladi;
  to'lov holatini faqat server (`service_role`) o'zgartira oladi.

# Mini App embed proxy (Cloudflare Worker)

Mini ilovalar **superapp ichida** ochilishi uchun kerak bo'lgan proksi.

## Nega Supabase Edge Function yetarli emas

Supabase `*.supabase.co/functions/v1/...` dan qaytgan HTML platforma tomonidan
`Content-Security-Policy: sandbox` bilan beriladi. Natijada iframe ichida JS
umuman ishga tushmaydi:

```
Blocked script execution in '.../mini-app-proxy?url=...' because the document's
frame is sandboxed and the 'allow-scripts' permission is not set.
```

Next.js/React saytlar (masalan islom.uz) butun kontentni JS bilan chizadi, shuning
uchun foydalanuvchi faqat bo'sh skeletonlarni ko'radi. Bu sarlavhani o'chirib
bo'lmaydi — proksi **o'z domenimizda** turishi shart.

## Deploy

```bash
npm install -g wrangler
cd workers/mini-app-proxy
wrangler login
wrangler deploy
```

So'ng Cloudflare dashboard'da custom domen ulang: `proxy.alsamos.com`.

## Frontend sozlamasi

`.env` (yoki hosting env) ga qo'shing:

```
VITE_MINI_APP_PROXY_ORIGIN=https://proxy.alsamos.com
```

Shundan keyin `buildOpenPlan` proksi qadamini shu domenga yo'naltiradi va
iframe `allow-scripts allow-same-origin` bilan ochiladi — sayt to'liq
interaktiv holda superapp ichida ishlaydi.

## Xavfsizlik

- `allow-same-origin` faqat **boshqa origin** (proxy.alsamos.com) uchun beriladi,
  shuning uchun mini ilova alsamos.com localStorage/cookie'lariga tegolmaydi.
- `ALLOWED_PARENTS` orqali proksini faqat alsamos.com iframe qila oladi
  (`frame-ancestors`).
- SSRF himoyasi: `localhost`, ichki IP diapazonlar, metadata manzillari va
  http(s) dan boshqa protokollar bloklangan; redirect har qadamda qayta
  tekshiriladi.
- `ALLOWED_HOSTS` to'ldirilsa faqat tasdiqlangan mini app domenlari ochiladi —
  ochiq proksi bo'lib qolmasligi uchun buni to'ldirish tavsiya etiladi.

## Manzil shakli

```
https://proxy.alsamos.com/p/https://islom.uz/
```

Path-prefix ataylab tanlangan: `<base href>` orqali barcha nisbiy havolalar
(`_next/static/...` chunk'lari ham) avtomatik proksi ichida qoladi. Ish vaqtida
yasaladigan `fetch` / `XMLHttpRequest` so'rovlari esa injekt qilingan kichik
skript orqali burib yuboriladi.

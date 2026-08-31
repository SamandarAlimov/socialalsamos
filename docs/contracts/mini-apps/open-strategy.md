# Ochish strategiyasi (web va Flutter uchun bir xil)

## 1. URL normalizatsiya va validatsiya

- Sxema majburiy `https:` ga keltiriladi (`example.com` -> `https://example.com`).
- Rad etiladi: `javascript:`, `data:`, `blob:`, `file:`, `ftp:` va boshqa sxemalar.
- Rad etiladi: `localhost`, `*.local`, `*.internal`, `127.0.0.0/8`, `10/8`,
  `172.16/12`, `192.168/16`, `169.254/16`, `::1`, `fc00::/7`, `fe80::/10`.
- `xn--` (punycode) domenlar ogohlantirish bilan belgilanadi.

## 2. Rejimlar tartibi

| `display_mode` | Qadamlar tartibi |
| --- | --- |
| `iframe` (default) | `embed` (agar mavjud bo'lsa) -> `direct` -> `proxy` -> `external` |
| `embed` | `embed` -> `proxy` -> `external` |
| `proxy` | `proxy` -> `external` |
| `external` | darhol tashqi brauzer / tashqi ilova |
| `webview` | Flutter: `InAppWebView`; web: `direct` -> `proxy` -> `external` |

- `direct` bosqichida yuklanish kutish vaqti: **8000 ms**.
- `proxy` bosqichida: **15000 ms**.
- Kutish vaqti tugagach keyingi qadamga o'tiladi; qadamlar tugasa aniq sabab ko'rsatiladi.

## 3. Iframe sandbox (web) — majburiy

```
allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox allow-modals allow-downloads allow-presentation
```

`allow-same-origin` **hech qachon** `allow-scripts` bilan birga berilmaydi — aks holda
sandbox amalda o'chadi va mini app host sahifaning `localStorage`/tokenlariga kirishi mumkin.

## 4. Framing'ni bloklaydigan hostlar

Quyidagi hostlar to'liq sayt sifatida iframe'da ishlamaydi, shuning uchun to'g'ridan-to'g'ri
tashqi ochiladi (embed havolasi bo'lmasa): `facebook.com`, `instagram.com` (post/reel'dan
tashqari), `x.com`, `twitter.com`, `linkedin.com`, `web.whatsapp.com`, `tiktok.com`,
`accounts.google.com`, `github.com/login`, `mail.google.com`, `chat.openai.com`.

## 5. Embed qoidalari

| Manba | Shart | Embed URL |
| --- | --- | --- |
| YouTube video | `?v=ID` | `https://www.youtube.com/embed/ID` |
| YouTube Shorts | `/shorts/ID` | `https://www.youtube.com/embed/ID` |
| YouTube playlist | `?list=ID` | `https://www.youtube.com/embed/videoseries?list=ID` |
| youtu.be | `/ID` | `https://www.youtube.com/embed/ID` |
| Vimeo | `/123456` | `https://player.vimeo.com/video/123456` |
| Instagram | `/p|reel|tv/ID` | `https://www.instagram.com/p/ID/embed/` |
| Telegram kanal | `t.me/name` | `https://t.me/s/name` |

Kanal/asosiy sahifa uchun **soxta embed URL yasalmaydi** (eski `?listType=search&list=` xatosi).
Embed topilmasa `null` qaytariladi va keyingi qadamga o'tiladi.

## 6. Telemetriya

Har bir ochish `mini_app_track_event` orqali yoziladi:
`open` (boshlanishida), `close` (`duration_ms` bilan), `error` (`error_code`: `timeout`,
`blocked`, `invalid_url`, `proxy_failed`).

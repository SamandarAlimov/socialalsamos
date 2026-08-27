# Alsamos Social — mahsulot vizyoni va talablar

Bu hujjat avval README ichida tarqoq holda yotgan mahsulot talablarini tartiblangan holda saqlaydi. README texnik hujjat, bu esa mahsulot hujjati.

## 1. Asosiy tamoyillar

- 100% haqiqiy, production darajasidagi frontend + backend
- Demo kontent yo'q — har bir funksiya haqiqatda ishlashi kerak
- Premium, ultra-zamonaviy UI/UX — faqat Alsamos dizayn tili
- Birinchi ekran: faqat Ro'yxatdan o'tish / Kirish. Login qilinmaguncha hech qanday tanishtiruv yo'q
- Chap tomonda universal navigatsiya (Alsamos Navigation System)
- Butun tizim AI bilan qo'llab-quvvatlanadi
- Enterprise darajasidagi xavfsizlik, zero tracking
- Dark + Light tema, silliq adaptiv animatsiyalar
- Realtime (WebSocket) dvigatel
- PWA + mobil ilovaga tayyor, SEO optimallashtirilgan
- Interfeys 3 tilda: uz / en / ru

## 2. Ekosistema integratsiyalari

`accounts.alsamos.com` · `pay.alsamos.com` · `drive.alsamos.com` · `maps.alsamos.com` · `cloud.alsamos.com` · `numbers.alsamos.com` · `ai.alsamos.com`

## 3. Autentifikatsiya (birinchi ekran)

- Markazlashtirilgan auth kartasi, yumshoq 3D chuqurlik, animatsiyali gradient fon
- Logotip yuqorida, tagline: "Welcome to the next generation of intelligent social connectivity."
- Kirish usullari (barchasi haqiqiy OAuth2): Alsamos ID, Email, Telefon raqam (global + Alsamos Online Numbers), Google, Apple, (ixtiyoriy) Yandex / Outlook / Yahoo
- Xavfsizlik: qurilmaga bog'lash, FaceID / TouchID, sessiya fingerprinting, AI fraud detection, multi-session boshqaruv, IP anomaliyalarini aniqlash, Kids Safe Mode
- Footer: Privacy • Terms • Help Center

## 4. Asosiy layout (login'dan keyin)

Login → `/home`.

Chap sidebar: Home, Search, Videos, Messages, Marketplace, Map, Notifications, Create, Profile, Settings, Admin (ruxsat bo'lsa).
Xulq: yupqa chizmali ikonkalar, hover animatsiyalari, kichik ekranlarda yig'iladigan, chapga fiksatsiya.

## 5. Modullar

### Feed (SmartFeed)
Cheksiz adaptiv scroll, AI shaxsiylashtirish, yuqorida story doiralari, "Moments" (1-sekundli mikro-storylar), filtrlar (Global / Friends / Business / Marketplace / Travel / Kids), reklama yo'q, avtomatik subtitrlar, realtime izohlar, live badge'lar.

### Profile
Uch rejim: Personal, Business/Creator, Kids.
Bo'limlar: cover, avatar, follow/connect, postlar grid, videolar, marketplace mahsulotlari, to'plamlar, Drive backup, live streamlar, statistika.
AI: profil menejeri, avto-bio, avto-caption, hashtag generator, o'sish tahlili.

### Messages (Super Messenger)
Barcha element Messages sahifasi ichida:
- Yuqorida qidiruv paneli (global qidiruv emas): odamlar, guruhlar, kanallar, xabarlar, fayllar; realtime taklif va AI semantik qidiruv
- Yonida `+` tugmasi: New Private Chat / Group / Channel / Secret Chat / Private Space
- **Ichki tabbar (sidebar'da emas!):** Private · Groups · Channels · Requests
- Tabbar ostida ro'yxat: avatar, ism, oxirgi xabar, vaqt, o'qilmagan soni, online/typing
- O'ng ustunda chat oynasi: header, xabarlar tarixi, input, attachment, qo'ng'iroq tugmalari

Xabar turlari: matn, rasm, video, audio, ovozli xabar, fayl (1TB gacha), havola preview, markdown, stiker, GIF.
Amallar: reply, forward, edit, delete (menga/hammaga), reaksiya, copy, Drive'ga saqlash, delivered/seen statuslari.
Xavfsizlik: E2E shifrlash, secret chat, vanish mode, qurilmaga bog'langan kalitlar, zero tracking.
AI: avto-javob taklifi, realtime tarjima, toksiklik filtri, ovozni matnga aylantirish, xabarlarni xulosalash.

### Groups & Channels
Guruhlar: bir nechta admin, ruxsatlar, pinned xabarlar, so'rovnomalar, slow mode, join link.
Kanallar: cheksiz obunachi, post rejalashtirish, reaksiyalar, ko'rish hisoblagichi, mahsulot tagging.

### Calls & Live (WebRTC)
- Signaling (WebSocket): SDP offer/answer, ICE candidate almashinuvi, room boshqaruvi, realtime qatnashchilar ro'yxati
- Har bir qatnashchi uchun alohida `RTCPeerConnection` (one-to-many / many-to-many), simulcast/SVC, dinamik bitrate
- Haqiqiy video/audio/screen-share oqimlari; adaptiv sifat 360p → 1080p
- Guruh qo'ng'iroqlari 3–50+ foydalanuvchi: dinamik grid, active speaker aniqlash, avatar fallback, ulanish sog'lig'i monitoringi
- Ichki boshqaruv: mute, kamera, qo'l ko'tarish, chat, rollar (host / speaker / listener)
- Live: host → cheksiz tomoshabin, WebRTC → HLS gibrid, realtime chat, reaksiyalar, past kechikish
- TURN/STUN (Coturn), NAT traversal, avtomatik fallback
- Qurilma boshqaruvi: kamera/mikrofon/audio-output almashtirish, hot-swap
- AI: fon blur, shovqin bosish, echo cancellation, auto-gain, PiP

### Videos
AI subtitrlar, video yaxshilash, avto-effektlar, monetizatsiya, tipping, creator konsoli, SEO.

### Marketplace
Video ichida mahsulot tagging, tap → mahsulot kartasi, Alsamos Pay bilan tezkor checkout, sotuvchi paneli, yetkazib berish, ombor, live-shopping.
AI: avto-tavsif, avto-narx, avto-teg, trend prognozi.

### Map
Realtime foydalanuvchi xaritasi, hotspotlar (Registon, Ichan Qal'a, global diqqatga sazovor joylar), geo-feed, yaqin atrofdagilar, mahalliy tadbirlar, biznes manzillari, hududga ko'ra mahsulotlar, joylashuv maxfiyligi.
AI: tavsiyalar, sayohat takliflari, kids-safe marshrutlar.

### Settings
Maxfiylik, qurilma tarixi, kirish tarixi, to'lov tarixi, kids mode, til, AI sozlamalari, Drive backup, ekosistema integratsiyalari.

### Admin (Alsamos Control Center)
AI-first moderatsiya, global analitika, hisobotlar tizimi, abuse va fraud detection, bolalar xavfsizligi, moderator loglari.

## 6. AI dvigatellari

Feed AI (reyting) · Vision AI (moderatsiya, blur, yaxshilash) · NLP AI (chat, tarjima, toksiklik) · Marketplace AI · Map AI · Profile AI · Moderator AI

## 7. Yakuniy majburiy oqim

1. Foydalanuvchi kiradi → faqat Login / Sign up ko'rinadi (feed yo'q, tanishtiruv yo'q)
2. Login'dan keyin → `/home` va butun platforma ochiladi

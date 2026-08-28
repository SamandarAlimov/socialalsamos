# Arxitektura qarorlari (ADR) va uzoq muddatli vizyon

Ushbu hujjat `docs/ROADMAP.md` bilan birga o‘qiladi. ROADMAP — nima qilinadi,
bu hujjat — nega aynan shunday qilinadi. Har bir qaror o‘zgarganda yangi ADR
qo‘shiladi, eskisi o‘chirilmaydi (faqat `Holati: bekor qilindi` deb belgilanadi).

---

## ADR-001 — Video qayta ishlash: gibrid (klient + server)

**Holati:** qabul qilindi (2026-08-28)

**Qaror.** Ikkitasidan birini tanlash o‘rniga vazifa bo‘yicha taqsimlanadi:

| Vazifa | Qayerda | Sabab |
| --- | --- | --- |
| Trim, crop, rotate, tezlik, musiqa mux (< 60 s, < 150 MB) | Klient, `ffmpeg.wasm` (Web Worker) | Darhol natija, server xarajati nol, offline ham ishlaydi |
| Filtr/effekt preview | Klient, WebGL (real-time) | 60 FPS talab qiladi, serverga bormaydi |
| Uzun video, 4K, HLS/DASH transcode, thumbnail sprite, NSFW tekshiruv | Server (Supabase Edge Function → ish navbati) | Telefon batareyasi va xotirasi yetmaydi; iOS Safari wasm limitlari |
| Reel eksporti (final render) | Klient birinchi, xato bo‘lsa serverga fallback | Tezlik + ishonchlilik |

**Amalga oshirish tartibi.** `src/lib/video/` papkasi: `ffmpegClient.ts` (lazy
load, `crossOriginIsolated` tekshiruvi), `videoJobs.ts` (server navbati bilan
muloqot), `pipeline.ts` (qaysi yo‘lni tanlashni hal qiladi). Klient yo‘li
ishlamasa foydalanuvchiga xato ko‘rsatilmaydi — jim tarzda serverga o‘tadi.

**Xarajat nazorati.** Server transcode faqat: davomiyligi > 60 s, yoki hajmi
> 150 MB, yoki klient 2 marta muvaffaqiyatsiz bo‘lganda. Har bir foydalanuvchi
uchun kunlik server-daqiqa limiti (`video_jobs` jadvalida hisoblanadi).

---

## ADR-002 — Musiqa katalogi: Jamendo asosiy, Audius ikkinchi manba

**Holati:** qabul qilindi (2026-08-28)

**Qaror.** Bir manbaga bog‘lanmaymiz. `music_tracks.source` enum allaqachon
bor, shuning uchun katalog federatsiyalangan bo‘ladi:

1. **Jamendo** — asosiy. Sababi: rasmiy API, aniq Creative Commons litsenziya
   metadatasi, to‘liq trek yuklab olish, tijorat foydalanish uchun ruxsat
   yo‘llari mavjud. Litsenziya `license` maydoniga majburiy yoziladi.
2. **Audius** — ikkinchi. Zamonaviy/elektron musiqa uchun yaxshi, lekin
   litsenziya metadatasi bir xil emas — shuning uchun faqat trek egasi ruxsat
   bergan (`is_downloadable`) treklar olinadi.
3. **Pixabay Music, Free Music Archive, ccMixter** — to‘ldiruvchi ingest.
4. **Foydalanuvchi yuklagan audio** — `source = 'device'`, faqat o‘ziga
   ko‘rinadi (`is_public = false`), boshqalarga tarqatilmaydi.

**Qattiq qoida.** Litsenziyasi va atributsiyasi bo‘lmagan trek katalogga
kirmaydi. Postda musiqa ishlatilsa, atributsiya avtomatik ko‘rsatiladi.

**Ingest.** Kunlik cron Edge Function: yangi treklarni oladi, audio faylni
o‘z storage’imizga ko‘chiradi (tashqi API o‘chsa musiqa yo‘qolmasligi uchun),
waveform peaklarini oldindan hisoblaydi.

---

## ADR-003 — Reel maksimal davomiyligi: 10 daqiqa

**Holati:** qabul qilindi (2026-08-28)

**Qaror.** 10 daqiqa — 5 daqiqadan yaxshi. Sabab: qisqa limit kontent
ijodkorlarini boshqa platformaga haydaydi, uzun limit esa faqat texnik masala
(u ADR-001 dagi server transcode bilan hal qilingan). Lekin limit bosqichli:

| Rejim | Limit | Standart holat |
| --- | --- | --- |
| Tez reel (kamerada olish) | 90 sekund | Standart |
| Galereyadan yuklash | 10 daqiqa | Ruxsat etilgan maksimum |
| Story | 60 sekund (uzunroq video avtomatik bo‘laklanadi) | — |

**Texnik ramka.** Maksimal 1080×1920, 30/60 FPS, H.264 + AAC, 2 daqiqadan
uzun videolar uchun HLS (360p/720p/1080p). Hajm limiti 512 MB (mavjud
`postComposer` cheklovi bilan bir xil).

---

## ADR-004 — So‘rovnoma turlari: rasmli va slayder v1 ga kiradi

**Holati:** qabul qilindi (2026-08-28)

**Qaror.** Birinchi versiyada 5 tur:

1. **Oddiy** — bir yoki bir nechta variant tanlash.
2. **Kviz** — to‘g‘ri javob + izoh (allaqachon bor).
3. **Rasmli** — har bir variantga rasm (`poll_options.image_url`).
4. **Slayder** — 0–100 yoki ixtiyoriy diapazon, natija o‘rtacha qiymat
   (`polls.poll_type = 'slider'`, `min_value`, `max_value`, `step`,
   `poll_votes.numeric_value`).
5. **Reyting** — 1–5 yulduz (slayderning maxsus ko‘rinishi).

**Migratsiya.** `polls` jadvaliga `poll_type` enum, `min_value`, `max_value`,
`step`, `left_label`, `right_label`; `poll_options` ga `image_url`;
`poll_votes` ga `numeric_value` qo‘shiladi. Barcha yangi maydonlar `NULL`
qabul qiladi, shuning uchun mavjud so‘rovnomalar buzilmaydi.

---

## ADR-005 — Geokodlash: o‘z proksi serverimiz orqali

**Holati:** qabul qilindi (2026-08-28)

**Qaror.** Ommaviy Nominatim to‘g‘ridan-to‘g‘ri brauzerdan chaqirilmaydi
(foydalanish shartlari buzilmasligi va rate-limit uchun). Yo‘l:

1. Birinchi navbatda o‘z bazamiz: `places` jadvali + `pg_trgm` qidiruv.
2. Topilmasa — Edge Function proksi (`VITE_GEOCODER_URL`), u Photon/Nominatim
   ga so‘rov yuboradi, javobni keshlaydi va yangi joyni `places` ga yozadi.
3. Har bir foydalanuvchi uchun rate-limit va 24 soatlik kesh.

Natijada platformamizning joy bazasi vaqt o‘tishi bilan mustaqil bo‘lib boradi.

---

## Uzoq muddatli vizyon: 2026 Q3 → 2028

### 2026 Q3 (hozir) — Poydevor
Post yaratish oqimi to‘liq ishonchli bo‘ladi: har qanday fayl turi, mukammal
so‘rovnoma, joylashuv (ikki rejim), 10 hammuallif, formatlash, hashtag.
Lentada barcha yangi kontent to‘g‘ri ko‘rinadi. Eski `CreatePage.tsx`
nafaqaga chiqadi. **Chiqish mezoni:** post joylash muvaffaqiyati > 99%.

### 2026 Q4 — Media tahrirlash va effektlar
ffmpeg.wasm quvuri, rasm crop/filtr, video trim/tezlik, MediaPipe yuz
effektlari, gl-transitions o‘tishlari, musiqa mux. **Chiqish mezoni:** mobil
qurilmada preview 30 FPS dan tushmaydi, eksport 60 s videoda < 20 s.

### 2027 Q1 — Story va Reel professional darajada
`stories`, `story_media`, `story_views`, `story_reactions`, `reels` sxemasi;
stikerlar, so‘rovnoma/savol stikerlari, ko‘rganlar ro‘yxati, highlight,
arxiv, yaqin do‘stlar; reel muqovasi, remix/duet, ko‘rish vaqti metrikasi.
**Chiqish mezoni:** story tugatish darajasi > 60%.

### 2027 Q2 — Tarqatish va tavsiya
`post_signals` jadvali, lenta reytingi (yangilik + qiziqish + yaqinlik),
hashtag va joy sahifalari, server tomonidagi qidiruv, "Siz uchun" tasmasi.
**Chiqish mezoni:** kunlik faol foydalanuvchi seans uzunligi +25%.

### 2027 Q3 — Ishonch va xavfsizlik
Moderatsiya navbati, NSFW tekshiruv (server), fayl turini server tomonda
tekshirish, rate limiting, shikoyat oqimi, yosh cheklovi, live joylashuv
uchun maxfiylik nazorati. **Chiqish mezoni:** shikoyatga javob vaqti < 1 soat.

### 2027 Q4 — Sifat va ishonchlilik
`types.ts` qayta generatsiya qilinadi va `src/lib/db.ts` o‘chiriladi;
vitest + Playwright qamrovi; rejalashtirilgan post publisher cron; xatolik
kuzatuvi; offline navbat (post internet qaytganda yuboriladi).
**Chiqish mezoni:** kritik oqimlarda test qamrovi > 70%.

### 2028 — Platforma
Ochiq API va webhooklar, ijodkor monetizatsiyasi, mini-ilovalar SDK si,
ko‘p tilli avtomatik subtitr, tavsiya modelini o‘z serverimizda o‘qitish.

---

## O‘zgarmas tamoyillar (buzilmaydi)

1. `.env` fayliga hech qachon tegilmaydi.
2. Post matni ichida texnik marker saqlanmaydi — hamma narsa jadvalda.
3. Har bir yangi jadval RLS bilan himoyalanadi.
4. Yangi maydonlar `NULL` qabul qiladi — eski kontent hech qachon buzilmaydi.
5. Litsenziyasiz media platformaga kirmaydi.
6. Mobil qurilma birinchi: scroll, klaviatura va touch har bir dialogda
   tekshiriladi.

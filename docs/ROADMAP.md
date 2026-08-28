# Alsamos Social — uzoq muddatli yo'l xaritasi

Oxirgi yangilanish: 2026-08-28

Bu hujjat qisqa vazifalar ro'yxati emas. Bu — platformani Instagram / TikTok /
Telegram darajasidagi kontent tizimiga olib chiqish uchun **12–18 oylik** reja.
Har bosqichda: maqsad, ish hajmi, tugallanganlik mezoni va xatarlar bor.

## 0. Tamoyillar (o'zgarmaydigan qoidalar)

1. **Ma'lumot strukturali bo'ladi.** Kontent post matniga marker sifatida
   yozilmaydi (`[POLL]`, `[MUSIC:id]`, `📍`, `[FILTER:id]` — bularning barchasi
   yo'q qilinadi). Har bir tushuncha o'z jadvalida yashaydi.
2. **Har bir tugma haqiqatda ishlaydi.** "Bor, lekin ishlamaydi" holati
   xatolik hisoblanadi. Ishlamaydigan funksiya UI ga chiqmaydi.
3. **Mobil birinchi.** Har bir oyna barmoq bilan sinaladi: scroll, klaviatura
   ostidagi maydonlar, hover'ga bog'liq bo'lmagan menyular.
4. **Xatolar ko'rinadi.** Fayl yuklanmasa foydalanuvchi biladi va qayta urinadi;
   jimgina yo'qolish yo'q.
5. **Faqat ochiq va litsenziyasi toza manbalar.** Musiqa, effekt, xarita —
   hammasi litsenziyasi va atributsiyasi bilan saqlanadi.
6. **`.env` va sirlar hech qachon repoga tegmaydi.**

## 1. Bosqichlar

### 1-bosqich — Poydevor (BAJARILDI)

- `posts` jadvaliga `post_kind`, `status`, `scheduled_at`, `published_at`,
  `has_poll`, `formatted_content`, `edit_state`
- Yangi jadvallar: `post_media`, `places`, `post_locations`, `polls`,
  `poll_options`, `poll_votes`, `hashtags`, `post_hashtags`, `music_tracks`,
  `post_music`
- RLS siyosatlari, triggerlar (ovoz tekshiruvi, hashtag sinxroni,
  hammuallif limiti 10), `search_hashtags` / `trending_hashtags` RPC lari
- Maxfiylik bug'i tuzatildi (`visibility` saqlanmasdi)

**Natija mezoni:** post yaratilganda barcha meta ma'lumot jadvallarga tushadi.

### 2-bosqich — Yuklash va matn (BAJARILDI)

- Har qanday turdagi fayl (`*/*`), 10 tagacha, har biriga alohida progress
- Signed upload URL + XHR progress, bekor qilish, qayta urinish
- Barcha turlar uchun preview (rasm, video, audio, hujjat, arxiv)
- Formatlash: qalin, qiya, chizilgan, tagi chizilgan, kod, H1–H3, sitata,
  ro'yxat, rang

**Natija mezoni:** 500 MB video va ZIP fayl ham progress ko'rsatib yuklanadi.

### 3-bosqich — So'rovnoma, joylashuv, hashtag (BAJARILDI)

- Real ovoz beruvchi so'rovnoma (2–12 variant, ko'p tanlov, anonim, viktorina,
  muddat, realtime natijalar)
- Ikki rejimli joylashuv: joy tanlash (xaritada pin, qidiruv, atrofdagi joylar)
  va real vaqtli ulashish (avtomatik yangilanish + to'xtatish)
- Hashtag qidiruvi `pg_trgm` indeksi bilan (kirill/lotin)

**Natija mezoni:** ovoz bergan foydalanuvchi natijani realtime ko'radi.

### 4-bosqich — Lenta integratsiyasi (JARAYONDA)

- `PostExtras` bloki: strukturali media galereyasi, so'rovnoma, joylashuv
- `RichText` renderer'i post matniga ulanadi
- `/create` o'rniga `/compose`; eski 56 KB lik `CreatePage` o'chiriladi
- Eski markerlar (`[POLL]`, `[MUSIC:]`, `📍`, `👥 with`) bir martalik
  migratsiya bilan yangi jadvallarga ko'chiriladi

**Natija mezoni:** yangi oqimda joylangan post lentada to'liq ko'rinadi;
eski postlar ham buzilmaydi.

### 5-bosqich — Media tahrirlagichlar (2–3 hafta)

- **Rasm:** crop (aspect ratio presetlari), aylantirish, yorqinlik/kontrast,
  filtrlar (CSS matritsalari → canvas orqali fayl sifatida saqlanadi), matn va
  sticker overlaylari
- **Video:** `ffmpeg.wasm` bilan trim, crop, aylantirish, sifat/format
  eksporti, musiqa mux qilish, poster kadr tanlash
- `edit_state` real faylga qo'llanadi (hozir faqat saqlanadi)
- Katta fayllar uchun Web Worker + progress; iOS Safari cheklovlari alohida
  sinaladi

**Xatar:** `ffmpeg.wasm` mobil brauzerda sekin. Yechim: 60 sekunddan uzun yoki
720p dan yuqori videolar server tomonida (Edge Function + ffmpeg) qayta
ishlanadi. Qaror talab qilinadi.

### 6-bosqich — Haqiqiy effektlar va AR (3–4 hafta)

- MediaPipe Tasks Vision (face landmarker) + WebGL/three.js niqoblar
- Ochiq manbali LUT va shader effektlari (gl-transitions, OpenCV.js)
- Yozib olishda kodek negotiatsiyasi (hozir `video/webm;codecs=vp9` qattiq
  yozilgan — iOS da ishlamaydi): `MediaRecorder.isTypeSupported` bo'yicha
  mp4/h264 → webm/vp9 → webm tartibida
- Effektlar katalogi bazada (`effects` jadvali), versiyalanadi

**Natija mezoni:** iPhone Safari va Android Chrome da yuz niqobi 25+ FPS.

### 7-bosqich — Musiqa ekotizimi (2–3 hafta)

- Qurilmadan yuklash (allaqachon `music_tracks.source='device'`)
- Platforma katalogi: admin yuklaydi, litsenziya va atributsiya majburiy
- Ochiq manbalar integratsiyasi: Jamendo, Audius, Free Music Archive,
  Pixabay Music, ccMixter — Edge Function orqali kesh va qidiruv
- Trek kesish (start/end), ovoz balandligi, original ovozni o'chirish
- Trek sahifasi: "bu musiqa bilan yaratilgan postlar" (TikTok'dagidek)

### 8-bosqich — Story va Reel (4–6 hafta)

- `stories`, `story_media`, `story_views`, `story_reactions`, `reels` sxemasi
- Story: 24 soat, ko'p slayd, sticker/so'rovnoma/savol/link stickerlari,
  ko'rganlar ro'yxati, javob berish, highlight'lar, arxiv
- Reel: vertikal lenta, muqova tanlash, remiks/duet, musiqa atributsiyasi,
  ko'rish vaqti metrikasi
- Yopiq do'stlar (close friends) va tanlangan auditoriya

### 9-bosqich — Tarqatish va tavsiya (3–4 hafta)

- Lenta reytingi: qiziqish signallari (ko'rish vaqti, saqlash, ulashish)
- Hashtag va joy sahifalari, trend hisoblash (vaqt oynasi bilan)
- Qidiruvni to'liq serverga o'tkazish (hozir ba'zi joyda klientda regex)
- Tavsiya uchun `post_signals` jadvali va materialized view

### 10-bosqich — Ishonch, xavfsizlik, moderatsiya (uzluksiz)

- Shikoyat qilish oqimi, moderatsiya navbati, avtomatik NSFW tekshiruv
- Fayl turi va hajmi server tomonida qayta tekshirilishi (hozir faqat klient)
- Rate limiting: post, ovoz, yuklash
- Audit log va admin panel yaxshilanishi

### 11-bosqich — Sifat va ishonchlilik (uzluksiz)

- `src/integrations/supabase/types.ts` qayta generatsiya, `src/lib/db.ts`
  ko'prigini o'chirish
- Vitest bilan test: `richText`, `polls`, `postComposer`, `geocoding`
- E2E (Playwright): post yaratish, ovoz berish, joylashuv ulashish
- Rejalashtirilgan postlarni e'lon qiluvchi cron (Edge Function)
- Xatolarni kuzatish (Sentry yoki shunga o'xshash), performance budjeti

## 2. Choraklar bo'yicha taqsimot

| Chorak | Asosiy maqsad |
| --- | --- |
| 2026 Q3 | 1–4 bosqich: poydevor, yuklash, so'rovnoma/joylashuv, lenta |
| 2026 Q4 | 5–7 bosqich: tahrirlagichlar, effektlar, musiqa |
| 2027 Q1 | 8-bosqich: story va reel to'liq |
| 2027 Q2 | 9-bosqich: tarqatish, tavsiya, qidiruv |
| 2027 Q3–Q4 | 10–11 bosqich: moderatsiya, test qoplami, masshtab |

## 3. O'lchov ko'rsatkichlari

- Post yaratish muvaffaqiyati > 99% (xatolik bilan tugagan urinishlar ulushi)
- Fayl yuklash o'rtacha tezligi va uzilishlarda qayta urinish muvaffaqiyati
- Composer'ni tashlab ketish darajasi (ochdi, lekin joylamadi)
- So'rovnomada ovoz berish ulushi, story tugatish ulushi, reel ko'rish vaqti
- Mobil FPS: composer va effektlarda 60 FPS maqsad, minimal 30

## 4. Ochiq qarorlar (foydalanuvchi tasdig'i kerak)

1. Video qayta ishlash: faqat klient (`ffmpeg.wasm`) yoki server (Edge Function)?
2. Musiqa katalogining asosiy manbasi: Jamendo yoki Audius?
3. Geokodlash: ochiq Nominatim/Photon (limitli) yoki o'z serverimiz?
4. Reel cheklovlari: maksimal davomiylik va ruxsat etilgan o'lcham?
5. So'rovnomaning rasm va slayder turlari birinchi versiyaga kiradimi?

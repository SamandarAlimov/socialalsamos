# Create oqimi: audit va professional daraja rejasi

Sana: 2026-08-31 · Tekshirilgan commit: `9978193`

Bu hujjat **ikki repo uchun bitta reja**:

- `SamandarAlimov/socialalsamos` — web (Vite + React + TS)
- `SamandarAlimov/alsamos-superapp` — Flutter superapp (Android / Web / Windows)

Ikkalasi **bir Supabase bazasini** ishlatadi. Shu sababli har bir bosqichda
“baza → web → superapp” tartibi saqlanadi va ikki mijoz bir-biridan uzoqlashib
ketmaydi (“nomutanosib” bo‘lmaydi).

---

## 0. Hozirgi holat (fakt)

Eski monolit `src/pages/CreatePage.tsx` **o‘chirilgan** — ko‘chish yakunlangan:

- `/create` → `CreateEntryPage.tsx` (385 B) → `ComposePage.tsx`
- 4 rejim: **post / story / reel / live** (`?mode=` parametri)
- Qoralama faol bo‘lsa rejim almashish bloklanadi (`currentModeLocked`)

Modullar: `PostComposer` (40 KB), `StoryComposer` (21 KB), `ReelComposer` (33 KB),
`LiveStreamBroadcast`, `RichTextComposer` (18 KB), `ImageEditor` (14 KB),
`VideoEditor`, `CameraVideoRecorder` (21 KB), `PollComposer` (22 KB),
`LocationPicker` (23 KB), `MusicPicker` (25 KB), `StickerStudio` (20 KB),
`StoryStickerComposer` (27 KB), `SchedulePostDialog`, `AttachmentGrid`.

Baza tomoni kuchli: `atomic_create_publish`, `create_visibility_media`,
`publish_formatted_content`, `create_p0_poll_storage`, `unified_story_foundation`,
`story_draft_lifecycle` (`create_story_draft` / `activate_story_draft` /
`discard_story_draft`), `post_music_private_storage`, `collaboration_lifecycle`,
`sticker_schema_compat`.

Story oqimi to‘g‘ri qurilgan: media yuklanadi → yashirin qoralama (`postId`,
`mediaId`) → stiker kompozitori → `activate_story_draft`. Qoralama tashlab
ketilsa `discard_story_draft` bilan tozalanadi.

---

## 1. Yetib borilmagan va ishlamaydigan joylar

### P0 — UI bor, backend yo‘q (foydalanuvchi “ishlamaydi” deb ko‘radi)

| # | Muammo | Dalil | Natija |
| --- | --- | --- | --- |
| 1 | **Rejalashtirilgan post hech qachon chiqmaydi** | `SchedulePostDialog` bor, `scheduled_at` yoziladi; `supabase/functions/` da post publisher **yo‘q** (`send-scheduled-messages` faqat chat uchun) | Post navbatda muzlab qoladi |
| 2 | **Serverda video/stiker kuydirish bajarilmaydi** | `video_jobs` navbati va `enqueueBurnJob` bor; navbatni iste‘mol qiluvchi worker **yo‘q** | Uzun video `pending`da qoladi |
| 3 | **Platforma musiqa katalogi bo‘sh** | `music_tracks`, `music_ingest_runs`, `search_music_tracks` bor; ingest funksiyasi **yo‘q** | MusicPicker’da platforma treklari chiqmaydi |
| 4 | **Effektlar haqiqiy emas** | `EffectsPicker.tsx` — 875 B, faqat `CameraVideoRecorder`ga o‘tkazuvchi qobiq | “Effekt” bor, effekt yo‘q |
| 5 | **AR filtrlar ishlamaydi** | `ARFaceFilters.tsx` bor, MediaPipe/three.js o‘rnatilmagan | Yuz filtri yuklanmaydi |
| 6 | **Geokoder proksi yo‘q (ADR-005)** | `geocoding.ts` Photon/Nominatim’ga to‘g‘ridan-to‘g‘ri uriladi | Rate-limit / CORS xatolari |
| 7 | **Stiker NSFW tekshiruvi majburiy emas** | `sticker-moderation` bor, yuklashdan keyin chaqirilishi kafolatlanmagan; `sticker_moderators` seed qilinmagan | Moderatsiya navbati bo‘sh qoladi |

### P1 — Yarim ulangan

8. **Trend stikerlar** — `trending_stickers` + `useStickerTrends` bor, `StickerStudio`da raf yo‘q, `logUsage` chaqirilmaydi.
9. **Story stiker javoblari** — unified story graph bor, lekin `StoryViewer` uzatgan ID unified `post_id` ekanini tasdiqlovchi test yo‘q.
10. **Poll yangi turlari** — bazada rasm/slayder/reyting bor, `PollComposer`da to‘liq UI yo‘q.
11. **Kollaboratsiya** — `collaboration_lifecycle` (taklif/qabul) bor; composer’da taklif holati ko‘rsatilmaydi.
12. **Live** — `live-stream-signaling` bor, ammo live rejimi uchun draft-lock yo‘q: efir vaqtida rejim almashib ketishi mumkin.

### P2 — Sifat qarzi

13. `PostComposer` 40 KB — yana monolitga aylanmoqda.
14. Eski dublikatlar: `PollCreator`, `EnhancedPollCreator`, `GifStickerPicker` qobig‘i.
15. Uchta o‘xshash preview qatlami: `MediaPreviewContainer`, `ResponsiveMediaPreview`, `AttachmentGrid`.
16. Create oqimi uchun bitta ham test yo‘q.

---

## 2. Dizayn: map UI tiliga keltirish

Mos yozuvlar namunasi — yangilangan map UI (`src/components/map/MapBottomSheet.tsx`,
`MapQuickActions`, `PlaceDetailsCard`):

| Belgi | Qiymat |
| --- | --- |
| Radius | mobil `rounded-t-[28px]`, desktop `rounded-[24px]` |
| Fon | `bg-background/92` (mobil), `bg-background/82` (desktop) |
| Blur | `backdrop-blur-2xl` |
| Chegara | `border-border/50`; desktop `border-border/45` + `ring-1 ring-white/10` |
| Soya | `shadow-2xl` |
| Mobil model | snap-sheet: `peek` 112 px / `half` ~54 vh / `full` ~90 vh |
| Sudrash | pointer capture + tezlik (`>0.55 px/ms` → keyingi snap), aks holda eng yaqin snap |
| Tutqich | `h-1.5 w-11 rounded-full bg-muted-foreground/35` |
| Desktop | chapda doimiy `w-[376px]` panel, kontent o‘ngda |
| Qatlam | `z-[1150]` |

Create hozir bunday emas: oddiy `border-b` header, `bg-muted/30` tab guruhi,
`sm:rounded-2xl` kartochkalar. Ikki sahifa boshqa-boshqa mahsulotdek ko‘rinadi.

**Yechim:** `MapBottomSheet` mantiqini umumiy `src/components/ui/snap-sheet.tsx`
ga ajratamiz (snap, drag, tezlik, desktop panel), keyin create uni ishlatadi:

- **Mobil**: media to‘liq ekranda, boshqaruv snap-sheetda; klaviatura chiqqanda
  `visualViewport` bilan balandlik moslashadi.
- **Desktop**: chapda `w-[376px]` glass boshqaruv paneli, o‘ngda live preview —
  map’dagi “panel + xarita” tuzilishining ko‘zgusi.
- Tugmalar `MapQuickActions` uslubida: dumaloq, glass, professional vektor
  ikonka (lucide) + mikro-yozuv. Emoji ikonka ishlatilmaydi.

---

## 3. Ikki repo muvofiqligi (majburiy shart)

### 3.1 Yagona haqiqat manbai — baza

Har qanday create imkoniyati **avval RPC/jadval sifatida** bazada bo‘ladi, keyin
ikki mijoz shu bitta shartnomani chaqiradi. Mijozda takrorlanadigan biznes
mantiq yozilmaydi.

Umumiy shartnoma (o‘zgarsa — ikki repo bir vaqtda yangilanadi):

| Sohа | Shartnoma |
| --- | --- |
| Post joylash | `atomic_create_publish` RPC + `post_media`, `post_locations`, `post_music`, `polls` |
| Story | `create_story_draft` / `activate_story_draft` / `discard_story_draft` |
| Story stiker | `story_stickers`, `respond_story_sticker`, `story_sticker_results` |
| Stiker | `search_stickers`, `touch_sticker_recent`, `trending_stickers`, `report_sticker` |
| Musiqa | `music_tracks`, `search_music_tracks` |
| Joylashuv | `places`, `post_locations` + geokoder proksi |
| Video ish | `video_jobs` (`sticker_burn`, `reel_render`) |
| Kollaboratsiya | `collaboration_lifecycle` RPClari, limit 10 |

### 3.2 Migratsiya qoidasi

Superapp qoidasi (`AGENTS.md`) qat‘iy: **additive/idempotent SQL** —
`IF NOT EXISTS`, `CREATE OR REPLACE FUNCTION`, `DROP POLICY IF EXISTS` →
`CREATE POLICY`, oxirida `NOTIFY pgrst, 'reload schema';`. Web repodagi yangi
create migratsiyalari ham shu uslubda yoziladi, chunki ular bir bazaga tushadi.
SQL superapp tomonida qo‘lda qo‘llanadi — shuning uchun har bosqichda
`docs/MIGRATIONS-TO-APPLY.md` ro‘yxati yuritiladi.

### 3.3 Parite jadvali (create)

| Imkoniyat | web (`socialalsamos`) | superapp (`lib/features/create`) |
| --- | --- | --- |
| Post: har qanday fayl | bor | tekshirish/ulash kerak |
| Rich-text formatlash | bor (`RichTextComposer`) | parite kerak |
| So‘rovnoma (5 tur) | qisman | parite kerak |
| Joylashuv (2 rejim + jonli) | bor | parite kerak |
| Stiker studiyasi | bor | parite kerak |
| Story qoralama oqimi | bor | parite kerak |
| Reel | bor (`ReelComposer`) | `lib/features/videos` bilan bog‘lash |
| Live | bor | `lib/features/live` bor — signaling bir xil bo‘lishi shart |
| Rejalashtirish | UI bor, backend yo‘q | backend tayyor bo‘lgach ikkisiga |
| Effekt / AR | yo‘q | yo‘q |

### 3.4 Dizayn tokenlari

Map dizayn tili ikki mijozda bir xil qiymatlar bilan takrorlanadi:
radius 28/24, blur, `ring-white/10` ekvivalenti, snap nuqtalari (112 px / 54% /
90%), tutqich o‘lchami, `z` tartibi. Flutter tomonida bu
`lib/core/theme` da konstantalar sifatida yoziladi, web tomonida
`snap-sheet.tsx` da. Qiymat o‘zgarsa — ikki repoda bir commitda o‘zgaradi.

---

## 4. Bosqichlar (P1 → P8)

Har bosqich: **baza → web → superapp → hujjat**. Bosqich yopilmaguncha
keyingisi boshlanmaydi.

### P1 — “Yolg‘on tugmalar” ni yo‘qotish (P0 ro‘yxati 1, 2)
- Edge Function `publish-scheduled-posts` + cron: `scheduled_at <= now()` bo‘lgan
  qoralamalarni `atomic_create_publish` orqali chiqarish, xato bo‘lsa qayta urinish.
- Edge Function `video-worker`: `video_jobs` navbatini olish, `progress`,
  `output_url`, `error` yozish; `sticker_burn` va `reel_render` turlari.
- Web: `SchedulePostDialog` → `PostComposer`ga ulanadi va navbat holati
  ko‘rsatiladi; `useStickerBurn` server yo‘nalishini kuzatadi.
- **Qabul mezoni:** rejalashtirilgan post o‘z vaqtida lentada paydo bo‘ladi;
  2 daqiqali video stikerlari bilan serverda render bo‘ladi.

### P2 — Create UI ni map dizayn tiliga o‘tkazish
- `src/components/ui/snap-sheet.tsx` (map mantiqidan ajratilgan).
- `ComposePage` + 4 kompozitor shu qatlamga o‘tadi; barcha ikonka professional
  vektor; mobil klaviatura bilan to‘g‘ri ishlash.
- **Qabul mezoni:** create va map yonma-yon skrinshotda bir mahsulotdek ko‘rinadi;
  mobil scroll/klaviatura nuqsonlari yo‘q.

### P3 — Media muharrirlari (haqiqiy natija)
- `ImageEditor` natijasi faylga qo‘llanishi (crop/filtr) va `post_media.edit_state`
  bilan mos bo‘lishi; `VideoEditor` trim/tezlik natijasi render bo‘lishi.
- `AspectRatioPicker` + `TextBackgroundPicker` yagona muharrirga birlashadi.
- **Qabul mezoni:** preview va yuklangan fayl bir xil; iOS Safari’da ham.

### P4 — Effektlar va AR (P0 4, 5)
- WebGL/gl-transitions filtr quvuri; MediaPipe face landmarker; `effects` jadvali.
- Bir xil filtr identifikatorlari ikki mijozda ham ishlaydi (`effects.slug`).
- **Qabul mezoni:** kamera preview, yozilgan fayl va serverdagi render bir xil filtr beradi.

### P5 — Musiqa (P0 3)
- `music-ingest` funksiyasi + cron (Jamendo asosiy, keyin Audius/FMA/Pixabay),
  waveform peaks; qurilmadan tanlash `post_music_private_storage` bilan.
- **Qabul mezoni:** qidiruvda kamida bir necha ming litsenziyali trek; reel/story
  ikkisida ham ishlaydi.

### P6 — So‘rovnoma, kollaboratsiya, joylashuv to‘liqligi (P1 10, 11, 6)
- Poll 5 tur UI; taklif holati; `geocoder-proxy` funksiyasi.
- **Qabul mezoni:** rasm variantli va slayder so‘rovnoma ishlaydi; 10 kishilik
  kollaboratsiya taklifi qabul/rad qilinadi; geokoder xatolari yo‘q.

### P7 — Stiker ekotizimini yopish (P0 7, P1 8, 9)
- Yuklashda majburiy NSFW; moderator seed; `StickerStudio`da trend rafi;
  `sticker_usage_events` uchun tozalash cron.
- **Qabul mezoni:** tekshirilmagan stiker ommaga chiqmaydi; trend raf real ma‘lumot ko‘rsatadi.

### P8 — Barqarorlik va parite
- `PostComposer`ni bo‘laklarga ajratish; eski dublikatlarni o‘chirish; vitest +
  Playwright (post/story/reel/live to‘rt senariy); `docs/CREATE-PARITY.md`
  jadvalini superapp bilan yopish.
- **Qabul mezoni:** ikki mijozda bir xil create imkoniyatlari; CI’da testlar yashil.

---

## 5. Ishni yuritish qoidalari

1. Faqat `main` — boshqa branch ishlatilmaydi.
2. `.env` fayllariga hech qachon tegilmaydi.
3. Bir bosqich = bir yo‘naltirilgan commit; tugallanmagan qobiq komponent
   qoldirilmaydi (“yolg‘on tugma” taqiqlanadi).
4. Har bosqich oxirida: shu hujjat yangilanadi + `docs/MIGRATIONS-TO-APPLY.md`
   ro‘yxatiga yangi SQL qo‘shiladi (superapp qo‘lda qo‘llashi uchun).
5. Superapp repoda kod/izohlar ingliz tilida, `dart analyze` majburiy;
   nozik fayllar ro‘yxatiga tegilmaydi.

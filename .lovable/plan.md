
# Create Page — Instagram-darajasidagi to'liq redesign

Katta hajmli refactor. 5 ta bosqichga bo'lamiz — har birini alohida turnda yetkazib beraman.

---

## Bosqich 1 — Layout va navigatsiya (fullscreen mode)

**Maqsad:** `/create` sahifasi mobile'da to'liq ekranni egallashi, header/bottom navbar ko'rinmasligi.

- `AppLayout.tsx`da `/create` route'ini "immersive" rejimga o'tkazish (header + bottom navbar yashiriladi).
- Mobile'da yuqorida faqat `X` close ikonkasi (background transparent, safe-area top).
- Tablet + Desktop'da X ikonka yo'q, standart sidebar/layout saqlanadi.
- Close bosilganda `navigate(-1)` — oldingi sahifaga qaytadi (fallback `/`).
- Body scroll lock mobile'da.

**Bottom tabbar (BottomNavbar.tsx):**
- Instagram uslubida 3 tomondan uzilgan floating shaffof tab bar (bg-black/40 + backdrop-blur-2xl, rounded-full yoki uzilgan corners, margin bilan pastda suzadi).
- Faqat mobile'da. Icon-only, active state — Alsamos orange.
- `/create` sahifasida tabbar yashirin.

---

## Bosqich 2 — Create page shell (tab arxitekturasi)

- Yuqorida capsul-uslubdagi mode switcher: **POST · STORY · REEL · LIVE** (Instagram'dagi pastdagi capsule kabi).
- Har bir mode alohida flow (component):
  - `CreatePostFlow` — kutubxona grid + preview + Next
  - `CreateStoryFlow` — camera/media + Aa text tools + stickers
  - `CreateReelFlow` — camera/upload + music + effects + speed + timer
  - `CreateLiveFlow` — Go Live pre-flight (title, camera preview, audience)
- Har bir flow o'z ichida step navigation ("New post → Edit → Share").
- Ochiladigan sheet/dialog'lar `h-[100dvh]` va ichki `overflow-y-auto` (scroll muammolari uchun fix).

---

## Bosqich 3 — Post flow (universal fayl yuklash)

- Media picker: Recents grid + camera tile + "Select multiple" (4 tagacha).
- **Universal file support:** image, video, audio (mp3), pdf, docx, pptx, xlsx, zip, apk, exe, msi, deb, svg va h.k.
- Non-media fayllar uchun "Attachment card" preview (icon + name + size + type badge).
- Aspect ratio picker (1:1, 4:5, 16:9, original) — MediaFrame bilan preview.
- Caption + mention/hashtag autocomplete.
- Storage bucket va DB `posts.media_urls` + yangi `posts.attachments` metadata (agar kerak bo'lsa migration).

---

## Bosqich 4 — Story & Reel flow

**Story (Instagram screenshot bo'yicha):**
- Fullscreen 9:16 canvas, chap tomonda vertical tool rail (Aa, Boomerang ∞, Layout, Stop).
- Yuqorida: flash, settings.
- Pastda katta capture tugmasi + gallery thumbnail.

**Reel:**
- Fullscreen 9:16, chap rail: Music, Effects, Speed (1x), Timer (60s), Green screen, Captions, Enhance.
- Yuqorida: flash, speed, timer, settings + "Add audio" pill.
- Editing step'ida: **YouTube-uslubdagi searchable caption** — hashtag/keyword tavsiyalar, qidiruvda topilishi uchun `title` + `description` fields.

---

## Bosqich 5 — Live flow + universal sizing rules

**Live (YouTube/Instagram):**
- Pre-flight: kamera preview + title input + audience selector (Public / Followers / Close friends).
- "Go Live" bosilganda mavjud `LiveStreamBroadcast` ochiladi.
- End screen: viewer count, duration, save to profile.

**Universal media sizing (bir marta MediaFrame'da centralize):**
| Kontekst | Aspect | Behavior |
|---|---|---|
| Post feed | Original (4:5 dan 1.91:1 gacha clamp) | object-contain, black bg |
| Story viewer | 9:16 | object-cover fullscreen |
| Reel viewer | 9:16 (16:9 letterbox) | contain, centered |
| Live | 16:9 | contain |
| Chat preview | Original clamped | contain |

---

## Texnik detallar

- Yangi fayllar: `src/pages/CreatePage.tsx` (redesign), `src/components/create/flows/{Post,Story,Reel,Live}Flow.tsx`, `src/components/create/CreateModeSwitcher.tsx`, `src/components/create/UniversalFileUploader.tsx`.
- Yangilanadi: `AppLayout.tsx` (immersive route detection), `BottomNavbar.tsx` (floating shaffof), `useFileUpload.ts` (kengaytirilgan MIME whitelist).
- Migration: `posts` jadvaliga `attachments jsonb` ustuni (fayl metadata uchun) — GRANT'lar bilan.
- Barcha Sheet/Dialog'larda `max-h-[100dvh] overflow-y-auto` — scroll fix.

---

## Yetkazib berish tartibi

1. **Turn 1:** Bosqich 1 (layout + shaffof tabbar) — ko'rinadigan darhol o'zgarish.
2. **Turn 2:** Bosqich 2 (shell + mode switcher + scroll fixes).
3. **Turn 3:** Bosqich 3 (Post + universal file uploader + migration).
4. **Turn 4:** Bosqich 4 (Story + Reel Instagram-uslubida).
5. **Turn 5:** Bosqich 5 (Live + sizing audit).

Har bosqichdan keyin tekshirasiz, kerak bo'lsa tuzatamiz, keyin keyingisiga o'tamiz.

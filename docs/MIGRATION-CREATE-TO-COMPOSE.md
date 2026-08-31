# `/create` → `/compose` ko‘chish rejasi

Holat: **boshlangan (M1 tugadi)** · Oxirgi yangilanish: 2026-08-31

## Nega bosqichma-bosqich

`src/pages/CreatePage.tsx` — 56 KB, bitta fayl ichida holat boshqaruvi, UI va
yuklash mantiqi aralashgan. Uni birdan o‘chirish quyidagi funksiyalarni
yo‘qotadi, chunki ular hali yangi oqimga ko‘chirilmagan:

| Modul | Fayl | Yangi oqimdagi holati |
| --- | --- | --- |
| Kameradan video yozish | `CameraVideoRecorder.tsx` | ko‘chirilmagan |
| Chizish qatlami | `DrawingCanvas.tsx` | ko‘chirilmagan |
| AR yuz filtrlari | `ARFaceFilters.tsx` | ko‘chirilmagan (Bosqich 6 ga bog‘liq) |
| Rejalashtirilgan post | `SchedulePostDialog.tsx` | ko‘chirilmagan (`scheduledAt` bazada bor) |
| Nisbat tanlash | `AspectRatioPicker.tsx` | ko‘chirilmagan |
| Matn foni | `TextBackgroundPicker.tsx` | ko‘chirilmagan |
| Musiqa tanlash | `MusicPicker.tsx` | ko‘chirilmagan (Bosqich 7 ga bog‘liq) |
| Effektlar | `EffectsPicker.tsx` | ko‘chirilmagan (Bosqich 6 ga bog‘liq) |

Yangi oqimda (`/compose` → `PostComposer`) allaqachon bor: har qanday turdagi
fayl, yuklash progressi, rich-text formatlash, so‘rovnoma, joylashuv (jonli
joylashuv bilan), hashtag, 10 kishilik kollaboratsiya, stiker muharriri va
endi interaktiv story stikerlari kompozitori.

## Bosqichlar

### M1 — Reja va parite ro‘yxati (tugadi)
Shu hujjat. Har bir ko‘chirilgan modul yuqoridagi jadvalda belgilanadi.

### M2 — Mustaqil modullarni ko‘chirish
Tashqi bog‘liqligi yo‘q va darhol ko‘chirila oladigan qismlar:
1. `SchedulePostDialog` → `PostComposer` (baza tomoni tayyor: `scheduled_at`).
2. `AspectRatioPicker` + `TextBackgroundPicker` → `StickerMediaEditor` yoniga
   qo‘shiladi, natija `post_media.edit_state` ga yoziladi.
3. `CameraVideoRecorder` → `usePostAttachments` ga to‘g‘ridan-to‘g‘ri fayl
   qo‘shish orqali ulanadi (`File` obyekti sifatida).

### M3 — Mobil aylantirish (scroll) nuqsonlarini tuzatish
Eski sahifadagi aniqlangan muammolar yangi oqimda takrorlanmasligi kerak:
- `MusicPicker` ichidagi ichma-ich scroll bloklanadi → bitta scroll konteyner.
- Emoji tanlagich faqat hoverda ochiladi → bosish (tap) bilan ham ochilishi.
- `EffectsPicker` drawer kesilib qoladi → `max-h-[85dvh]` + ichki scroll.
- Sarlavha inputi klaviatura ostida qoladi → `scrollIntoView` + `dvh`.

### M4 — Bosqich 6/7 ga bog‘liq modullar
`EffectsPicker`, `ARFaceFilters` va `MusicPicker` yangi arxitekturaga
ko‘chiriladi: MediaPipe + WebGL (Bosqich 6) va `music_tracks` katalogi
(Bosqich 7) tayyor bo‘lgach. Ular kuydirish quvuri (Bosqich E) bilan bir
xil kompozitordan foydalanadi — kod takrorlanmaydi.

### M5 — Marshrutni almashtirish
1. `/create` → `/compose` ga `Navigate replace` qilinadi.
2. Sidebar, pastki panel, FAB va barcha `navigate('/create')` chaqiruvlari
   yangilanadi.
3. Bir hafta kuzatiladi: xatolar va foydalanuvchi shikoyatlari.

### M6 — Nafaqaga chiqarish
`src/pages/CreatePage.tsx` va faqat u ishlatadigan komponentlar o‘chiriladi.
Shundan keyin eski markerlarni (`[POLL]`, `[MUSIC:id]`, `[FILTER:id]`,
`[TEXT_BG:id]`, `📍`, `👥 with`, `media_urls`) yangi jadvallarga ko‘chiruvchi
bir martalik migratsiya ishga tushiriladi.

## Nafaqaga chiqarish mezonlari

CreatePage o‘chirilishi mumkin, agar:
1. Yuqoridagi jadvalda “ko‘chirilmagan” qatori qolmasa;
2. M3 dagi to‘rt nuqson yopilgan bo‘lsa;
3. `/create` marshruti kamida bir hafta redirect holatida turgan bo‘lsa;
4. Eski markerlar migratsiyasi sinov bazasida muvaffaqiyatli o‘tgan bo‘lsa.

## Ulangan ishlar (yakunlangan)

- Moderator paneli: `/stickers/moderation`.
- Story stikerlari: `StoryViewer` va `/videos` reel pleyeriga ulandi
  (vaqt oynasi `currentTime` bilan ishlaydi).
- Story stiker kompozitori: `StoryStickerComposer` (drag, 10 tur, vaqt oynasi).

# Stiker moderatsiyasi va statistikasi (Bosqich F)

Ushbu hujjat yuklangan stikerlar uchun xavfsizlik quvurini va trend
hisobini tavsiflaydi.

## Asosiy printsip: xavfsiz nosozlik

Tizim buzilganda **ochiq** emas, **yopiq** holatga tushishi kerak. Shuning
uchun qoidalar bazada, klientda emas:

| Cheklov | Ma’nosi |
| --- | --- |
| `stickers_public_requires_approval` | Tasdiqlanmagan stiker ommaviy bo‘lmaydi |
| `stickers_public_requires_nsfw_check` | Tekshirilmagan stiker ommaviy bo‘lmaydi |
| `sticker_packs_public_requires_approval` | Tasdiqlanmagan paket ommaviy bo‘lmaydi |

Natija: Edge Function ishlamay qolsa yoki klient chetlab o‘tishga urinsa,
stiker shaxsiy holatda qoladi — boshqalarga ko‘rinmaydi.

## Oqim

1. Foydalanuvchi rasm yuklaydi → `useUserStickers.upload` (512×512 WebP).
2. Stiker `moderation_status = 'pending'`, `is_public = false` holatida
   yaratiladi.
3. Klient `sticker-moderation` Edge Function’ini chaqiradi.
4. Funksiya rasmni NSFW xizmatiga yuboradi va natijani yozadi:
   - `score >= 0.85` → avtomatik **rejected**
   - `score <= 0.15` → avtomatik **approved**
   - orasida yoki xizmat javob bermasa → **pending** (inson qaraydi)
5. Egasi paketni ommaga ochish so‘rovini yuboradi
   (`request_public_sticker_pack`, kamida 3 stiker).
6. Moderator `review_sticker` bilan qaror qabul qiladi. Paketdagi barcha
   stikerlar tasdiqlangach paket avtomatik ommaviy bo‘ladi.

## Nima uchun ikki chegara?

Bitta chegara qo‘yilsa, tizim yoki juda ko‘p halol stikerni bloklaydi,
yoki juda ko‘p shubhali stikerni o‘tkazib yuboradi. Ikki chegara oralig‘i
— "aniq emas" zonasi — inson moderatoriga yuboriladi. Bu navbat hajmini
kichik ushlab turadi.

## Shikoyatlar

`report_sticker` bir foydalanuvchidan bir marta qabul qiladi. **3 ta**
shikoyat to‘planganda stiker moderator qarorigacha ommadan olinadi — inson
tekshiruvini kutib turmaydi.

## Moderator huquqi

Huquq `sticker_moderators` jadvalida. Bu ataylab alohida qilingan: loyihada
hozircha umumiy rollar tizimi yo‘q, va moderatsiya uni kutib turmasligi
kerak. Umumiy rollar paydo bo‘lganda faqat `is_sticker_moderator()`
funksiyasining ichi o‘zgaradi — qolgan hamma joy tegilmaydi.

## Trend hisobi

`sticker_usage_events` — hodisalar jadvali. Faqat `usage_count`
sanog‘ini oshirib borish yetarli emas, chunki "oxirgi 48 soatda trend"
degan savolga javob berilmaydi.

- Oyna: standart **48 soat**.
- Tartib: oyna ichidagi ishlatilishlar soni asosiy, umumiy son ikkilamchi.
- Trend ro‘yxatiga faqat tasdiqlangan yoki tizim (builtin) stikerlari
  tushadi.

## Keyingi ish

- `sticker_usage_events` uchun tozalash cron vazifasi (90 kundan oshgani
  o‘chiriladi).
- Moderator paneli UI — `useStickerModeration` tayyor, sahifa qolgan.
- NSFW modelini o‘z serverida joylash (open-source), tashqi xizmatga
  bog‘liqlikni yo‘qotish.

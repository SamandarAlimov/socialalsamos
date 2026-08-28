# Stiker tizimi arxitekturasi (ADR-006)

## Nima uchun qayta yozildi

Eski `StickerPicker` (3.8 KB) quyidagi kamchiliklarga ega edi:

| Muammo | Natija |
| --- | --- |
| Stiker = faqat emoji glifi | GIF, rasm va Lottie stikerlar bir joyda ko‘rsatilmasdi |
| Paket ro‘yxati kodda qattiq yozilgan | Yangi to‘plam qo‘shish uchun deploy kerak edi |
| `ScrollArea` + qat’iy `h-64` | Mobil telefonda ichki scroll tutilib qolardi |
| Oxirgi ishlatilganlar / sevimlilar yo‘q | Har safar qaytadan izlash kerak edi |
| GIF alohida oynada (`GifStickerPicker`) | Ikki xil interfeys, ikki xil xatti-harakat |
| Paket ikonkalari emoji glifi | Turli qurilmada turlicha, sifatsiz ko‘rinardi |
| Stiker media ustiga qo‘yilmasdi | Instagram/Telegram darajasidagi tahrir yo‘q edi |

## Yangi qatlamlar

```
src/lib/stickers.ts          — yagona StickerItem / StickerPlacement modeli
src/hooks/useStickers.ts     — paketlar, qidiruv, tarix, sevimlilar, GIPHY
src/components/stickers/StickerView.tsx    — har qanday turni ko‘rsatadi
src/components/create/StickerStudio.tsx    — premium tanlash oynasi
src/components/create/StickerLayer.tsx     — media ustidagi tahrir qatlami
src/components/create/StickerPicker.tsx    — eski API uchun yupqa qobiq
```

Uch xil manba bitta ro‘yxatga birlashtiriladi:

1. **Kodli animatsion emoji paketlari** — internet sekin bo‘lsa ham ishlaydi,
   Noto Animated Emoji CDN (Apache 2.0 / OFL) kod-nuqta bo‘yicha manzillanadi.
2. **Bazadagi paketlar** (`sticker_packs`, `stickers`) — platforma to‘plamlari
   va foydalanuvchining o‘z stikerlari.
3. **GIPHY** — mavjud `giphy-search` Edge Function orqali tashqi qidiruv.

## Ikonka tamoyili

Interfeysdagi barcha boshqaruv ikonkalari — **lucide vektor ikonkalari**
(`History`, `Star`, `ThumbsUp`, `Smile`, `Heart`, `PartyPopper`, `PawPrint`,
`Hand`, `UtensilsCrossed`, `Leaf`, `Film`, `Sparkles`). Emoji glif faqat
**kontent** sifatida ishlatiladi, hech qachon tugma ikonkasi sifatida emas.
Sabab: emoji ko‘rinishi qurilmaga bog‘liq, o‘lchami bir xil emas, dark mode da
kontrasti buziladi.

## Koordinata modeli

`StickerPlacement` da `x`, `y`, `scale` **0..1 nisbiy** qiymatlarda saqlanadi.
Shu sababli:

- telefonda qo‘yilgan stiker kompyuterda aynan shu joyda turadi;
- bitta ma’lumot post, story va reel uchun ishlatiladi;
- keyinchalik server tomonda videoga “kuydirish” (burn-in) uchun ham yetarli.

Saqlash joyi: `post_media.edit_state.stickers` (jsonb). Alohida jadval
yaratilmadi — stikerlar media tahriri holatining bir qismi.

## Boshqaruv

| Harakat | Natija |
| --- | --- |
| Surish | joyini o‘zgartirish |
| O‘ng-past dasta | bir vaqtda burash + kattalashtirish |
| Ikki barmoq (pinch) | masshtab + burilish |
| Uzoq bosish (studiyada) | sevimliga qo‘shish, haptik javob bilan |
| Delete / Backspace | tanlangan stikerni o‘chirish |
| Escape | tanlovni bekor qilish |

Bir media uchun cheklov: `MAX_STICKERS_PER_MEDIA = 20`.

## Uzoq muddatli reja

**Bosqich A — bajarildi**
- Baza sxemasi, RLS, RPC lar (`search_stickers`, `touch_sticker_recent`,
  `top_sticker_recents`, `popular_stickers`)
- Yagona model, universal ko‘rsatgich, premium studiya, tahrir qatlami

**Bosqich B — keyingi**
- `PostComposer` ga stiker tugmasi va `StickerLayer` ni ulash
- `edit_state.stickers` ni saqlash va lentada `PostExtras` orqali ko‘rsatish
- Eski `GifStickerPicker` ni nafaqaga chiqarish

**Bosqich C**
- Foydalanuvchi stikerlari: rasmni yuklab, fonini avtomatik o‘chirish
  (`@imgly/background-removal` yoki MediaPipe segmentation), 512×512 WebP
- Shaxsiy paket yaratish, ulashish havolasi, paket sahifasi

**Bosqich D**
- Story stikerlari: so‘rovnoma, savol, viktorina, slayder, joylashuv,
  musiqa, mention, hashtag, vaqt, harorat — barchasi interaktiv
- Stiker ko‘rinadigan vaqt oynasi (`startSeconds`/`endSeconds`) reel uchun

**Bosqich E**
- Videoga stikerni kuydirish: klientda WebGL/ffmpeg.wasm, uzun videoda
  server navbati (`video_jobs`) — ADR-001 ga muvofiq
- Animatsion stikerni videoda kadrma-kadr chizish

**Bosqich F**
- Trend stikerlar, ishlatilish statistikasi, moderatsiya navbati va NSFW
  tekshiruvi (foydalanuvchi yuklagan stikerlar uchun majburiy)

# Post yaratish oqimi — arxitektura

Oxirgi yangilanish: 2026-08-28

## 1. Qatlamlar

```
UI          PostComposer, PollComposer, LocationPicker, AttachmentGrid,
            FormatToolbar, HashtagSuggestions
            ↓
Hooks       usePostAttachments, usePolls, useHashtags, usePostLocation,
            useLiveLocationSharing, usePostMedia, usePosts
            ↓
Lib         postComposer (validatsiya), uploadWithProgress, mediaMetadata,
            richText, polls, postMeta, geocoding
            ↓
Baza        posts + post_media / polls / poll_options / poll_votes /
            places / post_locations / hashtags / post_hashtags /
            music_tracks / post_music
```

## 2. Post joylash ketma-ketligi

1. Foydalanuvchi matn yozadi, fayl tanlaydi, so'rovnoma/joylashuv qo'shadi.
2. `usePostAttachments.uploadAll()` — har bir fayl signed URL orqali yuklanadi,
   progress ko'rinadi; xato bo'lgan fayllar qaytariladi va post to'xtatiladi.
3. `usePosts.createPost(...)` — `posts` qatori yaratiladi
   (`visibility`, `post_kind`, `status`, `scheduled_at`, `edit_state`).
4. Meta yozuvlar alohida try/catch bilan yoziladi:
   `savePostMedia`, `createPollForPost`, `savePostLocation`, `savePostMusic`.
5. Hammualliflar `post_collaborators` ga `pending` holatda yoziladi
   (baza triggeri 10 nafardan ortiqqa yo'l qo'ymaydi).
6. Hashtaglar `posts.content` dan trigger orqali avtomatik ajratiladi.

## 3. Muhim qoidalar

- Post matniga marker yozish taqiqlanadi. Yangi kontent turi kerak bo'lsa —
  yangi jadval yoki `post_kind` qiymati.
- Yangi jadvallar hali `src/integrations/supabase/types.ts` da yo'q, shuning
  uchun ular bilan ishlashda `db` (`src/lib/db.ts`) ishlatiladi. Tiplar qayta
  generatsiya qilingach, `db` o'chiriladi.
- Har bir yangi jadval RLS bilan yopiladi va `can_view_post` / `owns_post`
  yordamchilariga tayanadi.
- Fayl limitlari `src/lib/postComposer.ts` da bitta joyda turadi.

## 4. Eski koddan ko'chirish

| Eski | Yangi |
| --- | --- |
| `[POLL]{json}[/POLL]` | `polls` + `poll_options` + `poll_votes` |
| `[MUSIC:id]`, `[MUSIC]{json}` | `music_tracks` + `post_music` |
| `📍 Joy nomi` matn qatori | `places` + `post_locations` |
| `[FILTER:id]`, `[TEXT_BG:id]` | `post_media.edit_state` |
| `👥 with @user` | `post_collaborators` |
| `posts.media_urls` massivi | `post_media` (tartib, o'lcham, davomiylik) |

`media_urls` ustuni orqaga moslik uchun hozircha to'ldirilib boradi.

# GitHub konnektori (bearer token)

Alsamos AI foydalanuvchining shaxsiy GitHub akkaunti bilan ishlashi uchun konnektor.
Token **faqat serverda** (Supabase, RLS bilan himoyalangan jadval) saqlanadi va brauzerga qaytarilmaydi.

## 1. Token olish (foydalanuvchi tomonidan)

1. GitHub > Settings > Developer settings > Personal access tokens > **Fine-grained tokens** > *Generate new token*.
2. **Repository access**: kerakli repolarni tanlang (yoki *All repositories*).
3. **Permissions** (minimal tavsiya):
   - `Contents: Read` — fayllarni o'qish
   - `Contents: Read and write` — AI kod push qilishi kerak bo'lsa
   - `Issues: Read and write` — issue yaratish
   - `Pull requests: Read and write` — PR yaratish
   - `Metadata: Read` (majburiy)
4. Tokenni nusxalang (`github_pat_...`). U faqat bir marta ko'rsatiladi.

Classic token ham ishlaydi (`repo` scope), lekin fine-grained xavfsizroq.

## 2. Ilovada ulash

AI sahifasida kompozerdagi **+ > GitHub'dan qo'shish** menyusi orqali tokenni kiriting.
Frontend `src/lib/ai/githubConnector.ts` dagi `connectGithub(token)` ni chaqiradi.

## 3. Server API

`POST /functions/v1/github-connector` (Supabase JWT bilan). Tanadagi `action`:

| action | Kirish | Natija |
| --- | --- | --- |
| `connect` | `token` | `{ connected, login }` — token `GET /user` bilan tekshiriladi |
| `status` | — | `{ connected, login, updatedAt }` |
| `disconnect` | — | `{ connected: false }` |
| `repos` | `page?` | `{ repos: [...] }` (oxirgi yangilangan 30 ta) |
| `file` | `owner, repo, path, ref?` | `{ name, size, content }` (base64 dekod qilingan) |
| `search_code` | `q` | `{ items: [{ path, repo, htmlUrl }] }` |
| `create_issue` | `owner, repo, title, body?` | `{ number, url }` |

Har bir chaqiruv `_shared/guard.ts` orqali autentifikatsiya + soatiga 120 ta limit bilan himoyalangan.

## 4. Ma'lumotlar bazasi

Migratsiya: `supabase/migrations/20260901020000_github_connector.sql`

```
ai_github_connections(user_id pk, token, login, scopes, created_at, updated_at)
```

RLS: faqat `auth.uid() = user_id`. Edge funksiya service role bilan o'qiydi.

## 5. Deploy

```bash
supabase db push
supabase functions deploy github-connector
```

## 6. Xavfsizlik qoidalari

- Token hech qachon frontendga qaytarilmaydi (`status` faqat `login` beradi).
- AI push/PR/issue kabi yozuv amallarini foydalanuvchi tasdig'isiz bajarmaydi.
- Tokenni almashtirish uchun yangisini kiriting — eskisi ustiga yoziladi.
- Tokenni repoga, `.env` faylga yoki chatga yozmang.

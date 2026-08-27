# Alsamos Social

**Alsamos ekosistemasining ijtimoiy super-ilovasi** — haqiqiy autentifikatsiya, haqiqiy foydalanuvchilar, haqiqiy funksiyalar.

- **Live:** https://socialalsamos.vercel.app
- **Maqsadli domen:** social.alsamos.com
- **Mahsulot vizyoni va roadmap:** [`docs/product-vision.md`](docs/product-vision.md)

---

## 1. Loyiha haqida

Alsamos Social — bir nechta modulni bitta ilovada birlashtirgan platforma:

| Modul | Tavsif |
|---|---|
| Auth / Alsamos ID | OAuth2 + OpenID Connect provayderi (SSO) |
| Feed | Postlar, storylar, reyting va shaxsiylashtirish |
| Messages | Telegram uslubidagi chat: Private / Groups / Channels / Requests |
| Calls & Live | WebRTC audio/video qo'ng'iroqlar, guruh qo'ng'iroqlari, translyatsiya |
| Videos | Qisqa va uzun formatli video |
| Marketplace | Video-first savdo, sotuvchi paneli |
| Map | Geo-feed, hotspotlar, yaqin atrofdagi foydalanuvchilar |
| AI | Assistent, smart-reply, rasm generatsiyasi, semantik qidiruv |
| Mini Apps | Tashqi ilovalarni proxy orqali ishga tushirish |
| Admin | Moderatsiya, analitika, hisobotlar |

Interfeys **3 tilda**: O'zbekcha (default), English, Русский.

---

## 2. Texnologiyalar (haqiqiy stack)

**Frontend**
- Vite + React 18 + TypeScript
- React Router v6 (SPA routing)
- Tailwind CSS + shadcn/ui + Radix UI
- TanStack Query (server state)
- next-themes (dark / light)
- i18next + react-i18next (uz / en / ru)
- Vitest (testlar)

**Backend**
- Supabase: PostgreSQL + Auth + Storage + Realtime + Row Level Security
- Supabase Edge Functions (Deno) — 20 ta funksiya
- WebRTC + WebSocket signaling (edge functions orqali)

**Infratuzilma**
- Vercel (asosiy deploy, `vercel.json`)
- Docker + nginx (`Dockerfile`, `nginx.conf`) — self-hosted variant
- `infra/` — infratuzilma konfiguratsiyalari

> Eslatma: loyiha Lovable yordamida boshlangan. Lovable editor: https://lovable.dev/projects/3898e601-fc77-4b65-840a-e12a51bbb21e

---

## 3. Papkalar tuzilishi

```
src/
  App.tsx              # routing va providerlar
  main.tsx             # kirish nuqtasi
  pages/               # 24 sahifa (route komponentlari)
  components/          # UI komponentlar (layout, profile, stories, ui/...)
  contexts/            # Auth, GlobalCall, OnlinePresence, Audio/VideoPlayer
  hooks/               # useUserProfile, useMessages, useReposts, ...
  i18n/                # i18next sozlamasi
    locales/           # uz.json, en.json, ru.json
  integrations/        # Supabase klienti va tiplar
  lib/                 # yordamchi kutubxonalar (mediaUpload, utils, ...)
  utils/               # umumiy yordamchilar
  test/                # test setup
supabase/
  functions/           # edge funksiyalar
  migrations/          # DB migratsiyalari
docs/                  # mahsulot vizyoni, roadmap
public/                # statik fayllar, PWA, SEO
scripts/               # yordamchi skriptlar
```

---

## 4. Ishga tushirish

Talab: **Node.js 18+** (yoki Bun) va npm.

```sh
git clone https://github.com/SamandarAlimov/socialalsamos.git
cd socialalsamos
npm install
cp .env.example .env   # keyin qiymatlarni to'ldiring
npm run dev
```

Ilova `http://localhost:8080` (Vite konfiguratsiyasiga qarab) manzilida ochiladi.

### Muhit o'zgaruvchilari

| O'zgaruvchi | Tavsif |
|---|---|
| `VITE_SUPABASE_PROJECT_ID` | Supabase loyiha ID'si |
| `VITE_SUPABASE_URL` | Supabase API URL |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Supabase anon (publishable) kalit |

Server tarafdagi maxfiy kalitlar (AI, TURN, to'lov) faqat **Supabase Edge Function secrets** ichida saqlanadi, frontendga chiqmaydi.

### Skriptlar

| Buyruq | Vazifasi |
|---|---|
| `npm run dev` | Dev server |
| `npm run build` | Production build |
| `npm run preview` | Build'ni lokal ko'rish |
| `npm run lint` | ESLint |
| `npx vitest` | Testlar |

---

## 5. Routing (sahifalar xaritasi)

| Route | Sahifa | Kirish |
|---|---|---|
| `/` | AuthPage | Ochiq (login qilgan bo'lsa `/home`ga) |
| `/.lovable/oauth/consent` | OAuthConsent | Ochiq |
| `/home` | HomePage (feed) | Himoyalangan |
| `/discover` | DiscoveryPage | Himoyalangan |
| `/search` | SearchPage | Himoyalangan |
| `/videos` | VideosPage | Himoyalangan |
| `/messages` | MessagesPage | Himoyalangan |
| `/marketplace` | MarketplacePage | Himoyalangan |
| `/map` | MapPage | Himoyalangan |
| `/notifications` | NotificationsPage | Himoyalangan |
| `/create` | CreatePage | Himoyalangan |
| `/profile` | ProfilePage | Himoyalangan |
| `/user/:username` | UserProfilePage | Himoyalangan |
| `/settings` | SettingsPage | Himoyalangan |
| `/payment` | PaymentSettingsPage | Himoyalangan |
| `/admin` | AdminPage | Himoyalangan |
| `/story-archive` | StoryArchivePage | Himoyalangan |
| `/ai` | AIPage | Himoyalangan |
| `/activity` | ActivityPage | Himoyalangan |
| `/ads` | AdsPage | Himoyalangan |
| `/channels` | ChannelsPage | Himoyalangan |
| `/mini-apps` | MiniAppsPage | Himoyalangan |
| `*` | NotFound | — |

**Qoida:** login qilinmaguncha foydalanuvchi faqat `/` (Auth) sahifasini ko'radi.

---

## 6. Edge funksiyalar

| Funksiya | Vazifasi |
|---|---|
| `oauth-authorize`, `oauth-token`, `oauth-userinfo`, `oauth-revoke`, `openid-configuration`, `sso-session` | Alsamos ID: OAuth2 / OIDC provayder |
| `webrtc-signaling`, `live-stream-signaling` | Qo'ng'iroq va translyatsiya signaling |
| `ai-assistant`, `ai-generate-image`, `smart-reply`, `summarize-email` | AI xizmatlari |
| `global-search`, `giphy-search` | Qidiruv |
| `mini-app-proxy`, `api-gateway`, `mcp`, `oauth-clients` | Tashqi integratsiyalar |
| `send-scheduled-messages`, `rate-limit-notification` | Fon vazifalari |

Lokal ishga tushirish:

```sh
supabase functions serve <function-name>
```

---

## 7. Ko'p tillilik (i18n)

Barcha matnlar `src/i18n/locales/{uz,en,ru}.json` ichida saqlanadi. Kodda hardcode matn yozish **taqiqlangan**.

```tsx
import { useTranslation } from 'react-i18next';

const { t } = useTranslation();
return <h1>{t('profile.tabs.posts')}</h1>;
```

Qoidalar:
- Kalitlar `section.key` ko'rinishida (masalan `profile.stats.followers`).
- Yangi kalit **uchta faylga birdan** qo'shiladi.
- Default til: `uz`, fallback: `uz`. Tanlangan til `localStorage` (`alsamos-language`) da saqlanadi.
- Sana/vaqt formatlari faol tilga qarab formatlanadi.

---

## 8. Deploy

**Vercel (asosiy)** — `main` branch push qilinganda avtomatik deploy. SPA rewrite `vercel.json` ichida.

**Docker (self-host)**

```sh
docker build -t alsamos-social .
docker run -p 8080:80 alsamos-social
```

---

## 9. Rivojlanish tartibi (qisqa roadmap)

1. Auth / Alsamos ID (SSO, OAuth2) — *jarayonda*
2. Profile / UserProfile — *joriy bosqich*
3. Settings (til, tema, maxfiylik, qurilmalar)
4. Create → Feed → Notifications
5. Messages → Channels
6. Videos → Stories → Search / Discovery
7. Calls & Live (WebRTC + TURN)
8. Payment → Marketplace → Ads
9. Map → AI → Mini Apps
10. Admin, SEO, PWA

To'liq versiyasi: [`docs/product-vision.md`](docs/product-vision.md)

---

## 10. Hissa qo'shish

1. `main`dan branch oching: `feat/...` yoki `fix/...`
2. `npm run lint` va testlarni o'tkazing
3. PR oching, o'zgarish tavsifini yozing

© Alsamos. Barcha huquqlar himoyalangan.

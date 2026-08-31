# Alsamos Bridge

Alsamos Bridge — foydalanuvchi kompyuterida ishlaydigan kichik lokal agent.
AI (`ai-agent`) kompyuterni **bevosita** boshqarmaydi: u faqat vazifa yozadi,
foydalanuvchi tasdiqlaydi, keyin Bridge o'zi bajaradi.

## Xavfsizlik modeli

1. AI `computer_task` vositasini chaqiradi → `ai_computer_tasks` jadvaliga
   `status = 'pending_approval'` yozuv tushadi (`expires_at` = +15 daqiqa).
2. Foydalanuvchi web yoki mobil ilovada **tasdiqlaydi** → `status = 'approved'`.
3. Bridge faqat `approved` va muddati o'tmagan vazifalarni oladi, `running` ga
   o'tkazadi, bajaradi va `done` / `failed` natijasini yozadi.
4. AI natijani `computer_task_result` orqali o'qiydi.

Qo'shimcha cheklovlar:

- RLS: har bir foydalanuvchi faqat o'z vazifalarini ko'radi (`auth.uid() = user_id`).
- Bridge **service role** kalitidan foydalanmaydi — oddiy foydalanuvchi sessiyasi
  bilan ishlaydi.
- `ALSAMOS_BRIDGE_ROOT` papkasidan tashqariga fayl amallari bloklanadi.
- `shell` amali ixtiyoriy: `ALSAMOS_BRIDGE_ALLOW_SHELL=1` bo'lmasa ishlamaydi.
- Har bir amal uchun timeout (default 20 s) va chiqish hajmi limiti bor.

## Ruxsat etilgan amallar

| Amal | Tavsif | Talab |
| --- | --- | --- |
| `list_dir` | Papka tarkibi | root ichida |
| `read_file` | Fayl o'qish (matn) | root ichida, <= 512 KB |
| `write_file` | Fayl yozish | root ichida |
| `open` | Fayl/URL ni tizim ilovasida ochish | — |
| `shell` | Buyruq bajarish | `ALSAMOS_BRIDGE_ALLOW_SHELL=1` |
| `screenshot`, `click`, `type_text`, `key` | GUI avtomatlashtirish | keyingi versiya |

## O'rnatish

```bash
cd tools/bridge
npm install
cp .env.example .env   # qiymatlarni to'ldiring
npm start
```

### Muhit o'zgaruvchilari

| Nom | Tavsif |
| --- | --- |
| `SUPABASE_URL` | Loyiha URL manzili |
| `SUPABASE_ANON_KEY` | Publishable (anon) kalit |
| `ALSAMOS_EMAIL` / `ALSAMOS_PASSWORD` | Bridge kiradigan hisob |
| `ALSAMOS_BRIDGE_ROOT` | Ruxsat etilgan ildiz papka (default: `~/Alsamos`) |
| `ALSAMOS_BRIDGE_ALLOW_SHELL` | `1` bo'lsa `shell` amali yoqiladi |
| `ALSAMOS_BRIDGE_POLL_MS` | Navbatni tekshirish oralig'i (default 3000) |
| `ALSAMOS_BRIDGE_DEVICE` | Qurilma nomi (default: host nomi) |

Maxfiy kalitlarni hech qachon repozitoriyga qo'shmang.

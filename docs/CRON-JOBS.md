# Cron ishlari

Oxirgi yangilanish: 2026-08-31

Bu hujjat rejalashtirilgan (cron) Edge Function'larni ishga tushirish tartibini
belgilaydi. Funksiya mavjud bo'lishi yetarli emas — uni chaqiradigan
rejalashtiruvchi bo'lmasa, foydalanuvchi uchun tugma yana "yolg'on" bo'lib
qoladi.

## Umumiy qoidalar

- Har bir cron funksiyasi `CRON_SECRET` sirini `x-cron-secret` sarlavhasida
  talab qiladi. `verify_jwt = false` — chunki cron JWT yubormaydi; himoya
  funksiya ichida.
- Sir hech qachon migratsiyaga, kodga yoki hujjatga yozilmaydi. U faqat
  Supabase secrets va Vault'da turadi. `.env` fayllariga tegilmaydi.
- Nashr/yangilash mantig'i har doim bazadagi funksiyada bo'ladi, Edge Function
  esa faqat uni chaqiradi. Shunda web va superapp bir xil natijani oladi.

## Ro'yxat

| Funksiya | Davriylik | Baza funksiyasi | Vazifasi |
| --- | --- | --- | --- |
| `publish-scheduled-posts` | har daqiqada | `publish_due_scheduled_posts(p_limit)` | Vaqti kelgan rejalashtirilgan postlarni chiqarish |
| `send-scheduled-messages` | har daqiqada | — (funksiya ichida) | Rejalashtirilgan xabarlarni yuborish |

## Sozlash (bir marta, qo'lda bajariladi)

### 1. Kengaytmalar

```sql
create extension if not exists pg_cron;
create extension if not exists pg_net;
```

### 2. Sirni Vault'ga joylash

Qiymatni SQL tarixida qoldirmaslik uchun Supabase Dashboard → Vault orqali
kiritish tavsiya etiladi. Nomlar:

- `project_url` — masalan `https://<project-ref>.supabase.co`
- `cron_secret` — Edge Function secrets'dagi `CRON_SECRET` bilan bir xil

### 3. Ishni rejalashtirish

```sql
select cron.schedule(
  'publish-scheduled-posts',
  '* * * * *',
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url')
           || '/functions/v1/publish-scheduled-posts',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 20000
  );
  $$
);
```

Qayta sozlashda avval `select cron.unschedule('publish-scheduled-posts');`
chaqiriladi — bir xil nomdagi ish ikki marta yozilib qolmasligi uchun.

## Tekshirish

```sql
-- Rejalashtirilgan ishlar ro'yxati
select jobid, jobname, schedule, active from cron.job order by jobname;

-- Oxirgi yuritishlar va xatolar
select jobid, status, return_message, start_time
from cron.job_run_details
order by start_time desc
limit 20;

-- Navbatda qolib ketgan postlar (0 bo'lishi kerak)
select count(*) from public.posts
where status = 'scheduled' and scheduled_at <= now();
```

Ruxsatsiz chaqiruvlar `public.function_usage` jadvalida `blocked` yoki
`would_block` sifatida ko'rinadi (`AUTH_ENFORCE` rejimiga qarab).

## Qo'lda sinash

```bash
curl -X POST "$PROJECT_URL/functions/v1/publish-scheduled-posts" \
  -H "x-cron-secret: $CRON_SECRET"
```

Javob: `{"success":true,"published":<son>,"batchFull":false}`.
`batchFull` `true` bo'lsa, navbat bir chaqiruvga sig'magan — monitoringda
kuzatib borish kerak.

## Kelgusi ishlar

- `video-worker` — `video_jobs` navbatini qayta ishlash (P1, ADR-001).
- `music-ingest` — katalogni to'ldirish (P5, ADR-002).
- `sticker_usage_events` uchun 90 kunlik tozalash ishi (P7).

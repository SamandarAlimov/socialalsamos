# Gemini kalitlari hovuzi

Alsamos AI bir nechta Gemini API kalitini navbat bilan ishlatadi. Bu bitta
kalitning limiti tugaganda xizmat to'xtab qolishining oldini oladi.

## 1. Kalitlarni qo'yish

Kalitlar **hech qachon kodga yoki repoga yozilmaydi**. Faqat Supabase secrets:

```bash
# Bir qatorda, vergul bilan ajratib (tavsiya etiladi)
supabase secrets set GEMINI_API_KEYS="KEY_1,KEY_2,KEY_3,KEY_4"

# yoki alohida-alohida (10 tagacha)
supabase secrets set GEMINI_API_KEY_1="KEY_1"
supabase secrets set GEMINI_API_KEY_2="KEY_2"
```

Qo'yilgan kalitlarni ko'rish (qiymatlari ko'rinmaydi, faqat nomlari):

```bash
supabase secrets list
```

## 2. Xavfsizlik qoidalari

- Kalitni chatga, screenshotga, commit'ga yoki `.env` faylining repodagi
  nusxasiga yozmang.
- Kalit biror joyda ochilib qolsa — Google Cloud konsolida darhol o'chirib,
  yangisini yarating.
- Har bir kalitga Google konsolida cheklov qo'ying: faqat
  "Generative Language API", kerak bo'lsa IP/referrer cheklovi.

## 3. Qanday ishlaydi

`supabase/functions/_shared/geminiPool.ts`:

1. `GEMINI_API_KEYS`, `GEMINI_API_KEY_1..10` va `GEMINI_API_KEY` dan barcha
   kalitlarni yig'adi, takrorlanganini olib tashlaydi.
2. Har so'rovni navbatdagi kalitga yuboradi (round-robin) — yuk teng taqsimlanadi.
3. Kalit **429** (limit) qaytarsa — 1 daqiqaga, **401/403** (yaroqsiz) qaytarsa
   15 daqiqaga chetga qo'yiladi va so'rov keyingi kalit bilan qayta uriniladi.
4. **5xx** — keyingi kalitga o'tadi. **400** — so'rovning o'zida xato, qayta
   urinilmaydi.
5. Barcha kalitlar band bo'lsa — eski **Lovable gateway**'iga qaytadi, ya'ni
   xizmat baribir uzilmaydi.

Google'ning OpenAI-mos endpointi ishlatiladi
(`/v1beta/openai/chat/completions`), shuning uchun so'rov tanasi Lovable
gateway'inikiga aynan bir xil: `model`, `messages`, `stream`, `tools`.

## 4. Model nomlari

Lovable nomlari Google ID'lariga avtomatik moslanadi:

| Lovable | Google |
| --- | --- |
| `google/gemini-3-flash-preview` | `gemini-2.5-flash` |
| `google/gemini-3.1-flash-lite` | `gemini-2.5-flash-lite` |
| `google/gemini-3.5-flash` | `gemini-2.5-flash` |
| `google/gemini-2.5-pro` | `gemini-2.5-pro` |

## 5. Funksiyaga ulash

`ai-assistant` va `ai-agent` ichidagi to'g'ridan-to'g'ri `fetch(GATEWAY, ...)`
o'rniga:

```ts
import { aiFetch } from "../_shared/geminiPool.ts";

const { response, provider, keyIndex } = await aiFetch({
  body: { model, messages: conversation, stream: true, tools: toolSpecs },
  lovableKey,
});
```

Javob sarlavhasiga qaysi manba ishlaganini qo'shish foydali:
`X-AI-Provider: gemini` yoki `lovable`.

## 6. Tekshirish

Deploy'dan keyin:

```bash
supabase functions deploy ai-assistant ai-agent
supabase functions logs ai-assistant
```

Loglarda `gemini key #2 failed: HTTP 429` kabi qatorlar hovuz ishlayotganini
ko'rsatadi — ya'ni limitga urilgan kalit chetga qo'yilib, so'rov boshqasi bilan
davom etgan.

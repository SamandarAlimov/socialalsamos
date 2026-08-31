# Alsamos AI — platforma spetsifikatsiyasi (v1.0.0)

Bu hujjat **socialalsamos** (React/Web + Supabase Edge) va **alsamos-superapp**
(Flutter) repolari uchun **yagona kontrakt**. Ikkala repo ham shu spetsifikatsiyaga
rioya qilishi shart — aks holda mobil va web AI bir-biriga nomutanosib bo'ladi.

| Kontrakt | Web fayli | Flutter fayli |
| --- | --- | --- |
| Imkoniyatlar, modellar, SSE sxemasi | `src/lib/ai/capabilities.ts` | `lib/features/ai/domain/ai_capabilities.dart` |
| Agent klienti | `src/lib/ai/agentClient.ts` | `lib/features/ai/data/ai_agent_client.dart` |
| Xabar modellari | `src/components/ai/types.ts` | `lib/features/ai/domain/ai_message.dart` |

> Kontrakt o'zgarsa `AI_CONTRACT_VERSION` (web) va `aiContractVersion` (Dart)
> birga oshiriladi va ikkala repoda bir xil qiymatda bo'ladi.

---

## 1. Arxitektura

```
UI (React AIPage / Flutter AiChatScreen)
   │  POST /functions/v1/ai-agent  (SSE)
   ▼
ai-agent  — agent halqasi (max 8 qadam), model routing, tool-calling
   ├─ _shared/aiTools.ts   — vositalar reyestri
   ├─ _shared/net.ts       — SSRF himoyasi + HTML→matn
   ├─ _shared/sandbox.ts   — izolyatsiyalangan JS ijrosi
   └─ _shared/guard.ts     — auth, rate limit, CORS, audit

Yordamchi funksiyalar:
   code-sandbox        — UI dan kodni to'g'ridan-to'g'ri ishga tushirish
   ai-generate-image   — tezkor rasm generatsiyasi
```

## 2. Vositalar (tools)

| Vosita | Guruh | Tavsif |
| --- | --- | --- |
| `web_search` | web | Tavily → Brave → DuckDuckGo zaxira bilan qidiruv |
| `web_fetch` | web | Ommaviy URL matnini o'qish (SSRF bloki) |
| `run_code` | code | Tarmoqsiz JS sandbox (max 10 s) |
| `generate_image` | image | `google/gemini-2.5-flash-image`, tahrirlash ham |
| `generate_video` | video | `ai_media_jobs` navbati |
| `search_posts` | alsamos | Postlar bo'yicha qidiruv |
| `search_marketplace` | alsamos | Mahsulotlar bo'yicha qidiruv |
| `remember` | alsamos | `ai_memories` ga barqaror fakt yozish |
| `list_connector_tools` | connectors | MCP `tools/list` |
| `connector_call` | connectors | MCP `tools/call` |
| `computer_task` | computer | Lokal amalni navbatga qo'yish (tasdiq talab) |
| `computer_task_result` | computer | Amal natijasini o'qish |

## 3. So'rov formati

```json
POST /functions/v1/ai-agent
{
  "messages": [{ "role": "user", "content": "..." }],
  "mode": "agent",
  "model": "auto",
  "toolGroups": ["web", "code", "image", "alsamos"],
  "conversationId": "uuid | null"
}
```

## 4. SSE hodisalari

Har bir satr `data: <JSON>` ko'rinishida, oxirida `data: [DONE]`.

```json
{"type":"meta","model":"google/gemini-3-flash-preview","task":"coding","language":"uz","tools":["web_search"]}
{"type":"tool_call","id":"call_1","name":"web_search","args":{"query":"..."}}
{"type":"tool_result","id":"call_1","name":"web_search","ok":true,"summary":"...","data":{"sources":[]}}
{"type":"delta","text":"Javob matni..."}
{"type":"notice","message":"..."}
{"type":"error","message":"..."}
```

`tool_result.data` ichidagi kelishilgan kalitlar:

- `sources: [{ title, url, snippet }]` — web vositalari
- `imageUrl: string` — `generate_image`
- `jobId, status, kind` — `generate_video`
- `execution: { ok, logs, result, error, durationMs }` — `run_code`
- `taskId, action, status, reason` — `computer_task`

## 5. Kompyuter boshqaruvi (Alsamos Bridge)

1. Foydalanuvchi kompyuterda Bridge agentini ishga tushiradi va `ai_devices` ga
   qurilmani bog'laydi.
2. AI `computer_task` chaqiradi → satr `status = 'pending_approval'` bo'lib yaziladi.
3. Foydalanuvchi UI da (web yoki mobil) amalni ko'radi: `action`, `payload`, `reason`.
   Tasdiqlasa → `approved`, rad etsa → `rejected`.
4. Bridge faqat `approved` vazifalarni oladi, bajaradi, `result`/`error` yozadi.
5. 15 daqiqada tasdiqlanmasa → `expired`.

**Qat'iy qoidalar:** tasdiqsiz bajarish yo'q; destruktiv buyruqlar (`rm -rf`,
disk formatlash, maxfiy kalitlarni uzatish) taqiqlanadi; har bir amal auditda qoladi.

## 6. Xavfsizlik

- Barcha yakuniy nuqtalar `guard()` orqali: auth, rate limit, CORS allowlist, audit log.
- `web_fetch` va konnektor URL'lari `isPublicHttpUrl()` bilan tekshiriladi
  (localhost, private IP, metadata endpointlari bloklangan).
- `run_code` — Deno Worker, `permissions: "none"`; tarmoq/fayl/env yo'q.
- Konnektor tokenlari faqat server tomonida o'qiladi; RLS bilan foydalanuvchiga bog'langan.
- Pul, publikatsiya va xabar yuborish amallari uchun UI tasdig'i majburiy.

## 7. Ma'lumotlar bazasi

`supabase/migrations/20260831121500_ai_agent_platform.sql`:
`ai_connectors`, `ai_devices`, `ai_computer_tasks`, `ai_memories`, `ai_media_jobs`
— barchasi RLS bilan (`auth.uid() = user_id`).

## 8. Muhit o'zgaruvchilari

| Nom | Majburiy | Izoh |
| --- | --- | --- |
| `LOVABLE_API_KEY` | ha | AI gateway |
| `SUPABASE_SERVICE_ROLE_KEY` | ha | Edge funksiyalar |
| `TAVILY_API_KEY` | yo'q | Eng sifatli web qidiruv |
| `BRAVE_SEARCH_API_KEY` | yo'q | Ikkinchi variant |
| `AUTH_ENFORCE` | yo'q | `off\|log\|on` |

Kalit bo'lmasa `web_search` DuckDuckGo zaxirasiga o'tadi — funksiya buzilmaydi.

## 9. Parite tekshiruvi (ikkala repo uchun majburiy)

- [ ] `AI_CONTRACT_VERSION` == `aiContractVersion`
- [ ] Vosita guruhlari ro'yxati, ID va yorliqlari bir xil
- [ ] Model tanlovlari (`auto/fast/balanced/coding/reasoning/vision`) bir xil
- [ ] SSE hodisa turlari to'liq qo'llanadi (`meta`, `delta`, `tool_call`, `tool_result`, `notice`, `error`)
- [ ] Kompyuter vazifasi tasdiq oynasi ikkala platformada mavjud
- [ ] Konnektor CRUD ikkala platformada mavjud

# Mini Apps kontrakti (yagona haqiqat manbasi)

Bu papka `socialalsamos` (web) va `alsamos-superapp` (Flutter) uchun **bitta** shartnoma.
Ikkala repo ham shu fayllarni bir xil nusxada saqlaydi va faqat shu shartnomaga tayanadi.

## Qat'iy qoidalar

1. **Biznes-mantiq klientda takrorlanmaydi.** Tartiblash (ranking), filtrlash, moderatsiya
   holati va sahifalash faqat serverda (`mini_apps_feed` RPC) hisoblanadi.
2. **Kategoriyalar xardkod qilinmaydi.** Manba — `mini_app_categories` jadvali
   (`labels` jsonb: `uz`/`ru`/`en`).
3. **Ochish strategiyasi** (`display_mode`, embed URL, fallback tartibi) bir xil qoidalarga
   bo'ysunadi: `openStrategy.ts` (web) va `mini_app_open_strategy.dart` (Flutter) —
   ikkisi ham `open-strategy.md` dagi jadvalni bajaradi.
4. **Telemetriya nomlari** bir xil: `open`, `close`, `error`, `install`, `uninstall`, `share`, `payment`.
5. `CONTRACT_VERSION` o'zgarsa, ikkala repoda ham mos o'zgarish bo'lishi shart (CI `contract-check`).

## Fayllar

| Fayl | Vazifa |
| --- | --- |
| `mini-app-manifest.schema.json` | Mini app manifesti (JSON Schema draft-07) |
| `open-strategy.md` | Ochish rejimlari va fallback tartibi |
| `CONTRACT_VERSION` | Kontrakt versiyasi (ikki repoda bir xil bo'lishi shart) |

## Ilova turlari

| Tur | Kimga | Talab |
| --- | --- | --- |
| `link` | Junior dasturchi, portfolio, oddiy foydalanuvchi | Faqat `https` URL. API talab qilinmaydi. |
| `webapp` | Biznes / kompaniya | Mini App SDK (`initData`), `domain_verified` publisher |
| `bot` | Bot ssenariylari | Bot token + webhook |
| `native` | Alsamos ichki modullari | `deep_link` (`alsamos://...`) |

`link` turi **birinchi klass fuqaro**: API yozmagan odam ham loyihasini 1 daqiqada
joylashtira olishi kerak. Bu talab hech qachon olib tashlanmaydi.

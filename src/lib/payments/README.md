# To‘lov qatlami

Alsamos to‘lov arxitekturasi ikki qatlamdan iborat:

1. **Alsamos Wallet** — platforma ichidagi server-authoritative balans, P2P,
   Marketplace debit/refund/seller settlement va chat transferlari.
2. **Tashqi provider rail** — bank/karta pulini walletga kiritish yoki tashqariga
   chiqarish. Bu qism real PSP merchant/payout shartnomalariga bog‘liq.

## Hozir kodda ishlaydigan real oqimlar

| Oqim | Holat | Qanday ishlaydi |
|---|---|---|
| Wallet P2P | Tayyor | DB transaction + row lock + idempotency + immutable ledger |
| Messages transfer | Tayyor | Private chat recipient serverda aniqlanadi, pul wallet RPC orqali ko‘chadi |
| Marketplace wallet checkout | Tayyor | Buyer wallet atomik debit qilinadi |
| Marketplace refund | Tayyor | Cancel qilinganda buyer walletga credit |
| Marketplace seller settlement | Tayyor | Delivery tasdiqlanganda seller walletga credit |
| Manual top-up | Tayyor | Bank/P2P/kassa reference operator tasdig‘idan keyin credit |
| Payme top-up | **Kod tayyor** | One-time intent + Payme Merchant API + idempotent settlement |

## Payme live rail

Quyidagi Edge Functionlar mavjud:

- `wallet-payme-create` — authenticated user uchun bir martalik Payme checkout
  link yaratadi.
- `wallet-payme-merchant` — Payme Merchant API endpoint:
  `CheckPerformTransaction`, `CreateTransaction`, `PerformTransaction`,
  `CancelTransaction`, `CheckTransaction`, `GetStatement`.

Pul faqat `PerformTransaction` muvaffaqiyatli kelgandan keyin walletga tushadi.
Takroriy callback bir marta credit qiladi. Balans browserdan o‘zgartirilmaydi.

### Live qilish uchun majburiy tashqi ma’lumotlar

Supabase/GitHub secrets:

- `SUPABASE_ACCESS_TOKEN`
- `SUPABASE_DB_PASSWORD`
- `PAYME_MERCHANT_ID`
- `PAYME_LOGIN`
- `PAYME_KEY`

Sandbox uchun `PAYME_TEST_KEY` va kerak bo‘lsa
`PAYME_CHECKOUT_URL=https://test.paycom.uz`.

Payme kabinetida Merchant API endpoint sifatida production Edge Function URL
ko‘rsatiladi:

`https://<project-ref>.supabase.co/functions/v1/wallet-payme-merchant`

Merchant onboarding, sandbox testlari va Payme tomonidan production kassaning
faollashtirilishi tugamaguncha kod real bank kartasidan pul yecha olmaydi.

## Muhim: “real pul” va ichki balans bir xil narsa emas

Ichki wallet transferi texnik jihatdan real ledger operatsiyasi. Ammo
foydalanuvchining bank kartasidan real fiat kirishi uchun acquiring provider,
cash-out uchun esa alohida payout rail/shartnoma kerak.

Shuning uchun:

- provider credential yo‘q bo‘lsa UI “muvaffaqiyat” deb soxta balans yozmaydi;
- webhook tasdiqlamasa balance credit qilinmaydi;
- seller settlement delivery’dan oldin bajarilmaydi;
- Payme completed top-up avtomatik clawback qilinmaydi; settled wallet value
  qaytarilishi kontrolli refund oqimi orqali bajarilishi kerak.

## Keyingi providerlar

`click` uchun DB intent modeli allaqachon provider-agnostic. Click merchant
credentiallari mavjud bo‘lganda xuddi shu settlement RPC qatlamiga Shop/Merchant
API adapter ulanadi. Cash-out/payout esa acquiring’dan alohida provider
shartnomasini talab qiladi.

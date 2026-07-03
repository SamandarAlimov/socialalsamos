# Marketplace Professional Redesign + Real Checkout

So'rovingiz juda katta (butun superapp: Marketplace + AI + Map + Payment + Messages + Posts qayta ko'rib chiqish). Bir turnda hammasini sifatli qilib bo'lmaydi — natija yuzaki chiqadi.

**Shu sababli bu planda faqat aniq va bajariladigan qismni qilamiz:**
1. Marketplace UI/UX responsive redesign
2. Real checkout `/settings/payment` bilan
3. Order history + payment status (success/failed) + kvitansiya
4. Kategoriyalar, qidiruv, narx filtrlari

Qolgan katta modullar (AI hub, Map integratsiyasi, Messages xavfsizlik qatlami, Superapp AI-brain) alohida promptlarda qilinadi — pastdagi "Keyingi fazalar" ro'yxatiga qarang.

---

## 1. Marketplace Responsive Redesign

### `src/pages/MarketplacePage.tsx`
- Amazon/Wildberries uslubi: sticky top bar (logo + qidiruv + savat + orderlar), kategoriya chip-row (horizontal scroll mobile, wrap desktop), sort dropdown (yangi / arzon / qimmat / reyting).
- **Grid breakpoints:** mobile `grid-cols-2`, `sm:grid-cols-3`, `md:grid-cols-3`, `lg:grid-cols-4`, `xl:grid-cols-5`, `2xl:grid-cols-6`. Gap: mobile `gap-2`, desktop `gap-4`.
- Chap sidebar (desktop `lg:`): kategoriya daraxti + narx range slider + kondisiya (new/used) + faqat aksiya + faqat yetkazib berish. Mobile: pastdan chiqadigan `Sheet` "Filtr" tugmasi.
- Hero banner (top featured / promo) — desktop only.
- Empty state, skeleton loading, infinite scroll (yoki "Ko'proq yuklash").

### `src/components/marketplace/ProductCard.tsx`
- Nomi, narxi, discount %, sotuvchi, reyting, like — hozirgi karta yaxshi, faqat responsive typography (`text-[13px] md:text-sm`) va min-height guard qo'shamiz.

### `src/components/marketplace/MarketplaceFilters.tsx` (yangi)
- Narx range (min–max), kategoriya, kondisiya, "faqat yetkazib berish", sort.
- Mobile'da `Sheet` ichida, desktop'da sticky sidebar.

### `src/hooks/useMarketplace.ts`
- `useProducts` ga `filters: { minPrice, maxPrice, condition, shippingOnly, sortBy }` param qo'shamiz.

---

## 2. Real Checkout (Payment integratsiyasi)

### `src/components/marketplace/CheckoutSheet.tsx` (mavjudni to'liq yozamiz)
Bosqichlar (stepper):
1. **Manzil / yetkazib berish** — foydalanuvchi manzili, telefon, izoh
2. **To'lov usuli** — `wallets` balansi, `payment_methods` (linked cards), yoki naqd (yetkazganda)
3. **Ko'rib chiqish** — mahsulotlar, jami, yetkazib berish narxi, jami
4. **Tasdiqlash** — PIN yoki confirm dialog (memory'da yozilgan xavfsizlik talabi)

### Database (yangi migratsiya)
Mavjud `orders`, `order_items`, `transactions`, `wallets` jadvallari bor. Qo'shamiz:
- `orders`: `payment_status` (pending/paid/failed/refunded), `payment_method` (wallet/card/cash), `shipping_address` jsonb, `receipt_number` — agar yo'q bo'lsa.
- RPC funksiya `process_marketplace_order(cart_items, payment_method, address)` — SECURITY DEFINER, atomic: order yaratadi, wallet dan yechadi (agar wallet bo'lsa), transaction log yozadi, cart tozalaydi. Muvaffaqiyatsiz bo'lsa rollback.

### Wallet integratsiya
- Checkout'da `wallets.balance` ko'rsatiladi, yetarli emasda "Hamyonni to'ldirish" tugmasi → `/settings/payment` ga o'tadi.
- Karta orqali to'lov: hozircha mock success (chunki Stripe/Paddle o'rnatilmagan) — lekin `transactions` yoziladi va `orders.payment_status = 'paid'` bo'ladi. Kelajakda haqiqiy provayder ulanadi.

---

## 3. Order History + Receipt

### `src/components/marketplace/OrdersView.tsx` (mavjudni yaxshilaymiz)
- Status filterlar (Barchasi / Kutilmoqda / To'landi / Yetkazildi / Bekor qilindi).
- Har bir order kartasi: rasm thumbnail, narxi, sana, status badge, "Kvitansiya" tugmasi.

### `src/components/marketplace/OrderReceiptDialog.tsx` (yangi)
- Kvitansiya raqami, sana, mahsulotlar, jami, to'lov usuli, sotuvchi, "PDF yuklab olish" (print CSS orqali).

### Success/Fail feedback
- Checkout tugagach `toast` + navigate `/marketplace/orders/:id` (yoki dialog ichida success ekrani).
- Failed bo'lsa aniq xato sababi + "Qayta urinish".

---

## 4. Texnik (qisqa)

- Barcha yangi tugmalar/kartalar semantic tokens (`bg-card`, `text-foreground`, `text-primary`) — hardcoded rang yo'q.
- `useIsMobile` + `md:` / `lg:` breakpointlar orqali responsive.
- i18n: yangi stringlar `uz.json` / `en.json` / `ru.json` ga qo'shiladi.
- RLS: yangi RPC service_role bilan ishlaydi, foydalanuvchi faqat o'z orderini ko'radi (allaqachon shunday).

---

## Keyingi fazalar (bu planga kirmaydi — alohida so'rang)

Bularni bir vaqtda qilsam sifat ketadi. Marketplace tugagach, birma-bir so'rang:

- **Faza 2:** AI Hub — Marketplace bilan bog'liq mahsulot qidirish, post generatsiya, ko'p tillik, model routing
- **Faza 3:** Map moduli — Marketplace mahsulotlarini xaritada, marker → product card
- **Faza 4:** Messages xavfsizlik qatlami — scam/spam filter, PII detektor, message requests
- **Faza 5:** Posts ↔ Marketplace bog'lash (post orqali mahsulot reklama)
- **Faza 6:** AI orqali platforma boshqaruvi (settings, wallet, notifications), har bir amal uchun confirm dialog

---

Roziman desangiz Faza 1 (Marketplace) ni boshlayman. Rejani o'zgartirmoqchi bo'lsangiz ayting.
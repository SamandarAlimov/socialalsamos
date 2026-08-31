# To'lov qatlami (`src/lib/payments`)

Bu papka checkout va provayder o'rtasidagi yagona shartnoma. `CheckoutSheet`
hech qachon provayder nomiga qarab shartlanmaydi — u faqat `getEnabledPaymentProviders()`,
`getPendingPaymentProviders()` va `initPayment()` bilan gaplashadi.

## Hozir real ishlaydigan rellslar

| Provayder | `settlement` | Holat | Izoh |
|---|---|---|---|
| `wallet` | `instant` | Yoqilgan | Pul `process_marketplace_order` ichida atomik yechiladi, shuning uchun `initPayment` darhol `settled` qaytaradi. |
| `card_on_delivery` | `on_delivery` | Yoqilgan | Buyurtma `payment_status = 'pending'` bo'lib turadi, `delivered` bo'lganda yopiladi. |
| `cash` | `on_delivery` | Yoqilgan | Yuqoridagi bilan bir xil oqim. |

## Hali ulanmagan (huquqiy shakl kerak)

| Provayder | Nima kerak |
|---|---|
| `payme` | YaTT yoki MCHJ + Payme merchant shartnomasi |
| `click` | YaTT yoki MCHJ + Click merchant shartnomasi |
| `uzum` | MCHJ + Uzum Nasiya shartnomasi |

Uchtasi ham `enabled: false` va checkoutda "tez kunda" bo'limida
`unavailableReason` matni bilan ko'rinadi. Ular tanlanmaydi, ya'ni foydalanuvchi
ishlamaydigan usulni bosib qolmaydi.

## Muhim ogohlantirish: hamyonni to'ldirish

`wallet` yagona "instant" usul, lekin **balansga pul kirituvchi backend yo'q**.
Hech qanday PSP webhooki yozilmagan, shuning uchun hozircha balans faqat qo'lda
(SQL yoki admin) to'ldiriladi. Real xaridlar uchun standart usul
`card_on_delivery` bo'lishi kerak.

## PSP ulanadigan kun nima yoziladi

1. `providers.ts` da tegishli provayderning `initPayment` ini yozing: PSP dan
   to'lov havolasini olib `{ status: 'redirect', redirectUrl, providerRef }`
   qaytaring.
2. `enabled: true` qiling va `unavailableReason` ni olib tashlang.
3. `supabase/functions/<provider>-webhook/` yarating. Webhook:
   - imzoni tekshiradi (`service_role` kaliti bilan emas, PSP siri bilan);
   - `orders.payment_status` ni `paid` ga o'tkazadi, `paid_at` va
     `receipt_number` yozadi;
   - `marketplace_payments` ga `direction = 'credit'` yozuvi qo'shadi;
   - idempotent bo'ladi (bir xil `providerRef` ikki marta kelsa, ikkinchisi
     hech narsa qilmaydi).
4. Bekor qilish/qaytarish uchun `marketplace_update_order_status` allaqachon
   hamyonga qaytaradi — PSP refund chaqiruvini shu joyga ulash kerak.

Checkout, buyurtma holati mashinasi va qaytarish mantiqi bu interfeysni
allaqachon biladi, shuning uchun yuqoridagi 4 qadamdan boshqa hech narsa
o'zgarmaydi.

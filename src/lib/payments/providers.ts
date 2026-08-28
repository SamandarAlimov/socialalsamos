import type { PaymentProvider } from './types';

/**
 * Wallet — the only instant rail that works today.
 * The debit itself happens atomically inside process_marketplace_order, so
 * there is nothing to charge afterwards; a successful order means paid.
 */
export const walletProvider: PaymentProvider = {
  id: 'wallet',
  label: 'Alsamos hamyon',
  description: "Balansdan darhol yechiladi. Bekor qilinsa, pul to'liq qaytariladi.",
  method: 'wallet',
  settlement: 'instant',
  requiresLegalEntity: false,
  enabled: true,
  initPayment: async () => ({ status: 'settled' }),
};

export const cashProvider: PaymentProvider = {
  id: 'cash',
  label: 'Naqd (yetkazganda)',
  description: "Kuryerga qo'lda naqd to'lanadi. Yetkazilgach hisob yopiladi.",
  method: 'cash',
  settlement: 'on_delivery',
  requiresLegalEntity: false,
  enabled: true,
  initPayment: async () => ({ status: 'pending' }),
};

export const cardOnDeliveryProvider: PaymentProvider = {
  id: 'card_on_delivery',
  label: 'Karta (yetkazganda)',
  description: "Kuryerdagi terminal yoki P2P orqali to'lanadi.",
  method: 'card_on_delivery',
  settlement: 'on_delivery',
  requiresLegalEntity: false,
  enabled: true,
  initPayment: async () => ({ status: 'pending' }),
};

/**
 * Uzbek PSP descriptors.
 *
 * All three require a registered legal entity (YaTT is enough for Payme and
 * Click; Uzum Nasiya asks for MCHJ) plus a merchant contract, so they stay
 * disabled until the credentials exist. When that day comes, only
 * `initPayment` and a Supabase edge function webhook need to be written --
 * checkout, orders and refunds already speak this interface.
 */
const notOnboarded = async () => ({
  status: 'failed' as const,
  error: "Bu to'lov usuli hali ulanmagan",
});

export const paymeProvider: PaymentProvider = {
  id: 'payme',
  label: 'Payme',
  description: 'Payme Merchant API (Receipts + webhook).',
  method: 'card_on_delivery',
  settlement: 'redirect',
  requiresLegalEntity: true,
  enabled: false,
  unavailableReason: 'YaTT/MCHJ va Payme merchant shartnomasi kerak',
  initPayment: notOnboarded,
};

export const clickProvider: PaymentProvider = {
  id: 'click',
  label: 'Click',
  description: 'Click Uzbekistan Prepare/Complete integratsiyasi.',
  method: 'card_on_delivery',
  settlement: 'redirect',
  requiresLegalEntity: true,
  enabled: false,
  unavailableReason: 'YaTT/MCHJ va Click merchant shartnomasi kerak',
  initPayment: notOnboarded,
};

export const uzumProvider: PaymentProvider = {
  id: 'uzum',
  label: 'Uzum Nasiya',
  description: "Muddatli to'lov (rassrochka).",
  method: 'card_on_delivery',
  settlement: 'redirect',
  requiresLegalEntity: true,
  enabled: false,
  unavailableReason: 'MCHJ va Uzum Nasiya shartnomasi kerak',
  initPayment: notOnboarded,
};

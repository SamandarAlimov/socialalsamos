import type {
  PaymentInitContext,
  PaymentInitResult,
  PaymentProvider,
  PaymentProviderId,
} from './types';
import {
  walletProvider,
  cashProvider,
  cardOnDeliveryProvider,
  paymeProvider,
  clickProvider,
  uzumProvider,
} from './providers';

export type {
  PaymentProvider,
  PaymentProviderId,
  PaymentMethod,
  PaymentSettlement,
  PaymentInitContext,
  PaymentInitResult,
} from './types';

/** Registration order = display order in checkout. */
export const PAYMENT_PROVIDERS: PaymentProvider[] = [
  walletProvider,
  cardOnDeliveryProvider,
  cashProvider,
  paymeProvider,
  clickProvider,
  uzumProvider,
];

export function getPaymentProvider(id: PaymentProviderId): PaymentProvider | undefined {
  return PAYMENT_PROVIDERS.find(p => p.id === id);
}

/** Only these may be rendered as selectable options in checkout. */
export function getEnabledPaymentProviders(): PaymentProvider[] {
  return PAYMENT_PROVIDERS.filter(p => p.enabled);
}

/** Providers blocked purely by merchant onboarding -- shown as "coming soon". */
export function getPendingPaymentProviders(): PaymentProvider[] {
  return PAYMENT_PROVIDERS.filter(p => !p.enabled);
}

/**
 * Single entry point for checkout. Returns a settled result for the rails that
 * are already handled by process_marketplace_order, and a redirect for future
 * PSPs -- so the caller never branches on provider names.
 */
export async function initPayment(
  id: PaymentProviderId,
  ctx: PaymentInitContext,
): Promise<PaymentInitResult> {
  const provider = getPaymentProvider(id);
  if (!provider) {
    return { status: 'failed', error: "To'lov usuli topilmadi" };
  }
  if (!provider.enabled) {
    return { status: 'failed', error: provider.unavailableReason || "To'lov usuli mavjud emas" };
  }
  return provider.initPayment(ctx);
}

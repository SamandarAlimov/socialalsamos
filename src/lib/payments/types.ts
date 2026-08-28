/**
 * Provider-agnostic payment contract.
 *
 * Checkout must never talk to a PSP SDK directly. It asks the registry for the
 * enabled providers, renders them, and calls `initPayment` on the chosen one.
 * That way Payme / Click / Uzum can be added later without touching
 * CheckoutSheet, the order RPC, or the wallet ledger.
 */

export type PaymentProviderId =
  | 'wallet'
  | 'cash'
  | 'card_on_delivery'
  | 'payme'
  | 'click'
  | 'uzum';

/** Values accepted by orders.payment_method in the database. */
export type PaymentMethod = 'wallet' | 'cash' | 'card_on_delivery';

export type PaymentSettlement =
  /** Money moved immediately (wallet debit inside process_marketplace_order). */
  | 'instant'
  /** Money is collected when the courier hands the parcel over. */
  | 'on_delivery'
  /** Buyer is sent to an external PSP page and we wait for a webhook. */
  | 'redirect';

export interface PaymentInitContext {
  orderId: string;
  orderNumber?: string | null;
  amount: number;
  currency: string;
  /** Where the PSP should send the buyer back to. */
  returnUrl?: string;
}

export interface PaymentInitResult {
  /** 'settled' = nothing left to do, 'redirect' = open redirectUrl, 'pending' = collect later. */
  status: 'settled' | 'redirect' | 'pending' | 'failed';
  redirectUrl?: string;
  /** PSP-side transaction id, stored for reconciliation. */
  providerRef?: string;
  /** Human readable Uzbek message when status = 'failed'. */
  error?: string;
}

export interface PaymentProvider {
  id: PaymentProviderId;
  /** Label shown in checkout. */
  label: string;
  description: string;
  /** Value written to orders.payment_method. */
  method: PaymentMethod;
  settlement: PaymentSettlement;
  /**
   * True when the provider can only be switched on after a registered legal
   * entity (YaTT / MCHJ) signs a contract with the PSP.
   */
  requiresLegalEntity: boolean;
  /** Disabled providers are still listed in settings, but never in checkout. */
  enabled: boolean;
  /** Why the provider is currently unavailable (shown in settings). */
  unavailableReason?: string;
  /**
   * Called after the order row exists. Instant providers are already settled by
   * process_marketplace_order, so they simply confirm.
   */
  initPayment: (ctx: PaymentInitContext) => Promise<PaymentInitResult>;
}

import type {
  InternationalIncoterm,
  InternationalServiceLevel,
  InternationalShippingQuote,
  LogisticsTransportMode,
} from '@/lib/logistics/international';

export interface CarrierQuoteRequest {
  originCountryCode: string;
  destinationCountryCode: string;
  serviceLevel: InternationalServiceLevel;
  incoterm: InternationalIncoterm;
  weightKg: number;
  declaredValue: number;
  currency: string;
}

export interface CarrierShipmentRequest {
  orderId: string;
  quote: InternationalShippingQuote;
  recipient: {
    name: string;
    phone: string;
    street: string;
    city: string;
    region?: string;
    postalCode?: string;
    countryCode: string;
  };
}

export interface CarrierTrackingEvent {
  externalId?: string;
  status: string;
  title: string;
  description?: string;
  location?: string;
  countryCode?: string;
  occurredAt: string;
  raw?: unknown;
}

export interface CarrierShipmentResult {
  externalShipmentId: string;
  trackingNumber: string;
  trackingUrl?: string;
  transportMode?: LogisticsTransportMode;
}

export interface MarketplaceCarrierAdapter {
  id: string;
  label: string;
  supportsLiveRates: boolean;
  supportsTracking: boolean;
  quote?(request: CarrierQuoteRequest): Promise<InternationalShippingQuote>;
  createShipment?(request: CarrierShipmentRequest): Promise<CarrierShipmentResult>;
  track?(trackingNumber: string): Promise<CarrierTrackingEvent[]>;
  cancel?(externalShipmentId: string): Promise<void>;
}

/**
 * Manual carrier is the safe production fallback while no DHL/FedEx/UPS/etc.
 * contract credentials are configured. It deliberately does not pretend to
 * provide live rates or tracking: sellers enter the real carrier/tracking data
 * in Shipment Center and shipment events remain auditable in our database.
 */
export const manualCarrierAdapter: MarketplaceCarrierAdapter = {
  id: 'manual',
  label: 'Manual / hamkor tashuvchi',
  supportsLiveRates: false,
  supportsTracking: false,
};

const adapters = new Map<string, MarketplaceCarrierAdapter>([
  [manualCarrierAdapter.id, manualCarrierAdapter],
]);

export function registerMarketplaceCarrierAdapter(adapter: MarketplaceCarrierAdapter) {
  if (!adapter?.id) throw new Error('Carrier adapter id is required');
  adapters.set(adapter.id, adapter);
}

export function getMarketplaceCarrierAdapter(id: string) {
  return adapters.get(id) || manualCarrierAdapter;
}

export function listMarketplaceCarrierAdapters() {
  return [...adapters.values()];
}

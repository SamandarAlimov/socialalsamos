import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import db from '@/lib/supabaseAny';

export type ShipmentTransportMode =
  | 'courier'
  | 'truck'
  | 'air'
  | 'sea'
  | 'rail'
  | 'multimodal'
  | 'pickup';

export type ShipmentStatus =
  | 'draft'
  | 'booked'
  | 'handed_over'
  | 'customs_export'
  | 'in_transit'
  | 'customs_import'
  | 'customs_hold'
  | 'out_for_delivery'
  | 'delivered'
  | 'exception'
  | 'cancelled';

export interface ShipmentLeg {
  id: string;
  shipment_id: string;
  position: number;
  mode: ShipmentTransportMode;
  carrier_name: string | null;
  tracking_number: string | null;
  origin_name: string | null;
  origin_country: string | null;
  destination_name: string | null;
  destination_country: string | null;
  status: string;
  estimated_departure_at: string | null;
  estimated_arrival_at: string | null;
  departed_at: string | null;
  arrived_at: string | null;
}

export interface ShipmentEvent {
  id: string;
  shipment_id: string;
  leg_id: string | null;
  status: ShipmentStatus | string;
  event_code: string;
  title: string;
  description: string | null;
  location: string | null;
  country_code: string | null;
  occurred_at: string;
  is_public: boolean;
}

export interface CustomsDeclaration {
  id: string;
  shipment_id: string;
  hs_code: string | null;
  origin_country: string | null;
  destination_country: string | null;
  declared_value: number;
  currency: string;
  invoice_number: string | null;
  incoterm: 'DDP' | 'DAP';
  duty_amount: number;
  tax_amount: number;
  fees_amount: number;
  payment_status: string;
  clearance_status: string;
  notes: string | null;
}

export interface MarketplaceShipment {
  id: string;
  order_id: string;
  seller_id: string;
  buyer_id: string;
  carrier_id: string | null;
  carrier_name: string | null;
  service_level: string;
  transport_mode: ShipmentTransportMode;
  tracking_number: string | null;
  status: ShipmentStatus;
  origin_country: string | null;
  destination_country: string | null;
  current_country: string | null;
  current_location: string | null;
  incoterm: 'DDP' | 'DAP';
  duties_payer: 'buyer' | 'seller' | 'included';
  declared_value: number;
  currency: string;
  customs_status: string;
  estimated_departure_at: string | null;
  estimated_delivery_at: string | null;
  shipped_at: string | null;
  delivered_at: string | null;
  created_at: string;
  updated_at: string;
  carrier?: { id: string; code: string; name: string } | null;
  legs: ShipmentLeg[];
  events: ShipmentEvent[];
  customs: CustomsDeclaration | null;
}

function isMissingLogisticsSchema(error: any) {
  const code = String(error?.code || '');
  const message = String(error?.message || '').toLowerCase();
  return code === '42P01' || code === 'PGRST205' || message.includes('shipments') && message.includes('not found');
}

function normalizeShipment(row: any): MarketplaceShipment {
  const customsRow = Array.isArray(row.customs) ? row.customs[0] ?? null : row.customs ?? null;
  return {
    ...row,
    declared_value: Number(row.declared_value ?? 0),
    legs: [...(row.legs ?? [])].sort((a: any, b: any) => Number(a.position ?? 0) - Number(b.position ?? 0)),
    events: [...(row.events ?? [])].sort(
      (a: any, b: any) => new Date(a.occurred_at).getTime() - new Date(b.occurred_at).getTime(),
    ),
    customs: customsRow
      ? {
          ...customsRow,
          declared_value: Number(customsRow.declared_value ?? 0),
          duty_amount: Number(customsRow.duty_amount ?? 0),
          tax_amount: Number(customsRow.tax_amount ?? 0),
          fees_amount: Number(customsRow.fees_amount ?? 0),
        }
      : null,
  } as MarketplaceShipment;
}

export function useShipmentTracking(orderId?: string | null) {
  const [shipments, setShipments] = useState<MarketplaceShipment[]>([]);
  const [isLoading, setIsLoading] = useState(Boolean(orderId));
  const [error, setError] = useState<string | null>(null);
  const [schemaAvailable, setSchemaAvailable] = useState(true);

  const refresh = useCallback(async () => {
    if (!orderId) {
      setShipments([]);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    const { data, error: fetchError } = await db
      .from('shipments')
      .select(`
        *,
        carrier:marketplace_carriers(id, code, name),
        legs:shipment_legs(*),
        events:shipment_events(*),
        customs:customs_declarations(*)
      `)
      .eq('order_id', orderId)
      .order('created_at', { ascending: false });

    if (fetchError) {
      if (isMissingLogisticsSchema(fetchError)) {
        setSchemaAvailable(false);
        setError(null);
      } else {
        setError(fetchError.message || 'Yetkazma ma’lumotlari yuklanmadi');
      }
      setShipments([]);
      setIsLoading(false);
      return;
    }

    setSchemaAvailable(true);
    setError(null);
    setShipments((data ?? []).map(normalizeShipment));
    setIsLoading(false);
  }, [orderId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!orderId || !schemaAvailable) return;
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') void refresh();
    }, 30_000);
    return () => window.clearInterval(timer);
  }, [orderId, refresh, schemaAvailable]);

  const latest = useMemo(() => shipments[0] ?? null, [shipments]);
  return { shipments, latest, isLoading, error, schemaAvailable, refresh };
}

export interface CreateShipmentInput {
  orderId: string;
  transportMode: ShipmentTransportMode;
  serviceLevel?: string;
  carrierName?: string;
  trackingNumber?: string;
  originCountry?: string;
  destinationCountry?: string;
  incoterm?: 'DDP' | 'DAP';
  estimatedDeliveryAt?: string | null;
}

export interface ShipmentEventInput {
  shipmentId: string;
  status: ShipmentStatus;
  eventCode: string;
  title: string;
  description?: string;
  location?: string;
  countryCode?: string;
}

export interface CustomsDeclarationInput {
  shipmentId: string;
  hsCode?: string;
  originCountry?: string;
  destinationCountry?: string;
  declaredValue: number;
  currency: string;
  invoiceNumber?: string;
  incoterm: 'DDP' | 'DAP';
  dutyAmount?: number;
  taxAmount?: number;
  feesAmount?: number;
  notes?: string;
}

const ACTION_ERRORS: Record<string, string> = {
  not_authenticated: 'Iltimos, tizimga kiring',
  order_not_found: 'Buyurtma topilmadi',
  shipment_not_found: 'Yetkazma topilmadi',
  seller_only: 'Bu amalni faqat buyurtma sotuvchisi bajara oladi',
  order_finalized: 'Yakunlangan buyurtma uchun yangi yetkazma yaratib bo‘lmaydi',
  invalid_transport_mode: 'Transport turi noto‘g‘ri',
  invalid_incoterm: 'Bojxona sharti noto‘g‘ri',
  invalid_shipment_status: 'Yetkazma holati noto‘g‘ri',
};

function friendlyRpcError(error: any) {
  const raw = String(error?.message || 'Amal bajarilmadi');
  const code = raw.replace(/^.*:\s*/, '').trim();
  return ACTION_ERRORS[code] || raw;
}

export function useSellerShipmentActions() {
  const [isSaving, setIsSaving] = useState(false);

  const createShipment = useCallback(async (input: CreateShipmentInput) => {
    setIsSaving(true);
    try {
      const { data, error } = await db.rpc('marketplace_create_shipment', {
        _order_id: input.orderId,
        _transport_mode: input.transportMode,
        _service_level: input.serviceLevel || 'standard',
        _carrier_name: input.carrierName || 'Alsamos Logistics',
        _tracking_number: input.trackingNumber?.trim() || null,
        _origin_country: input.originCountry?.trim() || null,
        _destination_country: input.destinationCountry?.trim() || null,
        _incoterm: input.incoterm || 'DAP',
        _estimated_delivery_at: input.estimatedDeliveryAt || null,
      });
      if (error) throw error;
      toast.success('Yetkazma yaratildi');
      return { success: true, data };
    } catch (error: any) {
      const message = friendlyRpcError(error);
      toast.error(message);
      return { success: false, error: message };
    } finally {
      setIsSaving(false);
    }
  }, []);

  const addEvent = useCallback(async (input: ShipmentEventInput) => {
    setIsSaving(true);
    try {
      const { data, error } = await db.rpc('marketplace_add_shipment_event', {
        _shipment_id: input.shipmentId,
        _status: input.status,
        _event_code: input.eventCode,
        _title: input.title,
        _description: input.description?.trim() || null,
        _location: input.location?.trim() || null,
        _country_code: input.countryCode?.trim() || null,
        _occurred_at: new Date().toISOString(),
      });
      if (error) throw error;
      toast.success(input.title);
      return { success: true, data };
    } catch (error: any) {
      const message = friendlyRpcError(error);
      toast.error(message);
      return { success: false, error: message };
    } finally {
      setIsSaving(false);
    }
  }, []);

  const saveCustoms = useCallback(async (input: CustomsDeclarationInput) => {
    setIsSaving(true);
    try {
      const { data, error } = await db.rpc('marketplace_upsert_customs_declaration', {
        _shipment_id: input.shipmentId,
        _hs_code: input.hsCode?.trim() || null,
        _origin_country: input.originCountry?.trim() || null,
        _destination_country: input.destinationCountry?.trim() || null,
        _declared_value: Math.max(0, Number(input.declaredValue || 0)),
        _currency: input.currency || 'USD',
        _invoice_number: input.invoiceNumber?.trim() || null,
        _incoterm: input.incoterm,
        _duty_amount: Math.max(0, Number(input.dutyAmount || 0)),
        _tax_amount: Math.max(0, Number(input.taxAmount || 0)),
        _fees_amount: Math.max(0, Number(input.feesAmount || 0)),
        _notes: input.notes?.trim() || null,
      });
      if (error) throw error;
      toast.success('Bojxona ma’lumotlari saqlandi');
      return { success: true, data };
    } catch (error: any) {
      const message = friendlyRpcError(error);
      toast.error(message);
      return { success: false, error: message };
    } finally {
      setIsSaving(false);
    }
  }, []);

  return { createShipment, addEvent, saveCustoms, isSaving };
}

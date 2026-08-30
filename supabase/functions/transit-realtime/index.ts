// Alsamos Transit Realtime gateway.
//
// Real GTFS/GTFS-Realtime provider credentials stay on the server.
// Browser receives only normalized JSON:
//   status
//   arrivals  -> route ref + minutes
//   vehicles  -> fresh vehicle positions
//
// Required secrets for direct GTFS mode:
//   TRANSIT_GTFS_STATIC_URL
//   TRANSIT_GTFS_RT_TRIP_UPDATES_URL
//   TRANSIT_GTFS_RT_VEHICLES_URL
// Optional:
//   TRANSIT_GTFS_HEADERS_JSON={"x-api-key":"..."}
//   TRANSIT_NORMALIZED_URL=https://provider.example/api
//
// If no provider is configured, the endpoint returns configured:false and
// never invents arrival times or vehicle positions.

import GtfsRealtimeBindings from "npm:gtfs-realtime-bindings@1.1.1";
import { strFromU8, unzipSync } from "npm:fflate@0.8.2";
import { corsHeaders, jsonResponse, preflight } from "../_shared/guard.ts";

type StaticStop = {
  id: string;
  name: string;
  lat: number;
  lng: number;
};

type StaticRoute = {
  id: string;
  ref: string;
  name: string;
  color: string | null;
};

type StaticData = {
  stops: StaticStop[];
  routes: Map<string, StaticRoute>;
  tripRoute: Map<string, string>;
  loadedAt: number;
};

type FeedCache = {
  value: any;
  fetchedAt: number;
};

const STATIC_TTL_MS = 6 * 60 * 60 * 1000;
const REALTIME_TTL_MS = 20 * 1000;
const MAX_FRESH_AGE_SECONDS = 120;
const MAX_MATCH_METERS = 300;

let staticCache: StaticData | null = null;
const feedCache = new Map<string, FeedCache>();

function env(name: string): string {
  return (Deno.env.get(name) ?? "").trim();
}

function providerHeaders(): Record<string, string> {
  const raw = env("TRANSIT_GTFS_HEADERS_JSON");
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return Object.fromEntries(
      Object.entries(parsed)
        .filter(([, value]) => typeof value === "string")
        .map(([key, value]) => [key, String(value)]),
    );
  } catch {
    return {};
  }
}

function asNumber(value: unknown): number {
  if (typeof value === "number") return value;
  if (typeof value === "bigint") return Number(value);
  if (value && typeof (value as any).toString === "function") {
    const parsed = Number((value as any).toString());
    return Number.isFinite(parsed) ? parsed : 0;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function csvRows(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (quoted) {
      if (char === '"' && text[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') {
      quoted = true;
    } else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n") {
      row.push(field.replace(/\r$/, ""));
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += char;
    }
  }

  if (field.length || row.length) {
    row.push(field.replace(/\r$/, ""));
    rows.push(row);
  }
  return rows;
}

function records(text: string): Record<string, string>[] {
  const rows = csvRows(text);
  if (!rows.length) return [];
  const headers = rows[0].map((value) => value.replace(/^\uFEFF/, "").trim());
  return rows.slice(1).map((row) =>
    Object.fromEntries(headers.map((header, index) => [header, row[index] ?? ""]))
  );
}

async function fetchBytes(url: string): Promise<Uint8Array> {
  const response = await fetch(url, {
    headers: {
      Accept: "application/octet-stream, application/zip, application/x-protobuf, */*",
      ...providerHeaders(),
    },
  });
  if (!response.ok) throw new Error("Transit provider HTTP " + response.status);
  return new Uint8Array(await response.arrayBuffer());
}

async function loadStatic(): Promise<StaticData | null> {
  const url = env("TRANSIT_GTFS_STATIC_URL");
  if (!url) return null;
  if (staticCache && Date.now() - staticCache.loadedAt < STATIC_TTL_MS) return staticCache;

  const archive = unzipSync(await fetchBytes(url));
  const read = (name: string) => {
    const exact = archive[name];
    if (exact) return strFromU8(exact);
    const key = Object.keys(archive).find((item) => item.toLowerCase().endsWith("/" + name));
    return key ? strFromU8(archive[key]) : "";
  };

  const stops: StaticStop[] = records(read("stops.txt"))
    .map((row) => ({
      id: row.stop_id,
      name: row.stop_name || row.stop_code || row.stop_id,
      lat: Number(row.stop_lat),
      lng: Number(row.stop_lon),
    }))
    .filter((stop) => stop.id && Number.isFinite(stop.lat) && Number.isFinite(stop.lng));

  const routes = new Map<string, StaticRoute>();
  for (const row of records(read("routes.txt"))) {
    if (!row.route_id) continue;
    routes.set(row.route_id, {
      id: row.route_id,
      ref: row.route_short_name || row.route_id,
      name: row.route_long_name || row.route_short_name || row.route_id,
      color: row.route_color ? "#" + row.route_color.replace(/^#/, "") : null,
    });
  }

  const tripRoute = new Map<string, string>();
  for (const row of records(read("trips.txt"))) {
    if (row.trip_id && row.route_id) tripRoute.set(row.trip_id, row.route_id);
  }

  staticCache = { stops, routes, tripRoute, loadedAt: Date.now() };
  return staticCache;
}

function radians(value: number): number {
  return value * Math.PI / 180;
}

function meters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const dLat = radians(lat2 - lat1);
  const dLng = radians(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(radians(lat1)) * Math.cos(radians(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371000 * Math.asin(Math.sqrt(a));
}

function nearestStop(data: StaticData, lat: number, lng: number): StaticStop | null {
  let best: StaticStop | null = null;
  let bestMeters = Infinity;
  for (const stop of data.stops) {
    if (Math.abs(stop.lat - lat) > 0.01 || Math.abs(stop.lng - lng) > 0.015) continue;
    const distance = meters(lat, lng, stop.lat, stop.lng);
    if (distance < bestMeters) {
      best = stop;
      bestMeters = distance;
    }
  }
  return bestMeters <= MAX_MATCH_METERS ? best : null;
}

async function decodeFeed(url: string): Promise<any> {
  const cached = feedCache.get(url);
  if (cached && Date.now() - cached.fetchedAt < REALTIME_TTL_MS) return cached.value;

  const bytes = await fetchBytes(url);
  const feed = GtfsRealtimeBindings.transit_realtime.FeedMessage.decode(bytes);
  feedCache.set(url, { value: feed, fetchedAt: Date.now() });
  return feed;
}

function feedFresh(feed: any): boolean {
  const timestamp = asNumber(feed?.header?.timestamp);
  if (!timestamp) return true;
  return Math.max(0, Date.now() / 1000 - timestamp) <= MAX_FRESH_AGE_SECONDS;
}

function routeMeta(staticData: StaticData | null, routeId: string, tripId: string) {
  const resolvedRouteId = routeId || staticData?.tripRoute.get(tripId) || "";
  const route = resolvedRouteId ? staticData?.routes.get(resolvedRouteId) : null;
  return {
    routeId: resolvedRouteId,
    ref: route?.ref || resolvedRouteId || "?",
    name: route?.name || route?.ref || resolvedRouteId || "Marshrut",
    color: route?.color ?? null,
  };
}

async function normalizedRequest(action: string, payload: Record<string, unknown>) {
  const base = env("TRANSIT_NORMALIZED_URL").replace(/\/+$/, "");
  if (!base) return null;
  const response = await fetch(base + "/" + action, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...providerHeaders() },
    body: JSON.stringify(payload),
  });
  if (!response.ok) throw new Error("Normalized transit provider HTTP " + response.status);
  return await response.json();
}

async function arrivals(payload: Record<string, any>) {
  const normalized = await normalizedRequest("arrivals", payload);
  if (normalized) return normalized;

  const tripUpdatesUrl = env("TRANSIT_GTFS_RT_TRIP_UPDATES_URL");
  if (!tripUpdatesUrl) return { configured: false, realtime: false, arrivals: [] };

  const staticData = await loadStatic();
  const lat = Number(payload.latitude);
  const lng = Number(payload.longitude);
  const matched = staticData && Number.isFinite(lat) && Number.isFinite(lng)
    ? nearestStop(staticData, lat, lng)
    : null;

  const requestedStopId = String(payload.gtfsStopId || "");
  const stopId = requestedStopId || matched?.id || "";
  if (!stopId) {
    return {
      configured: true,
      realtime: false,
      reason: "GTFS stop mosligi topilmadi",
      arrivals: [],
    };
  }

  const feed = await decodeFeed(tripUpdatesUrl);
  if (!feedFresh(feed)) {
    return { configured: true, realtime: false, stale: true, arrivals: [], gtfsStopId: stopId };
  }

  const nowSeconds = Date.now() / 1000;
  const result: any[] = [];

  for (const entity of feed.entity ?? []) {
    const update = entity.tripUpdate;
    if (!update) continue;

    const tripId = String(update.trip?.tripId ?? "");
    const routeId = String(update.trip?.routeId ?? "");
    const meta = routeMeta(staticData, routeId, tripId);

    for (const stopUpdate of update.stopTimeUpdate ?? []) {
      if (String(stopUpdate.stopId ?? "") !== stopId) continue;
      const eventTime =
        asNumber(stopUpdate.arrival?.time) ||
        asNumber(stopUpdate.departure?.time);
      if (!eventTime) continue;
      const minutes = Math.ceil((eventTime - nowSeconds) / 60);
      if (minutes < -1 || minutes > 180) continue;
      result.push({
        ...meta,
        minutes: Math.max(0, minutes),
        tripId,
        gtfsStopId: stopId,
      });
    }
  }

  result.sort((a, b) => a.minutes - b.minutes);
  return {
    configured: true,
    realtime: true,
    gtfsStopId: stopId,
    matchedStopName: matched?.name ?? null,
    arrivals: result.slice(0, 40),
  };
}

async function vehicles(payload: Record<string, any>) {
  const normalized = await normalizedRequest("vehicles", payload);
  if (normalized) return normalized;

  const vehiclesUrl = env("TRANSIT_GTFS_RT_VEHICLES_URL");
  if (!vehiclesUrl) return { configured: false, realtime: false, vehicles: [] };

  const staticData = await loadStatic();
  const feed = await decodeFeed(vehiclesUrl);
  if (!feedFresh(feed)) {
    return { configured: true, realtime: false, stale: true, vehicles: [] };
  }

  const south = Number(payload.south);
  const west = Number(payload.west);
  const north = Number(payload.north);
  const east = Number(payload.east);
  const hasBounds = [south, west, north, east].every(Number.isFinite);
  const nowSeconds = Date.now() / 1000;
  const result: any[] = [];

  for (const entity of feed.entity ?? []) {
    const vehicle = entity.vehicle;
    const position = vehicle?.position;
    const lat = Number(position?.latitude);
    const lng = Number(position?.longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    if (hasBounds && (lat < south || lat > north || lng < west || lng > east)) continue;

    const timestamp = asNumber(vehicle.timestamp);
    if (timestamp && nowSeconds - timestamp > MAX_FRESH_AGE_SECONDS) continue;

    const tripId = String(vehicle.trip?.tripId ?? "");
    const routeId = String(vehicle.trip?.routeId ?? "");
    const meta = routeMeta(staticData, routeId, tripId);

    result.push({
      id: String(vehicle.vehicle?.id || entity.id || tripId || result.length),
      label: String(vehicle.vehicle?.label || vehicle.vehicle?.licensePlate || ""),
      ...meta,
      tripId,
      latitude: lat,
      longitude: lng,
      bearing: Number(position?.bearing) || null,
      speedMps: Number(position?.speed) || null,
      timestamp: timestamp || null,
    });
  }

  return { configured: true, realtime: true, vehicles: result.slice(0, 500) };
}

Deno.serve(async (req) => {
  const pre = preflight(req, "GET, POST, OPTIONS");
  if (pre) return pre;

  if (req.method !== "GET" && req.method !== "POST") {
    return jsonResponse(req, { error: "Method not allowed" }, 405);
  }

  let payload: Record<string, any> = {};
  if (req.method === "POST") {
    try {
      payload = await req.json();
    } catch {
      payload = {};
    }
  } else {
    const url = new URL(req.url);
    payload = Object.fromEntries(url.searchParams.entries());
  }

  const action = String(payload.action || "status");

  try {
    if (action === "status") {
      return jsonResponse(req, {
        configured: Boolean(
          env("TRANSIT_NORMALIZED_URL") ||
          env("TRANSIT_GTFS_RT_TRIP_UPDATES_URL") ||
          env("TRANSIT_GTFS_RT_VEHICLES_URL"),
        ),
        staticGtfs: Boolean(env("TRANSIT_GTFS_STATIC_URL")),
        arrivals: Boolean(env("TRANSIT_NORMALIZED_URL") || env("TRANSIT_GTFS_RT_TRIP_UPDATES_URL")),
        vehicles: Boolean(env("TRANSIT_NORMALIZED_URL") || env("TRANSIT_GTFS_RT_VEHICLES_URL")),
      }, 200, { "Cache-Control": "public, max-age=30" });
    }

    if (action === "arrivals") {
      return jsonResponse(req, await arrivals(payload), 200, {
        "Cache-Control": "public, max-age=15",
      });
    }

    if (action === "vehicles") {
      return jsonResponse(req, await vehicles(payload), 200, {
        "Cache-Control": "public, max-age=10",
      });
    }

    return jsonResponse(req, { error: "Unknown transit action" }, 400);
  } catch (error) {
    console.error("transit-realtime failed", error);
    return jsonResponse(req, {
      error: "Transit provider temporarily unavailable",
      configured: true,
      realtime: false,
    }, 502);
  }
});

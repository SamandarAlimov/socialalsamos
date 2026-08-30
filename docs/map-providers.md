# Alsamos Map providers

This document describes the production provider contracts used by the Map page.
Secrets are server-side only. Do not expose traffic or transit credentials through
`VITE_*` variables.

## Real traffic

The UI never fabricates congestion. The **Tirbandlik** switch is disabled until
`/api/traffic?action=status` reports a configured provider.

### TomTom Orbis Traffic v2

Recommended server environment:

```text
TRAFFIC_PROVIDER=tomtom-orbis
TOMTOM_TRAFFIC_API_KEY=<server secret>
```

Alsamos proxies TomTom Orbis Traffic Flow raster tiles through `/api/traffic`,
using the `TomTom-Api-Key` request header. The provider key is never returned to
the browser. Light and dark traffic styles are selected automatically from the
active map theme. Tiles refresh on the provider cadence.

### Generic real traffic provider

A provider that exposes transparent XYZ raster traffic tiles can be connected
without changing the renderers:

```text
TRAFFIC_PROVIDER=template
TRAFFIC_TILE_URL_TEMPLATE=https://provider.example/traffic/{z}/{x}/{y}?style={style}
TRAFFIC_TILE_HEADERS_JSON={"Authorization":"Bearer <server secret>"}
TRAFFIC_PROVIDER_NAME=Provider name
TRAFFIC_ATTRIBUTION=Traffic data © Provider
TRAFFIC_MIN_ZOOM=0
TRAFFIC_MAX_ZOOM=22
TRAFFIC_REFRESH_SECONDS=60
```

The template must use HTTPS. Supported placeholders are `{z}`, `{x}`,
`{y}`, and `{style}` where style is `light` or `dark`.

## Authoritative GTFS / GTFS-Realtime

The transit gateway is `supabase/functions/transit-realtime`. It supports
static GTFS, GTFS-Realtime TripUpdates, VehiclePositions, ServiceAlerts, and an
optional journey router.

Recommended secrets:

```text
TRANSIT_GTFS_STATIC_URL=https://operator.example/gtfs.zip
TRANSIT_GTFS_RT_TRIP_UPDATES_URL=https://operator.example/gtfs-rt/trip-updates.pb
TRANSIT_GTFS_RT_VEHICLES_URL=https://operator.example/gtfs-rt/vehicle-positions.pb
TRANSIT_GTFS_RT_ALERTS_URL=https://operator.example/gtfs-rt/service-alerts.pb

TRANSIT_PROVIDER_NAME=Official city transport operator
TRANSIT_PROVIDER_URL=https://operator.example
TRANSIT_FEED_AUTHORITY=official

# Optional provider authentication
TRANSIT_GTFS_HEADERS_JSON={"Authorization":"Bearer <server secret>"}

# Optional multimodal journey planner adapter
TRANSIT_ROUTER_URL=https://router.example

# Optional already-normalized provider adapter
TRANSIT_NORMALIZED_URL=https://provider.example/api
```

Use `TRANSIT_FEED_AUTHORITY=official` only for a feed published by the public
authority itself. Use `operator` for the actual transport operator,
`aggregator` for a third-party aggregation service, and `unknown` when the
provenance has not been verified.

### Data-integrity rules

- GTFS static routes are preferred over OpenStreetMap route relations once an
  official static feed is configured.
- OSM `interval` / `headway` metadata is displayed only as service frequency.
  It is **never** converted into a fabricated arrival time.
- TripUpdates and VehiclePositions older than 90 seconds are rejected as stale.
- ServiceAlerts may remain valid for up to 10 minutes and are filtered by their
  active period.
- The client polls GTFS-RT and provider health every 30 seconds.
- If no real feed exists, the UI explicitly says live GTFS is not connected.

## Rollout

1. Configure provider secrets in the production environment.
2. Verify `/api/traffic?action=status` and the transit edge-function status.
3. Test raster and vector map engines.
4. Verify provider attribution and geographic coverage.
5. Enable overlays for users only after real provider responses are healthy.

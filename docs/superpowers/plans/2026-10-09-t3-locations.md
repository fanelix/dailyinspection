# T3 locations implementation

Goal: confirm and preserve the inspected object's WGS84 location separately from the observer's GPS.
Architecture: one shared validator, generated Apps Script companion, additive inspection JSON snapshot, read-only existing location masters, client-only Leaflet map.
Tech stack: existing Next/React/TypeScript/Apps Script, native Geolocation, Leaflet 1.9.4 (stable).
Spec: docs/plan.md §7, §12–13; user authorized the next task on 2026-10-09.
Global constraints: preserve T2 retries and original Sheet headers/rows; no fabricated coordinates, accuracy limits, CRS transforms or boundaries; no T4–T7. Photo permissions left as directed.
Review focus: swapped coordinate order, observer accuracy on moved pins, stale GPS callbacks, old retry compatibility, master edits changing historical snapshots.

1. Test location validation and storage: finite/ranged numbers, blank versus zero, independent GPS/pin, deterministic snapshot/checksum, same-ID conflict, T2 retry migration.
2. Add lib/location.ts and generate apps-script/src/location.js. Store location_json after sub_area; acknowledge SHA-256. Existing locationless clients remain valid, the T3 UI requires confirmation.
3. Read existing Areas, ObservationObjects, PhotoPoints and Locations headers without writing. Join explicit entity types area/observation_object/photo_point; match the seven known area labels; reject invalid configured WGS84 records. Current tables contain headers only. Check a selected master against storage on first save, preserve its snapshot on retry.
4. Add /api/locations and LocationPicker with GPS on request, map pin, saved selection, manual coordinates and confirmation. Reset confirmation after edits; cancel stale GPS callbacks. Two labeled markers; no default object point. A small current-point GeoJSON download proves [longitude, latitude]; history exports remain T6.
5. Run the full check suite and production build. Review scoped changes, publish a stacked draft PR and verify its preview. A deployed T3 Apps Script version is required for real location acknowledgments; do not claim fake-runtime checks prove Google storage.

Verification: node --test checks/location.check.mjs; npm run check; npm run build; browser manual-coordinate/pin/confirmation flow and API acknowledgments when the gateway is updated.

## User-authorized UTM revision (10 October WIB)

Add explicit datum/zone/hemisphere selection and manual E/N. Keep WGS84 map/GeoJSON, observer GPS and old snapshots unchanged. Use pinned Proj4js and verified PROJ/EPSG WGS84/DGN95/ID74 definitions/coverage, with operation accuracy distinguished from GPS. Preserve source UTM metadata and revalidate at storage. Reject old gateways before writes through prepareUtmInspection. Correcting manual input CRS requires preview again; changing display does not discard provenance. Generate projection.js with official MIT distribution; deploy six gateway files, build 2026-10-09.6. Check independent control points, invalid source metadata, checksum/retry/legacy compatibility, build and preview; no T4–T7.

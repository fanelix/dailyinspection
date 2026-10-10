// GENERATED: npm run sync:location. Edit lib/location.ts / config/utm-crs.json.
// Global supplied by projection.js (UMD is detected as CommonJS by checkJs).
/** @type {(from: string, to: string, coordinates: number[]) => number[]} */
var proj4;
const utmCrs = [
  {"datum":"ID74","zone":46,"hemisphere":"N","crs":"EPSG:23846","bounds":[95.16,2.55,96.0,5.97]},
  {"datum":"ID74","zone":47,"hemisphere":"N","crs":"EPSG:23847","bounds":[96.0,0.0,102.0,5.42]},
  {"datum":"ID74","zone":48,"hemisphere":"N","crs":"EPSG:23848","bounds":[102.0,0.0,108.0,4.11]},
  {"datum":"ID74","zone":49,"hemisphere":"N","crs":"EPSG:23849","bounds":[108.0,0.0,114.0,4.25]},
  {"datum":"ID74","zone":50,"hemisphere":"N","crs":"EPSG:23850","bounds":[114.0,0.0,120.0,4.37]},
  {"datum":"ID74","zone":51,"hemisphere":"N","crs":"EPSG:23851","bounds":[120.0,0.0,125.71,3.84]},
  {"datum":"ID74","zone":52,"hemisphere":"N","crs":"EPSG:23852","bounds":[126.55,0.0,131.0,4.59]},
  {"datum":"DGN95","zone":46,"hemisphere":"N","crs":"EPSG:23866","bounds":[92.01,0.0,96.0,7.79]},
  {"datum":"DGN95","zone":47,"hemisphere":"N","crs":"EPSG:23867","bounds":[96.0,0.0,102.0,7.49]},
  {"datum":"DGN95","zone":48,"hemisphere":"N","crs":"EPSG:23868","bounds":[102.0,0.0,108.0,6.94]},
  {"datum":"DGN95","zone":49,"hemisphere":"N","crs":"EPSG:23869","bounds":[108.0,0.0,114.0,7.37]},
  {"datum":"DGN95","zone":50,"hemisphere":"N","crs":"EPSG:23870","bounds":[114.0,0.0,120.0,4.37]},
  {"datum":"DGN95","zone":51,"hemisphere":"N","crs":"EPSG:23871","bounds":[120.0,0.0,126.0,5.48]},
  {"datum":"DGN95","zone":52,"hemisphere":"N","crs":"EPSG:23872","bounds":[126.0,0.0,132.0,6.68]},
  {"datum":"DGN95","zone":47,"hemisphere":"S","crs":"EPSG:23877","bounds":[96.0,-8.86,102.0,0.0]},
  {"datum":"DGN95","zone":48,"hemisphere":"S","crs":"EPSG:23878","bounds":[102.0,-10.73,108.01,0.0]},
  {"datum":"DGN95","zone":49,"hemisphere":"S","crs":"EPSG:23879","bounds":[108.0,-12.07,114.0,0.0]},
  {"datum":"DGN95","zone":50,"hemisphere":"S","crs":"EPSG:23880","bounds":[114.0,-13.06,120.01,0.0]},
  {"datum":"DGN95","zone":51,"hemisphere":"S","crs":"EPSG:23881","bounds":[120.0,-13.95,126.01,0.01]},
  {"datum":"DGN95","zone":52,"hemisphere":"S","crs":"EPSG:23882","bounds":[126.0,-9.45,132.0,0.0]},
  {"datum":"DGN95","zone":53,"hemisphere":"S","crs":"EPSG:23883","bounds":[132.0,-10.06,138.01,0.0]},
  {"datum":"DGN95","zone":54,"hemisphere":"S","crs":"EPSG:23884","bounds":[138.0,-10.84,141.46,0.0]},
  {"datum":"ID74","zone":47,"hemisphere":"S","crs":"EPSG:23887","bounds":[98.24,-3.57,102.0,0.0]},
  {"datum":"ID74","zone":48,"hemisphere":"S","crs":"EPSG:23888","bounds":[102.0,-7.79,108.0,0.0]},
  {"datum":"ID74","zone":49,"hemisphere":"S","crs":"EPSG:23889","bounds":[108.0,-8.67,114.0,0.0]},
  {"datum":"ID74","zone":50,"hemisphere":"S","crs":"EPSG:23890","bounds":[114.0,-10.15,120.0,0.0]},
  {"datum":"ID74","zone":51,"hemisphere":"S","crs":"EPSG:23891","bounds":[120.0,-10.98,126.0,0.0]},
  {"datum":"ID74","zone":52,"hemisphere":"S","crs":"EPSG:23892","bounds":[126.0,-8.41,132.0,0.0]},
  {"datum":"ID74","zone":53,"hemisphere":"S","crs":"EPSG:23893","bounds":[132.0,-8.49,138.0,-0.29]},
  {"datum":"ID74","zone":54,"hemisphere":"S","crs":"EPSG:23894","bounds":[138.0,-9.19,141.01,-1.49]}
];
function locationObject(v) { return v !== null && typeof v === 'object' && !Array.isArray(v); }
/** @returns {never} Keeps the throw-only return type in the generated Apps Script JS. */
function locationFail(message) { throw new Error(message); }
function locationText(v, label, max) {
    return typeof v === 'string' && v.trim().length > 0 && v.trim().length <= max ? v.trim() : locationFail(`${label} tidak valid.`);
}
function locationTime(v) {
    if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(v) || !Number.isFinite(Date.parse(v)) || new Date(v).toISOString() !== v)
        return locationFail('Waktu lokasi harus ISO UTC yang valid.');
    return v;
}
function locationNumber(v, limit, label) {
    return typeof v === 'number' && Number.isFinite(v) && Math.abs(v) <= limit ? v : locationFail(`${label} harus angka antara ${-limit} dan ${limit}.`);
}
function locationAccuracy(v) {
    return typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : locationFail('Akurasi GPS harus angka meter yang tidak negatif.');
}
function utmInput(value) {
    if (!value.trim())
        return locationFail('Isi Easting dan Northing; kolom kosong bukan nol.');
    const n = Number(value);
    return Number.isFinite(n) ? n : locationFail('Koordinat UTM harus angka meter yang valid.');
}
function utmDefinition(value) {
    if (!locationObject(value) || typeof value.datum !== 'string' || !['WGS84', 'DGN95', 'ID74'].includes(value.datum) || !Number.isInteger(value.zone) || Number(value.zone) < 1 || Number(value.zone) > 60 || (value.hemisphere !== 'N' && value.hemisphere !== 'S'))
        return locationFail('Pilih datum, zona UTM (1–60), dan belahan bumi N/S.');
    const settings = { datum: value.datum, zone: value.zone, hemisphere: value.hemisphere };
    const regional = utmCrs.find(c => c.datum === settings.datum && c.zone === settings.zone && c.hemisphere === settings.hemisphere);
    if (settings.datum !== 'WGS84' && !regional)
        return locationFail('Zona/belahan bumi tidak didukung untuk datum ini.');
    const west = settings.zone * 6 - 186;
    const coverage = regional?.bounds ?? [west, -80, west + 6, 84];
    // Intersect EPSG coverage with the selected hemisphere (23881 extends 0.01° north).
    const bounds = [coverage[0], Math.max(coverage[1], settings.hemisphere === 'S' ? -80 : 0), coverage[2], Math.min(coverage[3], settings.hemisphere === 'N' ? 84 : 0)];
    // EPSG:1833 is coordinate-frame; PROJ's +towgs84 uses position-vector (reverse rotation signs).
    const datum = settings.datum === 'ID74' ? '+a=6378160 +rf=298.247 +towgs84=-1.977,-13.06,-9.993,0.364,0.254,0.689,-1.037' : '+ellps=WGS84 +towgs84=0,0,0';
    return { settings, bounds, definition: `+proj=utm +zone=${settings.zone} ${settings.hemisphere === 'S' ? '+south' : ''} ${datum} +units=m +no_defs`,
        crs: regional?.crs ?? `EPSG:${(settings.hemisphere === 'N' ? 32600 : 32700) + settings.zone}`,
        operation: settings.datum === 'WGS84' ? 'identity' : settings.datum === 'DGN95' ? 'EPSG:15912' : 'EPSG:1833',
        transformationAccuracyM: settings.datum === 'WGS84' ? null : settings.datum === 'DGN95' ? 1 : 3 };
}
function utmCheckArea(latitude, longitude, bounds) {
    // 1e-7 degree tolerance is only floating-point boundary slack, not survey accuracy.
    if (longitude < bounds[0] - 1e-7 || longitude > bounds[2] + 1e-7 || latitude < bounds[1] - 1e-7 || latitude > bounds[3] + 1e-7)
        return locationFail('Titik berada di luar cakupan zona, belahan bumi, atau datum yang dipilih.');
}
function wgs84ToUtm(latitude, longitude, value) {
    locationNumber(latitude, 90, 'Latitude');
    locationNumber(longitude, 180, 'Longitude');
    const d = utmDefinition(value);
    // Validate coverage in the source datum, before the Helmert approximation to WGS84.
    const native = proj4('EPSG:4326', d.definition.replace('+proj=utm', '+proj=longlat'), [longitude, latitude]);
    utmCheckArea(native[1], native[0], d.bounds);
    const [easting, northing] = proj4('EPSG:4326', d.definition, [longitude, latitude]);
    return { ...d.settings, easting, northing, crs: d.crs, operation: d.operation, transformationAccuracyM: d.transformationAccuracyM };
}
function utmToWgs84(value) {
    const d = utmDefinition(value);
    if (!locationObject(value) || typeof value.easting !== 'number' || !Number.isFinite(value.easting) || value.easting < 100000 || value.easting > 900000 || typeof value.northing !== 'number' || !Number.isFinite(value.northing) || value.northing < 0 || value.northing > 10000000)
        return locationFail('Easting/Northing UTM tidak valid (meter).');
    const { easting, northing } = value;
    const native = proj4(d.definition.replace(/\+towgs84=[^ ]+/, ''), d.definition.replace('+proj=utm', '+proj=longlat').replace(/\+towgs84=[^ ]+/, ''), [easting, northing]);
    utmCheckArea(native[1], native[0], d.bounds);
    const [longitude, latitude] = proj4(d.definition, 'EPSG:4326', [easting, northing]);
    locationNumber(latitude, 90, 'Latitude hasil');
    locationNumber(longitude, 180, 'Longitude hasil');
    return { latitude, longitude, utm: { ...d.settings, easting, northing, crs: d.crs, operation: d.operation, transformationAccuracyM: d.transformationAccuracyM } };
}
function coordinateInput(value, axis) {
    if (!value.trim())
        return locationFail('Isi latitude dan longitude; kolom kosong bukan nol.');
    return locationNumber(Number(value), axis === 'latitude' ? 90 : 180, axis);
}
function parseSavedLocation(value, areaId) {
    if (!locationObject(value) || value.areaId !== areaId)
        return locationFail('Lokasi tersimpan tidak sesuai area.');
    const revision = locationText(value.revision, 'Revisi lokasi', 30);
    if (!/^[1-9]\d*$/.test(revision))
        return locationFail('Revisi lokasi harus bilangan bulat positif.');
    return { id: locationText(value.id, 'ID lokasi', 200), revision, areaId, label: locationText(value.label, 'Nama lokasi', 200),
        latitude: locationNumber(value.latitude, 90, 'Latitude'), longitude: locationNumber(value.longitude, 180, 'Longitude'),
        source: locationText(value.source, 'Sumber lokasi', 100), accuracyM: value.accuracyM === null ? null : locationAccuracy(value.accuracyM),
        capturedAt: value.capturedAt === null ? null : locationTime(value.capturedAt) };
}
// Shared with the storage boundary. Missing location is only for legacy T2 callers/retries.
function parseLocation(value, areaId) {
    if (value === undefined || value === null)
        return null;
    if (!locationObject(value) || value.version !== 1 || value.crs !== 'EPSG:4326' || !locationObject(value.object))
        return locationFail('Versi/lokasi WGS84 tidak valid.');
    let observerGps = null;
    if (value.observerGps !== null) {
        const g = value.observerGps;
        if (!locationObject(g))
            return locationFail('Data GPS petugas tidak valid.');
        observerGps = { latitude: locationNumber(g.latitude, 90, 'Latitude GPS'), longitude: locationNumber(g.longitude, 180, 'Longitude GPS'), accuracyM: locationAccuracy(g.accuracyM), capturedAt: locationTime(g.capturedAt) };
    }
    const o = value.object;
    if (!['gps', 'manual_pin', 'manual_coordinates', 'saved_location'].includes(String(o.method)))
        return locationFail('Metode lokasi tidak valid.');
    const method = o.method;
    const savedLocation = method === 'saved_location' ? parseSavedLocation(o.savedLocation, areaId) : null;
    if (method !== 'saved_location' && o.savedLocation !== null)
        return locationFail('Snapshot lokasi tidak sesuai metode.');
    const point = { latitude: locationNumber(o.latitude, 90, 'Latitude objek'), longitude: locationNumber(o.longitude, 180, 'Longitude objek'), method,
        accuracyM: method === 'gps' ? locationAccuracy(o.accuracyM) : null, capturedAt: locationTime(o.capturedAt), savedLocation };
    if (method !== 'gps' && o.accuracyM !== null)
        return locationFail('Pin/koordinat manual tidak memiliki akurasi GPS petugas.');
    if (method === 'gps' && (!observerGps || point.latitude !== observerGps.latitude || point.longitude !== observerGps.longitude || point.accuracyM !== observerGps.accuracyM || point.capturedAt !== observerGps.capturedAt))
        return locationFail('Lokasi objek GPS harus sama dengan hasil GPS petugas.');
    if (savedLocation && (point.latitude !== savedLocation.latitude || point.longitude !== savedLocation.longitude))
        return locationFail('Koordinat objek berbeda dari snapshot lokasi tersimpan.');
    if (o.utm !== undefined) {
        const converted = utmToWgs84(o.utm);
        if (!locationObject(o.utm) || o.utm.crs !== converted.utm.crs || o.utm.operation !== converted.utm.operation || o.utm.transformationAccuracyM !== converted.utm.transformationAccuracyM || Math.abs(point.latitude - converted.latitude) > 1e-7 || Math.abs(point.longitude - converted.longitude) > 1e-7)
            return locationFail('Snapshot UTM berbeda dari koordinat/CRS/transformasi objek.');
        point.utm = converted.utm;
    }
    return { version: 1, crs: 'EPSG:4326', observerGps, object: point };
}
function locationGeoJson(location) {
    return { type: 'Feature', geometry: { type: 'Point', coordinates: [location.object.longitude, location.object.latitude] },
        properties: { method: location.object.method, captured_at: location.object.capturedAt, accuracy_m: location.object.accuracyM, ...(location.object.utm ? { utm: location.object.utm } : {}) } };
}
function gpsErrorMessage(code) {
    return (code === 1 ? 'Izin GPS ditolak.' : code === 3 ? 'GPS melewati batas waktu.' : 'GPS tidak tersedia.') + ' Pilih pin, lokasi tersimpan, atau koordinat manual.';
}

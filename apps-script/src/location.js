// GENERATED: npm run sync:location. Edit lib/location.ts.
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
    return { version: 1, crs: 'EPSG:4326', observerGps, object: point };
}
function locationGeoJson(location) {
    return { type: 'Feature', geometry: { type: 'Point', coordinates: [location.object.longitude, location.object.latitude] },
        properties: { method: location.object.method, captured_at: location.object.capturedAt, accuracy_m: location.object.accuracyM } };
}
function gpsErrorMessage(code) {
    return (code === 1 ? 'Izin GPS ditolak.' : code === 3 ? 'GPS melewati batas waktu.' : 'GPS tidak tersedia.') + ' Pilih pin, lokasi tersimpan, atau koordinat manual.';
}

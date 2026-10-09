'use client';
import { useEffect, useRef, useState } from 'react';
import { coordinateInput, gpsErrorMessage, locationGeoJson, parseLocation, parseSavedLocation, utmInput, utmToWgs84, wgs84ToUtm } from '../lib/location.ts';
import type { GpsPoint, InspectionLocation, ObjectPoint, SavedLocation } from '../lib/location.ts';
import utmCrs from '../config/utm-crs.json';
import LocationMap from './LocationMap.tsx';

export default function LocationPicker({ areaId, value, disabled, onChange }: { areaId: string; value: InspectionLocation | null; disabled: boolean; onChange: (location: InspectionLocation | null) => void }) {
  const [observer, setObserver] = useState<GpsPoint | null>(null);
  const [point, setPoint] = useState<ObjectPoint | null>(null);
  const [latitude, setLatitude] = useState('');
  const [longitude, setLongitude] = useState('');
  const [coordinateMode, setCoordinateMode] = useState('utm');
  const [datum, setDatum] = useState('WGS84');
  const [zone, setZone] = useState('');
  const [hemisphere, setHemisphere] = useState('');
  const [easting, setEasting] = useState('');
  const [northing, setNorthing] = useState('');
  const [saved, setSaved] = useState<SavedLocation[]>([]);
  const [selected, setSelected] = useState('');
  const [masterMessage, setMasterMessage] = useState('Memuat lokasi tersimpan…');
  const [reloadKey, setReloadKey] = useState(0);
  const [gpsMessage, setGpsMessage] = useState('');
  const [error, setError] = useState('');
  const gpsToken = useRef(0);
  const disabledRef = useRef(disabled);
  useEffect(() => { disabledRef.current = disabled; if (disabled) gpsToken.current++; }, [disabled]);
  useEffect(() => () => { gpsToken.current++; }, []);
  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/locations?areaId=${encodeURIComponent(areaId)}`, { signal: AbortSignal.any([controller.signal, AbortSignal.timeout(30000)]), cache: 'no-store' })
      .then(async res => {
        const body = await res.json();
        if (!res.ok || !body.ok || !Array.isArray(body.locations)) throw new Error('Daftar lokasi tidak tersedia.');
        const locations = body.locations.map((l: unknown) => parseSavedLocation(l, areaId));
        if (!controller.signal.aborted) { setSaved(locations); setMasterMessage(locations.length ? '' : 'Belum ada lokasi tersimpan untuk area ini.'); }
      }).catch(() => { if (!controller.signal.aborted) setMasterMessage('Daftar lokasi tersimpan belum dapat dimuat. GPS, pin, dan koordinat manual tetap tersedia.'); });
    return () => controller.abort();
  }, [areaId, reloadKey]);
  function edit() { gpsToken.current++; setGpsMessage(''); setError(''); onChange(null); }
  const settings = { datum, zone: Number(zone), hemisphere };
  function showUtm(next: ObjectPoint, nextSettings = settings) {
    setEasting(''); setNorthing('');
    if (!nextSettings.zone || !nextSettings.hemisphere) return;
    try {
      const u = next.utm ?? wgs84ToUtm(next.latitude, next.longitude, nextSettings);
      setEasting(String(u.easting)); setNorthing(String(u.northing));
    } catch (err) { setError(err instanceof Error ? err.message : 'Konversi UTM tidak tersedia.'); }
  }
  function changeSettings(key: 'datum' | 'zone' | 'hemisphere', next: string) {
    edit();
    if (key === 'datum') setDatum(next); else if (key === 'zone') setZone(next); else setHemisphere(next);
    if (point) {
      // An entered UTM pair needs preview again under its corrected source CRS.
      if (point.method === 'manual_coordinates' && point.utm) { setPoint(null); return; }
      const { utm: _utm, ...physicalPoint } = point;
      setPoint(physicalPoint);
      showUtm(physicalPoint, { ...settings, [key]: key === 'zone' ? Number(next) : next });
    }
  }
  function choose(next: ObjectPoint) {
    if (disabledRef.current) return;
    edit(); setPoint(next); setLatitude(String(next.latitude)); setLongitude(String(next.longitude)); setSelected(next.savedLocation?.id ?? '');
    if (coordinateMode === 'utm') showUtm(next);
  }
  function pin(lat: number, lon: number) {
    choose({ latitude: lat, longitude: lon, method: 'manual_pin', accuracyM: null, capturedAt: new Date().toISOString(), savedLocation: null });
  }
  function getGps() {
    edit();
    if (!navigator.geolocation) { setGpsMessage(gpsErrorMessage(2)); return; }
    const token = ++gpsToken.current;
    setGpsMessage('Mengambil GPS petugas…');
    navigator.geolocation.getCurrentPosition(position => {
      if (token !== gpsToken.current || disabledRef.current) return;
      try {
        const g = { latitude: position.coords.latitude, longitude: position.coords.longitude, accuracyM: position.coords.accuracy, capturedAt: new Date(position.timestamp).toISOString() };
        // Validate native data too; do not read elevation as survey RL.
        parseLocation({ version: 1, crs: 'EPSG:4326', observerGps: g, object: { ...g, method: 'gps', savedLocation: null } }, areaId);
        setObserver(g); setGpsMessage('GPS petugas tersedia. Pilih lokasi objek lalu konfirmasi.'); onChange(null);
      } catch { setGpsMessage(gpsErrorMessage(2)); }
    }, err => { if (token === gpsToken.current && !disabledRef.current) setGpsMessage(gpsErrorMessage(err.code)); }, { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 });
  }
  function manual() {
    try {
      const coordinates = coordinateMode === 'utm' ? utmToWgs84({ ...settings, easting: utmInput(easting), northing: utmInput(northing) }) : { latitude: coordinateInput(latitude, 'latitude'), longitude: coordinateInput(longitude, 'longitude') };
      choose({ ...coordinates, method: 'manual_coordinates', accuracyM: null, capturedAt: new Date().toISOString(), savedLocation: null });
    }
    catch (err) { setError(err instanceof Error ? err.message : 'Koordinat tidak valid.'); }
  }
  function confirm() {
    if (!point) { setError('Pilih lokasi objek terlebih dahulu.'); return; }
    try {
      const { utm: _utm, ...physicalPoint } = point;
      const object = point.utm ? point : coordinateMode === 'utm' ? { ...physicalPoint, utm: wgs84ToUtm(point.latitude, point.longitude, settings) } : physicalPoint;
      const parsed = parseLocation({ version: 1, crs: 'EPSG:4326', observerGps: observer, object }, areaId); onChange(parsed); setError('');
    }
    catch (err) { setError(err instanceof Error ? err.message : 'Lokasi tidak valid.'); }
  }
  return <section aria-labelledby="location-title">
    <h2 id="location-title">Lokasi objek inspeksi</h2>
    <p className="hint">Pilih titik objek yang diperiksa. Posisi petugas dapat berbeda saat mengamati dari tempat aman. Peta memakai WGS84; koordinat UTM dikonversi sesuai pilihan datum dan zona.</p>
    <button type="button" onClick={getGps} disabled={disabled}>Ambil GPS petugas</button>
    {gpsMessage && <p role="status">{gpsMessage}</p>}
    {observer && <>
      <p className="hint">GPS petugas: {observer.latitude}, {observer.longitude}; akurasi dilaporkan perangkat {observer.accuracyM} m; {observer.capturedAt}.</p>
      <button type="button" onClick={() => choose({ ...observer, method: 'gps', savedLocation: null })} disabled={disabled}>Gunakan GPS petugas sebagai lokasi objek</button>
    </>}
    <label htmlFor="saved-location">Lokasi tersimpan</label>
    <select id="saved-location" value={selected} disabled={disabled || !saved.length} onChange={e => {
      const l = saved.find(l => l.id === e.target.value);
      if (l) choose({ latitude: l.latitude, longitude: l.longitude, method: 'saved_location', accuracyM: null, capturedAt: new Date().toISOString(), savedLocation: l });
      else { edit(); setSelected(''); setPoint(null); setLatitude(''); setLongitude(''); setEasting(''); setNorthing(''); }
    }}>
      <option value="">Pilih lokasi…</option>{saved.map(l => <option key={l.id} value={l.id}>{l.label} ({l.id}, revisi {l.revision})</option>)}
    </select>
    {masterMessage && <p className="hint" role="status">{masterMessage}</p>}
    <button type="button" disabled={disabled} onClick={() => {
      if (point?.method === 'saved_location') { edit(); setPoint(null); setSelected(''); setLatitude(''); setLongitude(''); setEasting(''); setNorthing(''); }
      setSaved([]); setMasterMessage('Memuat lokasi tersimpan…'); setReloadKey(current => current + 1);
    }}>Muat ulang lokasi tersimpan</button>
    <LocationMap observer={observer} point={point} disabled={disabled} onPin={pin} />
    <label htmlFor="coordinate-mode">Sistem koordinat</label>
    <select id="coordinate-mode" value={coordinateMode} disabled={disabled} onChange={e => { edit(); setCoordinateMode(e.target.value); if (point && e.target.value === 'utm') showUtm(point); }}>
      <option value="utm">UTM (Easting / Northing)</option><option value="geographic">WGS84 (Latitude / Longitude)</option>
    </select>
    {coordinateMode === 'utm' ? <>
      <label htmlFor="utm-datum">Datum UTM</label>
      <select id="utm-datum" value={datum} disabled={disabled} onChange={e => changeSettings('datum', e.target.value)}>
        <option value="WGS84">WGS84</option><option value="DGN95">DGN95</option><option value="ID74">ID74 (Indonesian Datum 1974)</option>
      </select>
      <div className="coordinate-fields">
        <div><label htmlFor="utm-zone">Zona UTM</label><select id="utm-zone" value={zone} disabled={disabled} onChange={e => changeSettings('zone', e.target.value)}>
          <option value="">Pilih zona…</option>{Array.from({ length: 60 }, (_, i) => i+1).map(z => <option key={z} value={z} disabled={datum !== 'WGS84' && !utmCrs.some(c => c.datum === datum && c.zone === z && (!hemisphere || c.hemisphere === hemisphere))}>{z}</option>)}
        </select></div>
        <div><label htmlFor="utm-hemisphere">Belahan bumi</label><select id="utm-hemisphere" value={hemisphere} disabled={disabled} onChange={e => changeSettings('hemisphere', e.target.value)}>
          <option value="">Pilih belahan…</option><option value="N">N — Utara</option><option value="S">S — Selatan</option>
        </select></div>
      </div>
      <p className="hint">Pilih sesuai referensi koordinat site. WGS84 mendukung zona 1–60; DGN95/ID74 mengikuti cakupan CRS Indonesia. {datum === 'DGN95' ? 'Transformasi DGN95 ke WGS84 adalah pendekatan dengan akurasi 1 m.' : datum === 'ID74' ? 'Transformasi ID74 ke WGS84 adalah pendekatan dengan akurasi 3 m.' : 'GPS perangkat memakai WGS84.'} Jumlah desimal bukan ketelitian survey.</p>
      <div className="coordinate-fields">
        <div><label htmlFor="utm-easting">Easting objek (m)</label><input id="utm-easting" type="number" inputMode="decimal" step="any" value={easting} disabled={disabled} onChange={e => { edit(); setPoint(null); setSelected(''); setEasting(e.target.value); }} /></div>
        <div><label htmlFor="utm-northing">Northing objek (m)</label><input id="utm-northing" type="number" inputMode="decimal" step="any" value={northing} disabled={disabled} onChange={e => { edit(); setPoint(null); setSelected(''); setNorthing(e.target.value); }} /></div>
      </div>
    </> : <>
    <div className="coordinate-fields">
      <div><label htmlFor="latitude">Latitude objek (−90 sampai 90)</label><input id="latitude" type="number" inputMode="decimal" step="any" min={-90} max={90} value={latitude} disabled={disabled} onChange={e => { edit(); setPoint(null); setSelected(''); setLatitude(e.target.value); }} /></div>
      <div><label htmlFor="longitude">Longitude objek (−180 sampai 180)</label><input id="longitude" type="number" inputMode="decimal" step="any" min={-180} max={180} value={longitude} disabled={disabled} onChange={e => { edit(); setPoint(null); setSelected(''); setLongitude(e.target.value); }} /></div>
    </div>
    </>}
    <button type="button" onClick={manual} disabled={disabled}>Pratinjau koordinat manual</button>
    {point && <p className="hint">Objek: {point.latitude}, {point.longitude}; metode {point.method === 'gps' ? 'GPS petugas' : point.method === 'manual_pin' ? 'pin manual' : point.method === 'saved_location' ? 'lokasi tersimpan' : 'koordinat manual'}.{point.accuracyM === null ? ' Akurasi GPS objek tidak tersedia.' : ` Akurasi perangkat ${point.accuracyM} m.`}</p>}
    {value?.object.utm && <p className="hint">UTM dikonfirmasi: {value.object.utm.datum}, zona {value.object.utm.zone}{value.object.utm.hemisphere}, {value.object.utm.crs}; E {value.object.utm.easting.toFixed(3)} m, N {value.object.utm.northing.toFixed(3)} m.</p>}
    <button type="button" onClick={confirm} disabled={disabled || !point}>Konfirmasi lokasi objek</button>
    {error && <p role="alert" className="status error">{error}</p>}
    <p role="status">{value ? '✔ Lokasi objek dikonfirmasi. Perubahan lokasi memerlukan konfirmasi ulang.' : 'Lokasi objek belum dikonfirmasi.'}</p>
    {value && <a download="lokasi-objek.geojson" href={`data:application/geo+json;charset=utf-8,${encodeURIComponent(JSON.stringify(locationGeoJson(value), null, 2))}`}>Unduh titik objek (GeoJSON)</a>}
  </section>;
}

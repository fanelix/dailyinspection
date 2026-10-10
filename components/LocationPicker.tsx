'use client';
import { useEffect, useRef, useState } from 'react';
import { coordinateInput, gpsErrorMessage, locationGeoJson, parseLocation, parseSavedLocation, utmInput, utmToWgs84, wgs84ToUtm } from '../lib/location.ts';
import type { GpsPoint, InspectionLocation, ObjectPoint, SavedLocation } from '../lib/location.ts';
import { masterData } from '../lib/drafts.ts';
import type { RawLocation } from '../lib/drafts.ts';
import utmCrs from '../config/utm-crs.json';
import LocationMap from './LocationMap.tsx';

export default function LocationPicker({ areaId, value, disabled, onChange, db, raw, onDraftChange }: { areaId: string; value: InspectionLocation | null; disabled: boolean; onChange: (location: InspectionLocation | null) => void; db: IDBDatabase; raw: RawLocation | null; onDraftChange: (raw: RawLocation) => void }) {
  const [observer, setObserver] = useState<GpsPoint | null>(raw?.observer ?? value?.observerGps ?? null);
  const [point, setPoint] = useState<ObjectPoint | null>(raw?.point ?? value?.object ?? null);
  const [latitude, setLatitude] = useState(raw?.latitude ?? (value ? String(value.object.latitude) : ''));
  const [longitude, setLongitude] = useState(raw?.longitude ?? (value ? String(value.object.longitude) : ''));
  const [coordinateMode, setCoordinateMode] = useState(raw?.coordinateMode ?? 'utm');
  const [datum, setDatum] = useState(raw?.datum ?? value?.object.utm?.datum ?? 'WGS84');
  const [zone, setZone] = useState(raw?.zone ?? (value?.object.utm ? String(value.object.utm.zone) : ''));
  const [hemisphere, setHemisphere] = useState(raw?.hemisphere ?? value?.object.utm?.hemisphere ?? '');
  const [easting, setEasting] = useState(raw?.easting ?? (value?.object.utm ? String(value.object.utm.easting) : ''));
  const [northing, setNorthing] = useState(raw?.northing ?? (value?.object.utm ? String(value.object.utm.northing) : ''));
  const [saved, setSaved] = useState<SavedLocation[]>([]);
  const [selected, setSelected] = useState(raw?.selected ?? value?.object.savedLocation?.id ?? '');
  const [masterMessage, setMasterMessage] = useState('Memuat lokasi tersimpan…');
  const [reloadKey, setReloadKey] = useState(0);
  const [gpsMessage, setGpsMessage] = useState('');
  const [error, setError] = useState('');
  const gpsToken = useRef(0);
  const disabledRef = useRef(disabled);
  useEffect(() => { disabledRef.current = disabled; if (disabled) gpsToken.current++; }, [disabled]);
  useEffect(() => () => { gpsToken.current++; }, []);
  const draftCallback = useRef(onDraftChange);
  useEffect(() => { draftCallback.current = onDraftChange; }, [onDraftChange]);
  useEffect(() => { draftCallback.current({ observer, point, latitude, longitude, coordinateMode, datum, zone, hemisphere, easting, northing, selected }); }, [observer, point, latitude, longitude, coordinateMode, datum, zone, hemisphere, easting, northing, selected]);
  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      let cached = false;
      try {
        const local = await masterData(db, areaId);
        if (local && !controller.signal.aborted) {
          setSaved(local.locations.map(l => parseSavedLocation(l, areaId))); cached = true;
          setMasterMessage(`Salinan lokasi di perangkat, diperbarui ${new Date(local.updatedAt).toLocaleString('id-ID')}. Server memeriksa revisi saat dikirim.`);
        }
        const res = await fetch(`/api/locations?areaId=${encodeURIComponent(areaId)}`, { signal: AbortSignal.any([controller.signal, AbortSignal.timeout(30000)]), cache: 'no-store' });
        const body = await res.json();
        if (!res.ok || !body.ok || !Array.isArray(body.locations)) throw new Error('Daftar lokasi tidak tersedia.');
        const locations = body.locations.map((l: unknown) => parseSavedLocation(l, areaId));
        if (controller.signal.aborted) return;
        setSaved(locations);
        await masterData(db, areaId, { areaId, locations, updatedAt: new Date().toISOString() });
        if (!controller.signal.aborted) setMasterMessage(locations.length ? 'Daftar lokasi tersimpan di perangkat.' : 'Belum ada lokasi tersimpan untuk area ini. Daftar kosong terverifikasi tersimpan di perangkat.');
      } catch {
        if (!controller.signal.aborted && !cached) setMasterMessage('Daftar lokasi belum tersedia untuk offline. Koordinat manual tetap tersedia.');
      }
    })();
    return () => controller.abort();
  }, [areaId, reloadKey, db]);
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
  const choice = (name: string, label: string, options: [string, string][], current: string, set: (v: string) => void) => <fieldset className="seg two">
    <legend>{label}</legend>
    {options.map(([v, text]) => <label key={v}><input type="radio" name={name} value={v} checked={current === v} disabled={disabled} onChange={() => set(v)} />{text}</label>)}
  </fieldset>;
  return <section className="panel" aria-labelledby="location-title">
    <h2 id="location-title">Lokasi objek</h2>
    <p className="hint">Pilih titik objek yang diperiksa. Posisi petugas dapat berbeda saat mengamati dari tempat aman. Peta memakai WGS84; koordinat UTM dikonversi sesuai pilihan datum dan zona.</p>
    <div className="group">
    <h3><i className="ic ic-user" aria-hidden="true" />Posisi petugas (GPS)</h3>
    <button type="button" className="secondary" onClick={getGps} disabled={disabled}><i className="ic ic-map-pin" aria-hidden="true" />Ambil GPS petugas</button>
    {gpsMessage && <p className="hint" role="status">{gpsMessage}</p>}
    {observer && <>
      <p className="meta"><span className="mono">{observer.latitude}, {observer.longitude}</span><span className="badge ok"><i className="ic ic-sm ic-check-circle" aria-hidden="true" />Akurasi ±{Math.round(observer.accuracyM ?? 0)} m</span></p>
      <p className="hint">Tempat petugas berdiri, bukan lokasi objek. Akurasi dilaporkan perangkat {observer.accuracyM} m; {observer.capturedAt}.</p>
      <button type="button" className="secondary" onClick={() => choose({ ...observer, method: 'gps', savedLocation: null })} disabled={disabled}>Gunakan GPS petugas sebagai lokasi objek</button>
    </>}
    </div>
    <h3><i className="ic ic-map-pin" aria-hidden="true" />Posisi objek</h3>
    <label htmlFor="saved-location">Lokasi tersimpan</label>
    <select id="saved-location" value={selected} disabled={disabled || !saved.length} onChange={e => {
      const l = saved.find(l => l.id === e.target.value);
      if (l) choose({ latitude: l.latitude, longitude: l.longitude, method: 'saved_location', accuracyM: null, capturedAt: new Date().toISOString(), savedLocation: l });
      else { edit(); setSelected(''); setPoint(null); setLatitude(''); setLongitude(''); setEasting(''); setNorthing(''); }
    }}>
      <option value="">Pilih lokasi…</option>{saved.map(l => <option key={l.id} value={l.id}>{l.label} ({l.id}, revisi {l.revision})</option>)}
    </select>
    {masterMessage && <p className="hint" role="status">{masterMessage}</p>}
    <button type="button" className="secondary" disabled={disabled} onClick={() => {
      if (point?.method === 'saved_location') { edit(); setPoint(null); setSelected(''); setLatitude(''); setLongitude(''); setEasting(''); setNorthing(''); }
      setSaved([]); setMasterMessage('Memuat lokasi tersimpan…'); setReloadKey(current => current + 1);
    }}><i className="ic ic-sync" aria-hidden="true" />Muat ulang lokasi tersimpan</button>
    {choice('coordinate-mode', 'Sistem koordinat', [['utm', 'UTM'], ['geographic', 'WGS84 lat/long']], coordinateMode, v => { edit(); setCoordinateMode(v); if (point && v === 'utm') showUtm(point); })}
    {coordinateMode === 'utm' ? <>
      <div className="coordinate-fields">
        <div><label htmlFor="utm-datum">Datum</label>
        <select id="utm-datum" value={datum} disabled={disabled} onChange={e => changeSettings('datum', e.target.value)}>
          <option value="WGS84">WGS84</option><option value="DGN95">DGN95</option><option value="ID74">ID74 (Indonesian Datum 1974)</option>
        </select></div>
        <div><label htmlFor="utm-zone">Zona UTM</label><select id="utm-zone" value={zone} disabled={disabled} onChange={e => changeSettings('zone', e.target.value)}>
          <option value="">Pilih zona…</option>{Array.from({ length: 60 }, (_, i) => i+1).map(z => <option key={z} value={z} disabled={datum !== 'WGS84' && !utmCrs.some(c => c.datum === datum && c.zone === z && (!hemisphere || c.hemisphere === hemisphere))}>{z}</option>)}
        </select></div>
      </div>
      {choice('utm-hemisphere', 'Belahan bumi', [['N', 'N (utara)'], ['S', 'S (selatan)']], hemisphere, v => changeSettings('hemisphere', v))}
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
    <button type="button" className="secondary" onClick={manual} disabled={disabled}><i className="ic ic-map-pin" aria-hidden="true" />Pratinjau koordinat manual</button>
    <LocationMap observer={observer} point={point} disabled={disabled} onPin={pin} />
    {point && <p className="hint">Objek: {point.latitude}, {point.longitude}; metode {point.method === 'gps' ? 'GPS petugas' : point.method === 'manual_pin' ? 'pin manual' : point.method === 'saved_location' ? 'lokasi tersimpan' : 'koordinat manual'}.{point.accuracyM === null ? ' Akurasi GPS objek tidak tersedia.' : ` Akurasi perangkat ${point.accuracyM} m.`}</p>}
    {value?.object.utm && <p className="hint">UTM dikonfirmasi: {value.object.utm.datum}, zona {value.object.utm.zone}{value.object.utm.hemisphere}, {value.object.utm.crs}; E {value.object.utm.easting.toFixed(3)} m, N {value.object.utm.northing.toFixed(3)} m.</p>}
    <button type="button" onClick={confirm} disabled={disabled || !point}><i className="ic ic-check-circle" aria-hidden="true" />Konfirmasi lokasi objek</button>
    {error && <p role="alert" className="status error">{error}</p>}
    <p role="status" className={`status ${value ? 'ok' : ''}`}>{value ? '✔ Lokasi objek dikonfirmasi. Perubahan lokasi memerlukan konfirmasi ulang.' : 'Lokasi objek belum dikonfirmasi.'}</p>
    {value && <p><a download="lokasi-objek.geojson" href={`data:application/geo+json;charset=utf-8,${encodeURIComponent(JSON.stringify(locationGeoJson(value), null, 2))}`}>Unduh titik objek (GeoJSON)</a></p>}
  </section>;
}

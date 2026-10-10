'use client';
import { useEffect, useRef, useState } from 'react';
import type * as Leaflet from 'leaflet';
import type { GpsPoint, ObjectPoint } from '../lib/location.ts';

export default function LocationMap({ observer, point, disabled, onPin, readOnly = false }: { observer: GpsPoint | null; point: ObjectPoint | null; disabled: boolean; onPin: (latitude: number, longitude: number) => void; readOnly?: boolean }) {
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<Leaflet.Map | null>(null);
  const latest = useRef({ onPin, disabled });
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');
  const [tilesFailed, setTilesFailed] = useState(false);
  useEffect(() => { latest.current = { onPin, disabled }; }, [onPin, disabled]);
  useEffect(() => {
    let disposed = false;
    let map: Leaflet.Map | null = null;
    import('leaflet').then(L => {
      if (disposed || !container.current) return;
      // A world view is context only: no site coordinates or default object pin.
      map = L.map(container.current).setView([0, 0], 2);
      mapRef.current = map;
      L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      }).on('tileerror', () => { if (!disposed) setTilesFailed(true); }).addTo(map);
      map.on('click', (e: Leaflet.LeafletMouseEvent) => {
        const p = e.latlng.wrap();
        if (!latest.current.disabled) latest.current.onPin(p.lat, p.lng);
      });
      setReady(true);
    }).catch(() => { if (!disposed) setError('Peta tidak dapat dimuat. Gunakan koordinat manual atau lokasi tersimpan.'); });
    return () => { disposed = true; mapRef.current = null; map?.remove(); };
  }, []);
  useEffect(() => {
    if (!ready || !mapRef.current) return;
    const map = mapRef.current;
    let disposed = false;
    const markers: Leaflet.Layer[] = [];
    import('leaflet').then(L => {
      if (disposed) return;
      if (observer) markers.push(L.circleMarker([observer.latitude, observer.longitude], { radius: 9, color: '#0758a5', fillOpacity: 0.8 }).bindTooltip('GPS petugas (biru)').addTo(map));
      if (point) {
        markers.push(L.marker([point.latitude, point.longitude], { icon: L.divIcon({ className: 'object-pin', html: 'O', iconSize: [32, 32], iconAnchor: [16, 32] }), draggable: !disabled })
          .bindTooltip('Lokasi objek (oranye)').on('dragend', (e: Leaflet.LeafletEvent) => {
            const p = (e.target as Leaflet.Marker).getLatLng().wrap();
            if (!latest.current.disabled) latest.current.onPin(p.lat, p.lng);
          }).addTo(map));
      }
      const center = point ?? observer;
      if (center) map.setView([center.latitude, center.longitude], 16);
    });
    return () => { disposed = true; markers.forEach(m => map.removeLayer(m)); };
  }, [ready, observer, point, disabled]);
  return <>
    <div ref={container} className="location-map" role="region" aria-label="Peta lokasi objek; koordinat manual tersedia di bawah" />
    <p className="hint">{readOnly ? 'Peta konteks umum; pin oranye menunjukkan lokasi objek yang tersimpan. Koordinat lengkap ada di atas.' : 'Ketuk peta atau geser pin oranye untuk memilih lokasi objek. Biru = GPS petugas; oranye = objek. Peta OpenStreetMap adalah konteks umum.'}</p>
    {(error || tilesFailed) && <p role="status" className="hint">{error || 'Latar peta tidak dapat dimuat. Koordinat manual dan lokasi tersimpan tetap bisa digunakan.'}</p>}
  </>;
}

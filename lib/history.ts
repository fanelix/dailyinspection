// T6: tipe riwayat bersama dan pembangun ekspor murni (dipakai browser dan check Node).
export type ReviewEntry = {
  reviewId: string; reviewerName: string; note: string; reviewedAt: string; version: number;
  findings: { itemId: string; status: 'open' | 'closed'; note: string }[];
};
export type HistoryItem = {
  inspectionId: string; inspectorName: string; observedAt: string | null; receivedAt: string | null;
  areaId: string; subArea: string; status: string; version: number; reviewRequired: boolean;
  findings: { total: number; open: number; closed: number }; reviews: number; lastReviewedAt: string | null;
  photoCount: number; location: { latitude: number; longitude: number } | null;
};

const CSV_HEADER = ['inspection_id', 'observed_at', 'received_at', 'area_id', 'sub_area', 'inspector_name', 'status', 'review_required', 'reviews', 'findings_open', 'findings_closed', 'longitude', 'latitude'];
// Sel yang diawali karakter formula dapat dieksekusi Excel/Sheets saat CSV dibuka; kutip sebagai teks (rencana §10).
const csvCell = (value: unknown): string => {
  const s = value == null ? '' : String(value);
  // Angka (termasuk negatif) bukan vektor formula; hanya teks yang perlu dikutip.
  const safe = typeof value === 'string' && /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
};
export function buildCsv(items: HistoryItem[]): string {
  const lines = [CSV_HEADER.join(',')];
  for (const i of items) {
    lines.push([i.inspectionId, i.observedAt ?? '', i.receivedAt ?? '', i.areaId, i.subArea, i.inspectorName, i.status, i.reviewRequired ? 'true' : 'false',
      i.reviews, i.findings.open, i.findings.closed, i.location?.longitude ?? '', i.location?.latitude ?? ''].map(csvCell).join(','));
  }
  return lines.join('\r\n') + '\r\n';
}
// GeoJSON WGS84 dengan urutan [longitude, latitude] (rencana §7); inspectsi tanpa koordinat tetap punya geometry null.
export function buildGeoJson(items: HistoryItem[]): string {
  const features = items.map((i) => ({
    type: 'Feature',
    geometry: i.location && Number.isFinite(i.location.latitude) && Number.isFinite(i.location.longitude)
      ? { type: 'Point', coordinates: [i.location.longitude, i.location.latitude] }
      : null,
    properties: {
      inspection_id: i.inspectionId, observed_at: i.observedAt, received_at: i.receivedAt, area_id: i.areaId, sub_area: i.subArea,
      inspector_name: i.inspectorName, status: i.status, review_required: i.reviewRequired,
      findings_open: i.findings.open, findings_closed: i.findings.closed,
    },
  }));
  return JSON.stringify({ type: 'FeatureCollection', features }, null, 2);
}

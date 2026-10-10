// Read existing master tabs without creating, migrating or rewriting them.
function listLocations(payload) {
  if (!isObject_(payload) || !CHECKLISTS.areas.some(function (a) { return a.id === payload.areaId; })) throw bad_('Pilih area untuk daftar lokasi');
  const ss = SpreadsheetApp.openById(props_().getProperty('SPREADSHEET_ID'));
  const locations = locationRows_(ss, 'Locations', ['location_id','entity_type','entity_id','revision','operation_id','latitude','longitude','source','accuracy_m','captured_at','source_crs','source_x','source_y','map_layer_id','map_layer_version']);
  if (!locations.length) return { locations: [] };
  const areas = locationRows_(ss, 'Areas', ['area_id','name','area_type','boundary_geometry_id','active']);
  const objects = locationRows_(ss, 'ObservationObjects', ['object_id','area_id','label','location_text','geometry_id']);
  const points = locationRows_(ss, 'PhotoPoints', ['photo_point_id','area_id','object_id','label','view_hint','geometry_id']);
  const result = [];
  const ids = new Set();
  locations.forEach(function (row) {
    if (ids.has(String(row.location_id))) throw bad_('ID lokasi master ganda; periksa tab Locations');
    ids.add(String(row.location_id));
    const entity = row.entity_type === 'area' ? areas.find(function (a) { return a.area_id === row.entity_id; }) :
      row.entity_type === 'observation_object' ? objects.find(function (o) { return o.object_id === row.entity_id; }) :
      row.entity_type === 'photo_point' ? points.find(function (p) { return p.photo_point_id === row.entity_id; }) : null;
    if (!entity) throw bad_('Relasi lokasi master tidak dikenal; periksa entity_type/entity_id');
    const area = areas.find(function (a) { return a.area_id === entity.area_id; });
    if (!area) throw bad_('Area lokasi master tidak ditemukan');
    if (area.active !== true && area.active !== 1 && String(area.active).toLowerCase() !== 'true') return;
    const catalogArea = CHECKLISTS.areas.find(function (a) { return a.label.toLowerCase() === String(area.name).trim().toLowerCase(); });
    if (!catalogArea || catalogArea.id !== payload.areaId) return;
    if (row.source_crs !== 'EPSG:4326' && row.source_crs !== 'WGS84') throw bad_('Lokasi master harus WGS84/EPSG:4326; tidak ada konversi CRS otomatis');
    try {
      result.push(parseSavedLocation({ id: String(row.location_id), revision: String(row.revision), areaId: catalogArea.id, label: String(row.entity_type === 'area' ? area.name : entity.label),
        latitude: locationCellNumber_(row.latitude), longitude: locationCellNumber_(row.longitude), source: String(row.source),
        accuracyM: row.accuracy_m === '' ? null : locationCellNumber_(row.accuracy_m),
        capturedAt: row.captured_at === '' ? null : row.captured_at instanceof Date ? row.captured_at.toISOString() : String(row.captured_at) }, catalogArea.id));
    } catch (err) { throw bad_('Lokasi master tidak valid: ' + err.message); }
  });
  return { locations: result.sort(function (a, b) { return a.id.localeCompare(b.id); }) };
}

function locationCellNumber_(value) {
  return (typeof value === 'number' || typeof value === 'string' && value.trim() !== '') ? Number(value) : NaN;
}

function locationRows_(ss, name, columns) {
  const sh = ss.getSheetByName(name);
  if (!sh || sh.getLastRow() === 0) return [];
  const header = sh.getRange(1, 1, 1, Math.max(columns.length, sh.getLastColumn())).getValues()[0];
  while (header.length && header[header.length - 1] === '') header.pop();
  if (header.length !== columns.length || !columns.every(function (c, i) { return header[i] === c; })) throw new GatewayError('INTERNAL_ERROR', 'Header master ' + name + ' tidak sesuai; periksa sebelum membaca');
  if (sh.getLastRow() === 1) return [];
  return sh.getRange(2, 1, sh.getLastRow() - 1, columns.length).getValues()
    .filter(function (row) { return row.some(function (v) { return v !== ''; }); })
    .map(function (row) { const record = {}; columns.forEach(function (c, i) { record[c] = row[i]; }); return record; });
}

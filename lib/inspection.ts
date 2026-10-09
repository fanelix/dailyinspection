import inspectionCatalog from '../config/checklists.json' with { type: 'json' };

export const CHECKLISTS = inspectionCatalog;
export const ANSWER_OPTIONS = [
  { value: 'no_finding', label: 'Tidak ada temuan' },
  { value: 'finding', label: 'Ada temuan' },
  { value: 'not_inspected', label: 'Tidak diperiksa' },
  { value: 'not_applicable', label: 'Tidak berlaku' },
] as const;
export type Answer = typeof ANSWER_OPTIONS[number]['value'];
export type Finding = {
  type: string; description: string; photoIds: string[]; noPhotoReason: string | null;
  measurement: { value: number; unit: string; method: string } | null;
};
export type ChecklistAnswer = { itemId: string; answer: Answer | null; finding: Finding | null };

export function emptyAnswers(areaId: string): ChecklistAnswer[] {
  return (CHECKLISTS.areas.find(area => area.id === areaId)?.items ?? [])
    .map(item => ({ itemId: item.id, answer: null, finding: null }));
}

// Shared by browser and Apps Script (generated with scripts/sync-checklist.mjs).
// No defaults for observations, no geotechnical thresholds. Reject at the storage boundary too.
export function parseChecklist(payload: unknown) {
  const object = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === 'object' && !Array.isArray(v);
  const fail = (message: string): never => { throw new Error(message); };
  const text = (v: unknown, label: string, max: number): string =>
    typeof v === 'string' && v.trim().length > 0 && v.trim().length <= max ? v.trim() : fail(`${label} wajib diisi (maksimal ${max} karakter).`);
  if (!object(payload)) return fail('Data checklist harus objek.');
  const p = payload;
  if (p.schemaVersion !== CHECKLISTS.schemaVersion || p.templateVersion !== CHECKLISTS.templateVersion) return fail('Versi checklist tidak didukung. Muat ulang aplikasi setelah mencatat isian Anda.');
  const area = CHECKLISTS.areas.find(area => area.id === p.areaId);
  if (!area) return fail('Pilih area inspeksi.');
  if (!Array.isArray(p.photoIds) || !p.photoIds.every(id => typeof id === 'string')) return fail('Daftar foto tidak valid.');
  const photoIds = p.photoIds as string[];
  if (!Array.isArray(p.answers) || p.answers.length !== area.items.length) return fail('Semua item checklist harus dijawab.');
  const input = p.answers;
  let reviewRequired = false;
  const answers: ChecklistAnswer[] = area.items.map(item => {
    const matches = input.filter(a => object(a) && a.itemId === item.id);
    if (matches.length !== 1) return fail(`Item ${item.label} hilang atau ganda.`);
    const a = matches[0] as Record<string, unknown>;
    if (!ANSWER_OPTIONS.some(option => option.value === a.answer)) return fail(`Jawab item: ${item.label}.`);
    const answer = a.answer as Answer;
    if (answer !== 'finding') {
      if (a.finding !== null) return fail(`Rincian temuan tidak sesuai jawaban: ${item.label}.`);
      return { itemId: item.id, answer, finding: null };
    }
    if (!object(a.finding)) return fail(`Lengkapi temuan: ${item.label}.`);
    const f = a.finding;
    const type = text(f.type, `Jenis temuan (${item.label})`, 100);
    const description = text(f.description, `Deskripsi (${item.label})`, 2000);
    if (!Array.isArray(f.photoIds) || !f.photoIds.every(id => typeof id === 'string' && photoIds.includes(id)) || new Set(f.photoIds).size !== f.photoIds.length) return fail(`Foto temuan tidak terhubung ke inspeksi: ${item.label}.`);
    const linkedPhotos = f.photoIds as string[];
    let noPhotoReason: string | null = null;
    if (linkedPhotos.length === 0) {
      noPhotoReason = text(f.noPhotoReason, `Alasan tanpa foto (${item.label})`, 500);
      reviewRequired = true;
    } else if (f.noPhotoReason !== null) return fail(`Pilih foto atau alasan tanpa foto: ${item.label}.`);
    let measurement: Finding['measurement'] = null;
    if (f.measurement !== null) {
      const m = f.measurement;
      if (!object(m) || typeof m.value !== 'number' || !Number.isFinite(m.value)) return fail(`Nilai pengukuran tidak valid: ${item.label}.`);
      measurement = { value: m.value, unit: text(m.unit, 'Satuan', 30), method: text(m.method, 'Metode pengukuran', 200) };
    }
    return { itemId: item.id, answer, finding: { type, description, photoIds: [...linkedPhotos].sort(), noPhotoReason, measurement } };
  });
  // Snapshot preserves the meaning of old records when a later template changes.
  return { schemaVersion: CHECKLISTS.schemaVersion, templateVersion: CHECKLISTS.templateVersion, areaId: area.id,
    templateSnapshot: area, templateStatus: CHECKLISTS.status, answers, reviewRequired };
}

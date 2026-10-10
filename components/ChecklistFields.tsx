'use client';
import { ANSWER_OPTIONS, CHECKLISTS } from '../lib/inspection.ts';
import type { Answer, ChecklistAnswer, Finding } from '../lib/inspection.ts';

export default function ChecklistFields({ areaId, answers, photos, onChange }: {
  areaId: string; answers: ChecklistAnswer[]; photos: { id: string; label: string }[]; onChange: (answers: ChecklistAnswer[]) => void;
}) {
  const area = CHECKLISTS.areas.find(a => a.id === areaId);
  if (!area) return null;
  const update = (index: number, change: Partial<ChecklistAnswer>) => onChange(answers.map((a, i) => i === index ? { ...a, ...change } : a));
  const finding = (index: number, change: Partial<Finding>) => update(index, { finding: { ...answers[index].finding!, ...change } });
  return <section aria-label="Checklist observasi">
    <h2>Checklist {area.label}</h2>
    <p className="hint">Pilih jawaban untuk setiap item. “Tidak diperiksa” dan “Tidak berlaku” dicatat terpisah.</p>
    {area.items.map((item, index) => {
      const a = answers[index];
      const f = a?.finding;
      const m = f?.measurement;
      const id = `item-${item.id}`;
      return <fieldset className="checklist-item" key={item.id}>
        <legend>{index + 1}. {item.label}</legend>
        <p id={`${id}-hint`} className="hint">{item.hint}</p>
        <label htmlFor={id}>Hasil observasi</label>
        <select id={id} value={a?.answer ?? ''} aria-describedby={`${id}-hint`} required onChange={e => {
          const answer = (e.target.value || null) as Answer | null;
          update(index, { answer, finding: answer === 'finding' ? {
            type: '', description: '', photoIds: [], noPhotoReason: null, measurement: null,
          } : null });
        }}>
          <option value="">Pilih hasil observasi…</option>
          {ANSWER_OPTIONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
        {f && <div className="finding">
          <label htmlFor={`${id}-type`}>Jenis temuan</label>
          <input id={`${id}-type`} value={f.type} maxLength={100} required onChange={e => finding(index, { type: e.target.value })} />
          <label htmlFor={`${id}-description`}>Deskripsi temuan</label>
          <textarea id={`${id}-description`} value={f.description} maxLength={2000} required onChange={e => finding(index, { description: e.target.value })} />
          {photos.map(photo => <label className="choice" key={photo.id}>
            <input type="checkbox" checked={f.photoIds.includes(photo.id)} onChange={e => finding(index, {
              photoIds: e.target.checked ? [...f.photoIds, photo.id] : f.photoIds.filter(id => id !== photo.id), noPhotoReason: null,
            })} />
            {photo.label} menunjukkan temuan ini
          </label>)}
          {f.photoIds.length === 0 && <>
            <label htmlFor={`${id}-reason`}>Alasan tanpa foto temuan</label>
            <textarea id={`${id}-reason`} value={f.noPhotoReason ?? ''} maxLength={500} required onChange={e => finding(index, { noPhotoReason: e.target.value })} />
            <p className="hint">Temuan tanpa foto akan ditandai Perlu review. Ambil foto hanya dari posisi yang aman.</p>
          </>}
          <label className="choice">
            <input type="checkbox" checked={m != null} onChange={e => finding(index, { measurement: e.target.checked ? { value: NaN, unit: '', method: '' } : null })} />
            Tambahkan hasil pengukuran (opsional)
          </label>
          {m != null && <div className="measurement">
            <label htmlFor={`${id}-value`}>Nilai</label>
            <input id={`${id}-value`} type="number" step="any" value={Number.isFinite(m.value) ? m.value : ''} required onChange={e => finding(index, { measurement: { ...m, value: e.target.value === '' ? NaN : Number(e.target.value) } })} />
            <label htmlFor={`${id}-unit`}>Satuan</label>
            <input id={`${id}-unit`} value={m.unit} maxLength={30} required placeholder="Contoh: mm" onChange={e => finding(index, { measurement: { ...m, unit: e.target.value } })} />
            <label htmlFor={`${id}-method`}>Metode pengukuran</label>
            <input id={`${id}-method`} value={m.method} maxLength={200} required onChange={e => finding(index, { measurement: { ...m, method: e.target.value } })} />
          </div>}
        </div>}
      </fieldset>;
    })}
  </section>;
}

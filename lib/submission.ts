// The same immutable attempt is reused on retry. Every acknowledgment is checked before proceeding.
type Photo = { photoId: string; sha256: string; size: number; caption: string; bytes: ArrayBuffer };
export type SubmissionAttempt = {
  payload: { inspectionId: string; schemaVersion: number; templateVersion: string; photoIds: string[]; [key: string]: unknown };
  photos: Photo[]; checklistSha256: string; locationSha256: string; photoManifestSha256: string;
};
type Ack = {
  inspectionId?: string; status?: string; version?: number; schemaVersion?: number; templateVersion?: string;
  checklistSha256?: string; locationSha256?: string; photoManifestSha256?: string; reviewRequired?: boolean;
  photoId?: string; sha256?: string; size?: number; photos?: { photoId: string; status: string; sha256?: string }[];
};
export async function submitInspection(
  attempt: SubmissionAttempt,
  api: (path: string, init: RequestInit) => Promise<Ack | null>,
  progress: (text: string) => void = () => {},
) {
  const { payload, photos, checklistSha256, locationSha256, photoManifestSha256 } = attempt;
  const headers = { 'content-type': 'application/json' };
  const hashesMatch = (ack: Ack) => ack.checklistSha256 === checklistSha256 && ack.locationSha256 === locationSha256 && ack.photoManifestSha256 === photoManifestSha256;
  progress('Menyimpan data inspeksi…');
  const prepared = await api('/api/inspections', { method: 'POST', headers, body: JSON.stringify(payload) });
  if (!prepared || prepared.inspectionId !== payload.inspectionId || prepared.schemaVersion !== payload.schemaVersion || prepared.templateVersion !== payload.templateVersion || !hashesMatch(prepared) || prepared.reviewRequired !== payload.reviewRequired ||
    !((prepared.status === 'uploading' && prepared.version === 1) || (prepared.status === 'submitted' && prepared.version === 2)) ||
    !Array.isArray(prepared.photos) || prepared.photos.length !== photos.length || photos.some(p => !prepared.photos!.some(a => a.photoId === p.photoId && ['reserved', 'stored'].includes(a.status)))) {
    throw new Error('Server belum mengonfirmasi data, lokasi, dan daftar foto yang sama. Tekan Kirim lagi dengan isian yang sama.');
  }
  for (const [i, photo] of photos.entries()) {
    progress(`Mengunggah foto ${i + 1} dari ${photos.length}…`);
    const stored = await api(`/api/inspections/${payload.inspectionId}/photos/${photo.photoId}`, {
      method: 'PUT', headers: { 'content-type': 'image/jpeg', 'x-photo-sha256': photo.sha256 }, body: photo.bytes,
    });
    if (!stored || stored.inspectionId !== payload.inspectionId || stored.photoId !== photo.photoId || stored.status !== 'stored' || stored.sha256 !== photo.sha256 || stored.size !== photo.size) {
      throw new Error(`Server belum mengonfirmasi foto ${i + 1} dengan isi yang sama. Tekan Kirim lagi.`);
    }
  }
  progress('Memfinalisasi inspeksi…');
  const finalized = await api(`/api/inspections/${payload.inspectionId}/finalize`, {
    method: 'POST', headers, body: JSON.stringify({ expectedVersion: 1, checklistSha256, locationSha256, photoManifestSha256 }),
  });
  if (!finalized || finalized.inspectionId !== payload.inspectionId || finalized.status !== 'submitted' || finalized.version !== 2 || !hashesMatch(finalized) || finalized.reviewRequired !== payload.reviewRequired ||
    !Array.isArray(finalized.photos) || finalized.photos.length !== photos.length || photos.some(p => !finalized.photos!.some(a => a.photoId === p.photoId && a.status === 'stored' && a.sha256 === p.sha256))) {
    throw new Error('Server belum mengonfirmasi finalisasi inspeksi yang sama. Tekan Kirim lagi; hasil belum diketahui.');
  }
  return finalized;
}

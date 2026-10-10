export function assertOfflineShell(executingVersion: string, status: {ready:boolean;build:string;version:string}, manifest: {build:string;version:string}) {
  if (!status.ready || status.version !== executingVersion || manifest.version !== executingVersion || status.build !== manifest.build) {
    throw new Error('Versi halaman dan shell offline belum sama atau aset belum lengkap. Tutup tab lama dan siapkan ulang saat online.');
  }
}

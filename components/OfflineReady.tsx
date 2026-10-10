'use client';
import { useEffect, useState } from 'react';
import { CHECKLISTS } from '../lib/inspection.ts';
import { parseSavedLocation } from '../lib/location.ts';
import { OFFLINE_VERSION } from '../lib/offline-build.ts';
import { assertOfflineShell } from '../lib/offline-ready.ts';
import { masterData } from '../lib/drafts.ts';

function workerStatus(worker: ServiceWorker) {
  return new Promise<{ready:boolean;build:string;version:string}>((resolve,reject)=>{
    const channel=new MessageChannel();const timer=setTimeout(()=>{channel.port1.close();reject(new Error('Aset offline belum terkonfirmasi.'));},10000);
    channel.port1.onmessage=e=>{clearTimeout(timer);channel.port1.close();resolve(e.data);};
    worker.postMessage('OFFLINE_STATUS',[channel.port2]);
  });
}
async function shellStatus() {
  if (!('serviceWorker' in navigator)) throw new Error('Browser belum mendukung shell offline.');
  const registration=await navigator.serviceWorker.register('/sw.js',{updateViaCache:'none'});
  const ready=await Promise.race([navigator.serviceWorker.ready,new Promise<never>((_,reject)=>setTimeout(()=>reject(new Error('Persiapan aset belum selesai. Coba lagi saat online.')),30000))]);
  if (!ready.active) throw new Error('Shell offline belum aktif.');
  const [status,manifest]=await Promise.all([workerStatus(ready.active),fetch('/offline-assets.json',{cache:'no-store'}).then(r=>{if(!r.ok)throw new Error('Daftar aset tidak tersedia.');return r.json();})]);
  assertOfflineShell(OFFLINE_VERSION,status,manifest);
  return registration.waiting !== null;
}
export default function OfflineReady({db}: {db:IDBDatabase}) {
  const [message,setMessage]=useState('Belum siap untuk pencatatan offline. Siapkan saat ada jaringan.');
  const [busy,setBusy]=useState(false),[ready,setReady]=useState(false);
  async function verify() {
    const waiting=await shellStatus();
    for (const area of CHECKLISTS.areas) {
      const cached=await masterData(db,area.id);
      if(!cached)throw new Error('Daftar lokasi seluruh area belum tersimpan.');
      cached.locations.forEach(l=>parseSavedLocation(l,area.id));
    }
    const persistent=await navigator.storage?.persisted?.().catch(()=>false);
    setReady(true);setMessage(`✔ Siap untuk pencatatan offline. Template, aset aplikasi dan daftar lokasi tujuh area tersedia.${persistent ? ' Penyimpanan persisten diberikan browser.' : ' Penyimpanan persisten belum diberikan browser.'}${waiting ? ' Versi baru akan aktif setelah semua tab aplikasi ditutup.' : ''}`);
  }
  useEffect(()=>{
    let live=true;
    // Avoid registering production caches against the development hot-reload server.
    if (process.env.NODE_ENV !== 'production') return;
    void verify().catch(()=>{if(live){setReady(false);setMessage('Belum siap untuk pencatatan offline. Siapkan saat ada jaringan.');}});
    return()=>{live=false;};
  },[db]);
  async function prepare() {
    setBusy(true);setReady(false);setMessage('Menyiapkan aplikasi dan daftar lokasi…');
    try {
      if (process.env.NODE_ENV !== 'production') throw new Error('Persiapan offline tersedia pada preview yang dibangun.');
      await Promise.all(CHECKLISTS.areas.map(async area=>{
        const response=await fetch(`/api/locations?areaId=${encodeURIComponent(area.id)}`,{cache:'no-store',signal:AbortSignal.timeout(30000)});
        const body=await response.json();
        if (!response.ok || !body.ok || !Array.isArray(body.locations)) throw new Error('Daftar lokasi belum tersedia.');
        const locations=body.locations.map((l:unknown)=>parseSavedLocation(l,area.id));
        await masterData(db,area.id,{areaId:area.id,locations,updatedAt:new Date().toISOString()});
      }));
      await navigator.storage?.persist?.().catch(()=>false);
      await verify();
    } catch(err) {setReady(false);setMessage(`Belum siap offline. ${err instanceof Error?err.message:'Persiapan gagal.'}`);}
    finally {setBusy(false);}
  }
  return <section aria-label="Persiapan offline">
    <p className={`status ${ready?'ok':''}`} role="status">{message}</p>
    <button type="button" disabled={busy} onClick={()=>void prepare()}>{busy?'Menyiapkan offline…':'Siapkan pencatatan offline'}</button>
    <p className="hint">Siapkan sebelum berangkat. Peta latar memerlukan jaringan; koordinat manual dan lokasi tersimpan tetap tersedia. Jangan bersihkan data browser ketika ada draft belum terkirim.</p>
  </section>;
}

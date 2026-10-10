import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
const worker = await fs.readFile(new URL('../scripts/service-worker.js',import.meta.url),'utf8');
function runtime(failAsset=false,html='<title>Inspeksi Geoteknik Harian</title><script>self.__next_f</script>'){
 const handlers={},storage=new Map();let offline=false;
 const caches={open:async name=>{if(!storage.has(name))storage.set(name,new Map());const map=storage.get(name);return {put:async(k,r)=>map.set(typeof k==='string'?k:k.url,r),match:async k=>map.get(typeof k==='string'?k:k.url)};},keys:async()=>[...storage.keys()],delete:async name=>storage.delete(name)};
 const self={location:{origin:'https://example.test'},clients:{claim:async()=>{}},addEventListener:(name,fn)=>handlers[name]=fn};
 const fetch=async req=>{if(offline)throw Error('offline');const path=typeof req==='string'?req:new URL(req.url).pathname;if(failAsset&&path.includes('leaflet'))throw Error('asset failed');return {ok:true,clone(){return this;},text:async()=>html};};
 vm.runInNewContext(`const VERSION='bundle-a';const BUILD='build-a';const ASSETS=['/_next/static/app.js','/_next/static/leaflet.js'];${worker}`,{self,caches,fetch,URL,Promise});
 return {handlers,storage,goOffline:()=>{offline=true;}};
}
const event=handler=>{let work;handler({waitUntil:p=>work=p});return work;};
test('worker becomes ready only after shell and every build asset commit',async()=>{
 const {handlers}=runtime();await event(handlers.install);
 let reply;await handlers.message({data:'OFFLINE_STATUS',ports:[{postMessage:r=>reply=r}],waitUntil:p=>p});
 await new Promise(resolve=>setImmediate(resolve));assert.deepEqual(JSON.parse(JSON.stringify(reply)),{ready:true,build:'build-a',version:'bundle-a'});
});
test('one failed asset rejects installation and removes only the incomplete cache',async()=>{
 const {handlers,storage}=runtime(true);await assert.rejects(event(handlers.install),/asset failed/);assert.equal(storage.size,0);
});
test('offline navigation uses the coherent cached shell; API and external map requests are untouched',async()=>{
 const {handlers,goOffline}=runtime();await event(handlers.install);goOffline();let response;
 handlers.fetch({request:{url:'https://example.test/',method:'GET',mode:'navigate'},respondWith:p=>response=p});assert.ok((await response).ok);
 handlers.fetch({request:{url:'https://example.test/_next/static/leaflet.js',method:'GET',mode:'cors'},respondWith:p=>response=p});assert.ok((await response).ok);
 for(const req of [{url:'https://example.test/api/inspections/a/photos/b',method:'GET'},{url:'https://example.test/api/locations?areaId=pit',method:'GET'},{url:'https://example.test/api/inspections',method:'POST'},{url:'https://tile.openstreetmap.org/0/0/0.png',method:'GET'},{url:'https://example.test/?_rsc=abc',method:'GET',mode:'cors'}]){
  let intercepted=false;handlers.fetch({request:req,respondWith:()=>intercepted=true});assert.equal(intercepted,false);
 }
});

test('new executing bundle cannot claim ready from old active worker and its old manifest',async()=>{
 const {assertOfflineShell}=await import('../lib/offline-ready.ts');
 assert.throws(()=>assertOfflineShell('bundle-b',{ready:true,build:'asset-a',version:'bundle-a'},{build:'asset-a',version:'bundle-a'}),/versi/i);
 assert.doesNotThrow(()=>assertOfflineShell('bundle-b',{ready:true,build:'asset-b',version:'bundle-b'},{build:'asset-b',version:'bundle-b'}));
});

test('a Next-based sign-in page cannot be cached as the inspection shell',async()=>{
 const {handlers,storage}=runtime(false,'<title>Authentication Required</title><script>self.__next_f</script>');
 await assert.rejects(event(handlers.install),/Shell aplikasi/);assert.equal(storage.size,0);
});

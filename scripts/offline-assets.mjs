import { readdir, readFile, mkdir, writeFile } from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
const root = new URL('../',import.meta.url);
async function walk(path) {
  return (await Promise.all((await readdir(new URL(path,root),{withFileTypes:true})).map(e=>e.isDirectory()?walk(`${path}/${e.name}`):`${path}/${e.name}`))).flat();
}
if (process.argv.includes('--prepare')) {
  await writeFile(new URL('lib/offline-build.ts',root),`// Generated before compilation; identity belongs to this executing bundle.\nexport const OFFLINE_VERSION=${JSON.stringify(randomUUID())};\n`);
  process.exit(0);
}
const version=(await readFile(new URL('lib/offline-build.ts',root),'utf8')).match(/OFFLINE_VERSION=("[^"]+")/)[1];
const files = (await walk('.next/static')).filter(p=>!p.endsWith('.map')).sort();
const template = await readFile(new URL('scripts/service-worker.js',root),'utf8');
const hash=createHash('sha256').update(template);
for(const path of files)hash.update(path).update(await readFile(new URL(path,root)));
const build=hash.digest('hex').slice(0,20),assets=files.map(p=>p.replace('.next/static','/_next/static'));
await mkdir(new URL('public/',root),{recursive:true});
await writeFile(new URL('public/offline-assets.json',root),JSON.stringify({build,version:JSON.parse(version),assets}));
await writeFile(new URL('public/sw.js',root),`const VERSION=${version};const BUILD=${JSON.stringify(build)};const ASSETS=${JSON.stringify(assets)};\n${template}`);
console.log(`Shell offline ${build}: ${assets.length} aset disiapkan.`);

// Same shared-source generation as the checklist; no ES modules in Apps Script.
import fs from 'node:fs';
import ts from 'typescript';
const source=fs.readFileSync(new URL('../lib/location.ts',import.meta.url),'utf8').replace(/^export /gm,'');
const out='// GENERATED: npm run sync:location. Edit lib/location.ts.\n'+ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2020,module:ts.ModuleKind.None}}).outputText;
const path=new URL('../apps-script/src/location.js',import.meta.url);
if(process.argv.includes('--check')) {
  if(!fs.existsSync(path)||fs.readFileSync(path,'utf8')!==out) throw new Error('Gateway location stale: run npm run sync:location');
} else fs.writeFileSync(path,out);

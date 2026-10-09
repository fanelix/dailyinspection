// Same shared-source generation as the checklist; no ES modules in Apps Script.
import fs from 'node:fs';
import ts from 'typescript';
const catalog=fs.readFileSync(new URL('../config/utm-crs.json',import.meta.url),'utf8');
const source=fs.readFileSync(new URL('../lib/location.ts',import.meta.url),'utf8').replace(/^import .*\n/gm,'').replace(/^export /gm,'');
const out='// GENERATED: npm run sync:location. Edit lib/location.ts / config/utm-crs.json.\n// Global supplied by projection.js (UMD is detected as CommonJS by checkJs).\n/** @type {(from: string, to: string, coordinates: number[]) => number[]} */\nvar proj4;\nconst utmCrs = '+catalog.trim()+';\n'+ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2020,module:ts.ModuleKind.None}}).outputText;
const path=new URL('../apps-script/src/location.js',import.meta.url);
if(process.argv.includes('--check')) {
  if(!fs.existsSync(path)||fs.readFileSync(path,'utf8')!==out) throw new Error('Gateway location stale: run npm run sync:location');
} else fs.writeFileSync(path,out);
// Official, pinned UMD distribution; Apps Script has no npm/module loader.
const pkg=JSON.parse(fs.readFileSync(new URL('../node_modules/proj4/package.json',import.meta.url),'utf8'));
const license=fs.readFileSync(new URL('../node_modules/proj4/LICENSE.md',import.meta.url),'utf8');
const vendor='// @ts-nocheck\n// GENERATED: npm run sync:location. Proj4js '+pkg.version+' (unmodified distribution).\n/*\n'+license+'\n*/\n/** @type {(from: string, to: string, coordinates: number[]) => number[]} */\nvar proj4 = (function () { var module = { exports: {} }; var exports = module.exports;\n'+fs.readFileSync(new URL('../node_modules/proj4/dist/proj4.js',import.meta.url),'utf8')+'\nreturn module.exports; })();\n';
const vendorPath=new URL('../apps-script/src/projection.js',import.meta.url);
if(process.argv.includes('--check')) {
  if(!fs.existsSync(vendorPath)||fs.readFileSync(vendorPath,'utf8')!==vendor) throw new Error('Gateway projection stale: run npm run sync:location');
} else fs.writeFileSync(vendorPath,vendor);

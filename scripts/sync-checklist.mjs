// Apps Script has no ES module/JSON imports. Generate a plain script using the installed TS compiler.
// Keep the generated file in git for copy/paste deployment; --check detects drift without writing.
import fs from 'node:fs';
import ts from 'typescript';
const config = fs.readFileSync(new URL('../config/checklists.json', import.meta.url), 'utf8');
const source = fs.readFileSync(new URL('../lib/inspection.ts', import.meta.url), 'utf8')
  .replace(/^import inspectionCatalog .*;$/m, `const inspectionCatalog = ${config.trim()};`)
  .replace(/^export /gm, '');
const out = '// GENERATED: npm run sync:checklist. Edit lib/inspection.ts and config/checklists.json.\n' +
  ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.None } }).outputText;
const path = new URL('../apps-script/src/checklist.js', import.meta.url);
if (process.argv.includes('--check')) {
  if (!fs.existsSync(path) || fs.readFileSync(path, 'utf8') !== out) throw new Error('Gateway checklist stale: run npm run sync:checklist');
} else fs.writeFileSync(path, out);

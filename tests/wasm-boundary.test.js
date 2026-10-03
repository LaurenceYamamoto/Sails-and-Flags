import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
test('browser entry points do not import the JavaScript reference engine or localStorage saves',()=>{
 const seen=new Set();function visit(file){if(seen.has(file))return;seen.add(file);const source=fs.readFileSync(file,'utf8');assert.doesNotMatch(source,/\blocalStorage\b/);assert.ok(!['engine.js','industry.js','security.js','management.js','land.js','storage.js','data.js','sea-routing.js'].includes(path.basename(file)),file);for(const m of source.matchAll(/from\s+['"](\.[^'"]+)['"]/g))visit(path.normalize(path.join(path.dirname(file),m[1])));}
 visit('src/wasm-app.js');visit('src/game-worker.js');assert.match(fs.readFileSync('index.html','utf8'),/src\/wasm-app\.js/);
});
test('shipped WebAssembly matches the checked-in Rust sources and build manifest',()=>{
 const build=JSON.parse(fs.readFileSync('assets/wasm/build.json'));const hash=file=>createHash('sha256').update(fs.readFileSync(file)).digest('hex');assert.equal(hash('assets/wasm/engine.wasm'),build.binary);for(const [file,digest]of Object.entries(build.sources)){const actual=createHash('sha256').update(fs.readFileSync(file,'utf8').replace(/^\uFEFF/,'').replace(/\r\n/g,'\n')).digest('hex');assert.equal(actual,digest,'Run npm run build:wasm after changing '+file);}
});
test('Wasm executes without imported JavaScript game callbacks',()=>{
 const module=new WebAssembly.Module(fs.readFileSync('assets/wasm/engine.wasm'));assert.deepEqual(WebAssembly.Module.imports(module),[]);const exports=WebAssembly.Module.exports(module).map(e=>e.name);for(const name of ['memory','allocate','execute','output_len'])assert.ok(exports.includes(name));
});

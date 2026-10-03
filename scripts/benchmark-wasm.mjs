import fs from 'node:fs';
import os from 'node:os';
import {performance} from 'node:perf_hooks';
import {bridge} from '../src/wasm-bridge.js';
import {stressFixture} from './stress-fixture.js';
import {tick,serialize,deserialize} from '../src/engine.js';
const legacy=stressFixture(Number(process.argv[2]??200));
const {instance}=await WebAssembly.instantiate(fs.readFileSync('assets/wasm/engine.wasm')),core=bridge(instance),cmd=c=>core({op:'command',command:c});
cmd({action:'new',seed:1700,events:false});const catalog=core({op:'catalog'}),g=JSON.parse(core({op:'save'}));g.companies[0].cash+=1e14;g.companies[0].initial_cash+=1e14;core({op:'load',text:JSON.stringify(g)});
catalog.nations.forEach((_,nation)=>cmd({action:'license',nation}));
for(const r of legacy.routes)cmd({action:'openRoute',kind:'fluyt',stops:r.stops.map(id=>catalog.cities.findIndex(c=>c.id===id)),allowed:catalog.goods.map((_,i)=>i),margin:10});
function measure(fn,n){const times=[];for(let i=0;i<n;i++){const start=performance.now();fn();times.push(performance.now()-start);}times.sort((a,b)=>a-b);return {mean:times.reduce((a,b)=>a+b,0)/n,p95:times[Math.floor(n*.95)],max:times.at(-1)};}
const old=measure(()=>tick(legacy),365),wasm=measure(()=>cmd({action:'tick',days:1}),365),views=measure(()=>core({op:'view',city:0}),30);
const oldStart=performance.now(),oldRaw=serialize(legacy);deserialize(oldRaw);const oldSave=performance.now()-oldStart;
const start=performance.now(),raw=core({op:'save'});core({op:'load',text:raw});const save=performance.now()-start;
const report={cpu:os.cpus()[0].model,node:process.version,ships:legacy.ships.length,routes:legacy.routes.length,days:365,legacyTickMs:old,wasmTickWithAbiMs:wasm,wasmViewWithAbiMs:views,legacySerializeValidateMs:oldSave,wasmSaveLoadWithAbiMs:save,saveBytes:Buffer.byteLength(raw)};
console.log(JSON.stringify(report,null,2));
if(wasm.p95>50||core({op:'view'}).day!==365)process.exitCode=1;

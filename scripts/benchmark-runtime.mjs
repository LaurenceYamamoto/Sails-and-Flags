import fs from 'node:fs';
import os from 'node:os';
import {performance} from 'node:perf_hooks';
import {bridge} from '../src/wasm-bridge.js';
import {postFixture} from '../tests/post-fixture.js';

// Reproducible current-Wasm workload, without the retired JavaScript engine.
// Optional binary path permits comparing the same fixture with a release build.
const binary=process.argv[2]??'assets/wasm/engine.wasm';
const call=bridge((await WebAssembly.instantiate(fs.readFileSync(binary))).instance);
const cmd=command=>call({op:'command',command});
cmd({action:'new',seed:1700,events:false});
const catalog=call({op:'catalog'}),city=id=>catalog.cities.findIndex(c=>c.id===id);
let game=JSON.parse(call({op:'save'}));
const player=game.companies[0];player.cash=player.initial_cash=1e12;
player.licenses=catalog.nations.map((_,i)=>i);player.technology.fill(60);
player.posts[city('london')]=postFixture(catalog.goods.length);
call({op:'load',text:JSON.stringify(game)});
for(let i=0;i<catalog.cities.length;i++){
 if(i===city('london'))continue;
 let q;try{q=call({op:'query',request:{query:'opening',kind:'galleon',stops:[city('london'),i]}});}catch{continue;}
 if(!q.eligible&&!q.affordable)continue;
 try{cmd({action:'openRoute',kind:'galleon',stops:[city('london'),i],allowed:catalog.goods.map((_,i)=>i)});}catch{continue;}
 if(JSON.parse(call({op:'save'})).companies[0].routes.length>=60)break;
}
game=JSON.parse(call({op:'save'}));
for(const ship of [...game.companies[0].ships])for(let i=0;i<9;i++)game.companies[0].ships.push({...structuredClone(ship),id:game.next_id++});
call({op:'load',text:JSON.stringify(game)});
const fixture=call({op:'save'});
function measure(fn,n){const samples=[];for(let i=0;i<n;i++){const t=performance.now();fn();samples.push(performance.now()-t);}samples.sort((a,b)=>a-b);return {mean:samples.reduce((a,b)=>a+b)/n,p95:samples[Math.floor(n*.95)],max:samples.at(-1)};}
const initial=call({op:'view'});
const views=measure(()=>call({op:'view'}),30);
const ticks=measure(()=>cmd({action:'tick',days:1}),180);
const active=call({op:'view'});
const lateViews=measure(()=>call({op:'view'}),30);
const save=measure(()=>call({op:'save'}),10);
let runtime;
try{const selected=active.companies[0].routes[0]?.id;call({op:'runtimeView',route:selected});const snapshot=call({op:'runtimeView',route:selected});runtime={viewMs:measure(()=>call({op:'runtimeView',route:selected}),30),clockMs:measure(()=>call({op:'clock'}),100),viewBytes:Buffer.byteLength(JSON.stringify(snapshot))};}catch(e){if(e.message!=='Unknown operation')throw e;/* Older release binaries have no runtime protocol. */}
const report={cpu:os.cpus()[0].model,logicalCpus:os.cpus().length,binary,initialRoutes:initial.companies[0].routes.length,initialShips:initial.companies[0].ships.length,day:active.day,totalRoutes:active.companies.reduce((n,c)=>n+c.routes.length,0),totalShips:active.companies.reduce((n,c)=>n+c.ships.length,0),tickMs:ticks,viewMs:views,lateViewMs:lateViews,viewBytes:Buffer.byteLength(JSON.stringify(active)),saveMs:save,runtime};
console.log(JSON.stringify(report,null,2));
if(process.env.PERF_FIXTURE)fs.writeFileSync(process.env.PERF_FIXTURE,fixture);

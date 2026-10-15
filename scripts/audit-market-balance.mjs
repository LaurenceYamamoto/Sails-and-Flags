// Local-only comparison against the 3.3.14 release build; no browser or hosting.
import fs from 'node:fs';
import {execFileSync} from 'node:child_process';
import {bridge} from '../src/wasm-bridge.js';
const baseline=execFileSync('git',['show','3.3.14:assets/wasm/engine.wasm'],{maxBuffer:40*1024*1024});
async function audit(binary){
 const {instance}=await WebAssembly.instantiate(binary),call=bridge(instance);
 call({op:'command',command:{action:'new',seed:1700,events:false}});
 const catalog=call({op:'catalog'}),snapshots=[];
 for(const day of [0,365,1825]){
  let state=JSON.parse(call({op:'save'}));
  while(state.day<day){call({op:'command',command:{action:'tick',days:Math.min(31,day-state.day)}});state=JSON.parse(call({op:'save'}));}
  const goods=catalog.goods.map(g=>({id:g.id,production:0,demand:0,consumption:0,stock:0}));
  for(let city=0;city<catalog.cities.length;city++)for(const m of call({op:'view',city}).market){const g=goods[m.good];for(const k of ['production','demand','consumption','stock'])g[k]+=m[k];}
  snapshots.push({day,activeRivals:state.companies.slice(1).filter(c=>!c.bankrupt&&!c.acquired).length,
   deliveries:state.companies.reduce((n,c)=>n+c.routes.reduce((n,r)=>n+r.deliveries,0),0),
   finiteNonnegativeMarkets:state.markets.every(m=>Number.isFinite(m.stock)&&m.stock>=0),goods});
  console.error('Audited day '+day);
 }
 return snapshots;
}
const report={seed:1700,events:false,scenario:'Player idle; rivals operate normally. Current working build compared to release 3.3.14.',
 before:await audit(baseline),after:await audit(fs.readFileSync('assets/wasm/engine.wasm'))};
console.log(JSON.stringify(report,null,2));

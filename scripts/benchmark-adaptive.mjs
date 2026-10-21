import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import os from 'node:os';
import assert from 'node:assert/strict';
import {installHost,liveWorkers,messages} from '../tests/helpers/shared-node-worker.js';
import {fleetFixture} from '../tests/helpers/fleet-fixture.js';
import {warehouseFixture} from '../tests/helpers/warehouse-fleet-fixture.js';
// Keep both Wasm instances alive, and warm each tested mode on the same fixture.
// This reduces fresh-process compilation variation without hiding calibration:
// threadMode is reset before EVERY timed run, as it is after warm-up.
const packages=JSON.parse(process.env.BENCH_PACKAGES??'{"before":"sites/adaptive-before","after":"assets/wasm/shared"}');
const days=+(process.env.BENCH_DAYS??360),trials=+(process.env.BENCH_TRIALS??5),warmDays=720;
const modes=(process.env.BENCH_MODES??'adaptive,serial').split(',');
const hash=x=>createHash('sha256').update(x).digest('hex');
installHost();const cores={};
try{
 for(const [label,dir]of Object.entries(packages)){
  const pkg=await import(pathToFileURL(path.resolve(dir,'engine.js')));await pkg.default({module_or_path:fs.readFileSync(dir+'/engine_bg.wasm')});await pkg.initThreadPool(4);pkg.threads_ready(4);
  cores[label]=q=>{const r=JSON.parse(pkg.request(JSON.stringify(q)));if(!r.ok)throw Error(r.error);return r.value;};
 }
 const scenarios=[['600',10,false],['2400',40,false],['warehouse',10,true],['warehouse2400',40,true]];
 if(process.env.BENCH_SAVE)scenarios.push(['provided',0,false]);
 const results=[];
 for(const [name,ships,warehouse]of scenarios){
  // Perform identical setup on every module: generating routes only on the
  // baseline also warms its calculation paths and biases the comparison.
  let fixture;
  for(const core of Object.values(cores)){
   const base=ships?fleetFixture(core,{routes:60,shipsPerRoute:ships}):fs.readFileSync(process.env.BENCH_SAVE,'utf8');
   const prepared=warehouse?warehouseFixture(core,base):base;
   fixture??=prepared;assert.equal(prepared,fixture,'identical fixture setup: '+name);
  }
  const reset=(core,mode)=>{core({op:'load',text:fixture});core({op:'threadMode',mode:mode==='serial'?1:mode==='forced'?2:0});};
  const tick=core=>core({op:'command',command:{action:'tick',days:1}});
  const keys=Object.keys(cores),rows=[];let expected;
  for(const mode of modes){
   for(const key of keys){reset(cores[key],mode);for(let d=0;d<warmDays;d++)tick(cores[key]);}
   for(let trial=0;trial<trials;trial++){
    const order=trial%2?[...keys].reverse():keys;
    for(const key of order){const core=cores[key];reset(core,mode);const sent=messages.sent;const times=[];
     for(let d=0;d<days;d++){const t=performance.now();tick(core);times.push(performance.now()-t);}
     const state=core({op:'save'}),saveHash=hash(state),status=core({op:'threadStatus'});core({op:'load',text:state});assert.equal(core({op:'save'}),state);assert.equal(messages.sent,sent);
     expected??=saveHash;assert.equal(saveHash,expected,`${name}/${key}/${mode}/${trial}`);
     times.sort((a,b)=>a-b);const row={key,mode,trial,meanMs:times.reduce((s,x)=>s+x,0)/days,p95Ms:times[Math.floor(days*.95)],maxMs:times.at(-1),saveHash,status};rows.push(row);
     console.error(`${name} ${trial+1} ${key}/${mode}: ${row.meanMs.toFixed(3)} ms/day`);
    }
   }
  }
  results.push({scenario:name,exact:true,rows});
 }
 const result={date:new Date().toISOString(),cpu:os.cpus()[0].model,node:process.version,days,trials,warmDays,modes,packages,binaries:Object.fromEntries(Object.entries(packages).map(([k,p])=>[k,hash(fs.readFileSync(p+'/engine_bg.wasm'))])),results};
 fs.writeFileSync(process.env.BENCH_OUTPUT??'AgentNote/2026-10-21-adaptive-benchmark.json',JSON.stringify(result,null,2)+'\n');
}finally{await Promise.all([...liveWorkers].map(w=>w.terminate()));}


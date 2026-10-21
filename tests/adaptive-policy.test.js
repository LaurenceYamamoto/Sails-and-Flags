import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {pathToFileURL} from 'node:url';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {bridge} from '../src/wasm-bridge.js';
import {installHost,liveWorkers,messages} from './helpers/shared-node-worker.js';
import {fleetFixture} from './helpers/fleet-fixture.js';
import {warehouseFixture} from './helpers/warehouse-fleet-fixture.js';

test('adaptive calibration avoids disposable warm-ups and preserves every daily result',async()=>{
 installHost();
 const cores=[];
 try{
  for(const dir of [process.env.ADAPTIVE_BASELINE??'sites/adaptive-before','assets/wasm/shared']){
   // Fresh checkouts can verify results against the released serial oracle.
   // Local performance work uses the preserved immediate shared baseline.
   if(cores.length===0 && !fs.existsSync(dir+'/engine_bg.wasm') && !process.env.ADAPTIVE_BASELINE){
    const bytes=execFileSync('git',['show','4.1.7:assets/wasm/engine.wasm'],{maxBuffer:32*1024*1024});
    cores.push(bridge((await WebAssembly.instantiate(bytes)).instance));continue;
   }
   const pkg=await import(pathToFileURL(path.resolve(dir,'engine.js')));
   await pkg.default({module_or_path:fs.readFileSync(dir+'/engine_bg.wasm')});
   await pkg.initThreadPool(4);pkg.threads_ready(4);
   cores.push(q=>{const r=JSON.parse(pkg.request(JSON.stringify(q)));assert.ok(r.ok,r.error);return r.value;});
  }
  const [before,after]=cores,tick={op:'command',command:{action:'tick',days:1}};
  const base=fleetFixture(before,{routes:60,shipsPerRoute:10});
  const reset=(text,mode=0)=>{before({op:'load',text});before({op:'threadMode',mode:1});after({op:'load',text});after({op:'threadMode',mode});};
  const realNow=performance.now;
  // The test clock controls only the scheduling measurements, never game time.
  // One slow initial sample followed by cheap work must not wake the pool.
  try{
   for(const profile of ['cheap','cold-first','heavy']){
    reset(base);let time=0,calls=0;
    performance.now=()=>{calls++;time+=profile==='heavy'?.2:profile==='cold-first'&&calls===2?.2:.01;return time;};
    for(let d=0;d<3;d++){
     before(tick);after(tick);assert.equal(after({op:'save'}),before({op:'save'}),profile+' day '+d);
    }
    const kinds=after({op:'threadStatus'}).kinds;
    assert.ok(kinds.some(s=>s.measurements>0));
    for(const s of kinds)assert.ok(s.probes<=Math.max(0,s.measurements-1),'first measurement cannot probe');
    if(profile==='heavy')assert.ok(kinds.some(s=>s.probes>0),'sustained heavy work must be tested in parallel');
    else assert.ok(kinds.every(s=>s.probes===0),'cheap work and a transient cold sample must stay local');
    // Exactly two timestamps per useful serial measurement and parallel probe.
    assert.equal(calls,2*kinds.reduce((n,s)=>n+s.measurements+s.probes,0),'all scheduling measurements are accounted for');
   }
  }finally{performance.now=realNow;}
  const fixtures=[['600',base],['warehouse',warehouseFixture(before,base)],['2400',fleetFixture(before,{routes:60,shipsPerRoute:40})]];
  if(process.env.BENCH_SAVE)fixtures.push(['provided',fs.readFileSync(process.env.BENCH_SAVE,'utf8')]);
  for(const [name,text]of fixtures){
   reset(text);before({op:'threadMode',mode:0});const sent=messages.sent;
   for(let day=1;day<=720;day++){
    before(tick);after(tick);assert.equal(after({op:'save'}),before({op:'save'}),`${name}, day ${day}`);
    if(day===360){const saved=after({op:'save'});after({op:'load',text:saved});assert.equal(after({op:'save'}),saved);}
   }
   assert.equal(messages.sent,sent,'Rust jobs must not use JS messages');
  }
 }finally{await Promise.all([...liveWorkers].map(w=>w.terminate()));}
});

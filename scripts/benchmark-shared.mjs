// Local only. Each mode uses a fresh process; no other tests should run while
// comparing timings. Keep the pre-change Wasm in the ignored sites directory.
import fs from 'node:fs';
import os from 'node:os';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {bridge} from '../src/wasm-bridge.js';
import {ParallelSimulation} from '../tests/helpers/legacy-simulation-parallel.js';
import {nodeComputeWorker,fleetFixture} from '../tests/helpers/parallel-fixture.js';
import {installHost,liveWorkers,messages} from '../tests/helpers/shared-node-worker.js';
const hash=s=>createHash('sha256').update(s).digest('hex');
const days=Number(process.env.BENCH_DAYS??180),trials=Number(process.env.BENCH_TRIALS??3);
const input=process.env.BENCH_SAVE,ships=Number(process.env.BENCH_SHIPS_PER_ROUTE??10);
if(process.argv[2]==='--mode'){
 const mode=process.argv[3];let core,pool,call;
 try{
  if(mode.startsWith('before')){
   const module=await WebAssembly.compile(fs.readFileSync('sites/local-shared-baseline.wasm'));
   core=bridge(await WebAssembly.instantiate(module));
   pool=new ParallelSimulation(core,module,{concurrency:mode==='before-serial'?1:6,createWorker:nodeComputeWorker});
   await pool.ready;call=q=>pool.call(q);
  }else{
   installHost();const pkg=await import('../assets/wasm/shared/engine.js');
   await pkg.default({module_or_path:fs.readFileSync('assets/wasm/shared/engine_bg.wasm')});
   const n=mode==='shared-2'?2:4;await pkg.initThreadPool(n);pkg.threads_ready(n);
   core=q=>{const r=JSON.parse(pkg.request(JSON.stringify(q)));if(!r.ok)throw Error(r.error);return r.value;};call=core;
  }
  const fixture=input?fs.readFileSync(input,'utf8'):fleetFixture(core,{routes:60,shipsPerRoute:ships});
  core({op:'load',text:fixture});
  const reset=()=>{
   if(pool){pool.minimum={};pool.samples={};}
   else core({op:'threadMode',mode:mode==='shared-serial'?1:mode==='shared-adaptive'?0:2});
  };
  reset();for(let i=0;i<30;i++)await call({op:'command',command:{action:'tick',days:1}});
  core({op:'load',text:fixture});reset();
  const sent=messages.sent,samples=[];
  for(let i=0;i<days;i++){const t=performance.now();await call({op:'command',command:{action:'tick',days:1}});samples.push(performance.now()-t);}
  if(!pool&&messages.sent!==sent)throw Error('Per-job JS messages detected');
  const saved=core({op:'save'});core({op:'load',text:saved});if(core({op:'save'})!==saved)throw Error('Roundtrip mismatch');
  const stats=pool?pool.status():core({op:'threadStatus'});if(stats.fallbacks)throw Error('Worker failure invalidates timing');
  const sorted=samples.toSorted((a,b)=>a-b);
  console.log(JSON.stringify({mode,meanMs:samples.reduce((a,b)=>a+b,0)/days,p95Ms:sorted[Math.floor(days*.95)],maxMs:sorted.at(-1),saveHash:hash(saved),stats,jobMessages:pool?null:messages.sent-sent}));
 }finally{pool?.close();await Promise.all([...liveWorkers].map(w=>w.terminate()));}
}else{
 const modes=['before-serial','before-adaptive','shared-serial','shared-2','shared-4','shared-adaptive'],rows=[];
 for(let trial=0;trial<trials;trial++)for(const mode of modes.slice(trial).concat(modes.slice(0,trial))){
  const raw=execFileSync(process.execPath,[process.argv[1],'--mode',mode],{encoding:'utf8',maxBuffer:8*1024*1024,timeout:240000});
  const row={trial,...JSON.parse(raw)};rows.push(row);console.error(`${trial+1} ${mode}: ${row.meanMs.toFixed(3)} ms/day`);
  if(row.saveHash!==rows[0].saveHash)throw Error('State mismatch: '+mode);
 }
 console.log(JSON.stringify({date:'2026-10-21',cpu:os.cpus()[0].model,logicalCpus:os.cpus().length,node:process.version,
 days,trials,fixture:input?'provided-save':`60 routes / ${ships*60} player ships`,
 beforeSha256:hash(fs.readFileSync('sites/local-shared-baseline.wasm')),sharedSha256:hash(fs.readFileSync('assets/wasm/shared/engine_bg.wasm')),
 exactAllModesMatch:true,notes:['Fresh process per mode; 30 warmup days, init/render/save excluded; scheduling and synchronization included.','Mode order rotated. Both serial and parallel outputs must exactly match 4.1.3.'],rows},null,2));
}

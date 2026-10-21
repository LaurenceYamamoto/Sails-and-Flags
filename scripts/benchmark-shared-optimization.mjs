// Local before/after comparison. The before package is a byte-for-byte copy
// made before edits, including its generated worker bootstrap.
import fs from 'node:fs';
import os from 'node:os';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import path from 'node:path';
import {Session} from 'node:inspector/promises';
import {installHost,liveWorkers,messages} from '../tests/helpers/shared-node-worker.js';
import {fleetFixture} from '../tests/helpers/fleet-fixture.js';
const hash=x=>createHash('sha256').update(x).digest('hex');
const days=+(process.env.BENCH_DAYS??360),trials=+(process.env.BENCH_TRIALS??3);
const ships=+(process.env.BENCH_SHIPS_PER_ROUTE??10),input=process.env.BENCH_SAVE;
const packages={before:'sites/shared-optimization-before',after:'assets/wasm/shared',profile:'sites/shared-profile'};
if(process.argv[2]==='--mode'){
 const label=process.argv[3], [version,mode]=label.split('/');
 installHost();let profiler;
 try{
  const dir=packages[version],pkg=await import(pathToFileURL(path.resolve(dir,'engine.js')));
  await pkg.default({module_or_path:fs.readFileSync(dir+'/engine_bg.wasm')});
  await pkg.initThreadPool(4);pkg.threads_ready(4);
  const core=q=>{const r=JSON.parse(pkg.request(JSON.stringify(q)));if(!r.ok)throw Error(r.error);return r.value;};
  const fixture=input?fs.readFileSync(input,'utf8'):fleetFixture(core,{routes:60,shipsPerRoute:ships});
  const reset=()=>{core({op:'load',text:fixture});core({op:'threadMode',mode:mode==='serial'?1:mode==='forced'?2:0});};
  reset();for(let i=0;i<30;i++)core({op:'command',command:{action:'tick',days:1}});reset();
  if(process.env.CPU_PROFILE){profiler=new Session();profiler.connect();await profiler.post('Profiler.enable');await profiler.post('Profiler.setSamplingInterval',{interval:100});await profiler.post('Profiler.start');}
  const sent=messages.sent,times=[];
  for(let i=0;i<days;i++){const t=performance.now();core({op:'command',command:{action:'tick',days:1}});times.push(performance.now()-t);}
  if(profiler){const {profile}=await profiler.post('Profiler.stop');fs.writeFileSync(process.env.CPU_PROFILE,JSON.stringify(profile));profiler.disconnect();}
  const save=core({op:'save'});core({op:'load',text:save});if(core({op:'save'})!==save)throw Error('Save roundtrip mismatch');
  if(messages.sent!==sent)throw Error('JS job messages detected');
  times.sort((a,b)=>a-b);
  console.log(JSON.stringify({label,meanMs:times.reduce((a,b)=>a+b,0)/days,p95Ms:times[Math.floor(days*.95)],maxMs:times.at(-1),saveHash:hash(save),jobMessages:messages.sent-sent,stats:core({op:'threadStatus'})}));
 }finally{await Promise.all([...liveWorkers].map(w=>w.terminate()));}
}else{
 const modes=(process.env.BENCH_MODES??'before/adaptive,after/adaptive,before/serial,after/serial,before/forced,after/forced').split(',');
 const rows=[];
 for(let trial=0;trial<trials;trial++)for(const label of modes.slice(trial).concat(modes.slice(0,trial))){
  const result=JSON.parse(execFileSync(process.execPath,[process.argv[1],'--mode',label],{encoding:'utf8',maxBuffer:8*1024*1024,timeout:240000}));
  rows.push({trial,...result});console.error(`${trial+1} ${label}: ${result.meanMs.toFixed(3)} ms/day`);
  if(result.saveHash!==rows[0].saveHash)throw Error('Before/after state mismatch: '+label);
 }
 console.log(JSON.stringify({date:new Date().toISOString(),cpu:os.cpus()[0].model,node:process.version,days,trials,
  fixture:input?'provided day 1408 save':`60 routes / ${60*ships} player ships`,
  binaries:Object.fromEntries(['before','after'].map(k=>[k,hash(fs.readFileSync(packages[k]+'/engine_bg.wasm'))])),
  exactAllModesMatch:true,rows},null,2));
}

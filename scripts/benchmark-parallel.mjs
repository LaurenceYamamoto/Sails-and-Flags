import fs from 'node:fs';
import os from 'node:os';
import {performance} from 'node:perf_hooks';
import {ParallelSimulation} from '../src/simulation-parallel.js';
import {coreFrom,fleetFixture,nodeComputeWorker} from '../tests/helpers/parallel-fixture.js';

const module=await WebAssembly.compile(fs.readFileSync('assets/wasm/engine.wasm'));
const core=await coreFrom(module);
const fixture=process.argv[2]?fs.readFileSync(process.argv[2],'utf8'):fleetFixture(core,{routes:60,shipsPerRoute:10});
const days=Number(process.env.BENCH_DAYS??180),runs=[];
for(const workers of [0,2,4]){
  core({op:'load',text:fixture});
  const pool=new ParallelSimulation(core,module,{concurrency:workers?workers+2:1,createWorker:nodeComputeWorker,adaptive:process.env.PARALLEL_FORCE!=='1'});
  await pool.ready;
  const samples=[];
  try{
    for(let i=0;i<days;i++){
      const t=performance.now();
      await pool.call({op:'command',command:{action:'tick',days:1}});
      samples.push(performance.now()-t);
    }
    const saved=core({op:'save'});
    if(runs.length && saved!==runs[0].save)throw Error('Parallel state mismatch');
    const sorted=[...samples].sort((a,b)=>a-b);
    runs.push({workers,meanMs:samples.reduce((a,b)=>a+b)/days,p95Ms:sorted[Math.floor(days*.95)],
      maxMs:sorted.at(-1),stats:pool.status(),save:saved});
    console.error(`${workers} workers: ${runs.at(-1).meanMs.toFixed(3)} ms/day`);
  }finally{pool.close();}
}
console.log(JSON.stringify({cpu:os.cpus()[0].model,logicalCpus:os.cpus().length,days,
  fixture:process.argv[2]?'provided-save':'60 routes / 600 ships',adaptive:process.env.PARALLEL_FORCE!=='1',
  exactStateMatch:true,runs:runs.map(({save,...report})=>report)},null,2));

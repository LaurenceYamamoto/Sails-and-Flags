// Local-only before/after comparison. Baseline is an untracked copy made before
// this experiment; it is never downloaded from or run on the published site.
import fs from 'node:fs';
import os from 'node:os';
import {createHash} from 'node:crypto';
import {performance} from 'node:perf_hooks';
import {ParallelSimulation} from '../tests/helpers/legacy-simulation-parallel.js';
import {coreFrom,fleetFixture,nodeComputeWorker} from '../tests/helpers/parallel-fixture.js';
const days=Number(process.env.BENCH_DAYS??180),trials=Number(process.env.BENCH_TRIALS??3);
const baseline=await WebAssembly.compile(fs.readFileSync('sites/local-city-baseline.wasm'));
const current=await WebAssembly.compile(fs.readFileSync('assets/wasm/engine.wasm'));
const old=await coreFrom(baseline),now=await coreFrom(current);
const fixture=process.argv[2]?fs.readFileSync(process.argv[2],'utf8'):
  fleetFixture(old,{routes:60,shipsPerRoute:Number(process.env.BENCH_SHIPS_PER_ROUTE??10)});
const modes=[
  {name:'before-serial',core:old,module:baseline,workers:0},
  {name:'phases-serial',core:now,module:current,workers:0},
  {name:'phases-2-workers',core:now,module:current,workers:2,adaptive:false},
  {name:'phases-4-workers',core:now,module:current,workers:4,adaptive:false},
  {name:'phases-4-adaptive',core:now,module:current,workers:4,adaptive:true}
];
const rows=[],saves=new Map();
for(let trial=0;trial<trials;trial++){
  // Rotate order to reduce consistently favoring the warmed-up later modes.
  const ordered=modes.slice(trial).concat(modes.slice(0,trial));
  for(const mode of ordered){
    mode.core({op:'load',text:fixture});
    const pool=new ParallelSimulation(mode.core,mode.module,{concurrency:mode.workers?mode.workers+2:1,
      createWorker:nodeComputeWorker,adaptive:mode.adaptive??true});
    try{
      await pool.ready;
      if(mode.workers&&pool.status().workers!==mode.workers)throw Error('Workers unavailable: '+JSON.stringify(pool.status()));
      if(mode.adaptive===false)pool.minimum={schedules:Number.MAX_SAFE_INTEGER,rival:Number.MAX_SAFE_INTEGER,movement:0,cities:0,investments:0};
      // Warm up outside measurement, then reset game and adaptation.
      for(let i=0;i<30;i++)await pool.call({op:'command',command:{action:'tick',days:1}});
      mode.core({op:'load',text:fixture});pool.minimum={schedules:0,rival:0,movement:0,cities:0,investments:0};pool.samples={};
      if(mode.adaptive===false)pool.minimum={schedules:Number.MAX_SAFE_INTEGER,rival:Number.MAX_SAFE_INTEGER,movement:0,cities:0,investments:0};
      const samples=[],beforeStats=pool.status();
      for(let i=0;i<days;i++){
        const t=performance.now();
        await pool.call({op:'command',command:{action:'tick',days:1}});
        samples.push(performance.now()-t);
      }
      if(pool.status().fallbacks)throw Error('Worker failure invalidates timing: '+JSON.stringify(pool.status()));
      const saved=mode.core({op:'save'}),family=mode.name==='before-serial'?'before':'phases';
      if(saves.has(family)&&saves.get(family)!==saved)throw Error('Non-deterministic result: '+mode.name);
      saves.set(family,saved);
      mode.core({op:'load',text:saved});
      if(mode.core({op:'save'})!==saved)throw Error('Save roundtrip failed');
      const sorted=samples.toSorted((a,b)=>a-b),g=JSON.parse(saved);
      const row={trial,mode:mode.name,meanMs:samples.reduce((a,b)=>a+b,0)/days,
        p95Ms:sorted[Math.floor(days*.95)],maxMs:sorted.at(-1),stats:pool.status(),warmupStats:beforeStats,
        final:{day:g.day,companies:g.companies.length,ships:g.companies.reduce((s,c)=>s+c.ships.length,0),
          playerCash:g.companies[0].cash,playerSales:g.companies[0].totals.sale??0}};
      rows.push(row);console.error(`${trial+1} ${mode.name}: ${row.meanMs.toFixed(3)} ms/day`);
    }finally{pool.close();}
  }
}
console.log(JSON.stringify({date:'2026-10-21',node:process.version,
  baselineSha256:createHash('sha256').update(fs.readFileSync('sites/local-city-baseline.wasm')).digest('hex'),
  currentSha256:createHash('sha256').update(fs.readFileSync('assets/wasm/engine.wasm')).digest('hex'),cpu:os.cpus()[0].model,logicalCpus:os.cpus().length,days,trials,
  fixture:process.argv[2]?'provided-save':`60 routes / ${60*Number(process.env.BENCH_SHIPS_PER_ROUTE??10)} ships`,
  notes:['Startup and 30 warmup days excluded; mode order rotated between trials.',
    'New-rule serial/parallel states must match exactly. Old/new trading rules may produce different results.'],
  exactPhaseStateMatch:true,oldAndNewStateMatch:saves.get('before')===saves.get('phases'),rows},null,2));

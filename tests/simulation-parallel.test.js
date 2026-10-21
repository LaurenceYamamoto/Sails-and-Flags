import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {bridge} from '../src/wasm-bridge.js';
import {ParallelSimulation} from '../src/simulation-parallel.js';
import {coreFrom,fleetFixture,nodeComputeWorker} from './helpers/parallel-fixture.js';
const module=await WebAssembly.compile(fs.readFileSync('assets/wasm/engine.wasm'));

test('real Wasm workers preserve exact fleet, market, RNG, and accounting results',async()=>{
  const serial=await coreFrom(module),parallel=await coreFrom(module);
  const fixture=fleetFixture(serial);
  parallel({op:'load',text:fixture});
  const pool=new ParallelSimulation(parallel,module,{concurrency:6,createWorker:nodeComputeWorker,adaptive:false});
  try{
    await pool.ready;assert.equal(pool.status().workers,4,JSON.stringify(pool.status()));
    for(let i=0;i<90;i++){
      const request={op:'command',command:{action:'tick',days:1}};
      serial(request);await pool.call(request);
      if(i%10===0)assert.equal(parallel({op:'save'}),serial({op:'save'}),`day ${i+1}`);
    }
    assert.equal(parallel({op:'save'}),serial({op:'save'}));
    assert.ok(pool.status().schedules>0);assert.ok(pool.status().rival>0);
    // An actual independent trade-planning kernel must run, not just route AI.
    for(const kind of ['movement','cities','investments'])assert.ok(pool.status()[kind]>0,kind);
    const before=parallel({op:'save'});
    parallel({op:'load',text:before});
    assert.equal(parallel({op:'save'}),before,'parallel result round-trips through validation');
  }finally{pool.close();}
});

test('fractional clocks, pause, load and new game share the same semantics',async()=>{
  const serial=await coreFrom(module),parallel=await coreFrom(module);
  const pool=new ParallelSimulation(parallel,module,{concurrency:4,createWorker:nodeComputeWorker});
  try{
    await pool.ready;
    for(const request of [
      {op:'command',command:{action:'new',seed:72,events:true}},
      {op:'advance',ms:123,speed:4,running:true},
      {op:'advance',ms:500,speed:16,running:false},
      {op:'advance',ms:500,speed:16,running:true},
      {op:'advance',ms:2000,speed:16,running:true},
      {op:'advance',ms:1,speed:1,running:true}
    ]){serial(request);await pool.call(request);assert.equal(parallel({op:'save'}),serial({op:'save'}));}
    await assert.rejects(()=>pool.call({op:'advance',ms:-1,speed:4,running:true}),/Invalid clock/);
    assert.equal(parallel({op:'save'}),serial({op:'save'}));
  }finally{pool.close();}
});

test('unavailable workers use the unchanged synchronous path',async()=>{
  const core=await coreFrom(module),serial=await coreFrom(module);
  const pool=new ParallelSimulation(core,module,{concurrency:8,createWorker:()=>{throw Error('Blocked');}});
  await pool.ready;assert.equal(pool.status().workers,0);
  const request={op:'command',command:{action:'tick',days:2}};
  serial(request);await pool.call(request);
  assert.equal(core({op:'save'}),serial({op:'save'}));pool.close();
});

test('failed batches are recomputed without replaying earlier charges',async()=>{
  const serial=await coreFrom(module),core=await coreFrom(module);
  const fixture=fleetFixture(serial);core({op:'load',text:fixture});
  let fail=false;
  const pool=new ParallelSimulation(core,module,{concurrency:4,timeout:10000,adaptive:false,createWorker:()=>{
    const worker=nodeComputeWorker(),send=worker.postMessage;
    worker.postMessage=data=>{
      if(data.op==='compute'&&!fail){fail=true;queueMicrotask(()=>worker.onerror?.(Error('Injected crash')));}
      else send(data);
    };
    return worker;
  }});
  try{
    await pool.ready;assert.equal(pool.status().workers,2,JSON.stringify(pool.status()));
    const request={op:'command',command:{action:'tick',days:3}};
    serial(request);await pool.call(request);
    assert.equal(core({op:'save'}),serial({op:'save'}));
    assert.equal(pool.status().fallbacks,1);assert.equal(pool.status().workers,0);
  }finally{pool.close();}
});

test('in-flight batches reject stale results and block conflicting commands',async()=>{
  const core=await coreFrom(module),serial=await coreFrom(module);
  const request={op:'command',command:{action:'tick',days:1}};
  let reply=core({op:'parallelBegin',request});
  assert.equal(reply.done,false);
  assert.throws(()=>core({op:'save'}),/Simulation in progress/);
  assert.throws(()=>core({op:'command',command:{action:'new'}}),/Simulation in progress/);
  assert.throws(()=>core({op:'parallelResume',token:reply.batch.token+1,results:null}),/Stale/);
  while(!reply.done)reply=core({op:'parallelResume',token:reply.batch.token,results:[]});
  serial(request);assert.equal(core({op:'save'}),serial({op:'save'}));
});

test('chunk completion order is irrelevant and slow transfer raises the dispatch threshold',async()=>{
  let index=0,commits=0,lastMinimum;
  const core=q=>{
    if(q.op==='planningTopology')return '';
    if(q.op==='parallelBegin')return {done:false,batch:{kind:'schedules',weight:300,items:[0,1,2,3],token:1,context:''}};
    if(q.op==='parallelProbe')return true;
    if(q.op==='parallelResume'){commits++;lastMinimum=q.minimum;assert.equal(q.results,null);return {done:true};}
  };
  const pool=new ParallelSimulation(core,null,{concurrency:4,createWorker:()=>{
    const slow=index++===0;
    const worker={
      postMessage(data){setTimeout(()=>worker.onmessage({data:{id:data.id,ok:true,
        value:data.op==='init'?true:data.items.map(i=>'value'+i)}}),slow?12:1);},
      terminate(){}
    };return worker;
  }});
  try{
    await pool.ready;
    assert.deepEqual(await pool.evaluate({kind:'schedules',items:[0,1,2,3],context:''}),['value0','value1','value2','value3']);
    await pool.call({op:'command',command:{action:'tick',days:1}});
    assert.equal(commits,1);assert.equal(lastMinimum.schedules,1200);
    assert.ok(pool.status().samples.schedules.parallelMs>pool.status().samples.schedules.localMs);
  }finally{pool.close();}
});

test('a stalled compute worker times out and the pending day completes exactly once',async()=>{
  const core=await coreFrom(module),serial=await coreFrom(module);
  const pool=new ParallelSimulation(core,module,{concurrency:4,timeout:10,adaptive:false,createWorker:()=>{
    const worker={terminate(){},postMessage(data){
      if(data.op==='init')queueMicrotask(()=>worker.onmessage({data:{id:data.id,ok:true,value:true}}));
      // Deliberately never reply to compute.
    }};return worker;
  }});
  try{
    await pool.ready;
    const request={op:'command',command:{action:'tick',days:2}};
    serial(request);await pool.call(request);
    assert.equal(core({op:'save'}),serial({op:'save'}));
    assert.equal(pool.status().fallbacks,1);
    assert.match(pool.status().lastError,/timeout/);
  }finally{pool.close();}
});

test('malformed city settlements fall back before spending or reserving stock',async()=>{
  const serial=await coreFrom(module),core=await coreFrom(module);
  const fixture=fleetFixture(serial,{routes:60,shipsPerRoute:10,events:false});
  core({op:'load',text:fixture});let corrupt=0;
  const pool=new ParallelSimulation(core,module,{concurrency:4,adaptive:false,createWorker:()=>{
    const worker=nodeComputeWorker(),send=worker.postMessage;
    worker.postMessage=data=>{
      if(data.op==='compute'&&data.kind==='cities'){
        corrupt++;
        queueMicrotask(()=>worker.onmessage?.({data:{id:data.id,ok:true,value:data.items.map(r=>({
          ship:r.ship,from:r.from,to:r.to,plan:{lots:[[999999,999999]],cost:0,sale:0},reposition:false
        }))}}));
      }else send(data);
    };return worker;
  }});
  try{
    await pool.ready;
    const request={op:'command',command:{action:'tick',days:14}};
    serial(request);await pool.call(request);
    assert.ok(corrupt>0,'must exercise actual city batches');
    assert.equal(core({op:'save'}),serial({op:'save'}));
    const saved=core({op:'save'});core({op:'load',text:saved});assert.equal(core({op:'save'}),saved);
  }finally{pool.close();}
});


test('warehouse sale does not create fictitious capacity behind oversized inbound reservations',async()=>{
  const compute=bridge(await WebAssembly.instantiate(module),'compute_execute');
  const [result]=compute({kind:'cities',items:[{
    city:0,stock:[10,1000],bases:[100,100],sales:[],buys:[],
    warehouses:{0:[{good:0,quantity:10,cost:123,from:null}]},
    posts:[{company:0,tax:0.1,budget:10000,room:0,limit:0,rules:[
      {buy:false,sell:true,buy_below:0,sell_above:0},
      {buy:true,sell:false,buy_below:0,sell_above:0}
    ]}]
  }]});
  assert.equal(result.posts[0][1].length,1);
  assert.equal(result.posts[0][1][0][0],false,'only the existing stock can be sold');
  assert.deepEqual(result.posts[0][2],[],'inbound reservations consume all remaining capacity');
});


test('a refused purchase updates route forecasts instead of retaining obsolete profits',async()=>{
  const core=await coreFrom(module);
  const g=JSON.parse(fleetFixture(core,{routes:1,shipsPerRoute:1,events:false}));
  g.markets.forEach(m=>m.stock=0);
  g.companies[0].routes[0].forecast=123456;
  core({op:'load',text:JSON.stringify(g)});
  core({op:'command',command:{action:'tick',days:1}});
  const route=JSON.parse(core({op:'save'})).companies[0].routes[0];
  assert.ok(route.activity.waiting>0);
  assert.ok(route.forecast<0,'the upkeep estimate must replace the stale profitable quote');
});

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {bridge} from '../src/wasm-bridge.js';
import {createSimulation} from '../src/simulation-runtime.js';
import {installHost,liveWorkers,messages} from './helpers/shared-node-worker.js';
import {fleetFixture} from './helpers/fleet-fixture.js';

test('shared Rust workers match serial every day without per-job JS messages',async()=>{
 installHost();
 const pkg=await import('../assets/wasm/shared/engine.js');
 const exports=await pkg.default({module_or_path:fs.readFileSync('assets/wasm/shared/engine_bg.wasm')});
 assert.ok(exports.memory.buffer instanceof SharedArrayBuffer);
 try{
  await pkg.initThreadPool(4);pkg.threads_ready(4);
  const shared=q=>{const r=JSON.parse(pkg.request(JSON.stringify(q)));assert.ok(r.ok,r.error);return r.value;};
  const serial=bridge((await WebAssembly.instantiate(fs.readFileSync('assets/wasm/engine.wasm'))).instance);
  const fixture=fleetFixture(serial,{routes:60,shipsPerRoute:10});
  for(const mode of [2,0]){
   serial({op:'load',text:fixture});shared({op:'load',text:fixture});shared({op:'threadMode',mode});
   const sent=messages.sent;
   for(let day=0;day<90;day++){
    const q={op:'advance',ms:250,speed:4,running:true};serial(q);shared(q);
    assert.equal(shared({op:'save'}),serial({op:'save'}),`mode ${mode}, day ${day+1}`);
   }
   const save=shared({op:'save'});shared({op:'load',text:save});assert.equal(shared({op:'save'}),save);
   assert.equal(messages.sent,sent,'Jobs/results must never use JS postMessage');
   const status=shared({op:'threadStatus'});assert.equal(status.workers,4);
   for(const kind of ['movement','cities','investments','schedules','rival'])assert.ok(status.kinds.find(s=>s.kind===kind).batches>0,kind);
  }
  assert.equal(pkg.thread_count(1),1);assert.equal(pkg.thread_count(64),4);
 }finally{await Promise.all([...liveWorkers].map(w=>w.terminate()));}
});

test('missing isolation or failed shared startup falls back before any game mutation',async()=>{
 const loadSerial=()=>WebAssembly.instantiate(fs.readFileSync('assets/wasm/engine.wasm'));
 let attempted=false;
 const serial=await createSimulation({isolated:false,loadSerial,loadShared:()=>{attempted=true;throw Error('unexpected');}});
 assert.equal(attempted,false);assert.equal(serial.status().backend,'rust-serial');
 const failed=await createSimulation({isolated:true,loadSerial,loadShared:async()=>{throw Error('startup test');}});
 assert.equal(failed.status().backend,'rust-serial');assert.match(failed.status().reason,/startup test/);
 assert.equal(serial.core({op:'save'}),failed.core({op:'save'}));
});

test('shared binary and JS bootstrap match their reproducible source manifest',()=>{
 const manifest=JSON.parse(fs.readFileSync('assets/wasm/shared-build.json'));
 for(const [file,digest]of Object.entries(manifest.files))assert.equal(createHash('sha256').update(fs.readFileSync(file)).digest('hex'),digest,file);
 for(const [file,digest]of Object.entries(manifest.sources))assert.equal(createHash('sha256').update(fs.readFileSync(file,'utf8').replace(/^\uFEFF/,'').replace(/\r\n/g,'\n')).digest('hex'),digest,file);
 const app=fs.readFileSync('src/game-worker.js','utf8');assert.doesNotMatch(app,/ParallelSimulation|parallelBegin|parallelResume/);
 const runtime=fs.readFileSync('src/simulation-runtime.js','utf8');assert.doesNotMatch(runtime,/parallelBegin|parallelResume|postMessage|\.items|performance\.now/);
});

test('failed thread startup terminates every created worker before fallback',async()=>{
 installHost();
 const original=globalThis.Worker,created=[];let built=false;
 globalThis.Worker=class {
  constructor(){this.events=new Map();created.push(this);}
  addEventListener(k,f){this.events.set(k,f);}
  removeEventListener(k){this.events.delete(k);}
  postMessage(){queueMicrotask(()=>this.events.get('error')?.({message:'Injected startup failure'}));}
  terminate(){this.terminated=true;}
 };
 try{
  const source=fs.readFileSync('scripts/shared-worker-bootstrap.js','utf8');
  const helper=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
  await assert.rejects(helper.startWorkers({}, {}, {numThreads:()=>4,receiver:()=>0,mainJS:()=>'',build:()=>{built=true;}}),/Injected startup/);
  assert.equal(built,false);assert.equal(created.length,4);assert.ok(created.every(w=>w.terminated));
 }finally{globalThis.Worker=original;}
});

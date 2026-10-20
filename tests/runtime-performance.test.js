import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {bridge} from '../src/wasm-bridge.js';
import {compilePath,pathPoint,shipPoint} from '../src/map-motion.js';
import {VesselGPU} from '../src/map-gpu.js';

test('compiled map paths retain segment boundaries and do not connect dateline gaps',()=>{
 const p=compilePath([[{x:0,y:0},{x:3,y:4}],[{x:100,y:4},{x:105,y:4}]]);
 assert.equal(p.total,10);
 assert.deepEqual(pathPoint(p,.25),{x:1.5,y:2});
 assert.deepEqual(pathPoint(p,.5),{x:3,y:4});
 assert.deepEqual(pathPoint(p,.75),{x:102.5,y:4});
 assert.deepEqual(pathPoint(p,2),{x:105,y:4});
 assert.deepEqual(shipPoint({path:p,voyage:{total:10,remaining:8},fallback:{}},.5,0),{x:1.5,y:2});
 const fallback={x:7,y:8};
 assert.equal(pathPoint(compilePath([]),0,fallback),fallback);
 assert.deepEqual(pathPoint(compilePath([[fallback,fallback]]),.5),fallback);
});

test('WebGL unavailable or lost returns to SVG rendering',()=>{
 let lost;const gpu=new VesselGPU({addEventListener:(_,f)=>lost=f,getContext:()=>null});
 assert.equal(gpu.draw([],[],[0,0,900,450],{width:900,height:450}),false);
 let prevented=false;lost({preventDefault:()=>prevented=true});assert.equal(prevented,true);gpu.destroy();
});

test('runtime snapshots preserve full-view details for the selected route and reuse topology',async()=>{
 const call=bridge((await WebAssembly.instantiate(fs.readFileSync('assets/wasm/engine.wasm'))).instance);
 const full=call({op:'view'}),before=call({op:'save'});
 const first=call({op:'runtimeView'});assert.deepEqual(first.paths,full.paths);
 assert.equal(call({op:'runtimeView'}).paths,null);
 assert.deepEqual(call({op:'runtimeView',paths:true}).paths,full.paths);
 assert.deepEqual(call({op:'clock'}),{day:full.day,fraction:full.fraction});
 assert.deepEqual(call({op:'saveInfo'}),{day:full.day,name:full.companies[0].name});
 assert.equal(call({op:'save'}),before,'view caches cannot change save data');
 // A realistic route fixture is constructed by the shared benchmark.
 const {postFixture}=await import('./post-fixture.js');
 const catalog=call({op:'catalog'}),g=JSON.parse(before),co=g.companies[0];
 const a=catalog.cities.findIndex(c=>c.id==='london'),b=catalog.cities.findIndex(c=>c.id==='nantes');
 co.cash=co.initial_cash=1e8;co.licenses=catalog.nations.map((_,i)=>i);co.technology.fill(60);co.posts[a]=postFixture(catalog.goods.length);
 call({op:'load',text:JSON.stringify(g)});
 call({op:'command',command:{action:'openRoute',kind:'galleon',stops:[a,b],allowed:[0]}});
 const expected=call({op:'view'}),route=expected.companies[0].routes[0];
 const updated=call({op:'runtimeView',company:0,route:route.id});
 assert.deepEqual(updated.paths,expected.paths,'route creation invalidates paths');
 assert.deepEqual(updated.companies[0].routes,expected.companies[0].routes);
 const quiet=call({op:'runtimeView'});
 assert.equal(quiet.paths,null);assert.equal(quiet.companies[0].routes[0].types,undefined);
 assert.equal(quiet.companies[0].routes[0].available,undefined);
});

test('fractional ticks omit full views and autosave IO does not block simulation',async()=>{
 let day=0,fraction=0,views=0,finish,writeCount=0;const messages=[];
 const core=q=>{
  if(q.op==='runtimeView'){views++;return {day,fraction,companies:[],paths:{}};}
  if(q.op==='advance'){day=q.day??day;fraction=q.fraction??fraction;}
  if(q.op==='clock')return {day,fraction};
  if(q.op==='save')return 'snapshot';
  if(q.op==='saveInfo')return {day,name:'Test'};
  return {};
 };
 const context=vm.createContext({bridge:()=>core,SaveClient:class{
  async list(){return [];}
  write(){writeCount++;return new Promise(resolve=>finish=resolve);}
 },fetch:()=>{},WebAssembly:{instantiateStreaming:async()=>({instance:{}})},postMessage:m=>messages.push(m)});
 vm.runInContext(fs.readFileSync('src/game-worker.js','utf8').replace(/^import .*;\r?\n/gm,''),context);
 let id=0;
 const send=async q=>{const request=++id;context.onmessage({data:{...q,id:request}});await vm.runInContext('queue',context);return messages.find(m=>m.id===request);};
 await send({op:'boot'});assert.equal(views,1);
 assert.equal((await send({op:'advance',fraction:.5})).value.frame,true);assert.equal(views,1);
 await send({op:'advance',day:30});assert.equal(writeCount,1);assert.equal(views,2);
 await send({op:'advance',day:60});assert.equal(writeCount,1);assert.equal(views,3);
 finish();await vm.runInContext('autosaving',context);
 await send({op:'advance',day:61});assert.equal(writeCount,2);finish();await vm.runInContext('autosaving',context);
 assert.ok(messages.every(m=>m.ok!==false));
});

test('a failed save worker rejects pending work and falls back to IndexedDB',async()=>{
 let worker,localCalls=0;
 const source=fs.readFileSync('src/save-client.js','utf8').replace(/^import .*;\r?\n/gm,'').replace('export class SaveClient','class SaveClient').replace("new URL('./save-worker.js',import.meta.url)","'worker-url'");
 const context=vm.createContext({Worker:class{constructor(){worker=this;}postMessage(){}terminate(){this.stopped=true;}},IndexedSaves:class{async list(){localCalls++;return [];}}});
 vm.runInContext(source+';globalThis.client=new SaveClient();',context);
 const read=context.client.list();
 const pending=context.client.write(1,'snapshot',{}),rejected=assert.rejects(pending,/Save worker unavailable/);
 worker.onerror();await rejected;
 await read;await context.client.list();assert.equal(localCalls,2);assert.equal(worker.stopped,true);
});

test('new games wait for the pending autosave and storage queue survives failures',async()=>{
 let day=0,finish,resets=0;const messages=[];
 const core=q=>{
  if(q.command?.action==='new'){resets++;day=0;}
  if(q.op==='advance')day=30;
  if(q.op==='runtimeView'||q.op==='clock')return {day,fraction:0,companies:[]};
  if(q.op==='save')return 'old-game';
  return {};
 };
 const context=vm.createContext({bridge:()=>core,SaveClient:class{async list(){return [];}write(){return new Promise(resolve=>finish=resolve);}},fetch:()=>{},WebAssembly:{instantiateStreaming:async()=>({instance:{}})},postMessage:m=>messages.push(m)});
 vm.runInContext(fs.readFileSync('src/game-worker.js','utf8').replace(/^import .*;\r?\n/gm,''),context);
 context.onmessage({data:{op:'boot',id:1}});await vm.runInContext('queue',context);
 context.onmessage({data:{op:'advance',id:2}});await vm.runInContext('queue',context);
 context.onmessage({data:{op:'command',command:{action:'new'},id:3}});
 await new Promise(resolve=>setImmediate(resolve));
 assert.equal(resets,1);assert.equal(messages.some(m=>m.id===3),false);
 finish();await vm.runInContext('queue',context);assert.equal(resets,2);
 const writes=[],replies=[];let release;
 const io=vm.createContext({IndexedSaves:class{
  async write(n){writes.push(n);if(n===1)await new Promise(resolve=>release=resolve);if(n===2)throw Error('quota');return n;}
 },postMessage:m=>replies.push(m)});
 vm.runInContext(fs.readFileSync('src/save-worker.js','utf8').replace(/^import .*;\r?\n/gm,''),io);
 for(let n=1;n<=3;n++)io.onmessage({data:{id:n,method:'write',args:[n]}});
 await new Promise(resolve=>setImmediate(resolve));assert.deepEqual(writes,[1]);release();
 await vm.runInContext('queue',io);assert.deepEqual(writes,[1,2,3]);
 assert.deepEqual(replies.map(m=>m.ok),[true,false,true]);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {bridge} from '../src/wasm-bridge.js';
import {WATERWAYS} from '../src/waterway-data.js';
import {RIVAL_STARTS} from '../src/rival-starts.js';
const world=JSON.parse(fs.readFileSync('wasm-core/data/world.json'));
const retired=JSON.parse(fs.readFileSync('wasm-core/data/retired-waterway-catalog.json'));
const city=id=>world.cities.findIndex(c=>c.id===id);
const fixture=revision=>JSON.parse(gunzipSync(fs.readFileSync(`tests/fixtures/waterway-${revision===23?'baseline':'prototype'}-${revision}.json.gz`)));
const orderedRoute=r=>({buy_below:0,sell_above:0,...r,stops:[...r.stops].sort((a,b)=>world.cities[a].order-world.cities[b].order)});
const orderedShip=(s,routes)=>{if(s.route==null)return s;const r=routes.find(r=>r.id===s.route);return {...s,next:orderedRoute(r).stops.indexOf(r.stops[s.next])};};
async function engine(){const {instance}=await WebAssembly.instantiate(fs.readFileSync('assets/wasm/engine.wasm')),call=bridge(instance);return {cmd:command=>call({op:'command',command}),query:request=>call({op:'query',request}),save:()=>JSON.parse(call({op:'save'})),load:g=>call({op:'load',text:JSON.stringify(g)}),view:()=>call({op:'view'})};}

test('allowlist preserves the restored world and explicitly enabled river corridors',async()=>{
 assert.equal(world.cities.length,323);assert.equal(world.nations.length,52);assert.equal(world.roads.length,356);assert.equal(world.roads.filter(r=>!r.retired).length,330);
 assert.deepEqual(world.waterways.map(w=>w.id),Object.keys(WATERWAYS));assert.equal(city('sulina'),-1);assert.equal(city('shanghai'),320);
 const e=await engine();
 for(const [i,old] of retired.roads.entries())if([24,25].includes(old.retired_since)){
  const road=world.roads[i],allowed=world.waterways.some(w=>w.id===road.id);if(road.retired_since===27||road.retired_since===28)continue;
  assert.equal(road.retired===true,allowed,road.id);
  const q=e.query({query:'connection',stops:[road.a,road.b]});
  if(allowed)assert.deepEqual(q.types.filter(k=>!['wagon','caravan'].includes(k)),['sloop']);
  else {assert.ok(q.types.some(k=>['wagon','caravan'].includes(k)),road.id);assert.ok(!q.types.includes('sloop'),road.id);assert.equal(q.waterway,false);}
 }
 for(const ids of [['dresden','hamburg']])assert.ok(!e.query({query:'connection',stops:ids.map(city)}).types.includes('sloop'));
 for(const id of ['newyork','quebec'])assert.equal(world.cities[city(id)].inland,false);
 for(const id of ['albany','montreal'])assert.equal(world.cities[city(id)].inland,true);
 // Rivals again start with their original 3.3.10 transport types.
 for(const c of RIVAL_STARTS)assert.deepEqual(world.starts.find(x=>x.id===c.id).routes.map(r=>r.kind),c.routes.map(r=>r.kind));
});

test('released 3.3.10 saves require a new trading-post campaign',async()=>{
 const e=await engine(),before=e.save();assert.throws(()=>e.load(fixture(23)),/旧版セーブ/);assert.deepEqual(e.save(),before);
});

test('withdrawn waterway prototypes are rejected without modifying the current campaign',async()=>{
 const e=await engine(),before=e.save();for(const rev of [24,25]){assert.throws(()=>e.load(fixture(rev)),/旧版セーブ/);assert.deepEqual(e.save(),before);}
});

test('invalid prototype data is rejected before discarded cities, cargo or routes are removed',async()=>{
 const e=await engine(),old=fixture(25),before=e.save();
 for(const mutate of [g=>g.development[320].basis=-1,g=>g.markets.at(-1).stock=-1,g=>g.companies[0].ships[0].cargo[0].cost=-1,g=>g.companies[0].routes[0].auto_type='brig',g=>g.companies[0].routes[0].stops[0]=999,g=>g.roads[0].basis=-1,g=>g.city_version=31]){
  const bad=structuredClone(old);mutate(bad);assert.throws(()=>e.load(bad));assert.deepEqual(e.save(),before);
 }
});

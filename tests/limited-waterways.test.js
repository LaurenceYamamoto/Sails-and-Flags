import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {bridge} from '../src/wasm-bridge.js';
import {RIVAL_STARTS} from '../src/rival-starts.js';
const world=JSON.parse(fs.readFileSync('wasm-core/data/world.json'));
const retired=JSON.parse(fs.readFileSync('wasm-core/data/retired-waterway-catalog.json'));
const city=id=>world.cities.findIndex(c=>c.id===id);
const fixture=revision=>JSON.parse(gunzipSync(fs.readFileSync(`tests/fixtures/waterway-${revision===23?'baseline':'prototype'}-${revision}.json.gz`)));
async function engine(){const {instance}=await WebAssembly.instantiate(fs.readFileSync('assets/wasm/engine.wasm')),call=bridge(instance);return {cmd:command=>call({op:'command',command}),query:request=>call({op:'query',request}),save:()=>JSON.parse(call({op:'save'})),load:g=>call({op:'load',text:JSON.stringify(g)}),view:()=>call({op:'view'})};}

test('rollback restores the 3.3.10 world and all but two of the converted roads',async()=>{
 assert.equal(world.cities.length,320);assert.equal(world.nations.length,52);assert.equal(world.roads.length,353);assert.equal(world.roads.filter(r=>!r.retired).length,332);
 assert.deepEqual(world.waterways.map(w=>w.id),['newyork_albany','quebec_montreal']);assert.equal(city('sulina'),-1);assert.equal(city('shanghai'),-1);
 const e=await engine();
 for(const [i,old] of retired.roads.entries())if([24,25].includes(old.retired_since)){
  const road=world.roads[i],allowed=world.waterways.some(w=>w.id===road.id);
  assert.equal(road.retired===true,allowed,road.id);
  const q=e.query({query:'connection',stops:[road.a,road.b]});
  if(allowed)assert.deepEqual(q.types,['sloop']);
  else {assert.ok(q.types.some(k=>['wagon','caravan'].includes(k)),road.id);assert.ok(!q.types.includes('sloop'),road.id);assert.equal(q.waterway,false);}
 }
 for(const ids of [['dresden','hamburg'],['hankou','nanjing']])assert.ok(!e.query({query:'connection',stops:ids.map(city)}).types.includes('sloop'));
 for(const id of ['newyork','quebec'])assert.equal(world.cities[city(id)].inland,false);
 for(const id of ['albany','montreal'])assert.equal(world.cities[city(id)].inland,true);
 // Rivals again start with their original 3.3.10 transport types.
 for(const c of RIVAL_STARTS)assert.deepEqual(world.starts.find(x=>x.id===c.id).routes.map(r=>r.kind),c.routes.map(r=>r.kind));
});

test('actual released 3.3.10 save preserves unrelated land routes and refunds only the two exceptions',async()=>{
 const e=await engine(),old=fixture(23);e.load(old);const g=e.save();
 assert.equal(g.city_version,26);assert.equal(g.companies[0].cash,old.companies[0].cash+1350);assert.deepEqual(g.markets,old.markets);assert.deepEqual(g.development,old.development);assert.equal(g.rng,old.rng);
 assert.deepEqual(g.companies[0].routes,[old.companies[0].routes[1]]);assert.equal(g.companies[0].ships[0].route,null);assert.equal(g.companies[0].ships[0].kind,'caravan');
 e.load(g);assert.deepEqual(e.save(),g);
});

test('withdrawn revision 24/25 saves preserve ships, valid journeys and city capital without double refunds',async()=>{
 const e=await engine();for(const rev of [24,25]){
  const old=fixture(rev),co=old.companies[0];e.load(old);const g=e.save(),p=g.companies[0];
  assert.equal(g.city_version,26);assert.equal(p.cash,co.cash+123+(rev===25?4154:0));assert.equal(g.rng,old.rng);assert.equal(g.next_id,old.next_id);
  assert.deepEqual(g.markets,old.markets.slice(0,320*world.goods.length));assert.deepEqual(g.development,old.development.slice(0,320));
  const kept=co.routes.filter(r=>r.stops[0]===city('newyork')||r.stops[0]===city('london')||rev===24&&r.mode==='land');assert.deepEqual(p.routes,kept);
  assert.deepEqual(p.ships.map(s=>[s.id,s.kind,s.name]),co.ships.map(s=>[s.id,s.kind,s.name]));
  for(const c of g.companies)for(const s of c.ships){const before=old.companies.find(x=>x.id===c.id).ships.find(x=>x.id===s.id);if(before.route&&!c.routes.some(r=>r.id===before.route)){assert.equal(s.route,null);assert.equal(s.handling,null);assert.equal(s.voyage,null);assert.deepEqual(s.cargo,[]);}}
  for(const r of kept)assert.deepEqual(p.ships.filter(s=>s.route===r.id),co.ships.filter(s=>s.route===r.id));
  e.load(g);assert.deepEqual(e.save(),g);e.cmd({action:'tick',days:31});const ticked=e.save();e.load(ticked);assert.deepEqual(e.save(),ticked);
 }
});

test('invalid prototype data is rejected before discarded cities, cargo or routes are removed',async()=>{
 const e=await engine(),old=fixture(25),before=e.save();
 for(const mutate of [g=>g.development[320].basis=-1,g=>g.markets.at(-1).stock=-1,g=>g.companies[0].ships[0].cargo[0].cost=-1,g=>g.companies[0].routes[0].auto_type='brig',g=>g.companies[0].routes[0].stops[0]=999,g=>g.roads[0].basis=-1,g=>g.city_version=27]){
  const bad=structuredClone(old);mutate(bad);assert.throws(()=>e.load(bad));assert.deepEqual(e.save(),before);
 }
});

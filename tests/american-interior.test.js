import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {bridge} from '../src/wasm-bridge.js';
import {AMERICAN_INTERIOR_CITIES as C,AMERICAN_INTERIOR_ROADS as R} from '../src/american-interior-data.js';
import {landSegment,onLand} from '../src/world-geometry.js';
import {seaRoute} from '../src/sea-routing.js';
const w=JSON.parse(fs.readFileSync('wasm-core/data/world.json'));
const city=id=>w.cities.findIndex(c=>c.id===id),nation=id=>w.nations.findIndex(n=>n.id===id),good=id=>w.goods.findIndex(g=>g.id===id);
const display=c=>({x:c.displayX??c.x,y:c.displayY??c.y}),ll=p=>[p.x/2.5-180,90-p.y/2.5];
async function engine(){const {instance}=await WebAssembly.instantiate(fs.readFileSync('assets/wasm/engine.wasm'));const call=bridge(instance);return {cmd:command=>call({op:'command',command}),save:()=>JSON.parse(call({op:'save'})),load:g=>call({op:'load',text:JSON.stringify(g)})};}
function oldWorld(g){g.city_version=20;g.markets.length=310*w.goods.length;g.development.length=310;g.roads.length=342;return g;}

test('Vila Rica and Detroit are inland export markets with four land-only connections',()=>{
 assert.equal(w.cities.length,320);assert.equal(w.nations.length,52);assert.equal(w.roads.length,353);assert.equal(w.roads.filter(r=>!r.retired).length,334);
 assert.deepEqual(w.cities.slice(310,312).map(c=>c.id),Object.keys(C));assert.deepEqual(w.roads.slice(342,346).map(r=>r.id),Object.keys(R));
 const s=w.cities[city('santiagodechile')],v=w.cities[city('valparaiso')],minimum=Math.hypot(s.x-v.x,s.y-v.y);
 for(const [id,c]of Object.entries(C)){
  const d=w.cities[city(id)],p=display(d);assert.equal(d.nation,nation(c.nation));assert.equal(d.lon,c.lon);assert.equal(d.lat,c.lat);assert.equal(d.inland,true);assert.ok(onLand(ll(p)));assert.ok(d.demand.every(x=>x>0));
  for(const b of w.cities.filter(c=>c.id!==id)){const q=display(b);assert.ok(Math.hypot(p.x-q.x,p.y-q.y)>=minimum-1e-9,id+'/'+b.id);}
  for(const g of c.exports)assert.ok(d.supply[good(g)]>=3.2,id+'/'+g);
  for(const g of ['spices','coffee','tea'])assert.equal(d.supply[good(g)],0);
  assert.ok(w.distances[city(id)].every(x=>x===null));assert.equal(seaRoute(id,'london'),null);
 }
 assert.equal(w.cities[city('detroit')].supply[good('gold')],0);
 assert.ok(w.cities[city('vilarica')].supply[good('tools')]<.2);
 for(const r of w.roads.slice(342,346)){
  assert.ok(r.nations.includes(w.cities[r.a].nation)&&r.nations.includes(w.cities[r.b].nation));
  const ps=structuredClone(r.points);ps[0]=display(w.cities[r.a]);ps[ps.length-1]=display(w.cities[r.b]);
  for(let i=1;i<ps.length;i++)assert.ok(landSegment(ll(ps[i-1]),ll(ps[i])),r.id+' '+i);
 }
});

test('Version 20 saves retain existing game state and append two markets and four roads exactly once',async()=>{
 const e=await engine(),old=oldWorld(e.save());old.markets[0].stock+=23;old.roads[341].quality=3;e.load(old);const after=e.save();
 assert.equal(after.city_version,23);assert.deepEqual(oldWorld(structuredClone(after)),old);assert.equal(after.markets.length,320*w.goods.length);assert.equal(after.development.length,320);assert.equal(after.roads.length,353);
 e.load(after);assert.deepEqual(e.save(),after);
 for(const mutate of [g=>g.city_version=24,g=>g.markets.pop(),g=>g.development.pop(),g=>g.roads.pop()]){const bad=structuredClone(old);mutate(bad);assert.throws(()=>e.load(bad));assert.deepEqual(e.save(),after);}
 e.cmd({action:'tick',days:31});const saved=e.save();e.load(saved);assert.deepEqual(e.save(),saved);
});

test('All four routes deliver by caravan, enforce licences, support investment and save reload',async()=>{
 const e=await engine(),g=e.save();g.events_enabled=false;g.companies[0].cash+=1e9;g.companies[0].initial_cash+=1e9;e.load(g);
 const open=(ids,kind='caravan')=>e.cmd({action:'openRoute',kind,stops:ids.map(city),allowed:w.goods.map((_,i)=>i),margin:0});
 assert.throws(()=>open(['vilarica','rio']));e.cmd({action:'license',nation:nation('portugal')});open(['vilarica','rio']);open(['vilarica','saopaulo']);
 assert.throws(()=>open(['detroit','montreal']));e.cmd({action:'license',nation:nation('france')});open(['detroit','montreal']);assert.throws(()=>open(['detroit','albany']));e.cmd({action:'license',nation:nation('england')});open(['detroit','albany']);
 assert.throws(()=>open(['detroit','montreal'],'sloop'));assert.throws(()=>open(['vilarica','rio'],'sloop'));
 const road=w.roads.findIndex(r=>r.id==='detroit_albany');e.cmd({action:'buyRoad',road});e.cmd({action:'roadInvestment',road,roadBudget:10,securityBudget:0});
 for(let i=0;i<24;i++)e.cmd({action:'tick',days:31});const saved=e.save();assert.equal(saved.companies[0].routes.length,4);
 assert.ok(saved.companies[0].routes.every(r=>r.deliveries>0),JSON.stringify(saved.companies[0].routes.map(r=>({stops:r.stops,deliveries:r.deliveries}))));assert.ok(saved.roads[road].quality>0);assert.ok(saved.companies.slice(1).every(c=>c.routes.length<=50));e.load(saved);assert.deepEqual(e.save(),saved);
});

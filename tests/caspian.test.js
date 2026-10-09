import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {bridge} from '../src/wasm-bridge.js';
import {CASPIAN_CITIES as C,CASPIAN_ROADS as R} from '../src/caspian-data.js';
import {roadBetween} from '../src/land-data.js';
import {seaRoute} from '../src/sea-routing.js';
import {onLand,landSegment} from '../src/world-geometry.js';
const w=JSON.parse(fs.readFileSync('wasm-core/data/world.json'));
const city=id=>w.cities.findIndex(c=>c.id===id),nation=id=>w.nations.findIndex(n=>n.id===id);
const display=c=>({x:c.displayX??c.x,y:c.displayY??c.y}),ll=p=>[p.x/2.5-180,90-p.y/2.5];
async function engine(){const {instance}=await WebAssembly.instantiate(fs.readFileSync('assets/wasm/engine.wasm'));const call=bridge(instance);return {cmd:command=>call({op:'command',command}),save:()=>JSON.parse(call({op:'save'})),load:g=>call({op:'load',text:JSON.stringify(g)})};}
function oldWorld(g){g.city_version=19;g.markets.length=304*w.goods.length;g.development.length=304;g.roads.length=334;return g;}

test('Six land markets and eight roads connect the Caucasus, Caspian and Russia without crossing water',()=>{
 assert.equal(w.cities.length,320);assert.equal(w.nations.length,52);assert.equal(w.roads.length,353);assert.equal(w.roads.filter(r=>!r.retired).length,334);assert.equal(w.cities.filter(c=>!c.inland).length,139);
 assert.deepEqual(w.cities.slice(304,310).map(c=>c.id),Object.keys(C));assert.deepEqual(w.roads.slice(334,342).map(r=>r.id),Object.keys(R));
 const s=w.cities[city('santiagodechile')],v=w.cities[city('valparaiso')],minimum=Math.hypot(s.x-v.x,s.y-v.y);
 for(const [id,c]of Object.entries(C)){
  const d=w.cities[city(id)],a=display(d);assert.equal(d.nation,nation(c.nation));assert.equal(d.lon,c.lon);assert.equal(d.lat,c.lat);assert.equal(d.inland,true);assert.ok(onLand(ll(a)));assert.ok(d.demand.every(x=>x>0));
  for(const b of w.cities.filter(c=>c.id!==id)){const p=display(b);assert.ok(Math.hypot(a.x-p.x,a.y-p.y)>=minimum-1e-9,id+'/'+b.id);}
  for(const g of c.exports)assert.ok(d.supply[w.goods.findIndex(x=>x.id===g)]>=3.2,id+'/'+g);
  for(const g of ['spices','coffee','tea','cocoa'])assert.equal(d.supply[w.goods.findIndex(x=>x.id===g)],0,id+'/'+g);
  assert.ok(w.distances[city(id)].every(x=>x===null));assert.equal(seaRoute(id,'london'),null);
 }
 assert.equal(seaRoute('baku','astrakhan'),null);
 for(const r of w.roads.slice(334,342)){
  assert.ok(r.nations.includes(w.cities[r.a].nation)&&r.nations.includes(w.cities[r.b].nation));assert.ok(r.km<=2500);
  const ps=structuredClone(r.points);ps[0]=display(w.cities[r.a]);ps[ps.length-1]=display(w.cities[r.b]);
  for(let i=1;i<ps.length;i++)assert.ok(landSegment(ll(ps[i-1]),ll(ps[i])),r.id+' '+i);
 }
 for(const [a,b]of [['tiflis','moscow'],['yerevan','kyiv'],['tiflis','kyiv']])assert.equal(roadBetween(a,b),undefined);
});

test('Version 19 saves append only markets, development and roads; reload is idempotent and malformed saves fail',async()=>{
 const e=await engine(),old=oldWorld(e.save());old.markets[0].stock+=21;old.roads[333].quality=3;e.load(old);const after=e.save();
 assert.equal(after.city_version,23);assert.deepEqual(oldWorld(structuredClone(after)),old);assert.equal(after.markets.length,320*w.goods.length);assert.equal(after.roads.length,353);
 e.load(after);assert.deepEqual(e.save(),after);
 for(const mutate of [g=>g.city_version=24,g=>g.markets.pop(),g=>g.development.pop(),g=>g.roads.pop()]){const bad=structuredClone(old);mutate(bad);assert.throws(()=>e.load(bad));assert.deepEqual(e.save(),after);}
 e.cmd({action:'tick',days:31});const saved=e.save();e.load(saved);assert.deepEqual(e.save(),saved);
});

test('All eight roads and a Caucasus–Kyiv return itinerary deliver with licences, investment and save support',async()=>{
 const e=await engine(),g=e.save();g.events_enabled=false;g.companies[0].cash+=1e9;g.companies[0].initial_cash+=1e9;e.load(g);
 const open=(ids,kind='caravan')=>e.cmd({action:'openRoute',kind,stops:ids.map(city),allowed:w.goods.map((_,i)=>i),margin:0});
 assert.throws(()=>open(['tiflis','shamakhi']));e.cmd({action:'license',nation:nation('safavid')});assert.throws(()=>open(['derbent','astrakhan']));e.cmd({action:'license',nation:nation('russia')});
 for(const r of Object.values(R))open([r.a,r.b]);
 open(['tiflis','shamakhi','derbent','astrakhan','tsaritsyn','moscow','kyiv','moscow','tsaritsyn','astrakhan','derbent','shamakhi']);
 assert.throws(()=>open(['baku','astrakhan'],'sloop'));assert.throws(()=>open(['tiflis','moscow']));
 const road=w.roads.findIndex(r=>r.id==='derbent_astrakhan');e.cmd({action:'buyRoad',road});e.cmd({action:'roadInvestment',road,roadBudget:10,securityBudget:0});
 for(let i=0;i<24;i++)e.cmd({action:'tick',days:31});const saved=e.save();assert.equal(saved.companies[0].routes.length,9);
 assert.ok(saved.companies[0].routes.every(r=>r.deliveries>0),JSON.stringify(saved.companies[0].routes.map(r=>({stops:r.stops,deliveries:r.deliveries}))));assert.ok(saved.roads[road].quality>0);assert.ok(saved.companies.slice(1).every(c=>c.routes.length<=50));e.load(saved);assert.deepEqual(e.save(),saved);
});

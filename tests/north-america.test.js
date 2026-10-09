import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {bridge} from '../src/wasm-bridge.js';
import {NORTH_AMERICA_CITIES as C,NORTH_AMERICA_ROADS as R,NORTH_AMERICA_PORTS as P} from '../src/north-america-data.js';
import {landSegment,onLand,waterSegment} from '../src/world-geometry.js';
import {seaRoute,PORT_APPROACHES} from '../src/sea-routing.js';
const w=JSON.parse(fs.readFileSync('wasm-core/data/world.json'));
const city=id=>w.cities.findIndex(c=>c.id===id),nation=id=>w.nations.findIndex(n=>n.id===id),good=id=>w.goods.findIndex(g=>g.id===id);
const display=c=>({x:c.displayX??c.x,y:c.displayY??c.y}),ll=p=>[p.x/2.5-180,90-p.y/2.5];
async function engine(){const {instance}=await WebAssembly.instantiate(fs.readFileSync('assets/wasm/engine.wasm'));const call=bridge(instance);return {cmd:command=>call({op:'command',command}),save:()=>JSON.parse(call({op:'save'})),load:g=>call({op:'load',text:JSON.stringify(g)})};}
function oldWorld(g){g.city_version=21;g.markets.length=312*w.goods.length;g.development.length=312;g.roads.length=346;return g;}

test('Eight markets supply food, furs and silver, with seven land corridors and two ocean ports',()=>{
 assert.equal(w.cities.length,320);assert.equal(w.nations.length,52);assert.equal(w.roads.length,353);assert.equal(w.roads.filter(r=>!r.retired).length,334);assert.equal(w.cities.filter(c=>!c.inland).length,139);
 assert.deepEqual(w.cities.slice(312).map(c=>c.id),Object.keys(C));assert.deepEqual(w.roads.slice(346).map(r=>r.id),Object.keys(R));
 const s=w.cities[city('santiagodechile')],v=w.cities[city('valparaiso')],minimum=Math.hypot(s.x-v.x,s.y-v.y);
 for(const [id,c]of Object.entries(C)){
  const d=w.cities[city(id)],p=display(d);assert.equal(d.nation,nation(c.nation));assert.equal(d.lon,c.lon);assert.equal(d.lat,c.lat);assert.equal(d.inland,c.inland);assert.ok(onLand(ll(p)));assert.ok(d.demand.every(x=>x>0));
  for(const b of w.cities.filter(c=>c.id!==id)){const q=display(b);assert.ok(Math.hypot(p.x-q.x,p.y-q.y)>=minimum-1e-9,id+'/'+b.id);}
  for(const g of c.exports)assert.ok(d.supply[good(g)]>=3.2,id+'/'+g);
  for(const g of ['spices','coffee','tea'])assert.equal(d.supply[good(g)],0);
  if(c.inland){assert.ok(w.distances[city(id)].every(x=>x===null));assert.equal(seaRoute(id,'london'),null);}
 }
 for(const r of w.roads.slice(346)){
  assert.ok(r.nations.includes(w.cities[r.a].nation)&&r.nations.includes(w.cities[r.b].nation));
  const ps=structuredClone(r.points);ps[0]=display(w.cities[r.a]);ps[ps.length-1]=display(w.cities[r.b]);
  for(let i=1;i<ps.length;i++)assert.ok(landSegment(ll(ps[i-1]),ll(ps[i])),r.id+' '+i);
 }
});

test('Both new Atlantic ports reach all existing ports with symmetric water-only offshore paths',()=>{
 const segments=new Map();for(const id of Object.keys(P))for(const other of Object.keys(PORT_APPROACHES)){
  if(id===other)continue;const r=seaRoute(id,other),back=seaRoute(other,id);assert.ok(Number.isFinite(r.nm)&&r.nm>0);assert.equal(r.nm,back.nm);assert.deepEqual(r.coordinates,[...back.coordinates].reverse());
  assert.equal(w.distances[city(id)][city(other)],r.nm);
  for(let i=1;i<r.offshore.length;i++)segments.set(JSON.stringify([r.offshore[i-1],r.offshore[i]].sort()),[r.offshore[i-1],r.offshore[i]]);
 }for(const [key,[a,b]]of segments)assert.ok(waterSegment(a,b),key);
});

test('Version 21 saves append eight cities and seven roads without changing existing state',async()=>{
 const e=await engine(),old=oldWorld(e.save());old.markets[0].stock+=23;old.roads[345].quality=3;e.load(old);const after=e.save();
 assert.equal(after.city_version,23);assert.deepEqual(oldWorld(structuredClone(after)),old);assert.equal(after.markets.length,320*w.goods.length);assert.equal(after.development.length,320);assert.equal(after.roads.length,353);
 e.load(after);assert.deepEqual(e.save(),after);
 for(const mutate of [g=>g.city_version=24,g=>g.markets.pop(),g=>g.development.pop(),g=>g.roads.pop()]){const bad=structuredClone(old);mutate(bad);assert.throws(()=>e.load(bad));assert.deepEqual(e.save(),after);}
 e.cmd({action:'tick',days:31});const saved=e.save();e.load(saved);assert.deepEqual(e.save(),saved);
});

test('Seven roads, Atlantic shipping and complete inland itineraries deliver and restore',async()=>{
 const e=await engine(),g=e.save();g.events_enabled=false;g.companies[0].cash+=1e9;g.companies[0].initial_cash+=1e9;e.load(g);
 const open=(ids,kind='caravan')=>e.cmd({action:'openRoute',kind,stops:ids.map(city),allowed:w.goods.map((_,i)=>i),margin:0});
 assert.throws(()=>open(['detroit','vincennes']));e.cmd({action:'license',nation:nation('france')});
 for(const r of Object.values(R).filter(r=>r.nations.includes('france')))open([r.a,r.b]);
 assert.throws(()=>open(['zacatecas','durango']));e.cmd({action:'license',nation:nation('spain')});
 for(const r of Object.values(R).filter(r=>r.nations.includes('spain')))open([r.a,r.b]);
 assert.throws(()=>open(['louisbourg','london'],'brig'));e.cmd({action:'license',nation:nation('england')});open(['louisbourg','london'],'brig');open(['stjohns','london'],'brig');
 open(['detroit','vincennes','kaskaskia','neworleans','kaskaskia','vincennes']);
 open(['zacatecas','durango','chihuahua','elpasodelnorte','santafe','elpasodelnorte','chihuahua','durango']);
 assert.throws(()=>open(['detroit','vincennes'],'sloop'));assert.throws(()=>open(['louisbourg','stjohns']));
 const road=w.roads.findIndex(r=>r.id==='durango_chihuahua');e.cmd({action:'buyRoad',road});e.cmd({action:'roadInvestment',road,roadBudget:10,securityBudget:0});
 for(let i=0;i<24;i++)e.cmd({action:'tick',days:31});const saved=e.save();assert.equal(saved.companies[0].routes.length,11);
 assert.ok(saved.companies[0].routes.every(r=>r.deliveries>0),JSON.stringify(saved.companies[0].routes.map(r=>({stops:r.stops,deliveries:r.deliveries}))));assert.ok(saved.roads[road].quality>0);assert.ok(saved.companies.slice(1).every(c=>c.routes.length<=50));e.load(saved);assert.deepEqual(e.save(),saved);
});

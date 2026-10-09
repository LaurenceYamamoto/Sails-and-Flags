import {ROADS} from '../src/land-data.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {bridge} from '../src/wasm-bridge.js';
import {ASIA_CITIES,ASIA_PORTS,ASIA_ROADS} from '../src/asia-expansion-data.js';
import {CITIES,GOODS} from '../src/data.js';
import {roadPoints} from '../src/land-data.js';
import {landSegment,onLand,waterSegment} from '../src/world-geometry.js';
import {PORT_APPROACHES,seaRoute} from '../src/sea-routing.js';
import {trimLegacyNations} from './legacy-nations.js';
const w=JSON.parse(fs.readFileSync('wasm-core/data/world.json'));
const display=c=>({x:c.displayX??c.x,y:c.displayY??c.y});
const coordinate=p=>[p.x/2.5-180,90-p.y/2.5];
const city=id=>w.cities.findIndex(c=>c.id===id);
async function engine(){const {instance}=await WebAssembly.instantiate(fs.readFileSync('assets/wasm/engine.wasm'));const call=bridge(instance);return {call,cmd:command=>call({op:'command',command}),save:()=>JSON.parse(call({op:'save'})),load:g=>call({op:'load',text:JSON.stringify(g)})};}
function oldWorld(g){g.city_version=9;g.markets.length=228*w.goods.length;g.development.length=228;g.roads.length=225;trimLegacyNations(g);return g;}

test('Asia adds 24 distinct markets, 5 sea ports, 2 authorities and 49 land road definitions',()=>{
 assert.equal(Object.keys(ASIA_CITIES).length,24);assert.equal(Object.keys(ASIA_PORTS).length,5);assert.equal(Object.keys(ASIA_ROADS).length,49);
 assert.equal(w.cities.length,256);assert.equal(w.nations.length,44);assert.equal(w.roads.filter(r=>!r.retired).length,264);
 assert.deepEqual(w.cities.slice(228,252).map(c=>c.id),Object.keys(ASIA_CITIES));
 assert.equal(w.nations[w.cities[city('cochin')].nation].id,'netherlands');
 assert.equal(w.nations[w.cities[city('calicut')].nation].id,'calicut');assert.equal(w.nations[w.cities[city('madurai')].nation].id,'madurai');
 const s=w.cities[city('santiagodechile')],v=w.cities[city('valparaiso')],minimum=Math.hypot(s.x-v.x,s.y-v.y);
 for(const [id,c]of Object.entries(ASIA_CITIES)){
  assert.ok(CITIES[id].demand.every(x=>x>0),id);for(const good of c.exports)assert.ok(CITIES[id].supply[GOODS.findIndex(g=>g.id===good)]>=3.2,id+'/'+good);
  const a=display(w.cities[city(id)]);assert.ok(onLand(coordinate(a)),id);
  for(const b of w.cities.filter(c=>c.id!==id)){const p=display(b);assert.ok(Math.hypot(a.x-p.x,a.y-p.y)>=minimum-1e-9,id+'/'+b.id);}
  if(c.inland)assert.ok(w.distances[city(id)].every(d=>d===null),id);
 }
 assert.equal(CITIES.calicut.supply[GOODS.findIndex(g=>g.id==='tea')],0);assert.equal(CITIES.tianjin.supply[GOODS.findIndex(g=>g.id==='spices')],0);
 const connected=new Set([city('beijing'),city('delhi')]);let changed=true;while(changed){changed=false;for(const r of w.roads.filter(r=>!r.retired))if(connected.has(r.a)||connected.has(r.b))for(const c of [r.a,r.b])if(!connected.has(c)){connected.add(c);changed=true;}}
 for(const id of Object.keys(ASIA_CITIES))assert.ok(connected.has(city(id)),id+' disconnected');
 for(const [id,r]of Object.entries(ASIA_ROADS)){
  if(!ROADS[id])continue;
  assert.ok(r.km>0&&r.km<=2000,id+' range');assert.ok(r.nations.every(n=>w.nations.some(x=>x.id===n)),id+' license');
  const points=roadPoints(r.a,r.b);assert.deepEqual(roadPoints(r.b,r.a),points.toReversed());
  points[0]=display(w.cities[city(r.a)]);points[points.length-1]=display(w.cities[city(r.b)]);
  for(let i=1;i<points.length;i++)assert.ok(landSegment(coordinate(points[i-1]),coordinate(points[i])),id+' segment '+i);
 }
});

test('All five new ports connect to every existing port via symmetric water-only ocean paths',()=>{
 const segments=new Map();for(const id of Object.keys(ASIA_PORTS))for(const other of Object.keys(PORT_APPROACHES).filter(x=>x!==id)){
  const r=seaRoute(id,other),reverse=seaRoute(other,id);assert.ok(r&&r.nm>0,id+'/'+other);assert.equal(r.nm,reverse.nm);assert.deepEqual(r.coordinates,reverse.coordinates.toReversed());
  for(let i=1;i<r.offshore.length;i++)segments.set(JSON.stringify([r.offshore[i-1],r.offshore[i]].sort()),[r.offshore[i-1],r.offshore[i]]);
 }
 for(const [key,[a,b]]of segments)assert.ok(waterSegment(a,b),key);
});

test('3.3.4 saves append Asian markets and nations without changing old company state or RNG',async()=>{
 const e=await engine(),old=oldWorld(e.save());old.markets[0].stock+=17;old.roads[0].quality=2;old.pairs[0].relation=12;old.pairs[0].until=45;
 e.load(old);const after=e.save();assert.equal(after.city_version,13);assert.equal(after.markets.length,256*w.goods.length);assert.equal(after.roads.length,281);assert.equal(after.pairs.length,946);assert.deepEqual(oldWorld(structuredClone(after)),old);
 for(const c of after.companies){assert.deepEqual(c.friendship.slice(39),[60,60,60,60,60]);assert.deepEqual(c.diplomacy_budget.slice(39),[0,0,0,0,0]);}
 for(const change of [g=>g.city_version=14,g=>g.markets.pop(),g=>g.companies[0].friendship.pop(),g=>g.roads.pop()]){const bad=structuredClone(old);change(bad);assert.throws(()=>e.load(bad));assert.deepEqual(e.save(),after);}
 e.cmd({action:'tick',days:31});const saved=e.save();e.load(saved);assert.deepEqual(e.save(),saved);
});

test('New Chinese and Indian inland, coastal and cross-license routes operate and survive saves',async()=>{
 const e=await engine(),g=e.save();g.events_enabled=false;g.companies[0].cash+=1e9;g.companies[0].initial_cash+=1e9;e.load(g);
 for(const [kind,ids]of [['wagon',['foshan','guangzhou']],['caravan',['chengdu','chongqing']],['wagon',['benares','patna']],['caravan',['hyderabad','masulipatnam']],['caravan',['madurai','cochin']],['sloop',['calicut','cochin']]]){
  const stops=ids.map(city),q=e.call({op:'query',request:{query:'opening',kind,stops}});for(const nation of q.missing)e.cmd({action:'license',nation});
  e.cmd({action:'openRoute',kind,stops,allowed:w.goods.map((_,i)=>i),margin:0});
 }
 assert.throws(()=>e.cmd({action:'openRoute',kind:'sloop',stops:['chengdu','chongqing'].map(city),allowed:[4],margin:0}));
 for(let i=0;i<6;i++)e.cmd({action:'tick',days:31});const saved=e.save();assert.equal(saved.companies[0].routes.length,6);assert.ok(saved.companies[0].routes.every(r=>r.deliveries>0));assert.ok(saved.companies.slice(1).every(c=>c.routes.length<=50));e.load(saved);assert.deepEqual(e.save(),saved);
});

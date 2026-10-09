import {trimLegacyNations} from './legacy-nations.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {bridge} from '../src/wasm-bridge.js';
import {JAPAN_CITIES,JAPAN_PORTS,JAPAN_ROADS,JAPAN_APPROACHES,JAPAN_CONNECTIONS} from '../src/japan-expansion-data.js';
import {roadPoints,roadBetween} from '../src/land-data.js';
import {seaRoute} from '../src/sea-routing.js';
import {landSegment,waterSegment,onLand} from '../src/world-geometry.js';
const w=JSON.parse(fs.readFileSync('wasm-core/data/world.json'));
const city=id=>w.cities.findIndex(c=>c.id===id),japan=w.nations.findIndex(n=>n.id==='japan');
const display=c=>({x:c.displayX??c.x,y:c.displayY??c.y}),coordinate=p=>[p.x/2.5-180,90-p.y/2.5];
async function engine(){const {instance}=await WebAssembly.instantiate(fs.readFileSync('assets/wasm/engine.wasm'));const call=bridge(instance);return {call,cmd:command=>call({op:'command',command}),save:()=>JSON.parse(call({op:'save'})),load:g=>call({op:'load',text:JSON.stringify(g)})};}
function oldWorld(g){trimLegacyNations(g,48);g.city_version=16;g.markets.length=283*w.goods.length;g.development.length=283;g.roads.length=314;return g;}

test('Six Japanese markets have spaced land markers, regional production, demand and seven inland corridors',()=>{
 assert.equal(w.cities.length,320);assert.equal(w.roads.length,353);assert.equal(w.roads.filter(r=>!r.retired).length,334);assert.equal(w.nations.length,52);
 assert.deepEqual(w.cities.slice(283,289).map(c=>c.id),Object.keys(JAPAN_CITIES));assert.equal(w.cities.filter(c=>c.nation===japan).length,10);
 const s=w.cities[city('santiagodechile')],v=w.cities[city('valparaiso')],minimum=Math.hypot(s.x-v.x,s.y-v.y);
 for(const [id,c] of Object.entries(JAPAN_CITIES)){
  const d=w.cities[city(id)],a=display(d);assert.equal(d.nation,japan);assert.equal(d.inland,!JAPAN_PORTS[id]);assert.equal(d.lon,c.lon);assert.equal(d.lat,c.lat);assert.ok(d.demand.every(n=>n>0));
  for(const good of c.exports)assert.ok(d.supply[w.goods.findIndex(g=>g.id===good)]>=3.2,id+'/'+good);
  for(const good of ['spices','coffee','cocoa'])assert.equal(d.supply[w.goods.findIndex(g=>g.id===good)],0);
  assert.ok(onLand(coordinate(a)));for(const b of w.cities.filter(c=>c.id!==id)){const p=display(b);assert.ok(Math.hypot(a.x-p.x,a.y-p.y)>=minimum-1e-9,id+'/'+b.id);}
 }
 assert.equal(Object.keys(JAPAN_ROADS).length,7);
 for(const r of Object.values(JAPAN_ROADS)){
  const points=roadPoints(r.a,r.b);assert.deepEqual(roadPoints(r.b,r.a),points.toReversed());assert.deepEqual(r.nations,['japan']);
  points[0]=display(w.cities[city(r.a)]);points[points.length-1]=display(w.cities[city(r.b)]);
  for(let i=1;i<points.length;i++)assert.ok(landSegment(coordinate(points[i-1]),coordinate(points[i])),r.a+'/'+r.b+' segment '+i);
 }
 assert.equal(roadBetween('kyoto','edo'),undefined);for(const [a,b]of [['kyoto','nagoya'],['nagoya','sunpu'],['sunpu','edo']])assert.ok(roadBetween(a,b));
});

test('Hakata and Hiroshima attach through water-only approaches and connect to every existing port',()=>{
 const segments=new Map();
 for(const id of Object.keys(JAPAN_PORTS)){
  const p=JAPAN_APPROACHES[id];for(let i=1;i<p.length;i++)assert.ok(waterSegment(p[i-1],p[i]),id+' approach '+i);assert.ok(waterSegment(p.at(-1),JAPAN_CONNECTIONS[id][0]));
  for(const c of w.cities.filter(c=>!c.inland&&c.id!==id)){
   const r=seaRoute(id,c.id);assert.ok(r.nm>0);assert.equal(w.distances[city(id)][city(c.id)],r.nm);assert.deepEqual(seaRoute(c.id,id).coordinates,r.coordinates.toReversed());
   for(let i=1;i<r.offshore.length;i++)segments.set(JSON.stringify([r.offshore[i-1],r.offshore[i]].sort()),[r.offshore[i-1],r.offshore[i]]);
  }
 }
 for(const [key,p]of segments)assert.ok(waterSegment(...p),key);
 for(const id of ['nagoya','sunpu','kanazawa','sendai'])assert.equal(seaRoute(id,'osaka'),null);
});

test('City-version 16 saves append Japan while preserving every existing field and reject truncated or future saves',async()=>{
 const e=await engine(),old=oldWorld(e.save());old.markets[0].stock+=17;old.roads[313].quality=3;
 e.load(old);const after=e.save();assert.equal(after.city_version,23);assert.deepEqual(oldWorld(structuredClone(after)),old);e.load(after);assert.deepEqual(e.save(),after);
 for(const change of [g=>g.city_version=24,g=>g.markets.pop(),g=>g.development.pop(),g=>g.roads.pop()]){const bad=structuredClone(old);change(bad);assert.throws(()=>e.load(bad));assert.deepEqual(e.save(),after);}
 e.cmd({action:'tick',days:31});const saved=e.save();e.load(saved);assert.deepEqual(e.save(),saved);
});

test('All seven roads and two new ports deliver, require Japan licenses, support investment and survive saves',async()=>{
 const e=await engine(),g=e.save();g.events_enabled=false;g.companies[0].cash+=1e8;g.companies[0].initial_cash+=1e8;e.load(g);
 const open=(ids,kind='caravan')=>e.cmd({action:'openRoute',kind,stops:ids.map(city),allowed:w.goods.map((_,i)=>i),margin:0});
 assert.throws(()=>open(['kyoto','nagoya']));e.cmd({action:'license',nation:japan});
 for(const r of Object.values(JAPAN_ROADS))open([r.a,r.b]);for(const id of Object.keys(JAPAN_PORTS))open([id,'nagasaki'],'sloop');
 assert.throws(()=>open(['kyoto','edo']));assert.throws(()=>open(['nagoya','osaka'],'sloop'));
 const road=w.roads.findIndex(r=>r.id==='kyoto_nagoya');e.cmd({action:'buyRoad',road});e.cmd({action:'roadInvestment',road,roadBudget:10,securityBudget:0});
 for(let i=0;i<24;i++)e.cmd({action:'tick',days:31});const saved=e.save();assert.equal(saved.companies[0].routes.length,9);assert.ok(saved.companies[0].routes.every(r=>r.deliveries>0),JSON.stringify(saved.companies[0].routes.map(r=>({stops:r.stops,deliveries:r.deliveries}))));assert.ok(saved.roads[road].quality>0);assert.ok(saved.companies.slice(1).every(c=>c.routes.length<=50));e.load(saved);assert.deepEqual(e.save(),saved);
});

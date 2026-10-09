import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {bridge} from '../src/wasm-bridge.js';
import {INDOCHINA_CITIES,INDOCHINA_ROADS} from '../src/indochina-data.js';
import {CITIES,GOODS} from '../src/data.js';
import {PORT_APPROACHES,seaRoute} from '../src/sea-routing.js';
import {roadPoints} from '../src/land-data.js';
import {onLand,landSegment,waterSegment} from '../src/world-geometry.js';
import {trimLegacyNations} from './legacy-nations.js';
const w=JSON.parse(fs.readFileSync('wasm-core/data/world.json'));
const city=id=>w.cities.findIndex(c=>c.id===id);
const display=c=>({x:c.displayX??c.x,y:c.displayY??c.y});
const coordinate=p=>[p.x/2.5-180,90-p.y/2.5];
async function engine(){const {instance}=await WebAssembly.instantiate(fs.readFileSync('assets/wasm/engine.wasm'));const call=bridge(instance);return {call,cmd:command=>call({op:'command',command}),save:()=>JSON.parse(call({op:'save'})),load:g=>call({op:'load',text:JSON.stringify(g)})};}
function oldWorld(g){g.city_version=12;g.markets.length=252*w.goods.length;g.development.length=252;g.roads.length=276;trimLegacyNations(g,41);return g;}

test('Indochina has four spaced markets, distinct authorities and five land-only connections',()=>{
 assert.equal(w.cities.length,320);assert.equal(w.nations.length,52);assert.equal(w.roads.filter(r=>!r.retired).length,334);
 assert.deepEqual(w.cities.slice(252,256).map(c=>c.id),Object.keys(INDOCHINA_CITIES));
 assert.deepEqual(w.nations.slice(41,44).map(n=>n.id),['trinh','nguyen','cambodia']);
 const s=w.cities[city('santiagodechile')],v=w.cities[city('valparaiso')],minimum=Math.hypot(s.x-v.x,s.y-v.y);
 for(const [id,c]of Object.entries(INDOCHINA_CITIES)){
  const a=display(w.cities[city(id)]);assert.ok(onLand(coordinate(a)),id);assert.equal(c.inland,id!=='hoian');
  assert.equal(w.cities[city(id)].region,'southeastAsia');assert.equal(w.nations[w.cities[city(id)].nation].id,c.nation);
  for(const b of w.cities.filter(c=>c.id!==id)){const p=display(b);assert.ok(Math.hypot(a.x-p.x,a.y-p.y)>=minimum-1e-9,id+'/'+b.id);}
  assert.ok(CITIES[id].demand.every(x=>x>0));for(const good of c.exports)assert.ok(CITIES[id].supply[GOODS.findIndex(g=>g.id===good)]>=3.2,id+'/'+good);
  for(const good of ['coffee','cocoa','fur'])assert.equal(CITIES[id].supply[GOODS.findIndex(g=>g.id===good)],0);
  if(c.inland)assert.ok(w.distances[city(id)].every(d=>d===null));
 }
 for(const [id,r]of Object.entries(INDOCHINA_ROADS)){
  const points=roadPoints(r.a,r.b);assert.deepEqual(roadPoints(r.b,r.a),points.toReversed());
  points[0]=display(w.cities[city(r.a)]);points[points.length-1]=display(w.cities[city(r.b)]);
  for(let i=1;i<points.length;i++)assert.ok(landSegment(coordinate(points[i-1]),coordinate(points[i])),id+' segment '+i);
  for(const endpoint of [r.a,r.b])assert.ok(r.nations.includes(CITIES[endpoint].nation));
 }
});

test('Hoi An connects to every sea port with symmetric, water-only offshore paths',()=>{
 const segments=new Map();for(const other of Object.keys(PORT_APPROACHES).filter(x=>x!=='hoian')){
  const r=seaRoute('hoian',other),reverse=seaRoute(other,'hoian');assert.ok(r.nm>0);assert.equal(r.nm,reverse.nm);assert.deepEqual(r.coordinates,reverse.coordinates.toReversed());
  assert.equal(w.distances[city('hoian')][city(other)],r.nm);
  for(let i=1;i<r.offshore.length;i++)segments.set(JSON.stringify([r.offshore[i-1],r.offshore[i]].sort()),[r.offshore[i-1],r.offshore[i]]);
 }
 for(const [key,[a,b]]of segments)assert.ok(waterSegment(a,b),key);
 assert.equal(seaRoute('phohien','hoian'),null);
});

test('3.3.5 saves append Indochina without altering old assets, routes, markets, diplomacy or RNG',async()=>{
 const e=await engine(),old=oldWorld(e.save());old.markets[0].stock+=19;old.roads[0].quality=3;old.pairs[0].relation=10;old.pairs[0].until=35;
 e.load(old);const after=e.save();assert.equal(after.city_version,23);assert.equal(after.markets.length,320*w.goods.length);assert.equal(after.roads.length,353);assert.equal(after.pairs.length,1326);assert.deepEqual(oldWorld(structuredClone(after)),old);
 for(const c of after.companies){assert.deepEqual(c.friendship.slice(41),Array(7).fill(60));assert.deepEqual(c.diplomacy_budget.slice(41),Array(7).fill(0));}
 e.load(after);assert.deepEqual(e.save(),after);
 for(const change of [g=>g.city_version=24,g=>g.markets.pop(),g=>g.companies[0].friendship.pop(),g=>g.roads.pop()]){const bad=structuredClone(old);change(bad);assert.throws(()=>e.load(bad));assert.deepEqual(e.save(),after);}
 e.cmd({action:'tick',days:31});const saved=e.save();e.load(saved);assert.deepEqual(e.save(),saved);
});

test('Indochina license checks, land routes, Hoi An shipping and road development operate and save',async()=>{
 const e=await engine(),g=e.save();g.events_enabled=false;g.companies[0].cash+=1e9;g.companies[0].initial_cash+=1e9;
 // Both Phnom Penh and Ayutthaya export food/timber. Seed a temporary imported
 // cloth surplus to verify transport, without requiring every natural market to be profitable.
 const cloth=w.goods.findIndex(g=>g.id==='cloth');g.markets[city('phnompenh')*w.goods.length+cloth].stock=2000;g.markets[city('ayutthaya')*w.goods.length+cloth].stock=0;e.load(g);
 for(const [kind,ids]of [...Object.values(INDOCHINA_ROADS).map(r=>['caravan',[r.a,r.b]]),['brig',['hoian','manila']]]){
  const stops=ids.map(city),q=e.call({op:'query',request:{query:'opening',kind,stops}});
  if(q.missing.length)assert.throws(()=>e.cmd({action:'openRoute',kind,stops,allowed:[4],margin:0}));
  for(const nation of q.missing)e.cmd({action:'license',nation});
  e.cmd({action:'openRoute',kind,stops,allowed:w.goods.map((_,i)=>i),margin:0});
 }
 assert.throws(()=>e.cmd({action:'openRoute',kind:'brig',stops:['phnompenh','hoian'].map(city),allowed:[4],margin:0}));
 const road=w.roads.findIndex(r=>r.id==='thanglong_phohien');e.cmd({action:'buyRoad',road});e.cmd({action:'roadInvestment',road,roadBudget:10,securityBudget:0});
 for(let i=0;i<12;i++)e.cmd({action:'tick',days:31});const saved=e.save();assert.equal(saved.companies[0].routes.length,6);assert.ok(saved.companies[0].routes.every(r=>r.deliveries>0),JSON.stringify(saved.companies[0].routes.map(r=>({stops:r.stops,deliveries:r.deliveries}))));assert.ok(saved.roads[road].quality>0);assert.ok(saved.companies.slice(1).every(c=>c.routes.length<=50));e.load(saved);assert.deepEqual(e.save(),saved);
});

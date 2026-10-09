import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {bridge} from '../src/wasm-bridge.js';
import {CENTRAL_ASIA_CITIES,CENTRAL_ASIA_ROADS} from '../src/central-asia-data.js';
import {CITIES,GOODS} from '../src/data.js';
import {roadPoints} from '../src/land-data.js';
import {onLand,landSegment} from '../src/world-geometry.js';
import {trimLegacyNations} from './legacy-nations.js';
const w=JSON.parse(fs.readFileSync('wasm-core/data/world.json'));
const city=id=>w.cities.findIndex(c=>c.id===id),nation=id=>w.nations.findIndex(n=>n.id===id);
const display=c=>({x:c.displayX??c.x,y:c.displayY??c.y});
const coordinate=p=>[p.x/2.5-180,90-p.y/2.5];
async function engine(){const {instance}=await WebAssembly.instantiate(fs.readFileSync('assets/wasm/engine.wasm'));const call=bridge(instance);return {call,cmd:command=>call({op:'command',command}),save:()=>JSON.parse(call({op:'save'})),load:g=>call({op:'load',text:JSON.stringify(g)})};}
function oldWorld(g){g.city_version=13;g.markets.length=256*w.goods.length;g.development.length=256;g.roads.length=281;trimLegacyNations(g,44);return g;}

test('Nine Central Asian cities have oasis markets, spaced land positions and Dzungar Kashgar',()=>{
 assert.equal(w.cities.length,274);assert.equal(w.nations.length,48);assert.equal(w.roads.length,303);assert.equal(w.roads.filter(r=>!r.retired).length,286);
 assert.deepEqual(w.cities.slice(256,265).map(c=>c.id),Object.keys(CENTRAL_ASIA_CITIES));
 assert.deepEqual(w.nations.slice(44).map(n=>n.id),['bukhara','khiva','kazakh','dzungar']);
 assert.equal(w.nations[w.cities[city('kashgar')].nation].nameEn,'Dzungar Khanate');
 assert.equal(w.cities[city('kashgar')].nation,nation('dzungar'));
 assert.ok(w.regions.some(r=>r.id==='centralAsia'&&r.name==='中央アジア'));
 const s=w.cities[city('santiagodechile')],v=w.cities[city('valparaiso')],minimum=Math.hypot(s.x-v.x,s.y-v.y);
 for(const [id,c]of Object.entries(CENTRAL_ASIA_CITIES)){
  const a=display(w.cities[city(id)]);assert.ok(onLand(coordinate(a)),id);assert.equal(c.inland,true);assert.ok(w.distances[city(id)].every(d=>d===null));
  for(const b of w.cities.filter(c=>c.id!==id)){const p=display(b);assert.ok(Math.hypot(a.x-p.x,a.y-p.y)>=minimum-1e-9,id+'/'+b.id);}
  assert.ok(CITIES[id].demand.every(x=>x>0));for(const good of c.exports)assert.ok(CITIES[id].supply[GOODS.findIndex(g=>g.id===good)]>=3.2,id+'/'+good);
  for(const good of ['tea','spices','coffee','cocoa','fur','porcelain'])assert.equal(CITIES[id].supply[GOODS.findIndex(g=>g.id===good)],0,id+'/'+good);
 }
});

test('All twelve caravan corridors stay on land and connect Persia, India, Russia and Kashgar',()=>{
 assert.equal(Object.keys(CENTRAL_ASIA_ROADS).length,12);
 const connected=new Set(['isfahan']);let changed=true;while(changed){changed=false;for(const r of Object.values(CENTRAL_ASIA_ROADS))if(connected.has(r.a)||connected.has(r.b))for(const id of [r.a,r.b])if(!connected.has(id)){connected.add(id);changed=true;}}
 for(const id of [...Object.keys(CENTRAL_ASIA_CITIES),'lahore','kazan'])assert.ok(connected.has(id),id);
 for(const [id,r]of Object.entries(CENTRAL_ASIA_ROADS)){
  assert.ok(r.km>0&&r.km<=2500);const points=roadPoints(r.a,r.b);assert.deepEqual(roadPoints(r.b,r.a),points.toReversed());
  points[0]=display(w.cities[city(r.a)]);points[points.length-1]=display(w.cities[city(r.b)]);
  for(let i=1;i<points.length;i++)assert.ok(landSegment(coordinate(points[i-1]),coordinate(points[i])),id+' segment '+i);
  for(const endpoint of [r.a,r.b])assert.ok(r.nations.includes(CITIES[endpoint].nation));
  assert.deepEqual(w.roads.find(x=>x.id===id).nations,r.nations.map(nation));
 }
 assert.equal(CENTRAL_ASIA_ROADS.khiva_kazan.climate,'arid');assert.equal(CENTRAL_ASIA_ROADS.tashkent_kashgar.terrain,'mountain');
});

test('3.3.6 saves append Central Asia while preserving all old state and rejecting malformed/future saves',async()=>{
 const e=await engine(),old=oldWorld(e.save());old.markets[0].stock+=17;old.roads[0].quality=3;old.pairs[0].relation=12;old.pairs[0].until=31;
 e.load(old);const after=e.save();assert.equal(after.city_version,15);assert.equal(after.markets.length,274*w.goods.length);assert.equal(after.roads.length,303);assert.equal(after.pairs.length,1128);assert.deepEqual(oldWorld(structuredClone(after)),old);
 for(const c of after.companies){assert.deepEqual(c.friendship.slice(44),[60,60,60,60]);assert.deepEqual(c.diplomacy_budget.slice(44),[0,0,0,0]);}
 e.load(after);assert.deepEqual(e.save(),after);
 for(const change of [g=>g.city_version=16,g=>g.markets.pop(),g=>g.companies[0].friendship.pop(),g=>g.roads.pop()]){const bad=structuredClone(old);change(bad);assert.throws(()=>e.load(bad));assert.deepEqual(e.save(),after);}
 e.cmd({action:'tick',days:31});const saved=e.save();e.load(saved);assert.deepEqual(e.save(),saved);
});

test('Central Asian routes enforce transit licenses/range, transport goods and retain investments and saves',async()=>{
 const e=await engine(),g=e.save();g.events_enabled=false;g.companies[0].cash+=1e9;g.companies[0].initial_cash+=1e9;e.load(g);
 for(const r of Object.values(CENTRAL_ASIA_ROADS)){
  const stops=[r.a,r.b].map(city),q=e.call({op:'query',request:{query:'opening',kind:'caravan',stops}});
  assert.deepEqual([...q.missing].sort(),r.nations.map(nation).sort());
  assert.throws(()=>e.cmd({action:'openRoute',kind:'caravan',stops,allowed:[4],margin:0}));
 }
 // Qing cannot substitute for Dzungar authority on the Kashgar corridor.
 for(const id of ['kazakh','bukhara','qing'])e.cmd({action:'license',nation:nation(id)});
 const stops=['tashkent','kashgar'].map(city);assert.deepEqual(e.call({op:'query',request:{query:'opening',kind:'caravan',stops}}).missing,[nation('dzungar')]);
 assert.throws(()=>e.cmd({action:'openRoute',kind:'caravan',stops,allowed:[4],margin:0}));
 for(const ids of [['tashkent','kashgar'],['bukhara','samarkand'],['herat','balkh'],['kabul','lahore'],['khiva','kazan']]){
  const stops=ids.map(city);for(const n of e.call({op:'query',request:{query:'opening',kind:'caravan',stops}}).missing)e.cmd({action:'license',nation:n});
  e.cmd({action:'openRoute',kind:'caravan',stops,allowed:w.goods.map((_,i)=>i),margin:0});
 }
 assert.throws(()=>e.cmd({action:'openRoute',kind:'wagon',stops:['khiva','kazan'].map(city),allowed:[4],margin:0}));
 assert.throws(()=>e.cmd({action:'openRoute',kind:'brig',stops,allowed:[4],margin:0}));
 const road=w.roads.findIndex(r=>r.id==='tashkent_kashgar');e.cmd({action:'buyRoad',road});e.cmd({action:'roadInvestment',road,roadBudget:10,securityBudget:0});
 for(let i=0;i<24;i++)e.cmd({action:'tick',days:31});const saved=e.save();assert.equal(saved.companies[0].routes.length,5);assert.ok(saved.companies[0].routes.every(r=>r.deliveries>0),JSON.stringify(saved.companies[0].routes.map(r=>({stops:r.stops,deliveries:r.deliveries}))));assert.ok(saved.roads[road].quality>0);assert.ok(saved.companies.slice(1).every(c=>c.routes.length<=50));e.load(saved);assert.deepEqual(e.save(),saved);
});

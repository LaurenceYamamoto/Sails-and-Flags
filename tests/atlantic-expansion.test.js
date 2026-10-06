import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {CITIES,NATIONS,GOODS} from '../src/data.js';
import {ROADS} from '../src/land-data.js';
import {ATLANTIC_CITIES,ATLANTIC_NATIONS,ATLANTIC_PORTS,ATLANTIC_ROADS} from '../src/atlantic-expansion-data.js';
import {seaRoute,PORT_APPROACHES,waterSegment,onLand} from '../src/sea-routing.js';
import {project} from '../src/geography.js';
import {bridge} from '../src/wasm-bridge.js';
const world=JSON.parse(fs.readFileSync('wasm-core/data/world.json'));
async function engine(){const {instance}=await WebAssembly.instantiate(fs.readFileSync('assets/wasm/engine.wasm'));const call=bridge(instance);return {call,cmd:command=>call({op:'command',command}),save:()=>JSON.parse(call({op:'save'})),load:g=>call({op:'load',text:JSON.stringify(g)}),data:call({op:'catalog'})};}

test('Atlantic expansion supplies 74 regional cities and viable sea or road access',()=>{
 assert.equal(Object.keys(ATLANTIC_CITIES).length,74);assert.equal(Object.keys(ATLANTIC_NATIONS).length,8);assert.equal(Object.keys(ATLANTIC_ROADS).length,101);
 assert.equal(world.cities.length,227);assert.equal(world.nations.length,39);assert.equal(world.roads.length,224);assert.equal(world.cities.filter(c=>!c.inland).length,123);
 const counts={};for(const [id,c]of Object.entries(ATLANTIC_CITIES)){
  counts[c.marketRegion]=(counts[c.marketRegion]??0)+1;assert.ok(NATIONS[c.nation]);assert.ok(CITIES[id].demand.every(x=>x>0),id);
  assert.ok(c.exports.every(g=>GOODS.some(x=>x.id===g)),id+' export');
  assert.ok(!c.inland||Object.values(ROADS).some(r=>r.a===id||r.b===id),id+' inaccessible');
  if(c.marketRegion==='westEurope'||c.marketRegion==='scandinavia'||c.marketRegion==='balkans')assert.equal(CITIES[id].supply[GOODS.findIndex(g=>g.id==='spices')],0);
 }
 assert.deepEqual(counts,{westEurope:28,balkans:5,scandinavia:5,africa:16,americas:20});
 for(const r of Object.values(ATLANTIC_ROADS)){assert.ok(CITIES[r.a]&&CITIES[r.b]);assert.ok(r.km>0&&r.km<=2500);assert.ok(r.nations.every(n=>NATIONS[n]));for(const id of [r.a,r.b])assert.ok(r.nations.includes(CITIES[id].nation));}
 assert.equal(CITIES.edinburgh.nation,'scotland');assert.equal(CITIES.milan.nation,'spain');assert.equal(CITIES.rome.inland,true);assert.equal(CITIES.christiania.nation,'denmark');assert.equal(CITIES.guatemala.lon,-90.73);
});

test('New city display positions stay on land and maintain the Santiago–Valparaiso gap without changing geography',()=>{
 const get=id=>world.cities.find(c=>c.id===id),s=get('santiagodechile'),v=get('valparaiso'),min=Math.hypot(s.x-v.x,s.y-v.y);
 const display=c=>c.id==='lima'?{x:c.x+1.7,y:c.y-1.7}:{x:c.displayX??c.x,y:c.displayY??c.y};
 for(const c of world.cities.slice(135)){
  assert.deepEqual({x:c.x,y:c.y},project(c.lon,c.lat));const p=display(c);assert.ok(onLand([p.x/2.5-180,90-p.y/2.5]),c.id);
  assert.ok(Math.hypot(p.x-c.x,p.y-c.y)<=3,c.id+' displaced too far');
  for(const b of world.cities)if(c.id!==b.id){const q=display(b);assert.ok(Math.hypot(p.x-q.x,p.y-q.y)>=min-1e-9,c.id+' / '+b.id);}
 }
});

test('Every new port reaches the world on water and symmetric distances',()=>{
 const segments=new Map();for(const id of Object.keys(ATLANTIC_PORTS))for(const other of Object.keys(PORT_APPROACHES)){
  if(id===other)continue;const r=seaRoute(id,other);assert.ok(r.nm>0&&Number.isFinite(r.nm),id+' / '+other);assert.equal(r.nm,seaRoute(other,id).nm);
  assert.deepEqual(r.coordinates[0],[CITIES[id].lon,CITIES[id].lat]);
  for(let i=1;i<r.offshore.length;i++)segments.set(JSON.stringify([r.offshore[i-1],r.offshore[i]].sort()),[r.offshore[i-1],r.offshore[i]]);
 }
 for(const [key,[a,b]]of segments)assert.ok(waterSegment(a,b),key);
 assert.ok(seaRoute('bordeaux','nantes').nm<1800);assert.ok(seaRoute('bristol','cork').nm<1800);assert.ok(seaRoute('athens','bordeaux').nm>seaRoute('athens','naples').nm);
});

function oldWorld(g){g.city_version=3;g.markets.length=135*world.goods.length;g.development.length=135;g.roads.length=101;g.pairs=g.pairs.filter(p=>p.b<31);for(const c of g.companies){c.friendship.length=31;c.diplomacy_budget.length=31;c.trade.length=31;}return g;}
test('3.3.1 migration appends markets and authorities without changing existing gameplay state',async()=>{
 const e=await engine(),old=oldWorld(e.save());old.markets[0].stock+=23;old.roads[0].quality=2;old.pairs[0].until=old.day+60;old.pairs[0].relation=10;
 e.load(old);const migrated=e.save();assert.equal(migrated.city_version,8);assert.equal(migrated.development.length,227);assert.equal(migrated.roads.length,224);assert.equal(migrated.pairs.length,741);assert.deepEqual(oldWorld(structuredClone(migrated)),old);
 for(const c of migrated.companies){assert.ok(c.friendship.slice(31).every(x=>x===60));assert.ok(c.diplomacy_budget.slice(31).every(x=>x===0));}
 for(const mutate of [g=>g.markets.pop(),g=>g.roads.push(g.roads[0]),g=>g.companies[0].friendship.pop(),g=>g.pairs[0].b=31,g=>g.city_version=9]){const bad=structuredClone(old);mutate(bad);assert.throws(()=>e.load(bad));assert.deepEqual(e.save(),migrated);}
 e.cmd({action:'tick',days:31});e.load(e.save());
});

test('New western, Balkan, Scandinavian, African and American routes operate',async()=>{
 for(const [kind,ids]of [['wagon',['bordeaux','toulouse']],['wagon',['florence','rome']],['caravan',['sarajevo','ragusa']],['wagon',['christiania','gothenburg']],['caravan',['gondar','massawa']],['caravan',['accra','benin']],['wagon',['philadelphia','annapolis']],['caravan',['arequipa','lapaz']],['sloop',['bristol','cork']],['sloop',['recife','salvador']]]){
  const e=await engine(),g=e.save();g.companies[0].cash+=1e9;g.companies[0].initial_cash+=1e9;e.load(g);
  const stops=ids.map(id=>e.data.cities.findIndex(c=>c.id===id)),q=e.call({op:'query',request:{query:'opening',kind,stops}});for(const nation of q.missing)e.cmd({action:'license',nation});
  e.cmd({action:'openRoute',kind,stops,allowed:e.data.goods.map((_,i)=>i),margin:10});e.cmd({action:'tick',days:90});assert.equal(e.save().companies[0].routes.length,1,ids.join('/'));const saved=e.save();e.load(saved);assert.deepEqual(e.save(),saved);
 }
});

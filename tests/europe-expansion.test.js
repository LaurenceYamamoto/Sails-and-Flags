import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {CITIES,NATIONS,GOODS} from '../src/data.js';
import {ROADS} from '../src/land-data.js';
import {EUROPE_PORTS,EUROPE_INLAND,EUROPE_NATIONS,EUROPE_ROADS} from '../src/europe-expansion-data.js';
import {seaRoute,PORT_APPROACHES,waterSegment} from '../src/sea-routing.js';
import {bridge} from '../src/wasm-bridge.js';
const ids=[...Object.keys(EUROPE_PORTS),...Object.keys(EUROPE_INLAND)];
async function engine(){const {instance}=await WebAssembly.instantiate(fs.readFileSync('assets/wasm/engine.wasm'));const call=bridge(instance);return {call,cmd:command=>call({op:'command',command}),save:()=>JSON.parse(call({op:'save'})),load:g=>call({op:'load',text:JSON.stringify(g)}),data:call({op:'catalog'})};}
test('European cities have connected roads, suitable markets, historical authorities and sufficient map separation',()=>{
 assert.equal(ids.length,19);assert.equal(Object.keys(EUROPE_NATIONS).length,8);assert.equal(Object.keys(EUROPE_ROADS).length,32);
 const reference=Math.hypot(CITIES.santiagodechile.x-CITIES.valparaiso.x,CITIES.santiagodechile.y-CITIES.valparaiso.y);
 const reached=new Set(['paris']);for(let changed=true;changed;){changed=false;for(const r of Object.values(ROADS))if(reached.has(r.a)||reached.has(r.b))for(const id of [r.a,r.b])if(!reached.has(id)){reached.add(id);changed=true;}}
 for(const id of ids){const c=CITIES[id];assert.ok(reached.has(id),id+' disconnected');assert.ok(NATIONS[c.nation]);assert.equal(!!c.inland,!!EUROPE_INLAND[id]);assert.equal(c.supply[GOODS.findIndex(g=>g.id==='spices')],0);assert.ok(c.demand.every(x=>x>0));assert.ok(c.supply.some(x=>x>=3.2));
  for(const [other,b]of Object.entries(CITIES))if(other!==id)assert.ok(Math.hypot(c.x-b.x,c.y-b.y)>=reference,id+' / '+other);
 }
 assert.equal(CITIES.breslau.nation,'habsburg');assert.equal(CITIES.gdansk.nation,'poland');assert.equal(CITIES.konigsberg.nation,'brandenburg');assert.equal(CITIES.belgrade.nation,'ottoman');
 for(const r of Object.values(EUROPE_ROADS)){assert.ok(r.km>0&&r.nations.every(n=>NATIONS[n]));assert.ok(r.nations.includes(CITIES[r.a].nation)&&r.nations.includes(CITIES[r.b].nation));}
});
test('North Sea and Baltic ports reach all ports without land-crossing offshore paths',()=>{
 const segments=new Map();for(const id of Object.keys(EUROPE_PORTS))for(const other of Object.keys(PORT_APPROACHES)){if(id===other)continue;const r=seaRoute(id,other);assert.ok(r.nm>0);assert.equal(r.nm,seaRoute(other,id).nm);for(let i=1;i<r.offshore.length;i++)segments.set(JSON.stringify([r.offshore[i-1],r.offshore[i]].sort()),[r.offshore[i-1],r.offshore[i]]);}
 for(const [key,[a,b]]of segments)assert.ok(waterSegment(a,b),key);
 assert.ok(seaRoute('hamburg','gdansk').nm>seaRoute('hamburg','amsterdam').nm,'Baltic service must go around Denmark');
});
test('3.3.0 world migration preserves existing balances, routes, investments, wars and RNG',async()=>{
 const e=await engine();const old=e.save();old.markets[0].stock+=123;old.roads[0].quality=2;old.city_version=2;old.markets.length=116*e.data.goods.length;old.development.length=116;old.roads.length=69;old.pairs=old.pairs.filter(p=>p.b<23);for(const c of old.companies){c.friendship.length=23;c.diplomacy_budget.length=23;c.trade.length=23;c.friendship_history=c.friendship_history.filter(h=>h.nation<23);}
 old.pairs[0].until=old.day+60;old.pairs[0].relation=12;
 e.load(old);const migrated=e.save();assert.equal(migrated.city_version,15);assert.equal(migrated.development.length,274);assert.equal(migrated.roads.length,303);assert.equal(migrated.pairs.length,48*47/2);
 const back=structuredClone(migrated);back.city_version=2;back.markets.length=old.markets.length;back.development.length=116;back.roads.length=69;back.pairs=back.pairs.filter(p=>p.b<23);for(const c of back.companies){c.friendship.length=23;c.diplomacy_budget.length=23;c.trade.length=23;}assert.deepEqual(back,old);
 for(const c of migrated.companies){assert.ok(c.friendship.slice(23).every(x=>x===60));assert.ok(c.diplomacy_budget.slice(23).every(x=>x===0));}
 for(const mutate of [g=>g.companies[0].friendship.push(60),g=>g.roads.pop(),g=>g.pairs[0].b=30,g=>g.city_version=16]){const bad=structuredClone(old);mutate(bad);assert.throws(()=>e.load(bad));assert.deepEqual(e.save(),migrated);}
 e.cmd({action:'tick',days:31});e.load(e.save());
});
test('European sea and land routes operate and survive a save round trip',async()=>{
 const e=await engine(),g=e.save();g.companies[0].cash+=1e9;g.companies[0].initial_cash+=1e9;e.load(g);
 const city=id=>e.data.cities.findIndex(c=>c.id===id);
 for(const [kind,names]of [['wagon',['leipzig','dresden']],['wagon',['prague','vienna','buda','vienna']],['sloop',['hamburg','amsterdam']],['sloop',['gdansk','konigsberg']]]){
  const stops=names.map(city),q=e.call({op:'query',request:{query:'opening',kind,stops}});for(const nation of q.missing)e.cmd({action:'license',nation});e.cmd({action:'openRoute',kind,stops,allowed:e.data.goods.map((_,i)=>i),margin:10});
 }
 e.cmd({action:'tick',days:180});assert.equal(e.save().companies[0].routes.length,4);const saved=e.save();e.load(saved);assert.deepEqual(e.save(),saved);
 for(const id of ids){const v=e.call({op:'view',city:city(id)});assert.ok(v.market.every(m=>m.demand>0),id);}
});

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {CITIES,GOODS} from '../src/data.js';
import {PORT_APPROACHES,seaRoute,waterSegment,onLand} from '../src/sea-routing.js';
import {roadBetween} from '../src/land-data.js';
import {bridge} from '../src/wasm-bridge.js';
const w=JSON.parse(fs.readFileSync('wasm-core/data/world.json'));
async function engine(){const {instance}=await WebAssembly.instantiate(fs.readFileSync('assets/wasm/engine.wasm'));const call=bridge(instance);return {call,cmd:command=>call({op:'command',command}),save:()=>JSON.parse(call({op:'save'})),load:g=>call({op:'load',text:JSON.stringify(g)})};}

test('Taranto is a Spanish port with a Naples road, suitable markets and enough map spacing',()=>{
 const c=w.cities.find(c=>c.id==='taranto');assert.equal(c.id,'taranto');assert.equal(w.cities.length,228);assert.equal(w.cities.filter(c=>!c.inland).length,123);assert.equal(w.roads.filter(r=>!r.retired).length,216);
 assert.equal(w.nations[c.nation].id,'spain');assert.ok(CITIES.taranto.demand.every(n=>n>0));for(const id of ['food','oliveOil'])assert.ok(CITIES.taranto.supply[GOODS.findIndex(g=>g.id===id)]>=3.2);assert.equal(CITIES.taranto.supply[GOODS.findIndex(g=>g.id==='spices')],0);
 assert.equal(roadBetween('taranto','naples')[0],'naples_taranto');assert.ok(onLand([c.displayX/2.5-180,90-c.displayY/2.5]));const s=w.cities.find(c=>c.id==='santiagodechile'),v=w.cities.find(c=>c.id==='valparaiso'),min=Math.hypot(s.x-v.x,s.y-v.y);
 for(const b of w.cities.filter(c=>c.id!=='taranto')){const p=b.id==='lima'?{x:b.x+1.7,y:b.y-1.7}:{x:b.displayX??b.x,y:b.displayY??b.y};assert.ok(Math.hypot(c.displayX-p.x,c.displayY-p.y)>=min-1e-9,b.id);}
});

test('Taranto reaches every port by symmetric water-only offshore routes',()=>{
 const segments=new Map();for(const id of Object.keys(PORT_APPROACHES).filter(id=>id!=='taranto')){const r=seaRoute('taranto',id),reverse=seaRoute(id,'taranto');assert.ok(Number.isFinite(r.nm)&&r.nm>0);assert.equal(r.nm,reverse.nm);assert.deepEqual(r.coordinates,reverse.coordinates.toReversed());for(let i=1;i<r.offshore.length;i++)segments.set(JSON.stringify([r.offshore[i-1],r.offshore[i]].sort()),[r.offshore[i-1],r.offshore[i]]);}
 for(const [key,[a,b]]of segments)assert.ok(waterSegment(a,b),key);assert.ok(seaRoute('taranto','naples').nm<=1800);
});

test('Version 7 saves gain Taranto without changing existing markets, roads, companies or RNG',async()=>{
 const e=await engine(),old=e.save();old.city_version=7;old.markets.length=226*w.goods.length;old.development.length=226;old.roads.length=223;old.markets[0].stock+=19;e.load(old);const after=e.save();assert.equal(after.city_version,9);assert.equal(after.development.length,228);assert.equal(after.roads.length,225);const back=structuredClone(after);back.city_version=7;back.markets.length=old.markets.length;back.development.length=226;back.roads.length=223;assert.deepEqual(back,old);
});

test('Naples–Taranto land and sea routes both operate with the Spanish license',async()=>{
 const e=await engine(),g=e.save();g.companies[0].cash+=1e6;g.companies[0].initial_cash+=1e6;e.load(g);const nation=w.nations.findIndex(n=>n.id==='spain'),stops=['naples','taranto'].map(id=>w.cities.findIndex(c=>c.id===id));e.cmd({action:'license',nation});
 for(const kind of ['caravan','sloop'])e.cmd({action:'openRoute',kind,stops,allowed:w.goods.map((_,i)=>i),margin:0});
 for(let i=0;i<6;i++)e.cmd({action:'tick',days:31});const after=e.save();assert.equal(after.companies[0].routes.length,2);assert.deepEqual(after.companies[0].licenses,[nation]);assert.ok(after.companies[0].routes.some(r=>r.deliveries>0));e.load(after);assert.deepEqual(e.save(),after);
});

import {trimLegacyNations} from './legacy-nations.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {CITIES,GOODS} from '../src/data.js';
import {FRENCH_CARIBBEAN_PORTS as ports,FRENCH_CARIBBEAN_APPROACHES as approaches,FRENCH_CARIBBEAN_ROADS as roads} from '../src/french-caribbean-data.js';
import {PORT_APPROACHES,seaRoute,waterSegment,onLand} from '../src/sea-routing.js';
import {bridge} from '../src/wasm-bridge.js';
const w=JSON.parse(fs.readFileSync('wasm-core/data/world.json'));
async function engine(){const {instance}=await WebAssembly.instantiate(fs.readFileSync('assets/wasm/engine.wasm'));const call=bridge(instance);return {call,cmd:command=>call({op:'command',command}),save:()=>JSON.parse(call({op:'save'})),load:g=>call({op:'load',text:JSON.stringify(g)}),data:call({op:'catalog'})};}

test('Three French Caribbean ports have usable markets, national colors and appropriate display separation',()=>{
 assert.equal(w.cities.length,320);assert.equal(w.cities.filter(c=>!c.inland).length,139);assert.equal(w.roads.length,353);assert.equal(w.nations.length,52);
 assert.deepEqual(w.cities.slice(223,226).map(c=>c.id),['neworleans','portauprince','saintpierre']);const get=id=>w.cities.find(c=>c.id===id),s=get('santiagodechile'),v=get('valparaiso'),min=Math.hypot(s.x-v.x,s.y-v.y);
 for(const [id,c]of Object.entries(ports)){const d=get(id);assert.equal(w.nations[d.nation].id,'france');assert.equal(d.inland,false);assert.ok(CITIES[id].demand.every(n=>n>0));for(const g of c.exports)assert.ok(CITIES[id].supply[GOODS.findIndex(x=>x.id===g)]>=3.2);assert.ok(onLand([d.displayX/2.5-180,90-d.displayY/2.5]));
  for(const b of w.cities)if(b.id!==id){const q=b.id==='lima'?{x:b.x+1.7,y:b.y-1.7}:{x:b.displayX??b.x,y:b.displayY??b.y};assert.ok(Math.hypot(d.displayX-q.x,d.displayY-q.y)>=min-1e-9,id+' / '+b.id);}
 }
 assert.equal(CITIES.saintpierre.lon,-61.175);assert.deepEqual(roads.portauprince_santodomingo.nations,['france','spain']);
});

test('French ports reach every port by symmetric sea routes and Port-au-Prince avoids Gonave',()=>{
 const segments=new Map();for(const id of Object.keys(ports))for(const other of Object.keys(PORT_APPROACHES)){
  if(id===other)continue;const r=seaRoute(id,other),rev=seaRoute(other,id);assert.ok(r.nm>0&&Number.isFinite(r.nm));assert.equal(r.nm,rev.nm);assert.deepEqual(r.coordinates,[...rev.coordinates].reverse());
  for(let i=1;i<r.offshore.length;i++)segments.set(JSON.stringify([r.offshore[i-1],r.offshore[i]].sort()),[r.offshore[i-1],r.offshore[i]]);
 }
 for(const [key,[a,b]]of segments)assert.ok(waterSegment(a,b),key);
 for(let i=1;i<approaches.portauprince.length;i++)assert.ok(waterSegment(approaches.portauprince[i-1],approaches.portauprince[i]));
 assert.ok(seaRoute('neworleans','portauprince').nm<=1800);assert.ok(seaRoute('portauprince','saintpierre').nm<=1800);
 assert.ok(seaRoute('neworleans','havana').coordinates.length>approaches.neworleans.length,'Mississippi approach included');
});

test('223-city saves gain only the French port markets, development and roads',async()=>{
 const e=await engine(),old=e.save();old.city_version=5;trimLegacyNations(old);old.markets.length=223*e.data.goods.length;old.development.length=223;old.roads.length=219;old.markets[0].stock+=18;e.load(old);const after=e.save();assert.equal(after.city_version,23);assert.equal(after.development.length,320);assert.equal(after.roads.length,353);
 const back=structuredClone(after);back.city_version=5;trimLegacyNations(back);back.markets.length=old.markets.length;back.development.length=223;back.roads.length=219;assert.deepEqual(back,old);
 for(const change of [g=>g.city_version=24,g=>g.markets.pop(),g=>g.roads.pop()]){const bad=structuredClone(old);change(bad);assert.throws(()=>e.load(bad));assert.deepEqual(e.save(),after);}
 e.cmd({action:'tick',days:31});e.load(e.save());
});

test('France-only Caribbean sea routes and Franco-Spanish land connections operate and restore',async()=>{
 const e=await engine(),g=e.save();g.companies[0].cash+=1e6;g.companies[0].initial_cash+=1e6;e.load(g);const city=id=>e.data.cities.findIndex(c=>c.id===id),france=e.data.nations.findIndex(n=>n.id==='france');
 const newRoute=(kind,ids)=>{const stops=ids.map(city),q=e.call({op:'query',request:{query:'opening',kind,stops}});for(const nation of q.missing)e.cmd({action:'license',nation});e.cmd({action:'openRoute',kind,stops,allowed:e.data.goods.map((_,i)=>i),margin:10});};
 newRoute('sloop',['neworleans','portauprince']);newRoute('sloop',['portauprince','saintpierre']);assert.deepEqual(e.save().companies[0].licenses,[france]);
 for(const r of Object.values(roads))newRoute('caravan',[r.a,r.b]);
 for(let i=0;i<6;i++)e.cmd({action:'tick',days:31});const saved=e.save();assert.equal(saved.companies[0].routes.length,4);assert.ok(saved.companies[0].routes.some(r=>r.deliveries>0));assert.ok(saved.markets.every(m=>Number.isFinite(m.stock)&&m.stock>=0));e.load(saved);assert.deepEqual(e.save(),saved);
});

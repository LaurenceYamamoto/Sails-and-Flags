import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {bridge} from '../src/wasm-bridge.js';
import {TRADE_HUB_CITIES as C,TRADE_HUB_NATIONS as N,TRADE_HUB_ROADS as R,TRADE_HUB_PORTS as P,TRADE_HUB_APPROACHES as A,TRADE_HUB_CONNECTIONS as X} from '../src/trade-hubs-data.js';
import {seaRoute} from '../src/sea-routing.js';
import {roadPoints} from '../src/land-data.js';
import {onLand,landSegment,waterSegment} from '../src/world-geometry.js';
import {trimLegacyNations} from './legacy-nations.js';
const w=JSON.parse(fs.readFileSync('wasm-core/data/world.json'));
const city=id=>w.cities.findIndex(c=>c.id===id),nation=id=>w.nations.findIndex(n=>n.id===id),good=id=>w.goods.findIndex(g=>g.id===id);
const display=c=>({x:c.displayX??c.x,y:c.displayY??c.y}),ll=p=>[p.x/2.5-180,90-p.y/2.5];
async function engine(){const {instance}=await WebAssembly.instantiate(fs.readFileSync('assets/wasm/engine.wasm'));const call=bridge(instance);return {cmd:command=>call({op:'command',command}),save:()=>JSON.parse(call({op:'save'})),load:g=>call({op:'load',text:JSON.stringify(g)})};}
function oldWorld(g){g.city_version=17;g.markets.length=289*w.goods.length;g.development.length=289;g.roads.length=321;trimLegacyNations(g,48);return g;}

test('Fifteen hubs preserve geographic coordinates, have spaced land markers and differentiated economies',()=>{
 assert.equal(w.cities.length,320);assert.equal(w.nations.length,52);assert.equal(w.roads.length,353);assert.equal(w.roads.filter(r=>!r.retired).length,334);assert.equal(w.cities.filter(c=>!c.inland).length,139);
 assert.deepEqual(w.cities.slice(289,304).map(c=>c.id),Object.keys(C));assert.deepEqual(w.nations.slice(48).map(n=>n.id),Object.keys(N));
 const s=w.cities[city('santiagodechile')],v=w.cities[city('valparaiso')],minimum=Math.hypot(s.x-v.x,s.y-v.y);
 for(const [id,c]of Object.entries(C)){
  const d=w.cities[city(id)],a=display(d);assert.equal(d.nation,nation(c.nation));assert.equal(d.lon,c.lon);assert.equal(d.lat,c.lat);assert.equal(d.inland,!P[id]);assert.ok(onLand(ll(a)));assert.ok(d.demand.every(n=>n>0));
  for(const b of w.cities.filter(c=>c.id!==id)){const p=display(b);assert.ok(Math.hypot(a.x-p.x,a.y-p.y)>=minimum-1e-9,id+'/'+b.id);}
  for(const g of c.exports)assert.ok(d.supply[good(g)]>=3.2,id+'/'+g);
  if(!['ambon','bandaneira'].includes(id))assert.equal(d.supply[good('spices')],0);
 }
 const mecca=w.cities[city('mecca')],medina=w.cities[city('medina')],jeddah=w.cities[city('jeddah')];
 assert.ok(mecca.supply.every(n=>n<=.1));assert.ok(mecca.demand[good('food')]>jeddah.demand[good('food')]);assert.ok(medina.supply[good('food')]>=3.2);
 for(const id of ['mecca','medina','jeddah','suakin'])for(const g of ['spices','coffee','silk','timber'])assert.equal(w.cities[city(id)].supply[good(g)],0,id+'/'+g);
});

test('All eleven roads remain on land including display offsets; six ports connect through water to every port',()=>{
 assert.equal(Object.keys(R).length,11);
 for(const r of Object.values(R)){
  assert.ok(r.nations.includes(C[r.a]?.nation??w.nations[w.cities[city(r.a)].nation].id));assert.ok(r.nations.includes(C[r.b]?.nation??w.nations[w.cities[city(r.b)].nation].id));
  const ps=roadPoints(r.a,r.b);ps[0]=display(w.cities[city(r.a)]);ps[ps.length-1]=display(w.cities[city(r.b)]);
  for(let i=1;i<ps.length;i++)assert.ok(landSegment(ll(ps[i-1]),ll(ps[i])),r.a+'/'+r.b+' '+i);
 }
 const edges=new Map();
 for(const id of Object.keys(P)){
  const ps=[...A[id],...X[id]];for(let i=1;i<ps.length;i++)assert.ok(waterSegment(ps[i-1],ps[i]),id+' '+i);
  for(const c of w.cities.filter(c=>!c.inland&&c.id!==id)){
   const r=seaRoute(id,c.id);assert.ok(r.nm>0);assert.equal(w.distances[city(id)][city(c.id)],r.nm);assert.deepEqual(seaRoute(c.id,id).coordinates,r.coordinates.toReversed());
   for(let i=1;i<r.offshore.length;i++)edges.set(JSON.stringify([r.offshore[i-1],r.offshore[i]].sort()),[r.offshore[i-1],r.offshore[i]]);
  }
 }
 for(const [key,ps]of edges)assert.ok(waterSegment(...ps),key);
 for(const id of Object.keys(C).filter(id=>!P[id]))assert.equal(seaRoute(id,'jeddah'),null);
});

test('Version 17 saves append cities, roads and four authorities without changing old state; migration is idempotent',async()=>{
 const e=await engine(),old=oldWorld(e.save());old.markets[0].stock+=17;old.roads[320].quality=3;old.companies[0].friendship[47]=77;e.load(old);
 const after=e.save();assert.equal(after.city_version,23);assert.deepEqual(oldWorld(structuredClone(after)),old);assert.equal(after.pairs.length,1326);
 for(const co of after.companies){assert.deepEqual(co.friendship.slice(48),[60,60,60,60]);assert.deepEqual(co.diplomacy_budget.slice(48),[0,0,0,0]);}
 e.load(after);assert.deepEqual(e.save(),after);
 for(const change of [g=>g.city_version=24,g=>g.markets.pop(),g=>g.roads.pop(),g=>g.pairs.pop(),g=>g.companies[0].friendship.pop()]){const bad=structuredClone(old);change(bad);assert.throws(()=>e.load(bad));assert.deepEqual(e.save(),after);}
});

test('Every new road and port operates, enforces licences, delivers cargo and survives save/load',async()=>{
 const e=await engine(),g=e.save();g.events_enabled=false;g.companies[0].cash+=1e10;g.companies[0].initial_cash+=1e10;e.load(g);
 const open=(ids,kind='caravan')=>e.cmd({action:'openRoute',kind,stops:ids.map(city),allowed:w.goods.map((_,i)=>i),margin:0});
 assert.throws(()=>open(['syriam','ava']));e.cmd({action:'license',nation:nation('air')});assert.throws(()=>open(['agadez','kano']));
 for(const id of ['burma','mughal','safavid','arma','kano','funj','ottoman','netherlands','portugal'])e.cmd({action:'license',nation:nation(id)});
 for(const r of Object.values(R))open([r.a,r.b]);
 for(const [a,b]of [['ambon','batavia'],['bandaneira','batavia'],['syriam','goa'],['lahoribandar','goa'],['jeddah','goa'],['suakin','jeddah']])open([a,b],'brig');
 assert.throws(()=>open(['mecca','jeddah'],'sloop'));
 const road=w.roads.findIndex(r=>r.id==='agadez_kano');e.cmd({action:'buyRoad',road});e.cmd({action:'roadInvestment',road,roadBudget:10,securityBudget:0});
 for(let i=0;i<24;i++)e.cmd({action:'tick',days:31});const saved=e.save();assert.equal(saved.companies[0].routes.length,17);
 assert.ok(saved.companies[0].routes.every(r=>r.deliveries>0),JSON.stringify(saved.companies[0].routes.map(r=>({cities:r.stops.map(i=>w.cities[i].id),deliveries:r.deliveries}))));
 assert.ok(saved.roads[road].quality>0);assert.ok(saved.companies.slice(1).every(c=>c.routes.length<=50));e.load(saved);assert.deepEqual(e.save(),saved);
});

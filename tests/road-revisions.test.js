import {trimLegacyNations} from './legacy-nations.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {bridge} from '../src/wasm-bridge.js';
import {ROADS,ROAD_SLOTS,roadBetween,roadPoints} from '../src/land-data.js';
import {RETIRED_ROADS,ADDED_ROADS} from '../src/road-revisions.js';

async function engine(){const {instance}=await WebAssembly.instantiate(fs.readFileSync('assets/wasm/engine.wasm'));const call=bridge(instance);return {call,cmd:command=>call({op:'command',command}),save:()=>JSON.parse(call({op:'save'})),load:g=>call({op:'load',text:JSON.stringify(g)}),data:call({op:'catalog'}),view:()=>call({op:'view'})};}
function fund(e){const g=e.save();g.companies[0].cash+=1e8;g.companies[0].initial_cash+=1e8;e.load(g);}
function open(e,ids){const stops=ids.map(id=>e.data.cities.findIndex(c=>c.id===id));const q=e.call({op:'query',request:{query:'opening',kind:'caravan',stops}});for(const nation of q.missing)e.cmd({action:'license',nation});return e.cmd({action:'openRoute',kind:'caravan',stops,allowed:e.data.goods.map((_,i)=>i),margin:0});}

test('Deleted roads cannot be selected, opened or invested in; new Spanish links work in both directions',async()=>{
 const e=await engine();fund(e);assert.equal(Object.keys(ROADS).length,303);assert.equal(e.view().roads.length,303);assert.equal(e.data.roads.length,321);
 for(const id of RETIRED_ROADS){const r=ROAD_SLOTS[id],i=e.data.roads.findIndex(d=>d.id===id);assert.ok(e.data.roads[i].retired);assert.ok(!e.view().roads.some(d=>d.index===i));assert.equal(ROADS[id],undefined);
  for(const [a,b] of [[r.a,r.b],[r.b,r.a]]){assert.equal(roadBetween(a,b),undefined);assert.deepEqual(roadPoints(a,b),[]);assert.throws(()=>open(e,[a,b]));}
  assert.throws(()=>e.cmd({action:'buyRoad',road:i}));assert.throws(()=>e.cmd({action:'roadInvestment',road:i,roadBudget:10,securityBudget:0}));
 }
 assert.equal(roadBetween('madrid','bordeaux'),undefined);assert.equal(roadBetween('madrid','paris'),undefined);
 for(const [id,r]of Object.entries(ADDED_ROADS)){assert.equal(roadBetween(r.b,r.a)[0],id);assert.deepEqual(roadPoints(r.b,r.a),roadPoints(r.a,r.b).toReversed());const route=open(e,[r.a,r.b]);assert.equal(open(e,[r.b,r.a]),route);const i=e.data.roads.findIndex(d=>d.id===id);e.cmd({action:'buyRoad',road:i});e.cmd({action:'roadInvestment',road:i,roadBudget:1,securityBudget:1});}
 for(const ids of [['quito','guayaquil','trujillo','lima','trujillo','guayaquil'],['lima','cusco','arequipa','cusco'],['lisbon','coimbra','porto','coimbra'],['cadiz','seville','madrid','seville']])open(e,ids);
 for(let i=0;i<4;i++)e.cmd({action:'tick',days:31});const g=e.save();assert.equal(g.city_version,17);e.load(g);assert.deepEqual(e.save(),g);
 for(const c of g.companies)for(const r of c.routes)if(r.mode==='land')for(let i=0;i<r.stops.length;i++)assert.ok(roadBetween(e.data.cities[r.stops[i]].id,e.data.cities[r.stops[(i+1)%r.stops.length]].id));
});

test('Old roads migrate for player and rivals: idle, loading, traveling and unloading vehicles are retained and refunded once',async()=>{
 const e=await engine();fund(e);open(e,['lima','cusco']);const keep=e.save().companies[0].routes[0].id;
 for(const nation of ['france','frankfurt','portugal'])e.cmd({action:'license',nation:e.data.nations.findIndex(n=>n.id===nation)});
 const old=e.save();old.city_version=6;trimLegacyNations(old);old.roads.length=221;old.markets.length=226*e.data.goods.length;old.development.length=226;
 const template=old.companies[0].routes[0],vehicle=old.companies[0].ships[0],refunds=new Map(),removedShips=[];
 for(const [k,id]of RETIRED_ROADS.entries()){
  const i=e.data.roads.findIndex(d=>d.id===id),d=e.data.roads[i],ci=k%2,c=old.companies[ci];c.licenses=[...new Set([...c.licenses,...old.companies[0].licenses])];
  const r=structuredClone(template);r.id=old.next_id++;r.stops=[d.a,d.b];c.routes.push(r);
  const s=structuredClone(vehicle);s.id=old.next_id++;s.route=r.id;s.next=0;s.cargo=[];s.handling=null;s.voyage=null;
  let cargoCost=0;if(k%4!==0){cargoCost=123;s.cargo=[{good:0,quantity:10,cost:cargoCost}];const trip={from:d.a,to:d.b,total:10,remaining:10,original_cost:cargoCost,upkeep:0};
   if(k%4===2)s.voyage=trip;else{s.handling={rate:5,unloading:k%4===3,total:2,remaining:1,trip};if(s.handling.unloading){s.next=1;trip.remaining=0;}}
  }c.ships.push(s);removedShips.push([ci,s.id]);Object.assign(old.roads[i],{owner:c.id,basis:2000,pool:17,road_budget:2,security_budget:3,quality:4,security:5});refunds.set(ci,(refunds.get(ci)??0)+2017+cargoCost);
 }
 const unaffected=e.data.roads.findIndex(d=>d.id==='lima_cusco');old.roads[unaffected].quality=9;
 e.load(old);const after=e.save();assert.equal(after.city_version,17);assert.equal(after.roads.length,321);assert.deepEqual(after.markets.slice(0,old.markets.length),old.markets);assert.equal(after.seed,old.seed);assert.deepEqual(after.roads[unaffected],old.roads[unaffected]);
 assert.deepEqual(after.companies[0].routes.find(r=>r.id===keep),template);
 for(const [ci,amount]of refunds){assert.equal(after.companies[ci].cash,old.companies[ci].cash+amount);assert.equal(after.companies[ci].totals.retiredRoadRefund,amount);}
 for(const [ci,id]of removedShips){const s=after.companies[ci].ships.find(s=>s.id===id);assert.equal(s.route,null);assert.equal(s.voyage,null);assert.equal(s.handling,null);assert.deepEqual(s.cargo,[]);}
 for(const id of RETIRED_ROADS){const r=after.roads[e.data.roads.findIndex(d=>d.id===id)];assert.equal(r.owner,'state');assert.equal(r.road_budget+r.security_budget+r.basis+r.pool+r.quality+r.security,0);}
 e.load(after);assert.deepEqual(e.save(),after);
 const bad=structuredClone(old);bad.companies[0].ships.at(-1).cargo=[{good:999,quantity:1,cost:1}];assert.throws(()=>e.load(bad));assert.deepEqual(e.save(),after);
 const forged=structuredClone(after);forged.roads[e.data.roads.findIndex(d=>d.id===RETIRED_ROADS[0])].owner='player';assert.throws(()=>e.load(forged));assert.deepEqual(e.save(),after);
 e.cmd({action:'tick',days:31});e.load(e.save());
});

test('Version 6 saves append new roads and Taranto without changing existing markets, ownership, RNG or companies',async()=>{
 const e=await engine(),old=e.save();old.city_version=6;trimLegacyNations(old);old.roads.length=221;old.markets.length=226*e.data.goods.length;old.development.length=226;const i=e.data.roads.findIndex(d=>d.id==='lima_cusco');old.roads[i].quality=7;e.load(old);const after=e.save();assert.equal(after.city_version,17);assert.equal(after.roads.length,321);const back=structuredClone(after);back.city_version=6;trimLegacyNations(back);back.roads.length=221;back.markets.length=old.markets.length;back.development.length=226;assert.deepEqual(back,old);
});

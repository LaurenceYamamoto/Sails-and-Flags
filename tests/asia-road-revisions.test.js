import {trimLegacyNations} from './legacy-nations.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {bridge} from '../src/wasm-bridge.js';
import {ASIA_RETIRED_ROADS,ASIA_ADDED_ROADS,ASIA_FURTHER_RETIRED_ROADS} from '../src/asia-road-revisions.js';
import {roadBetween,roadPoints} from '../src/land-data.js';
import {landSegment} from '../src/world-geometry.js';
async function engine(){const {instance}=await WebAssembly.instantiate(fs.readFileSync('assets/wasm/engine.wasm'));const call=bridge(instance);return {call,cmd:command=>call({op:'command',command}),save:()=>JSON.parse(call({op:'save'})),load:g=>call({op:'load',text:JSON.stringify(g)}),data:call({op:'catalog'}),view:()=>call({op:'view'})};}
function oldAsia(g){g.markets.length=252*20;g.development.length=252;g.roads.length=276;trimLegacyNations(g,41);return g;}
function fund(e){const g=e.save();g.companies[0].cash+=1e8;g.companies[0].initial_cash+=1e8;e.load(g);}
function open(e,a,b){const stops=[a,b].map(id=>e.data.cities.findIndex(c=>c.id===id));for(const nation of e.call({op:'query',request:{query:'opening',kind:'caravan',stops}}).missing)e.cmd({action:'license',nation});return e.cmd({action:'openRoute',kind:'caravan',stops,allowed:e.data.goods.map((_,i)=>i),margin:0});}

test('Six Asian roads are retired in both directions; Bombay coastal land routes avoid water and deliver',async()=>{
 const e=await engine();fund(e);assert.equal(e.data.roads.length,281);assert.equal(e.view().roads.length,264);
 assert.equal(roadBetween('ahmedabad','delhi'),undefined);assert.equal(roadBetween('ahmedabad','agra'),undefined);
 for(const id of ASIA_RETIRED_ROADS){const i=e.data.roads.findIndex(r=>r.id===id),r=e.data.roads[i];assert.equal(r.retired_since,11);assert.equal(r.retired,true);assert.ok(!e.view().roads.some(r=>r.index===i));
  for(const [a,b]of [[r.a,r.b],[r.b,r.a]]){const from=e.data.cities[a].id,to=e.data.cities[b].id;assert.equal(roadBetween(from,to),undefined);assert.deepEqual(roadPoints(from,to),[]);assert.throws(()=>open(e,from,to));}
  assert.throws(()=>e.cmd({action:'buyRoad',road:i}));assert.throws(()=>e.cmd({action:'roadInvestment',road:i,roadBudget:1,securityBudget:0}));
 }
 for(const [id,r]of Object.entries(ASIA_ADDED_ROADS)){
  const points=roadPoints(r.a,r.b),coords=points.map(p=>[p.x/2.5-180,90-p.y/2.5]);for(let i=1;i<coords.length;i++)assert.ok(landSegment(coords[i-1],coords[i]),id);
  assert.deepEqual(roadPoints(r.b,r.a),points.toReversed());const route=open(e,r.a,r.b);assert.equal(open(e,r.b,r.a),route);
 }
 for(let i=0;i<6;i++)e.cmd({action:'tick',days:31});const g=e.save();assert.equal(g.city_version,13);assert.ok(g.companies[0].routes.every(r=>r.deliveries>0));e.load(g);assert.deepEqual(e.save(),g);
 const qing=g.companies.find(c=>c.name==='清国商人');assert.ok(qing.routes.length>0);for(const r of qing.routes.filter(r=>r.mode==='land'))for(let i=0;i<r.stops.length;i++)assert.ok(roadBetween(e.data.cities[r.stops[i]].id,e.data.cities[r.stops[(i+1)%r.stops.length]].id));
});

test('Version 10 retirement preserves idle, loading, moving and unloading fleets and refunds player/rivals exactly once',async()=>{
 const e=await engine();fund(e);open(e,'surat','ahmedabad');e.cmd({action:'license',nation:e.data.nations.findIndex(n=>n.id==='qing')});
 const old=oldAsia(e.save());old.city_version=10;old.roads.length=274;const template=structuredClone(old.companies[0].routes[0]),vehicle=old.companies[0].ships[0],refunds=new Map(),ships=[];
 for(const [k,id]of ASIA_RETIRED_ROADS.entries()){
  const ri=e.data.roads.findIndex(r=>r.id===id),d=e.data.roads[ri],ci=k%2,c=old.companies[ci];c.licenses=[...new Set([...c.licenses,...d.nations])];
  const route=structuredClone(template);route.id=old.next_id++;route.stops=[d.a,d.b];c.routes.push(route);
  const s=structuredClone(vehicle);s.id=old.next_id++;s.route=route.id;s.next=0;s.cargo=[];s.voyage=null;s.handling=null;let cost=0;
  if(k%4!==0){cost=123;s.cargo=[{good:0,quantity:10,cost}];const trip={from:d.a,to:d.b,total:10,remaining:10,original_cost:cost,upkeep:0};if(k%4===2)s.voyage=trip;else{s.handling={rate:5,unloading:k%4===3,total:2,remaining:1,trip};if(s.handling.unloading){s.next=1;trip.remaining=0;}}}
  c.ships.push(s);ships.push([ci,s.id]);Object.assign(old.roads[ri],{owner:c.id,basis:2000,pool:17,road_budget:2,security_budget:3,quality:4,security:5});refunds.set(ci,(refunds.get(ci)??0)+2017+cost);
 }
 const untouched=structuredClone(old.markets),rng=old.rng;e.load(old);const migrated=e.save();assert.equal(migrated.city_version,13);assert.equal(migrated.roads.length,281);assert.deepEqual(migrated.markets.slice(0,untouched.length),untouched);assert.equal(migrated.rng,rng);assert.deepEqual(migrated.companies[0].routes.find(r=>r.id===template.id),template);
 for(const [ci,value]of refunds){assert.equal(migrated.companies[ci].cash,old.companies[ci].cash+value);assert.equal(migrated.companies[ci].totals.retiredRoadRefund,value);}
 for(const [ci,id]of ships){const s=migrated.companies[ci].ships.find(s=>s.id===id);assert.equal(s.route,null);assert.equal(s.handling,null);assert.equal(s.voyage,null);assert.deepEqual(s.cargo,[]);}
 for(const id of ASIA_RETIRED_ROADS){const r=migrated.roads[e.data.roads.findIndex(r=>r.id===id)];assert.equal(r.owner,'state');assert.equal(r.basis+r.pool+r.quality+r.security+r.road_budget+r.security_budget,0);}
 e.load(migrated);assert.deepEqual(e.save(),migrated);
 // A newer save cannot resurrect either the original or newly retired roads.
 for(const [id,version]of [['nanjing_suzhou',11],['madrid_paris',10]]){const bad=oldAsia(structuredClone(migrated));bad.city_version=version;if(version===10)bad.roads.length=274;bad.roads[e.data.roads.findIndex(r=>r.id===id)].owner='player';assert.throws(()=>e.load(bad));assert.deepEqual(e.save(),migrated);}
 const bad=structuredClone(old);bad.companies[0].ships.at(-1).cargo=[{good:999,quantity:1,cost:1}];assert.throws(()=>e.load(bad));assert.deepEqual(e.save(),migrated);
 e.cmd({action:'tick',days:31});e.load(e.save());
});


test('Nanchang–Jingdezhen is straight and version 11 saves retire Ahmedabad–Agra and Ajmer–Delhi only',async()=>{
 const e=await engine();fund(e);open(e,'nanchang','jingdezhen');e.cmd({action:'license',nation:e.data.nations.findIndex(n=>n.id==='mughal')});
 const points=roadPoints('nanchang','jingdezhen');assert.equal(points.length,2);assert.deepEqual(roadPoints('jingdezhen','nanchang'),points.toReversed());
 const cities=['nanchang','jingdezhen'].map(id=>e.data.cities.find(c=>c.id===id));assert.deepEqual(points,cities.map(c=>({x:c.x,y:c.y})));assert.ok(landSegment(...cities.map(c=>[c.lon,c.lat])));
 const rd=e.data.roads.find(r=>r.id==='nanchang_jingdezhen');assert.equal(rd.km,220);assert.equal(rd.penalty,.8);assert.deepEqual(rd.points,points);
 const old=oldAsia(e.save());old.city_version=11;const co=old.companies[0],template=structuredClone(co.routes[0]),ship=co.ships[0];let refund=0;
 for(const id of ASIA_FURTHER_RETIRED_ROADS){const i=e.data.roads.findIndex(r=>r.id===id),d=e.data.roads[i];assert.equal(d.retired_since,12);assert.equal(d.retired,true);
  for(const [a,b]of [[d.a,d.b],[d.b,d.a]]){assert.equal(roadBetween(e.data.cities[a].id,e.data.cities[b].id),undefined);assert.throws(()=>open(e,e.data.cities[a].id,e.data.cities[b].id));}
  assert.ok(!e.view().roads.some(r=>r.index===i));assert.throws(()=>e.cmd({action:'buyRoad',road:i}));
  const r=structuredClone(template);r.id=old.next_id++;r.stops=[d.a,d.b];co.routes.push(r);co.ships.push({...structuredClone(ship),id:old.next_id++,route:r.id,cargo:[],voyage:null,handling:null,next:0});
  Object.assign(old.roads[i],{owner:'player',basis:1800,pool:23,road_budget:2,security_budget:1,quality:3,security:1});refund+=1823;
 }
 e.load(old);const g=e.save();assert.equal(g.city_version,13);assert.equal(g.roads.length,281);assert.equal(g.companies[0].cash,co.cash+refund);assert.deepEqual(g.companies[0].routes,[template]);assert.equal(g.companies[0].ships.filter(s=>s.route===null).length,2);assert.deepEqual(g.markets.slice(0,old.markets.length),old.markets);assert.equal(g.rng,old.rng);
 e.load(g);assert.deepEqual(e.save(),g);const forged=structuredClone(old);forged.city_version=12;assert.throws(()=>e.load(forged));assert.deepEqual(e.save(),g);
 e.cmd({action:'tick',days:31});const saved=e.save();e.load(saved);assert.deepEqual(e.save(),saved);
});

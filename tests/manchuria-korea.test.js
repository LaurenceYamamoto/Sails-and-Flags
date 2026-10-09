import {trimLegacyNations} from './legacy-nations.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {bridge} from '../src/wasm-bridge.js';
import {CITIES,GOODS} from '../src/data.js';
import {MANCHURIA_KOREA_CITIES,MANCHURIA_KOREA_ROADS} from '../src/manchuria-korea-data.js';
import {roadBetween,roadPoints} from '../src/land-data.js';
import {onLand,landSegment} from '../src/world-geometry.js';
const w=JSON.parse(fs.readFileSync('wasm-core/data/world.json'));
const city=id=>w.cities.findIndex(c=>c.id===id),nation=id=>w.nations.findIndex(n=>n.id===id);
const display=c=>({x:c.displayX??c.x,y:c.displayY??c.y});
const coordinate=p=>[p.x/2.5-180,90-p.y/2.5];
async function engine(){const {instance}=await WebAssembly.instantiate(fs.readFileSync('assets/wasm/engine.wasm'));const call=bridge(instance);return {call,cmd:command=>call({op:'command',command}),save:()=>JSON.parse(call({op:'save'})),load:g=>call({op:'load',text:JSON.stringify(g)})};}
function fund(e){const g=e.save();g.events_enabled=false;g.companies[0].cash+=1e8;g.companies[0].initial_cash+=1e8;e.load(g);}
function open(e,ids){return e.cmd({action:'openRoute',kind:'caravan',stops:ids.map(city),allowed:w.goods.map((_,i)=>i),margin:0});}
function oldWorld(g){trimLegacyNations(g,48);g.city_version=15;g.markets.length=274*w.goods.length;g.development.length=274;g.roads.length=303;return g;}

test('Nine inland cities and eleven roads connect Beijing, Manchuria and Korea on land with spaced markers',()=>{
 assert.equal(w.cities.length,320);assert.equal(w.nations.length,52);assert.equal(w.roads.length,353);assert.equal(w.roads.filter(r=>!r.retired).length,334);
 assert.deepEqual(w.cities.slice(274,283).map(c=>c.id),Object.keys(MANCHURIA_KOREA_CITIES));
 const s=w.cities[city('santiagodechile')],v=w.cities[city('valparaiso')],minimum=Math.hypot(s.x-v.x,s.y-v.y);
 for(const [id,c] of Object.entries(MANCHURIA_KOREA_CITIES)){
  const d=w.cities[city(id)],a=display(d);assert.equal(d.nation,nation(c.nation));assert.equal(d.inland,true);assert.ok(onLand(coordinate(a)));assert.ok(w.distances[city(id)].every(x=>x===null));
  assert.equal(d.lon,c.lon);assert.equal(d.lat,c.lat);assert.ok(CITIES[id].demand.every(x=>x>0));
  for(const good of c.exports)assert.ok(CITIES[id].supply[GOODS.findIndex(g=>g.id===good)]>=3.2,id+'/'+good);
  for(const b of w.cities.filter(c=>c.id!==id)){const p=display(b);assert.ok(Math.hypot(a.x-p.x,a.y-p.y)>=minimum-1e-9,id+'/'+b.id);}
 }
 assert.equal(Object.keys(MANCHURIA_KOREA_ROADS).length,11);
 for(const r of Object.values(MANCHURIA_KOREA_ROADS)){
  const points=roadPoints(r.a,r.b);assert.ok(points.length>=2);assert.deepEqual(roadPoints(r.b,r.a),points.toReversed());
  points[0]=display(w.cities[city(r.a)]);points[points.length-1]=display(w.cities[city(r.b)]);
  for(let i=1;i<points.length;i++)assert.ok(landSegment(coordinate(points[i-1]),coordinate(points[i])),r.a+'/'+r.b+' segment '+i);
 }
 for(const chain of [['beijing','shanhaiguan','jinzhou','shenyang','liaoyang','fenghuangcheng','uiju','pyongyang','kaesong','hanseong'],['shenyang','jilin','ningguta']])for(let i=1;i<chain.length;i++)assert.ok(roadBetween(chain[i-1],chain[i]));
});

test('The direct Pyongyang–Hanseong road cannot reopen, receive investment or be resurrected by current saves',async()=>{
 const e=await engine();fund(e);e.cmd({action:'license',nation:nation('joseon')});const i=w.roads.findIndex(r=>r.id==='hanseong_pyongyang');assert.equal(w.roads[i].retired_since,16);
 assert.ok(!e.call({op:'view'}).roads.some(r=>r.index===i));
 for(const ids of [['hanseong','pyongyang'],['pyongyang','hanseong']]){assert.equal(roadBetween(...ids),undefined);assert.deepEqual(roadPoints(...ids),[]);assert.throws(()=>open(e,ids));}
 assert.throws(()=>e.cmd({action:'buyRoad',road:i}));assert.throws(()=>e.cmd({action:'roadInvestment',road:i,roadBudget:1,securityBudget:1}));
 const g=e.save(),bad=structuredClone(g);bad.roads[i].owner='player';assert.throws(()=>e.load(bad));assert.deepEqual(e.save(),g);
 open(e,['pyongyang','kaesong','hanseong','kaesong']);const forged=e.save();forged.companies[0].routes[0].stops=['pyongyang','hanseong'].map(city);assert.throws(()=>e.load(forged));
});

test('Version 15 migration preserves idle/loading/travelling/unloading vehicles and refunds the retired road exactly once',async()=>{
 const e=await engine();fund(e);e.cmd({action:'license',nation:nation('mughal')});open(e,['surat','ahmedabad']);
 const base=oldWorld(e.save()),template=structuredClone(base.companies[0].routes[0]),vehicle=base.companies[0].ships[0],ri=w.roads.findIndex(r=>r.id==='hanseong_pyongyang'),d=w.roads[ri];
 for(let state=0;state<4;state++){
  const old=structuredClone(base),ci=state%2,c=old.companies[ci];c.licenses=[...new Set([...c.licenses,nation('joseon')])];
  const route=structuredClone(template);route.id=old.next_id++;route.stops=[d.a,d.b];c.routes.push(route);
  const s=structuredClone(vehicle);s.id=old.next_id++;s.route=route.id;s.next=0;s.cargo=[];s.voyage=null;s.handling=null;const cost=state===0?0:123;
  if(state){s.cargo=[{good:0,quantity:10,cost}];const trip={from:d.a,to:d.b,total:10,remaining:10,original_cost:cost,upkeep:0};if(state===2)s.voyage=trip;else{s.handling={rate:5,unloading:state===3,total:2,remaining:1,trip};if(state===3){s.next=1;trip.remaining=0;}}}
  c.ships.push(s);Object.assign(old.roads[ri],{owner:c.id,basis:2000,pool:17,road_budget:2,security_budget:3,quality:4,security:5});
  e.load(old);const g=e.save(),back=g.companies[ci].ships.find(x=>x.id===s.id);assert.equal(g.city_version,23);assert.equal(g.companies[ci].cash,c.cash+2017+cost);assert.equal(g.companies[ci].totals.retiredRoadRefund,2017+cost);
  assert.deepEqual(g.markets.slice(0,old.markets.length),old.markets);assert.deepEqual(g.development.slice(0,274),old.development);assert.equal(g.rng,old.rng);assert.deepEqual(g.companies[0].routes.find(r=>r.id===template.id),template);
  assert.equal(back.kind,s.kind);assert.equal(back.name,s.name);assert.equal(back.route,null);assert.equal(back.voyage,null);assert.equal(back.handling,null);assert.deepEqual(back.cargo,[]);assert.equal(g.companies[ci].ships.length,c.ships.length);assert.ok(!g.companies[ci].routes.some(r=>r.id===route.id));
  assert.equal(g.roads[ri].owner,'state');assert.equal(g.roads[ri].basis+g.roads[ri].pool+g.roads[ri].quality+g.roads[ri].security+g.roads[ri].road_budget+g.roads[ri].security_budget,0);
  e.load(g);assert.deepEqual(e.save(),g);
 }
 const good=e.save();for(const change of [g=>g.city_version=24,g=>g.markets.pop(),g=>g.roads.pop(),g=>g.development.pop()]){const bad=structuredClone(base);change(bad);assert.throws(()=>e.load(bad));assert.deepEqual(e.save(),good);}
});

test('All eleven roads and the Kaesong return itinerary trade with proper licenses and survive saving',async()=>{
 const e=await engine();fund(e);const cross=['fenghuangcheng','uiju'].map(city),opening=()=>e.call({op:'query',request:{query:'opening',kind:'caravan',stops:cross}});
 assert.deepEqual(opening().missing.toSorted(),['qing','joseon'].map(nation).sort());e.cmd({action:'license',nation:nation('qing')});assert.deepEqual(opening().missing,[nation('joseon')]);assert.throws(()=>open(e,['fenghuangcheng','uiju']));e.cmd({action:'license',nation:nation('joseon')});
 for(const r of Object.values(MANCHURIA_KOREA_ROADS))open(e,[r.a,r.b]);open(e,['pyongyang','kaesong','hanseong','kaesong']);
 const road=w.roads.findIndex(r=>r.id==='fenghuangcheng_uiju');e.cmd({action:'buyRoad',road});e.cmd({action:'roadInvestment',road,roadBudget:10,securityBudget:0});
 for(let i=0;i<24;i++)e.cmd({action:'tick',days:31});const g=e.save();assert.equal(g.companies[0].routes.length,12);assert.ok(g.companies[0].routes.every(r=>r.deliveries>0),JSON.stringify(g.companies[0].routes.map(r=>({stops:r.stops,deliveries:r.deliveries}))));assert.ok(g.roads[road].quality>0);assert.ok(g.companies.slice(1).every(c=>c.routes.length<=50));e.load(g);assert.deepEqual(e.save(),g);
});

import {trimLegacyNations} from './legacy-nations.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {bridge} from '../src/wasm-bridge.js';
import {CITIES,GOODS} from '../src/data.js';
import {ROADS,roadPoints} from '../src/land-data.js';
import {ATLANTIC_ROADS} from '../src/atlantic-expansion-data.js';
import {COASTAL_ROAD_VIA} from '../src/coastal-road-data.js';
import {landSegment,waterSegment,onLand} from '../src/world-geometry.js';
const w=JSON.parse(fs.readFileSync('wasm-core/data/world.json'));
const coordinate=p=>[p.x/2.5-180,90-p.y/2.5];
const display=c=>({x:c.displayX??c.x,y:c.displayY??c.y});
async function engine(){const {instance}=await WebAssembly.instantiate(fs.readFileSync('assets/wasm/engine.wasm'));const call=bridge(instance);return {call,cmd:command=>call({op:'command',command}),save:()=>JSON.parse(call({op:'save'})),load:g=>call({op:'load',text:JSON.stringify(g)})};}
function open(e,a,b,kind='caravan'){const stops=[a,b].map(id=>w.cities.findIndex(c=>c.id===id)),q=e.call({op:'query',request:{query:'opening',kind,stops}});for(const nation of q.missing)e.cmd({action:'license',nation});return e.cmd({action:'openRoute',kind,stops,allowed:w.goods.map((_,i)=>i),margin:0});}

test('Nine corrected coastal roads stay on land at map endpoints and along every segment without changing economics',()=>{
 assert.equal(Object.keys(COASTAL_ROAD_VIA).length,9);
 for(const id of Object.keys(COASTAL_ROAD_VIA)){
  const r=w.roads.find(r=>r.id===id),current=ROADS[id],{via:oldVia,...old}=ATLANTIC_ROADS[id],{via:newVia,...rest}=current;assert.deepEqual(rest,old,id+' economics');
  assert.deepEqual(roadPoints(current.b,current.a),roadPoints(current.a,current.b).toReversed());
  const points=structuredClone(r.points);points[0]=display(w.cities[r.a]);points[points.length-1]=display(w.cities[r.b]);
  const coords=points.map(coordinate);for(let i=1;i<coords.length;i++){assert.ok(landSegment(coords[i-1],coords[i]),id+' segment '+i);for(let step=0;step<=40;step++){const t=step/40;assert.ok(onLand([coords[i-1][0]*(1-t)+coords[i][0]*t,coords[i-1][1]*(1-t)+coords[i][1]*t]),id+' vehicle');}}
 }
 const luanda=w.cities.find(c=>c.id==='luanda');assert.equal(luanda.lon,13.23);assert.equal(luanda.lat,-8.82);assert.ok(onLand(coordinate(display(luanda))));assert.ok(Math.hypot(luanda.displayX-luanda.x,luanda.displayY-luanda.y)<.4);
 // Both endpoints can be land while the segment crosses a bay or lake.
 assert.equal(landSegment([-2.93,43.26],[-.58,44.84]),false);
 assert.equal(landSegment([-72.1,10],[-71,10]),false);
 assert.equal(waterSegment([-30,20],[-29,20]),true);assert.equal(landSegment([-30,20],[-29,20]),false);
});

test('Pyongyang is appended as a Joseon inland city with a land-only Hanseong route and spaced map label',()=>{
 const p=w.cities.find(c=>c.id==='pyongyang');assert.equal(p.id,'pyongyang');assert.equal(p.mapName,'平壌');assert.equal(p.inland,true);assert.equal(w.nations[p.nation].id,'joseon');assert.equal(w.cities.length,252);assert.equal(w.roads.filter(r=>!r.retired).length,259);
 assert.ok(CITIES.pyongyang.demand.every(n=>n>0));for(const g of ['food','cloth'])assert.ok(CITIES.pyongyang.supply[GOODS.findIndex(x=>x.id===g)]>=3.2);
 const r=ROADS.hanseong_pyongyang;assert.deepEqual(r.nations,['joseon']);const pts=roadPoints(r.a,r.b).map(coordinate);for(let i=1;i<pts.length;i++)assert.ok(landSegment(pts[i-1],pts[i]));
 const s=w.cities.find(c=>c.id==='santiagodechile'),v=w.cities.find(c=>c.id==='valparaiso'),min=Math.hypot(s.x-v.x,s.y-v.y),a=display(p);assert.ok(onLand(coordinate(a)));for(const c of w.cities.filter(c=>c.id!==p.id)){const b=c.id==='lima'?{x:c.x+1.7,y:c.y-1.7}:display(c);assert.ok(Math.hypot(a.x-b.x,a.y-b.y)>=min-1e-9,c.id);}
 assert.ok(w.distances[w.cities.indexOf(p)].every(x=>x===null));
});

test('3.3.3 saves preserve existing routes, cargo, cash, investments and RNG while adding Pyongyang',async()=>{
 const e=await engine();let g=e.save();g.companies[0].cash+=1e8;g.companies[0].initial_cash+=1e8;e.load(g);
 for(const id of Object.keys(COASTAL_ROAD_VIA)){const r=ROADS[id];open(e,r.a,r.b);}
 const road=w.roads.findIndex(r=>r.id==='bilbao_bordeaux');e.cmd({action:'buyRoad',road});e.cmd({action:'roadInvestment',road,roadBudget:1,securityBudget:1});e.cmd({action:'tick',days:7});
 const old=e.save();old.city_version=8;trimLegacyNations(old);old.markets.length=227*w.goods.length;old.development.length=227;old.roads.length=224;e.load(old);const after=e.save();assert.equal(after.city_version,12);assert.equal(after.markets.length,252*w.goods.length);assert.equal(after.roads.length,276);const back=structuredClone(after);back.city_version=8;trimLegacyNations(back);back.markets.length=old.markets.length;back.development.length=227;back.roads.length=224;assert.deepEqual(back,old);
 const paths=e.call({op:'view',city:0}).paths;for(const id of Object.keys(COASTAL_ROAD_VIA)){const r=w.roads.find(r=>r.id===id);assert.deepEqual(paths[`land:${r.a}:${r.b}`],[r.points]);assert.deepEqual(paths[`land:${r.b}:${r.a}`],[r.points.toReversed()]);}
 for(const change of [g=>g.markets.pop(),g=>g.roads.pop(),g=>g.city_version=13]){const bad=structuredClone(old);change(bad);assert.throws(()=>e.load(bad));assert.deepEqual(e.save(),after);}
 e.cmd({action:'tick',days:31});e.load(e.save());
});

test('Hanseong–Pyongyang can open with a Joseon license, trade and restore',async()=>{
 const e=await engine();const route=open(e,'hanseong','pyongyang','wagon');assert.throws(()=>open(e,'hanseong','pyongyang','sloop'));
 for(let i=0;i<6;i++)e.cmd({action:'tick',days:31});const g=e.save(),r=g.companies[0].routes.find(r=>r.id===route);assert.ok(r.deliveries>0);assert.deepEqual(g.companies[0].licenses,[w.nations.findIndex(n=>n.id==='joseon')]);e.load(g);assert.deepEqual(e.save(),g);
});

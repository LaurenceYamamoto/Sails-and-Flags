import {trimLegacyNations} from './legacy-nations.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {bridge} from '../src/wasm-bridge.js';
import {SILK_ROAD_CITIES,SILK_ROAD_ROADS} from '../src/silk-road-data.js';
import {CITIES,GOODS} from '../src/data.js';
import {roadPoints} from '../src/land-data.js';
import {onLand,landSegment} from '../src/world-geometry.js';
const w=JSON.parse(fs.readFileSync('wasm-core/data/world.json'));
const city=id=>w.cities.findIndex(c=>c.id===id),nation=id=>w.nations.findIndex(n=>n.id===id);
const display=c=>({x:c.displayX??c.x,y:c.displayY??c.y});
const coordinate=p=>[p.x/2.5-180,90-p.y/2.5];
async function engine(){const {instance}=await WebAssembly.instantiate(fs.readFileSync('assets/wasm/engine.wasm'));const call=bridge(instance);return {call,cmd:command=>call({op:'command',command}),save:()=>JSON.parse(call({op:'save'})),load:g=>call({op:'load',text:JSON.stringify(g)})};}
function oldWorld(g){trimLegacyNations(g,48);g.city_version=14;g.markets.length=265*w.goods.length;g.development.length=265;g.roads.length=293;return g;}

test('Nine inland oases have correct authorities, regional markets and minimum map spacing',()=>{
 assert.equal(w.cities.length,320);assert.equal(w.nations.length,52);assert.equal(w.roads.length,353);assert.equal(w.roads.filter(r=>!r.retired).length,334);
 assert.deepEqual(w.cities.slice(265,274).map(c=>c.id),Object.keys(SILK_ROAD_CITIES));
 const s=w.cities[city('santiagodechile')],v=w.cities[city('valparaiso')],minimum=Math.hypot(s.x-v.x,s.y-v.y);
 for(const [id,c] of Object.entries(SILK_ROAD_CITIES)){
  const d=w.cities[city(id)],a=display(d);assert.equal(d.nation,nation(['aksu','kucha','karashahr','turpan'].includes(id)?'dzungar':'qing'));assert.equal(d.inland,true);assert.ok(onLand(coordinate(a)));assert.ok(w.distances[city(id)].every(d=>d===null));
  assert.equal(d.lon,c.lon);assert.equal(d.lat,c.lat);assert.equal(d.region,c.marketRegion);
  for(const b of w.cities.filter(c=>c.id!==id)){const p=display(b);assert.ok(Math.hypot(a.x-p.x,a.y-p.y)>=minimum-1e-9,id+'/'+b.id);}
  assert.ok(CITIES[id].demand.every(x=>x>0));for(const good of c.exports)assert.ok(CITIES[id].supply[GOODS.findIndex(g=>g.id===good)]>=3.2,id+'/'+good);
  for(const good of ['tea','spices','coffee','cocoa','porcelain'])assert.equal(CITIES[id].supply[GOODS.findIndex(g=>g.id===good)],0,id+'/'+good);
 }
});

test('Ten roads form a contiguous Kashgar to Xian corridor with land-only geometry and serviceable distances',()=>{
 const chain=['kashgar',...Object.keys(SILK_ROAD_CITIES),'xian'];assert.equal(Object.keys(SILK_ROAD_ROADS).length,10);
 for(let i=1;i<chain.length;i++){
  const [a,b]=[chain[i-1],chain[i]],r=SILK_ROAD_ROADS[a+'_'+b];assert.ok(r);assert.ok(r.km>0&&r.km<=2000);
  const points=roadPoints(a,b);assert.deepEqual(roadPoints(b,a),points.toReversed());points[0]=display(w.cities[city(a)]);points[points.length-1]=display(w.cities[city(b)]);
  for(let j=1;j<points.length;j++)assert.ok(landSegment(coordinate(points[j-1]),coordinate(points[j])),a+'/'+b+' segment '+j);
  assert.deepEqual(w.roads.find(x=>x.id===a+'_'+b).nations,r.nations.map(nation));
 }
 assert.deepEqual(SILK_ROAD_ROADS.turpan_hami.nations,['dzungar','qing']);
 assert.ok(SILK_ROAD_ROADS.hami_jiuquan.via.length>=4);
});

test('City-version 14 saves preserve old markets, roads, companies, diplomacy and random state',async()=>{
 const e=await engine(),old=oldWorld(e.save());old.markets[0].stock+=17;old.roads[292].quality=3;old.pairs[0].relation=12;old.pairs[0].until=31;
 e.load(old);const after=e.save();assert.equal(after.city_version,23);assert.equal(after.markets.length,320*w.goods.length);assert.equal(after.roads.length,353);assert.deepEqual(oldWorld(structuredClone(after)),old);
 e.load(after);assert.deepEqual(e.save(),after);
 for(const change of [g=>g.city_version=24,g=>g.markets.pop(),g=>g.roads.pop(),g=>g.development.pop()]){const bad=structuredClone(old);change(bad);assert.throws(()=>e.load(bad));assert.deepEqual(e.save(),after);}
 e.cmd({action:'tick',days:31});const saved=e.save();e.load(saved);assert.deepEqual(e.save(),saved);
});

test('All ten Silk Road legs trade with their licenses and retain investments, bounded rivals and saves',async()=>{
 const e=await engine(),g=e.save();g.events_enabled=false;g.companies[0].cash+=1e8;g.companies[0].initial_cash+=1e8;e.load(g);
 const cross=['turpan','hami'].map(city),opening=stops=>e.call({op:'query',request:{query:'opening',kind:'caravan',stops}});
 assert.deepEqual(opening(cross).missing.toSorted(),['dzungar','qing'].map(nation).sort());
 e.cmd({action:'license',nation:nation('qing')});assert.deepEqual(opening(cross).missing,[nation('dzungar')]);
 assert.throws(()=>e.cmd({action:'openRoute',kind:'caravan',stops:cross,allowed:[4],margin:0}));
 e.cmd({action:'license',nation:nation('dzungar')});
 for(const r of Object.values(SILK_ROAD_ROADS)){
  const stops=[r.a,r.b].map(city);assert.deepEqual(opening(stops).missing,[]);
  e.cmd({action:'openRoute',kind:'caravan',stops,allowed:w.goods.map((_,i)=>i),margin:0});
 }
 // Skipping the intermediate cities must not create a direct trans-desert route.
 assert.throws(()=>e.cmd({action:'openRoute',kind:'caravan',stops:['kashgar','xian'].map(city),allowed:[4],margin:0}));
 const road=w.roads.findIndex(r=>r.id==='karashahr_turpan');e.cmd({action:'buyRoad',road});e.cmd({action:'roadInvestment',road,roadBudget:10,securityBudget:0});
 for(let i=0;i<24;i++)e.cmd({action:'tick',days:31});const saved=e.save();assert.equal(saved.companies[0].routes.length,10);assert.ok(saved.companies[0].routes.every(r=>r.deliveries>0),JSON.stringify(saved.companies[0].routes.map(r=>({stops:r.stops,deliveries:r.deliveries}))));assert.ok(saved.roads[road].quality>0);assert.ok(saved.companies.slice(1).every(c=>c.routes.length<=50));e.load(saved);assert.deepEqual(e.save(),saved);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {bridge} from '../src/wasm-bridge.js';
import {REGIONAL_LINK_ROADS as R} from '../src/regional-link-data.js';
import {roadBetween} from '../src/land-data.js';
import {landSegment} from '../src/world-geometry.js';
const w=JSON.parse(fs.readFileSync('wasm-core/data/world.json'));
const city=id=>w.cities.findIndex(c=>c.id===id),nation=id=>w.nations.findIndex(n=>n.id===id);
const ll=p=>[p.x/2.5-180,90-p.y/2.5];
async function engine(){const {instance}=await WebAssembly.instantiate(fs.readFileSync('assets/wasm/engine.wasm'));const call=bridge(instance);return {cmd:command=>call({op:'command',command}),save:()=>JSON.parse(call({op:'save'})),load:g=>call({op:'load',text:JSON.stringify(g)})};}

test('Only the two approved roads are appended, with land-only displayed geometry and both licences',()=>{
 assert.equal(w.cities.length,320);assert.equal(w.nations.length,52);assert.equal(w.roads.length,353);assert.equal(w.roads.filter(r=>!r.retired).length,334);
 assert.deepEqual(w.roads.slice(332,334).map(r=>r.id),['kano_benin','mecca_sanaa']);
 for(const r of w.roads.slice(332,334)){
  assert.deepEqual(r.nations,[w.cities[r.a].nation,w.cities[r.b].nation]);assert.ok(r.km<=2500);assert.equal(r.km,R[r.id].km);
  const ps=structuredClone(r.points);for(const [at,i]of [[0,r.a],[ps.length-1,r.b]]){const c=w.cities[i];ps[at]={x:c.displayX??c.x,y:c.displayY??c.y};}
  for(let i=1;i<ps.length;i++)assert.ok(landSegment(ll(ps[i-1]),ll(ps[i])),r.id+' '+i);
 }
 for(const [a,b]of [['ava','dhaka'],['syriam','ayutthaya'],['jeddah','sanaa'],['mombasa','kilwa'],['kilwa','mozambique'],['saopaulo','asuncion'],['malacca','ayutthaya']])assert.equal(roadBetween(a,b),undefined,a+'/'+b);
});

test('Version 18 saves retain all state and append only two roads, rejecting malformed/future saves',async()=>{
 const e=await engine(),old=e.save();old.city_version=18;old.markets.length=304*w.goods.length;old.development.length=304;old.roads.length=332;old.roads[331].quality=2;old.markets[0].stock+=7;
 e.load(old);const after=e.save();assert.equal(after.city_version,23);assert.equal(after.roads.length,353);
 const back=structuredClone(after);back.city_version=18;back.markets.length=304*w.goods.length;back.development.length=304;back.roads.length=332;assert.deepEqual(back,old);
 for(const r of after.roads.slice(332)){assert.equal(r.owner,'state');assert.equal(r.quality,0);assert.equal(r.basis,0);}
 e.load(after);assert.deepEqual(e.save(),after);
 for(const change of [g=>g.roads.pop(),g=>g.roads.push(after.roads[332]),g=>g.city_version=24]){const bad=structuredClone(old);change(bad);assert.throws(()=>e.load(bad));assert.deepEqual(e.save(),after);}
});

test('Both routes require both licences, deliver cargo, support investment and survive saving',async()=>{
 const e=await engine(),g=e.save();g.events_enabled=false;g.companies[0].cash+=1e8;g.companies[0].initial_cash+=1e8;e.load(g);
 const open=r=>e.cmd({action:'openRoute',kind:'caravan',stops:[city(r.a),city(r.b)],allowed:w.goods.map((_,i)=>i),margin:0});
 for(const r of Object.values(R)){
  assert.throws(()=>open(r));e.cmd({action:'license',nation:nation(r.nations[0])});assert.throws(()=>open(r));e.cmd({action:'license',nation:nation(r.nations[1])});open(r);
 }
 const road=w.roads.findIndex(r=>r.id==='mecca_sanaa');e.cmd({action:'buyRoad',road});e.cmd({action:'roadInvestment',road,roadBudget:10,securityBudget:0});
 for(let i=0;i<24;i++)e.cmd({action:'tick',days:31});const saved=e.save();assert.equal(saved.companies[0].routes.length,2);assert.ok(saved.companies[0].routes.every(r=>r.deliveries>0));assert.ok(saved.roads[road].quality>0);assert.ok(saved.companies.slice(1).every(c=>c.routes.length<=50));e.load(saved);assert.deepEqual(e.save(),saved);
});

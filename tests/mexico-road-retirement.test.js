import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {bridge} from '../src/wasm-bridge.js';
import {roadBetween,roadPoints} from '../src/land-data.js';
const w=JSON.parse(fs.readFileSync('wasm-core/data/world.json'));
const city=id=>w.cities.findIndex(c=>c.id===id),road=w.roads.findIndex(r=>r.id==='mexicocity_guadalajara');
async function engine(){const {instance}=await WebAssembly.instantiate(fs.readFileSync('assets/wasm/engine.wasm'));const call=bridge(instance);return {call,cmd:command=>call({op:'command',command}),save:()=>JSON.parse(call({op:'save'})),load:g=>call({op:'load',text:JSON.stringify(g)})};}
async function ready(){const e=await engine(),g=e.save();g.companies[0].cash+=1e8;g.companies[0].initial_cash+=1e8;e.load(g);e.cmd({action:'license',nation:w.nations.findIndex(n=>n.id==='spain')});return e;}
const open=(e,ids)=>e.cmd({action:'openRoute',kind:'caravan',stops:ids.map(city),allowed:w.goods.map((_,i)=>i),margin:0});

test('Mexico City–Guadalajara is unavailable in either direction; Guanajuato connections remain usable',async()=>{
 const e=await ready();assert.equal(w.roads.length,353);assert.equal(w.roads.filter(r=>!r.retired).length,334);assert.equal(w.roads[road].retired_since,23);
 assert.ok(!e.call({op:'view'}).roads.some(r=>r.index===road));
 for(const [a,b]of [['mexicocity','guadalajara'],['guadalajara','mexicocity']]){assert.equal(roadBetween(a,b),undefined);assert.deepEqual(roadPoints(a,b),[]);assert.throws(()=>open(e,[a,b]));}
 assert.throws(()=>e.cmd({action:'buyRoad',road}));assert.throws(()=>e.cmd({action:'roadInvestment',road,roadBudget:1,securityBudget:0}));
 open(e,['mexicocity','guanajuato','guadalajara','guanajuato']);e.cmd({action:'tick',days:31});const g=e.save();e.load(g);assert.deepEqual(e.save(),g);
});

test('Version 22 routes are retired for player and rival, preserving vehicles and refunding cargo and road assets once',async()=>{
 const e=await ready();open(e,['mexicocity','guanajuato']);const old=e.save();old.city_version=22;
 const template=structuredClone(old.companies[0].routes[0]),vehicle=structuredClone(old.companies[0].ships.find(s=>s.route===template.id)),removed=[];
 for(const ci of [0,1]){
  const c=old.companies[ci];c.licenses=[...new Set([...c.licenses,...old.companies[0].licenses])];const r=structuredClone(template);r.id=old.next_id++;r.stops=[city('mexicocity'),city('guadalajara')];c.routes.push(r);
  for(let phase=0;phase<4;phase++){
   const s=structuredClone(vehicle);s.id=old.next_id++;s.route=r.id;s.next=0;s.cargo=[];s.handling=null;s.voyage=null;
   if(phase){s.cargo=[{good:0,quantity:10,cost:123}];const trip={from:r.stops[0],to:r.stops[1],total:10,remaining:10,original_cost:123,upkeep:0};if(phase===2)s.voyage=trip;else{s.handling={rate:5,unloading:phase===3,total:2,remaining:1,trip};if(phase===3){s.next=1;trip.remaining=0;}}}
   c.ships.push(s);removed.push([ci,s.id]);
  }
 }
 Object.assign(old.roads[road],{owner:'player',basis:2000,pool:17,road_budget:2,security_budget:3,quality:4,security:5});
 e.load(old);const after=e.save();assert.equal(after.city_version,23);assert.deepEqual(after.markets,old.markets);assert.deepEqual(after.development,old.development);assert.equal(after.rng,old.rng);assert.deepEqual(after.companies[0].routes.find(r=>r.id===template.id),template);
 for(const ci of [0,1]){const refund=369+(ci===0?2017:0);assert.equal(after.companies[ci].cash,old.companies[ci].cash+refund);assert.equal(after.companies[ci].routes.length,old.companies[ci].routes.length-1);}
 for(const [ci,id]of removed){const s=after.companies[ci].ships.find(s=>s.id===id);assert.ok(s);assert.equal(s.route,null);assert.equal(s.voyage,null);assert.equal(s.handling,null);assert.deepEqual(s.cargo,[]);}
 assert.equal(after.roads[road].owner,'state');assert.equal(after.roads[road].basis+after.roads[road].pool+after.roads[road].road_budget+after.roads[road].security_budget,0);
 e.load(after);assert.deepEqual(e.save(),after);
 const forged=structuredClone(after);forged.roads[road].owner='player';assert.throws(()=>e.load(forged));assert.deepEqual(e.save(),after);
 e.cmd({action:'tick',days:31});const saved=e.save();e.load(saved);assert.deepEqual(e.save(),saved);
});

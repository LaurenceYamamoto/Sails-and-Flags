import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {bridge} from '../src/wasm-bridge.js';

test('opening road report matches travel calculation, includes return legs and designs, and follows road improvements',async()=>{
 const {instance}=await WebAssembly.instantiate(fs.readFileSync('assets/wasm/engine.wasm'));
 const call=bridge(instance),query=request=>call({op:'query',request}),cmd=command=>call({op:'command',command}),save=()=>JSON.parse(call({op:'save'})),load=g=>call({op:'load',text:JSON.stringify(g)});
 cmd({action:'new',seed:1700,events:false});const data=call({op:'catalog'});
 const road=data.roads.find(r=>!r.retired&&r.penalty<.6&&r.km>300),index=data.roads.indexOf(road),stops=[road.a,road.b];
 const quote=(kind='wagon',route=stops)=>query({query:'opening',kind,stops:route});
 const original=save(),w=quote(),c=quote('caravan');assert.deepEqual(save(),original);
 assert.equal(w.roads.legs.length,2);assert.deepEqual(w.roads.legs.map(l=>[l.from,l.to]),[stops,stops.toReversed()]);
 for(const kind of ['wagon','caravan']){
  const q=quote(kind),spec=data.specs.find(s=>s.id===kind),row=q.roads.vehicles.find(v=>v.kind===kind);
  assert.equal(row.days,q.travelDays.reduce((a,b)=>a+b,0));assert.equal(row.daily,q.daily);assert.equal(row.capacity,spec.capacity);
  for(const [i,leg] of q.roads.legs.entries()){
   assert.equal(leg.days,q.travelDays[i]);assert.equal(leg.passability,call({op:'view'}).roads.find(r=>r.index===index).passability);
   assert.equal(leg.speedFactor,leg.passability+(1-leg.passability)*spec.roughness);
   assert.equal(leg.days,Math.max(1,Math.ceil(road.km/(spec.speed*leg.speedFactor))));
  }
 }
 assert.ok(c.roads.legs[0].speedFactor>w.roads.legs[0].speedFactor);
 let g=save();g.roads[index].quality=100;load(g);assert.ok(quote().roads.legs[0].passability>w.roads.legs[0].passability);assert.ok(quote().travelDays[0]<w.travelDays[0]);
 g=save();g.companies[0].cash+=1e8;g.companies[0].initial_cash+=1e8;load(g);
 cmd({action:'research',kind:'wagon',budgets:[0,0,10000,0,0]});const design=call({op:'view'}).catalog.find(s=>s.id.startsWith('design-'));
 assert.ok(quote().roads.vehicles.some(v=>v.kind===design.id));assert.ok(quote(design.id).roads.legs[0].speedFactor>quote().roads.legs[0].speedFactor);
 const loop=quote('caravan',[...stops,...stops]);assert.equal(loop.roads.legs.length,4);assert.equal(loop.roads.vehicles.find(v=>v.kind==='caravan').days,quote('caravan').travelDays.reduce((a,b)=>a+b,0)*2);
 const sea=['kingston','havana'].map(id=>data.cities.findIndex(c=>c.id===id));assert.equal(quote('sloop',sea).roads,null);
});

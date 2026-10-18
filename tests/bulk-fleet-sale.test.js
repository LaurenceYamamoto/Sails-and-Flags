import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {bridge} from '../src/wasm-bridge.js';

test('unused fleet bulk sales use exact types and preserve assigned fleets and accounts',async()=>{
 const call=bridge((await WebAssembly.instantiate(fs.readFileSync('assets/wasm/engine.wasm'))).instance);
 const cmd=command=>call({op:'command',command}),save=()=>JSON.parse(call({op:'save'})),load=g=>call({op:'load',text:JSON.stringify(g)}),view=()=>call({op:'view'});
 cmd({action:'new',seed:1700,events:false});const data=call({op:'catalog'}),city=id=>data.cities.findIndex(c=>c.id===id);
 let g=save();g.companies[0].cash=g.companies[0].initial_cash=1e7;g.companies[0].technology.fill(100);g.companies[0].licenses=[data.cities[city('kyoto')].nation];load(g);
 for(const kind of ['sloop','sloop','caravan','caravan','wagon'])cmd({action:'buyShip',kind});
 cmd({action:'research',kind:'sloop',budgets:[1000,0,0,0,0]});const design=Object.keys(save().designs)[0];assert.ok(design);
 cmd({action:'buyShip',kind:design});
 cmd({action:'buildPost',city:city('kyoto')});const route=cmd({action:'openRoute',kind:'caravan',stops:[city('kyoto'),city('nagoya')],allowed:[0]});
 cmd({action:'route',route,active:false});
 const before=save(),assigned=before.companies[0].ships.filter(s=>s.route!==null),quote=view().fleetGroups.find(g=>g.kind==='sloop');
 assert.equal(quote.idle,2);assert.equal(quote.saleValue,3600);
 const result=cmd({action:'sellIdleShips',kind:'sloop'});assert.deepEqual(result,{count:2,total:3600});
 let after=save();assert.equal(after.companies[0].cash,before.companies[0].cash+3600);
 assert.ok(after.companies[0].ships.some(s=>s.kind===design));
 assert.deepEqual(after.companies[0].ships.filter(s=>s.route!==null),assigned);assert.deepEqual(after.companies.slice(1),before.companies.slice(1));
 assert.equal(after.companies[0].totals.shipSale,3600);load(after);assert.deepEqual(save(),after);
 for(const command of [{action:'sellIdleShips',kind:'missing-type'},{action:'sellIdleShips'},{action:'sellIdleShips',all:false}]){assert.throws(()=>cmd(command));assert.deepEqual(save(),after);}
 assert.throws(()=>cmd({action:'sellShip',ship:assigned[0].id}));assert.deepEqual(save(),after);
 const preview=view().idleSale,remaining=after.companies[0].ships.filter(s=>s.route===null);assert.equal(preview.count,remaining.length);
 assert.deepEqual(cmd({action:'sellIdleShips',all:true}),preview);
 const sold=save();assert.deepEqual(sold.companies[0].ships,assigned);
 assert.ok(Math.abs(sold.companies[0].cash-after.companies[0].cash-preview.total)<1e-7);
 assert.ok(Math.abs(sold.companies[0].cash-sold.companies[0].initial_cash-Object.values(sold.companies[0].totals).reduce((n,v)=>n+v,0))<1e-6);
 assert.deepEqual(view().idleSale,{count:0,total:0});assert.deepEqual(cmd({action:'sellIdleShips',all:true}),{count:0,total:0});assert.deepEqual(save(),sold);
 load(sold);assert.deepEqual(save(),sold);
 // Assigned craft remain protected during loading and transit, not just when paused.
 for(const phase of ['loading','moving','unloading']){
  g=structuredClone(before);const co=g.companies[0],s=co.ships.find(s=>s.route!==null),r=co.routes[0];
  const trip={from:r.stops[0],to:r.stops[1],total:3,remaining:phase==='unloading'?0:3,original_cost:10,upkeep:0,direct_sale:true};
  s.cargo=[{good:0,quantity:1,cost:10}];s.next=phase==='unloading'?1:0;s.voyage=phase==='moving'?trip:null;
  s.handling=phase==='moving'?null:{rate:5,total:.2,remaining:.2,unloading:phase==='unloading',trip};
  load(g);const protectedShip=save().companies[0].ships.find(x=>x.id===s.id);cmd({action:'sellIdleShips',all:true});
  assert.deepEqual(save().companies[0].ships,[protectedShip]);load(save());
 }
});

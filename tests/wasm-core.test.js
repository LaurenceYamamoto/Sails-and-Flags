import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {bridge} from '../src/wasm-bridge.js';
const binary=fs.readFileSync(new URL('../assets/wasm/engine.wasm',import.meta.url));
async function engine(){const {instance}=await WebAssembly.instantiate(binary);const call=bridge(instance);return {call,cmd:c=>call({op:'command',command:c}),query:q=>call({op:'query',request:q}),view:city=>call({op:'view',city}),save:()=>JSON.parse(call({op:'save'})),load:g=>call({op:'load',text:JSON.stringify(g)}),data:call({op:'catalog'})};}
function trimLegacyWorld(g){g.roads.length=69;g.pairs=g.pairs.filter(p=>p.b<23);for(const c of g.companies){c.friendship.length=23;c.diplomacy_budget.length=23;c.trade.length=23;}}
function omitUnavailableRoutes(g,cityCount){for(const c of g.companies){const removed=new Set(c.routes.filter(r=>r.stops.some(i=>i>=cityCount)).map(r=>r.id));c.routes=c.routes.filter(r=>!removed.has(r.id));for(const ship of c.ships)if(removed.has(ship.route))ship.route=null;}}
function fund(e,value=1e9){const g=e.save();g.companies[0].cash+=value;g.companies[0].initial_cash+=value;e.load(g);}
function city(e,id){return e.data.cities.findIndex(c=>c.id===id);}
function nation(e,id){return e.data.nations.findIndex(n=>n.id===id);}
function open(e,ids,kind='sloop'){const stops=ids.map(id=>city(e,id));for(const n of e.query({query:'opening',kind,stops}).missing)e.cmd({action:'license',nation:n});return e.cmd({action:'openRoute',kind,stops,allowed:e.data.goods.map((_,i)=>i),margin:10});}

test('six technologies independently improve handling, upkeep, disaster risk and mode-specific designs without facilities',async()=>{
 const e=await engine();fund(e);assert.equal(e.view().technology.length,6);assert.deepEqual(e.view().handlingRates,[5,5]);assert.ok(!Object.hasOwn(e.view(),'shipyard'));assert.throws(()=>e.cmd({action:'shipyard'}));
 const quote=kind=>e.query({query:'opening',kind,stops:(kind==='sloop'?['kingston','havana']:['cairo','suez']).map(id=>city(e,id))});const sea=quote('sloop'),land=quote('wagon'),before=e.save();
 for(let i=0;i<6;i++){
  const g=structuredClone(before);g.companies[0].technology[i]=50;e.load(g);const s=quote('sloop'),l=quote('wagon');
  assert.equal(s.handlingRate>sea.handlingRate,i===2);assert.equal(l.handlingRate>land.handlingRate,i===5);
  assert.equal(s.daily<sea.daily,i===1);assert.equal(l.daily<land.daily,i===4);assert.equal(s.disasterRates[0]<sea.disasterRates[0],i===1);assert.equal(l.disasterRates[0]<land.disasterRates[0],i===4);
 }
 e.load(before);for(let i=0;i<6;i++)e.cmd({action:'technology',kind:i,value:100});e.cmd({action:'tick',days:1});assert.ok(e.view().technology.every(x=>x>0));
 const q=(kind,budgets)=>e.query({query:'design',kind,budgets});for(const kind of ['wagon','caravan']){
  const base=e.data.specs.find(s=>s.id===kind);for(let axis=0;axis<5;axis++){const budgets=Array(5).fill(0);budgets[axis]=10000;const spec=q(kind,budgets).spec;assert.ok([spec.capacity>base.capacity,spec.speed>base.speed,spec.roughness>base.roughness,spec.range>base.range,spec.daily<base.daily][axis]);assert.ok(Number.isFinite(spec.price)&&spec.price>0);}
 }
 let g=e.save();g.companies[0].technology=[30,0,0,0,0,0];e.load(g);const low=q('wagon',[10000,0,0,0,0]).spec.capacity;g.companies[0].technology[3]=100;e.load(g);assert.ok(q('wagon',[10000,0,0,0,0]).spec.capacity>low);assert.ok(e.view().catalog.some(s=>s.id==='corvette'));
 e.cmd({action:'research',kind:'wagon',budgets:[10000,0,10000,0,0]});const kind=e.view().catalog.find(s=>s.id.startsWith('design-')).id;e.cmd({action:'buyShip',kind});assert.ok(e.save().companies[0].ships.some(s=>s.kind===kind));e.load(e.save());
});

test('road passability rewards wagons on good roads and caravans or rough-road designs on poor roads',async()=>{
 const e=await engine();fund(e);const road=e.data.roads.find(r=>!r.retired&&r.penalty<.6&&r.km>300),index=e.data.roads.indexOf(road),stops=[road.a,road.b];assert.ok(road);
 const q=kind=>e.query({query:'opening',kind,stops});const w=q('wagon'),c=q('caravan');assert.ok(c.travelDays[0]<w.travelDays[0]);assert.ok(c.disasterRates[0]<w.disasterRates[0]);
 const g=e.save(),pass=e.view().roads.find(r=>r.index===index).passability;g.roads[index].quality=100;e.load(g);assert.ok(e.view().roads.find(r=>r.index===index).passability>pass);assert.ok(q('wagon').travelDays[0]<w.travelDays[0]);assert.ok(q('wagon').travelDays[0]<=q('caravan').travelDays[0]);
 for(const n of road.nations)e.cmd({action:'license',nation:n});e.cmd({action:'buyRoad',road:index});e.cmd({action:'roadInvestment',road:index,roadBudget:10000,securityBudget:0});const p=e.view().roads.find(r=>r.index===index).passability;e.cmd({action:'tick',days:1});assert.ok(e.view().roads.find(r=>r.index===index).passability>p);
 assert.ok(!e.data.specs.some(s=>['camel','mule'].includes(s.id)));assert.ok(e.data.specs.some(s=>s.id==='caravan'));const saved=e.save();assert.throws(()=>e.cmd({action:'buyShip',kind:'camel'}));assert.deepEqual(e.save(),saved);
});

test('handling technology sets actual operation durations and preserves an operation already in progress',async()=>{
 for(const [ids,kind,tech] of [[['kingston','havana'],'sloop',2],[['cairo','suez'],'caravan',5]]){
  const e=await engine();e.cmd({action:'new',seed:1700,events:false});fund(e);open(e,ids,kind);let g=e.save(),s=g.companies[0].ships[0],r=g.companies[0].routes[0];g.companies[0].technology[tech]=50;g.markets[r.stops[0]*e.data.goods.length].stock=2000;g.markets[r.stops[1]*e.data.goods.length].stock=0;e.load(g);e.cmd({action:'tick',days:1});g=e.save();s=g.companies[0].ships[0];assert.ok(s.handling&&!s.handling.unloading);assert.ok(s.handling.rate>5);assert.ok(Math.abs(s.handling.total-s.cargo.reduce((n,x)=>n+x.quantity,0)/s.handling.rate)<1e-9);
  const rate=s.handling.rate,total=s.handling.total;g.companies[0].technology[tech]=1000;e.load(g);assert.equal(e.save().companies[0].ships[0].handling.total,total);assert.equal(e.save().companies[0].ships[0].handling.rate,rate);
  s.handling=null;s.cargo=[{good:0,quantity:30,cost:300}];s.voyage={from:r.stops[0],to:r.stops[1],total:2,remaining:.2,original_cost:300,upkeep:0};e.load(g);e.cmd({action:'tick',days:1});const h=e.save().companies[0].ships[0].handling;assert.ok(h.unloading);assert.ok(h.rate>rate);assert.ok(Math.abs(h.total-30/h.rate)<1e-9);e.load(e.save());
 }
});

test('handling upgrades rebuild the timetable using the new rate at an intermediate stop',async()=>{
 const e=await engine();e.cmd({action:'new',seed:1700,events:false});fund(e);open(e,['kingston','havana']);const g=e.save(),p=g.companies[0],r=p.routes[0],ship=p.ships[0];g.day=100;p.technology[2]=50;r.cooldown=0;ship.next=1;ship.ready=1000;ship.voyage=null;ship.handling=null;ship.cargo=[];e.load(g);e.cmd({action:'tick',days:1});const saved=e.save().companies[0].routes[0],v=e.view().companies[0].routes[0];assert.ok(saved.handling_rate>5);assert.equal(saved.epoch,101-v.offsets[1]);assert.equal(saved.cooldown,101+Math.ceil(v.cycle));e.load(e.save());
});

test('legacy transport saves migrate three technologies, caravans, shipyards and in-progress handling exactly once',async()=>{
 const e=await engine();fund(e);const id=open(e,['cairo','suez'],'caravan');e.cmd({action:'buyShip',kind:'caravan'});const g=e.save(),p=g.companies[0],r=p.routes[0],s=p.ships[0];delete g.transport_version;
 for(const c of g.companies){c.technology=[12,34,56];c.tech_budget=[1,2,3];c.shipyard=false;c.yard_value=0;}p.shipyard=true;p.yard_value=4000;p.default_vehicle='mule';p.ships[0].kind='camel';p.ships[1].kind='mule';r.auto_type='camel';r.replacements=['mule'];delete r.handling_rate;
 s.cargo=[{good:0,quantity:15,cost:150}];s.handling={unloading:true,total:1.5,remaining:.5,trip:{from:r.stops[0],to:r.stops[1],total:2,remaining:0,original_cost:150,upkeep:0}};s.next=1;
 const cash=p.cash;e.load(g);const migrated=e.save(),co=migrated.companies[0];assert.equal(migrated.transport_version,1);assert.deepEqual(co.technology,[12,34,0,0,56,0]);assert.deepEqual(co.tech_budget,[1,2,0,0,3,0]);assert.equal(co.cash,cash+4000);assert.equal(co.totals.shipyardRefund,4000);assert.ok(!Object.hasOwn(co,'yard_value'));assert.equal(co.default_vehicle,'caravan');assert.ok(co.ships.every(s=>s.kind==='caravan'));assert.equal(co.routes[0].auto_type,'caravan');assert.deepEqual(co.routes[0].replacements,['caravan']);assert.equal(co.ships[0].handling.rate,10);assert.equal(co.ships[0].handling.remaining,.5);e.load(migrated);assert.deepEqual(e.save(),migrated);
 const injected=structuredClone(migrated);injected.companies[0].yard_value=4000;assert.throws(()=>e.load(injected));assert.deepEqual(e.save(),migrated);
 const bad=structuredClone(g);bad.companies[0].technology.pop();assert.throws(()=>e.load(bad));assert.deepEqual(e.save(),migrated);e.cmd({action:'tick',days:1});assert.equal(e.save().companies[0].routes[0].deliveries,1);
});

test('sea and land disasters lose hull and cargo, reduce assets, respect technology and queue replacement',async()=>{
 let seed=0;for(;seed<1000000;seed++){const a=(Math.imul(seed,1664525)+1013904223)>>>0,b=(Math.imul(a,1664525)+1013904223)>>>0;if(a/2**32>.00015&&a/2**32<.00019&&b/2**32>.02)break;}assert.ok(seed<1000000);
 for(const [kind,ids,tech,event] of [['sloop',['kingston','havana'],1,'seaDisaster'],['wagon',['cairo','suez'],4,'landDisaster']]){
  const e=await engine();e.cmd({action:'new',seed:1700,events:true});fund(e);const id=open(e,ids,kind);const g=e.save(),p=g.companies[0],r=p.routes[0],s=p.ships[0];g.day=100;g.rng=seed;s.cargo=[{good:0,quantity:10,cost:100}];s.handling=null;s.voyage={from:r.stops[0],to:r.stops[1],total:3,remaining:3,original_cost:100,upkeep:0};e.load(g);const assets=e.view().companies[0].assets;e.cmd({action:'tick',days:1});let after=e.save();assert.equal(after.companies[0].ships.length,0);assert.equal(after.companies[0].routes[0].cargo_loss,100);assert.equal(after.companies[0].routes[0].ship_loss,e.data.specs.find(s=>s.id===kind).price);assert.deepEqual(after.companies[0].routes[0].replacements,[kind]);assert.ok(e.view().companies[0].assets<assets-100);assert.ok(after.events.some(x=>x.kind===event));const once=after;e.load(g);e.cmd({action:'tick',days:1});assert.deepEqual(e.save(),once);
  e.cmd({action:'automation',enabled:true,replaceLost:true,budget:10000,reserve:0,expand:10,shrink:30});e.cmd({action:'tick',days:1});after=e.save();assert.equal(after.companies[0].ships[0].kind,kind);assert.equal(after.companies[0].routes[0].replacements.length,0);
  p.technology[tech]=1000;e.load(g);e.cmd({action:'tick',days:1});assert.equal(e.save().companies[0].ships.length,1);
  p.technology[tech]=0;g.events_enabled=false;e.load(g);e.cmd({action:'tick',days:1});assert.equal(e.save().companies[0].ships.length,1);
 }
});

test('city demand and production keep growing beyond former ceilings with diminishing gains',async()=>{
 const e=await engine();e.cmd({action:'new',seed:1700,events:false});const baseline=e.save();
 for(const id of ['london','kingston']){
  const i=city(e,id),initial=e.view(i).market,best=initial.reduce((a,b)=>a.baseProduction>b.baseProduction?a:b).good;
  const series=[];
  for(const level of [0,5,10,15,100,1000000]){
   const g=structuredClone(baseline);g.development[i].size=level;g.development[i].production[best]=level;e.load(g);
   const m=e.view(i).market[best],d=m.details;series.push([d.city,m.production/m.baseProduction]);
   assert.ok(Math.abs(m.demand-d.base*d.location*d.season*d.city*d.war*d.price)<1e-9);
   assert.ok(Number.isFinite(m.demand)&&Number.isFinite(m.production));
   const saved=e.save();e.load(saved);assert.deepEqual(e.save(),saved);
  }
  assert.deepEqual(series[0],[1,1]);
  for(let k=0;k<2;k++){
   for(let j=1;j<series.length;j++)assert.ok(series[j][k]>series[j-1][k]);
   assert.ok(series[2][k]-series[1][k]<series[1][k]-series[0][k]);assert.ok(series[3][k]-series[2][k]<series[2][k]-series[1][k]);
  }
  assert.ok(series[4][0]>(id==='london'?1.525:2.5));assert.ok(series[4][1]>5);
 }
 // Isolate production/consumption from rival purchases now that London has an initial route.
 const g=structuredClone(baseline),i=city(e,'london');for(const co of g.companies)for(const r of co.routes)r.active=false;g.development[i].size=100;g.development[i].production.fill(100);g.day=1;e.load(g);const market=e.view(i).market;
 g.day=0;e.load(g);e.cmd({action:'tick',days:1});const after=e.save();for(const m of market)assert.ok(Math.abs(after.markets[i*e.data.goods.length+m.good].stock-(m.stock+m.production-m.consumption))<1e-9);
});

test('continued city investment grows mature cities while retaining commodity suitability and saved levels',async()=>{
 const e=await engine();e.cmd({action:'new',seed:1700,events:false});fund(e);const i=city(e,'london');e.cmd({action:'license',nation:nation(e,'england')});e.cmd({action:'buyDevelopment',city:i});
 const market=e.view(i).market,positive=market.filter(m=>m.baseProduction>0).sort((a,b)=>a.baseProduction-b.baseProduction),weak=positive[0].good,strong=positive.at(-1).good,zero=market.find(m=>m.baseProduction===0).good;
 const g=e.save();g.development[i].size=100;g.development[i].production[strong]=100;g.development[i].production[weak]=100;g.development[i].production[zero]=1000000;e.load(g);const before=e.view(i);
 e.cmd({action:'cityInvestment',city:i,size:1000000});for(const good of [weak,strong])e.cmd({action:'cityInvestment',city:i,good,value:1000000});
 e.cmd({action:'tick',days:1});const first=e.save().development[i],v=e.view(i);assert.ok(first.size>100);assert.ok(v.market[strong].production>before.market[strong].production);assert.ok(v.market[strong].details.city>before.market[strong].details.city);assert.equal(v.market[zero].production,0);assert.ok(first.production[strong]-100>first.production[weak]-100);
 assert.ok(v.market[weak].production-before.market[weak].production<v.market[strong].production-before.market[strong].production);
 const saved=e.save();e.cmd({action:'tick',days:1});const second=e.save();assert.ok(second.development[i].size-first.size<first.size-100);assert.ok(second.development[i].production[strong]-first.production[strong]<first.production[strong]-100);e.load(saved);e.cmd({action:'tick',days:1});assert.deepEqual(e.save(),second);
});

test('sea and land cargo operations consume fractional days in order and sell only after unloading',async()=>{
 for(const [ids,kind] of [[['kingston','havana'],'sloop'],[['cairo','suez'],'caravan']]){
  const e=await engine();e.cmd({action:'new',seed:1700,events:false});fund(e);const id=open(e,ids,kind);
  const g=e.save(),r=g.companies[0].routes[0],s=g.companies[0].ships[0];r.active=false;
  s.cargo=[{good:0,quantity:15,cost:150}];s.voyage=null;
  s.handling={unloading:false,total:1.5,remaining:1.5,trip:{from:r.stops[0],to:r.stops[1],total:2,remaining:2,original_cost:150,upkeep:0}};
  e.load(g);const before=e.save();
  for(const command of [{action:'release',ship:s.id},{action:'sellShip',ship:s.id},{action:'removeRoute',route:id}]){assert.throws(()=>e.cmd(command));assert.deepEqual(e.save(),before);}
  for(const mutate of [s=>s.handling.remaining=-1,s=>s.handling.total=2,s=>s.handling.trip.from=999,s=>s.voyage={...s.handling.trip}]){
   const bad=structuredClone(before);mutate(bad.companies[0].ships[0]);assert.throws(()=>e.load(bad));assert.deepEqual(e.save(),before);
  }
  e.cmd({action:'tick',days:1});assert.equal(e.save().companies[0].ships[0].handling.remaining,.5);
  e.cmd({action:'tick',days:1});assert.equal(e.save().companies[0].ships[0].voyage.remaining,1.5);
  e.cmd({action:'tick',days:2});let p=e.save().companies[0];assert.equal(p.ships[0].handling.unloading,true);assert.equal(p.ships[0].handling.remaining,2.5);assert.equal(p.routes[0].transport.sales,0);assert.equal(p.routes[0].deliveries,0);
  const checkpoint=e.save();e.cmd({action:'tick',days:4});const result=e.save();e.load(checkpoint);e.cmd({action:'tick',days:4});assert.deepEqual(e.save(),result);
  p=result.companies[0];assert.equal(p.ships[0].handling,null);assert.equal(p.ships[0].voyage,null);assert.equal(p.ships[0].cargo.length,0);assert.equal(p.routes[0].deliveries,1);assert.ok(p.routes[0].transport.sales>0);
  assert.deepEqual(p.routes[0].activity,{since:0,moving:2,loading:1.5,unloading:3,waiting:1.5});assert.ok(Math.abs(e.view().companies[0].routes[0].idleRatio-18.75)<1e-9);
 }
});

test('decimal cargo durations remain valid at every daily save boundary',async()=>{
 const e=await engine();e.cmd({action:'new',seed:1700,events:false});fund(e);open(e,['kingston','havana']);const original=e.save();
 for(const quantity of [1,3,7,13,29]){
  const g=structuredClone(original),p=g.companies[0],r=p.routes[0],s=p.ships[0];r.active=false;s.cargo=[{good:0,quantity,cost:quantity*10}];s.handling={unloading:false,total:quantity/10,remaining:quantity/10,trip:{from:r.stops[0],to:r.stops[1],total:2,remaining:2,original_cost:quantity*10,upkeep:0}};e.load(g);
  const days=Math.ceil(2+quantity*0.3);for(let i=0;i<days;i++){e.cmd({action:'tick',days:1});e.load(e.save());}
  const route=e.save().companies[0].routes[0];assert.equal(route.deliveries,1);assert.ok(Math.abs(route.activity.moving-2)<1e-9);assert.ok(Math.abs(route.activity.loading-quantity/10)<1e-9);assert.ok(Math.abs(route.activity.unloading-quantity/5)<1e-9);assert.ok(Math.abs(route.activity.waiting-(days-2-quantity*0.3))<1e-9);
 }
});

test('loading reserves purchased cargo, timetables include handling, and fleet time accounts for spacing',async()=>{
 const e=await engine();e.cmd({action:'new',seed:1700,events:false});fund(e);const id=open(e,['kingston','havana']);open(e,['kingston','havana']);
 e.cmd({action:'route',route:id,allowed:[0],margin:10});const g=e.save();g.markets[0].stock=2000;g.markets[e.data.goods.length].stock=0;e.load(g);
 const initial=e.view().companies[0].routes[0];assert.ok(initial.cycle>=16);assert.equal(initial.interval,initial.cycle/2);
 e.cmd({action:'tick',days:1});let p=e.save().companies[0];const h=p.ships.find(s=>s.handling);assert.ok(h);assert.equal(h.handling.unloading,false);assert.equal(h.handling.total,h.cargo.reduce((n,x)=>n+x.quantity,0)/5);assert.ok(h.cargo.reduce((n,x)=>n+x.cost,0)>0);assert.equal(p.routes[0].transport.sales,0);
 assert.equal(p.ships.filter(s=>s.handling||s.voyage).length,1);assert.equal(p.routes[0].activity.waiting,1);
 e.cmd({action:'tick',days:7});p=e.save().companies[0];const a=p.routes[0].activity;assert.ok(Math.abs(a.moving+a.loading+a.unloading+a.waiting-16)<1e-9);e.load(e.save());
});

test('idle scaling validates percentages, waits for observation and migrates old profit thresholds',async()=>{
 const e=await engine();e.cmd({action:'new',seed:1700,events:false});fund(e);const id=open(e,['kingston','havana']);e.cmd({action:'route',route:id,auto:true});
 const command={action:'automation',enabled:true,replaceLost:true,budget:20000,reserve:1000,expand:10,shrink:30};e.cmd(command);
 for(const limits of [{expand:-1},{shrink:101},{expand:31}]){const before=e.save();assert.throws(()=>e.cmd({...command,...limits}));assert.deepEqual(e.save(),before);}
 let g=e.save();g.companies[0].routes[0].cooldown=0;g.companies[0].routes[0].transport={since:0,sales:1e6,costs:1,upkeep:0,deliveries:100};e.load(g);e.cmd({action:'tick',days:1});assert.equal(e.save().companies[0].ships.length,1);
 g=e.save();delete g.cargo_time_version;for(const c of g.companies){c.automation.expand=25;c.automation.shrink=-10;for(const r of c.routes)delete r.activity;}const ship=g.companies[0].ships[0];e.load(g);const migrated=e.save();assert.equal(migrated.cargo_time_version,1);assert.deepEqual(migrated.companies[0].ships[0],ship);assert.equal(migrated.companies[0].automation.expand,10);assert.equal(migrated.companies[0].automation.shrink,30);assert.equal(e.view().companies[0].routes[0].idleRatio,null);e.load(migrated);assert.deepEqual(e.save(),migrated);
});

test('automatic contraction waits for unloading and otherwise removes the smallest fallback type',async()=>{
 const e=await engine();e.cmd({action:'new',seed:1700,events:false});fund(e);const id=open(e,['kingston','havana']);open(e,['kingston','havana'],'brig');
 e.cmd({action:'route',route:id,kind:'sloop',auto:true});e.cmd({action:'automation',enabled:true,replaceLost:false,budget:0,reserve:0,expand:10,shrink:30});
 const g=e.save(),p=g.companies[0],r=p.routes[0],s=p.ships.find(s=>s.kind==='sloop');g.day=100;r.cooldown=0;r.activity={since:0,moving:0,loading:0,unloading:0,waiting:200};p.ships.forEach(s=>s.ready=10000);
 s.next=1;s.cargo=[{good:0,quantity:15,cost:150}];s.handling={unloading:true,total:1.5,remaining:1.5,trip:{from:r.stops[0],to:r.stops[1],total:2,remaining:0,original_cost:150,upkeep:0}};
 e.load(g);e.cmd({action:'tick',days:1});assert.equal(e.save().companies[0].ships.find(x=>x.id===s.id).route,id);assert.equal(e.save().companies[0].ships.find(x=>x.id===s.id).handling.remaining,.5);
 e.cmd({action:'tick',days:1});assert.equal(e.save().companies[0].ships.find(x=>x.id===s.id).route,null);assert.equal(e.view().companies[0].routes[0].idleRatio,null);
 // With no designated type in the fleet, the smaller sloop is removed before the brig.
 g.companies[0].routes[0].auto_type='galleon';s.handling=null;s.cargo=[];e.load(g);e.cmd({action:'tick',days:1});assert.equal(e.save().companies[0].ships.find(x=>x.id===s.id).route,null);assert.equal(e.save().companies[0].ships.find(x=>x.kind==='brig').route,id);
});

test('daily diplomacy records actual causes, limits and first-license changes; donations are rejected',async()=>{
 const e=await engine();e.cmd({action:'license',nation:0});
 assert.equal(e.view().licenses[0].changes[0].initial,40);
 let g=e.save();g.companies[0].trade[0]=100000;g.companies[0].trade[1]=200000;
 g.pairs.find(p=>p.a===0&&p.b===1).until=100;e.load(g);
 const cash=e.view().companies[0].cash;e.cmd({action:'diplomacy',nation:0,value:100});
 assert.equal(e.view().companies[0].cash,cash);assert.equal(e.view().licenses[0].friendship,100);
 const before=e.save();assert.throws(()=>e.cmd({action:'diplomacy',nation:0,value:100,donate:true}));assert.deepEqual(e.save(),before);
 e.cmd({action:'tick',days:1});let h=e.view().licenses[0].changes[0];
 assert.equal(h.trade,1);assert.equal(h.enemy_trade,-3);assert.equal(h.investment,.2);assert.equal(h.spent,100);assert.ok(Math.abs(h.after-98.2)<1e-10);
 assert.ok(Math.abs(h.trade+h.enemy_trade+h.investment+h.limit-h.delta)<1e-10);
 g=e.save();g.companies[0].friendship[0]=100;g.companies[0].trade.fill(0);e.load(g);e.cmd({action:'tick',days:1});
 h=e.view().licenses[0].changes[0];assert.equal(h.delta,0);assert.equal(h.limit,-.2);
 const saved=e.save();e.load(saved);assert.deepEqual(e.save(),saved);
 const malformed=structuredClone(saved);malformed.companies[0].friendship_history[0].delta=999;
 assert.throws(()=>e.load(malformed));assert.deepEqual(e.save(),saved);
 e.cmd({action:'diplomacy',nation:0,value:0});fund(e);e.cmd({action:'tick',days:40});
 g=e.save();assert.ok(g.companies[0].friendship_history.length<=30*e.data.nations.length+1);
 assert.ok(g.companies[0].friendship_history.every(h=>g.day-h.day<30));
 for(const c of g.companies)delete c.friendship_history;e.load(g);assert.equal(e.view().licenses[0].changes.length,0);
});
test('unfunded diplomacy records no payment or friendship gain',async()=>{
 const e=await engine();e.cmd({action:'diplomacy',nation:0,value:1000000});const cash=e.view().companies[0].cash;
 e.cmd({action:'tick',days:1});const h=e.view().licenses[0].changes[0];
 assert.equal(h.unfunded,true);assert.equal(h.spent,0);assert.equal(h.investment,0);assert.equal(h.delta,0);assert.equal(e.view().companies[0].cash,cash);
});
test('Wasm owns initial state, license escalation and symmetric tax formula',async()=>{
 const e=await engine();assert.equal(e.data.cities.length,320);assert.equal(e.data.roads.length,353);assert.equal(e.view().licenses.filter(l=>l.owned).length,0);
 e.cmd({action:'license',nation:0});let v=e.view();assert.equal(v.licenses[0].friendship,100);assert.equal(v.licenses[0].tax,5);assert.equal(v.licenses[1].tax,9);assert.equal(v.licenses[1].fee,e.data.nations[1].fee*3);assert.equal(v.licenses[0].daily,e.data.nations[0].daily*10*.6);
 const g=e.save();for(const c of g.companies.slice(1))assert.ok(c.friendship.every((f,n)=>f===(n===c.licenses[0]?100:60)));
 const before=e.save();assert.throws(()=>e.cmd({action:'license',nation:0}));assert.deepEqual(e.save(),before);
});
test('fractional clock, pause and deterministic save/restore',async()=>{
 const e=await engine();e.call({op:'advance',ms:250,speed:1,running:true});assert.equal(e.view().day,0);assert.equal(e.view().fraction,.25);
 e.call({op:'advance',ms:500,speed:4,running:false});assert.equal(e.view().fraction,.25);
 const g=e.save();e.cmd({action:'tick',days:31});const after=e.save();e.load(g);e.cmd({action:'tick',days:31});assert.deepEqual(e.save(),after);
});
test('shared routes, inventory reuse and automatic purchase; ordered revisits',async()=>{
 const e=await engine();fund(e);const id=open(e,['kingston','havana']);const g=e.save(),cash=g.companies[0].cash;
 e.cmd({action:'buyShip',kind:'sloop'});assert.equal(e.query({query:'opening',kind:'sloop',stops:[0,1]}).cost,0);
 const again=e.cmd({action:'openRoute',kind:'sloop',stops:[1,0],allowed:[0,1],margin:10});assert.equal(id,again);assert.equal(e.view().companies[0].routes.length,1);assert.equal(e.view().companies[0].routes[0].fleet.length,2);assert.equal(e.view().companies[0].cash,cash-1800);
 const circuit=open(e,['cadiz','lisbon','sanjuan','santodomingo','sanjuan','lisbon','cadiz'],'galleon');assert.equal(e.view().companies[0].routes.find(r=>r.id===circuit).stops.length,6);
});
test('sea detours, Pacific crossing and land connections remain available',async()=>{
 const e=await engine();const q=(a,b)=>e.query({query:'opening',kind:'galleon',stops:[city(e,a),city(e,b)]});
 assert.ok(q('marseille','nantes').longest>q('lisbon','nantes').longest);
 const pacific=Object.keys(e.data.cities).map(Number).filter(i=>e.data.cities[i].id==='acapulco'||e.data.cities[i].id==='manila');assert.equal(pacific.length,2);assert.ok(e.query({query:'opening',kind:'galleon',stops:pacific}).longest>0);
 for(const road of e.data.roads.filter(r=>!r.retired)){assert.ok(e.query({query:'connection',stops:[road.a,road.b]}).types.some(k=>['wagon','caravan'].includes(k)));}
});
test('production suitability, nonzero demand and commodity-specific investment',async()=>{
 const e=await engine();fund(e);const london=city(e,'london'),spice=e.data.goods.findIndex(g=>g.id==='spices');const v=e.view(london);assert.ok(v.market.every(m=>m.demand>0));assert.equal(v.market[spice].production,0);
 e.cmd({action:'license',nation:nation(e,'england')});e.cmd({action:'buyDevelopment',city:london});assert.throws(()=>e.cmd({action:'cityInvestment',city:london,good:spice,value:10}));const g=v.market.find(m=>m.production>0).good;e.cmd({action:'cityInvestment',city:london,good:g,value:10});e.cmd({action:'tick',days:31});const w=e.view(london);assert.ok(w.market[g].production>v.market[g].production);assert.equal(w.market[spice].production,0);
});
test('design budgets, names, fleet replacement and automation kind',async()=>{
 const e=await engine();fund(e);const id=open(e,['kingston','havana']);const g=e.save();g.companies[0].technology[0]=30;e.load(g);
 const q=e.query({query:'design',kind:'sloop',budgets:[1000,1000,1000,1000,1000]});assert.ok(q.spec.range>1800);assert.ok(e.query({query:'design',kind:'sloop',budgets:[1000,0,0,0,0]}).spec.capacity>30);
 e.cmd({action:'research',kind:'sloop',budgets:[1000,1000,1000,1000,1000]});const design=e.view().catalog.find(s=>s.id.startsWith('design-')).id;
 e.cmd({action:'rename',kind:'design',id:design,name:'Ocean Swift'});e.cmd({action:'rename',kind:'company',name:'Wasm Trading'});
 const before=e.view().companies[0].cash,quote=e.query({query:'replacement',mode:'route',route:id,target:design,source:''});e.cmd({action:'replace',mode:'route',route:id,target:design,source:''});assert.equal(e.view().companies[0].cash,before-quote.cost);assert.ok(e.view().companies[0].ships.every(s=>s.kind===design));
 e.cmd({action:'replace',mode:'automation',source:'sloop',target:design});assert.equal(e.view().companies[0].routes[0].auto_type,design);assert.equal(e.view().companies[0].name,'Wasm Trading');
});
test('invalid and legacy saves roll back without damaging live state',async()=>{
 const e=await engine(),before=e.save();for(const mutate of [g=>g.version=99,g=>g.markets.pop(),g=>g.companies[0].cash++,g=>g.companies[0].friendship[0]=101,g=>g.roads[0].quality=-1]){const g=structuredClone(before);mutate(g);assert.throws(()=>e.load(g));assert.deepEqual(e.save(),before);}
 assert.throws(()=>e.call({op:'load',text:'{"version":7}'}));assert.deepEqual(e.save(),before);
});
test('long campaign preserves accounting, finite markets, bounded rivals and history',async()=>{
 const e=await engine();fund(e);open(e,['kingston','havana']);for(let i=0;i<40;i++)e.cmd({action:'tick',days:31});const g=e.save();assert.equal(g.day,1240);assert.ok(g.markets.every(m=>Number.isFinite(m.stock)&&m.stock>=0));assert.ok(g.companies.every(c=>c.ledger.length<=200&&c.history.length<=365));assert.ok(g.companies.slice(1).every(c=>c.routes.length<=50));assert.ok(g.companies[0].routes[0].deliveries>0);assert.equal(e.view().wars.some(w=>Object.hasOwn(w,'until')),false);e.load(g);
});
test('automation buys the designated type, ignores unrelated inventory and shrinks preferred type',async()=>{
 const e=await engine();fund(e);e.cmd({action:'new',seed:1700,events:false});fund(e);const id=open(e,['kingston','havana']);e.cmd({action:'buyShip',kind:'galleon'});e.cmd({action:'route',route:id,kind:'brig',auto:true});
 e.cmd({action:'automation',enabled:true,replaceLost:true,budget:20000,reserve:1000,expand:10,shrink:30});
 let g=e.save();g.day=100;g.companies[0].ships.forEach(s=>s.ready=10000);let r=g.companies[0].routes[0];r.cooldown=0;r.transport={since:0,sales:100,costs:10000,upkeep:0,deliveries:2};r.activity={since:0,moving:100,loading:20,unloading:20,waiting:0};e.load(g);e.cmd({action:'tick',days:1});let p=e.view().companies[0];assert.equal(p.ships.filter(s=>s.kind==='brig'&&s.route===id).length,1);assert.equal(p.ships.find(s=>s.kind==='galleon').route,null);
 g=e.save();g.day=200;g.companies[0].ships.forEach(s=>{s.ready=10000;s.voyage=null;s.handling=null;s.cargo=[];});r=g.companies[0].routes[0];r.cooldown=0;r.transport={since:0,sales:10000,costs:100,upkeep:0,deliveries:2};r.activity={since:100,moving:0,loading:0,unloading:0,waiting:100};e.load(g);e.cmd({action:'tick',days:1});p=e.view().companies[0];assert.equal(p.ships.find(s=>s.kind==='brig').route,null);assert.equal(p.ships.find(s=>s.kind==='sloop').route,id);
});
test('acquisition merges routes and transfers ships without breaking restore validation',async()=>{
 const e=await engine();fund(e);const target=e.save().companies[1],r=target.routes[0];assert.ok(r);for(const n of target.licenses)e.cmd({action:'license',nation:n});e.cmd({action:'openRoute',kind:target.ships[0].kind,stops:r.stops,allowed:[0,1],margin:10});const count=e.view().companies[0].ships.length+target.ships.length;
 e.cmd({action:'acquire',company:1});assert.equal(e.view().companies.length,14);assert.equal(e.view().companies[0].ships.length,count);assert.equal(e.view().companies[0].routes.length,target.routes.length);e.load(e.save());e.cmd({action:'tick',days:31});e.save();
});
test('unprofitable return legs can reposition empty towards a profitable leg',async()=>{
 const e=await engine();e.cmd({action:'new',seed:1700,events:false});fund(e);const id=open(e,['kingston','havana']);e.cmd({action:'route',route:id,allowed:[0],margin:10});const g=e.save(),len=e.data.goods.length;g.markets[0].stock=2000;g.markets[len].stock=0;e.load(g);let empty=false;for(let i=0;i<40;i++){e.cmd({action:'tick',days:1});const s=e.view().companies[0].ships[0];if(s.voyage&&s.cargo.length===0)empty=true;}assert.ok(empty);e.save();
});
test('calendar uses real month boundaries, and malformed routes cannot trap Wasm',async()=>{
 const e=await engine();e.cmd({action:'tick',days:30});assert.equal(e.save().companies[0].automation.month,0);e.cmd({action:'tick',days:1});assert.equal(e.save().companies[0].automation.month,1);
 fund(e);open(e,['kingston','havana']);const before=e.save();for(const mutate of [r=>r.mode='land',r=>r.stops=[0,999],r=>r.stops=[0,0],r=>r.auto_type='unknown']){const g=structuredClone(before);mutate(g.companies[0].routes[0]);assert.throws(()=>e.load(g));assert.deepEqual(e.save(),before);}
});
test('rival land operations reinvest in roads within the shared investment policy',async()=>{
 const e=await engine();e.cmd({action:'new',seed:1700,events:false});fund(e);const road=e.data.roads.find(r=>r.id==='cairo_suez');const ids=[e.data.cities[road.a].id,e.data.cities[road.b].id];open(e,ids,'caravan');const g=e.save(),p=g.companies[0],r=g.companies[1];g.day=58;r.routes=p.routes;r.ships=p.ships;r.licenses=p.licenses;r.cash=1e9;r.initial_cash=r.cash-Object.values(r.totals).reduce((a,b)=>a+b,0);r.kind='large';p.routes=[];p.ships=[];r.ships.forEach(s=>s.ready=10000);r.routes[0].transport={since:0,sales:100000,costs:100,upkeep:0,deliveries:3};e.load(g);e.cmd({action:'tick',days:1});const after=e.save(),owned=after.roads.filter(d=>d.owner===r.id);assert.ok(owned.length>0);assert.ok(owned.some(d=>d.road_budget>0&&d.security_budget>0));assert.ok(after.companies[1].routes.length<=50);e.cmd({action:'tick',days:31});e.save();
});
test('sea route rejects land vehicles even where a road also joins the two ports',async()=>{
 const e=await engine();fund(e);const road=e.data.roads.find(r=>!e.data.cities[r.a].inland&&!e.data.cities[r.b].inland);const stops=[road.a,road.b];for(const n of e.query({query:'opening',kind:'galleon',stops}).missing)e.cmd({action:'license',nation:n});const id=e.cmd({action:'openRoute',kind:'galleon',stops,allowed:[0],margin:10});const ship=e.cmd({action:'buyShip',kind:'wagon'});const before=e.save();assert.throws(()=>e.cmd({action:'assign',route:id,ship}));assert.throws(()=>e.cmd({action:'route',route:id,kind:'wagon'}));assert.throws(()=>e.cmd({action:'assign',route:id+.5,ship}));assert.deepEqual(e.save(),before);
});
test('the starting company can run the tutorial route for a year without artificial funds',async()=>{
 const e=await engine();e.cmd({action:'new',seed:1700,events:false});open(e,['kingston','havana']);for(let i=0;i<12;i++)e.cmd({action:'tick',days:30});const v=e.view();assert.equal(v.day,360);assert.equal(v.companies[0].bankrupt,false);assert.ok(v.companies[0].routes[0].deliveries>5);e.save();
});
test('transport observations include gross sale revenue and transaction taxes in costs',async()=>{
 const e=await engine();e.cmd({action:'new',seed:1700,events:false});open(e,['kingston','havana']);let g;for(let i=0;i<31;i++){e.cmd({action:'tick',days:1});g=e.save();if(g.companies[0].routes[0].deliveries)break;}const p=g.companies[0],r=p.routes[0];assert.equal(r.deliveries,1);assert.ok(Math.abs(r.transport.sales-p.totals.sale)<1e-7);assert.ok(Math.abs(r.transport.costs+p.totals.purchase+p.totals.tax)<1e-7);
});
test('fifty-year multi-company run remains serializable and bounded',async()=>{
 const e=await engine();fund(e);open(e,['kingston','havana']);for(let days=0;days<18250;){const n=Math.min(31,18250-days);e.cmd({action:'tick',days:n});days+=n;}const g=e.save();assert.equal(g.day,18250);assert.ok(g.events.length<=100);assert.ok(g.companies.every(c=>c.history.length<=365));assert.ok(g.companies.slice(1).every(c=>c.routes.length<=50&&c.ships.length<=150));e.load(g);assert.equal(e.view().day,18250);
});

test('default sea and land types persist and opening selects eligible sea first, with cheapest fallback',async()=>{
 const e=await engine();e.cmd({action:'defaults',ship:'brig',vehicle:'caravan'});
 assert.equal(e.view().defaultShip,'brig');assert.equal(e.view().defaultVehicle,'caravan');
 const land=e.query({query:'connection',stops:[city(e,'cairo'),city(e,'suez')]});assert.equal(land.default,'caravan');
 const road=e.data.roads.find(r=>!e.data.cities[r.a].inland&&!e.data.cities[r.b].inland);
 const both=e.query({query:'connection',stops:[road.a,road.b]});assert.ok(both.types.includes('caravan'));assert.equal(both.default,'brig');
 e.cmd({action:'defaults',ship:'sloop',vehicle:'wagon'});
 const long=e.query({query:'connection',stops:[city(e,'kingston'),city(e,'london')]});assert.ok(!long.types.includes('sloop'));
 const cheapest=e.data.specs.filter(s=>long.types.includes(s.id)&&s.mode==='sea').sort((a,b)=>a.price-b.price)[0];assert.equal(long.default,cheapest.id);
 const g=e.save();e.load(g);assert.equal(e.view().defaultShip,'sloop');assert.equal(e.view().defaultVehicle,'wagon');
 assert.throws(()=>e.cmd({action:'defaults',ship:'wagon',vehicle:'sloop'}));assert.deepEqual(e.save(),g);
 for(const c of g.companies){delete c.default_ship;delete c.default_vehicle;}e.load(g);assert.equal(e.view().defaultVehicle,'wagon');
});

test('only idle empty ships can be sold; automatic names and grouped usage remain, manual rename is rejected',async()=>{
 const e=await engine();fund(e);const id=open(e,['kingston','havana']);const inUse=e.view().companies[0].ships[0];const before=e.save();
 assert.throws(()=>e.cmd({action:'sellShip',ship:inUse.id}));assert.throws(()=>e.cmd({action:'rename',kind:'ship',id:inUse.id,name:'Renamed'}));assert.deepEqual(e.save(),before);
 const idle=e.cmd({action:'buyShip',kind:'sloop'});let v=e.view();assert.ok(v.companies[0].ships.find(s=>s.id===idle).name.length>0);
 assert.deepEqual(v.fleetGroups.find(g=>g.kind==='sloop'),{kind:'sloop',used:1,idle:1});
 const cash=v.companies[0].cash,assets=v.companies[0].assets;e.cmd({action:'sellShip',ship:idle});v=e.view();
 assert.equal(v.companies[0].cash,cash+1800);assert.equal(v.companies[0].assets,assets);assert.equal(v.companies[0].routes[0].id,id);assert.equal(v.fleetGroups[0].idle,0);
 const sold=e.save();assert.throws(()=>e.cmd({action:'sellShip',ship:idle}));assert.deepEqual(e.save(),sold);
});

test('period accounts retain transactions beyond the ledger cap and restore exactly',async()=>{
 const e=await engine();for(let i=0;i<305;i++){const ship=e.cmd({action:'buyShip',kind:'wagon'});e.cmd({action:'sellShip',ship});}
 const g=e.save();assert.equal(g.companies[0].ledger.length,200);
 const month=e.query({query:'accounts'}).periods[0];assert.equal(month.expense.shipPurchase,305*600);assert.equal(month.income.shipSale,305*600);assert.equal(month.sales,0);assert.equal(month.net,0);assert.equal(month.assets,5000);
 e.load(g);assert.deepEqual(e.save(),g);assert.deepEqual(e.query({query:'accounts'}).periods[0],month);
 const bad=structuredClone(g);bad.companies[0].accounts.months[0].expense.shipPurchase=-1;assert.throws(()=>e.load(bad));assert.deepEqual(e.save(),g);
 const old=structuredClone(g);delete old.companies[0].accounts;old.day=60;e.load(old);let report=e.query({query:'accounts'});assert.equal(report.since,60);assert.equal(report.periods.length,1);assert.equal(report.periods[0].totalIncome,0);
 const ship=e.cmd({action:'buyShip',kind:'wagon'});report=e.query({query:'accounts'});assert.equal(report.periods[0].expense.shipPurchase,600);e.cmd({action:'sellShip',ship});
});

test('monthly and annual accounting follows calendar boundaries and period-end assets',async()=>{
 const e=await engine();e.cmd({action:'new',seed:1700,events:false});fund(e);open(e,['kingston','havana']);
 for(let day=0;day<366;){const n=Math.min(31,366-day);e.cmd({action:'tick',days:n});day+=n;}
 const m=e.query({query:'accounts'}),y=e.query({query:'accounts',annual:true});assert.equal(m.periods.length,13);assert.equal(y.periods.length,2);assert.equal(y.periods[0].year,1700);assert.equal(m.periods[0].asOf,30);assert.equal(m.periods[1].asOf,58);assert.equal(m.periods[11].asOf,364);
 const sum=(key)=>m.periods.slice(0,12).reduce((n,p)=>n+p[key],0);for(const key of ['totalIncome','totalExpense','sales'])assert.ok(Math.abs(y.periods[0][key]-sum(key))<1e-6);
 assert.equal(y.periods[0].assets,m.periods[11].assets);assert.equal(y.periods[1].assets,e.view().companies[0].assets);
 const totals=e.save().companies[0].totals;for(const [category,value]of Object.entries(totals)){const actual=m.periods.reduce((n,p)=>n+(p.income[category]??0)-(p.expense[category]??0),0);assert.ok(Math.abs(value-actual)<1e-5,category);}
});

const calendarDay=(year,month,date)=>Math.round((Date.UTC(year,month-1,date)-Date.UTC(1700,0,1))/86400000);
function legacyAccounts(e,year=2000,month=1,date=31){
 const g=e.save();g.day=calendarDay(year,month,date);g.events_enabled=false;
 const months={};
 for(let m=0;m<=(year-1700)*12+month-1;m++){
  const y=1700+Math.floor(m/12),n=m%12+1;
  months[m]={income:{sale:100},expense:{purchase:60},assets:5000+m,as_of:Math.min(g.day,calendarDay(y,n+1,0))};
 }
 g.companies[0].accounts={since:0,months};
 g.companies[0].ledger=Array.from({length:600},(_,i)=>({day:0,category:'sale',amount:1,route:null,detail:String(i)}));
 return g;
}

test('legacy history migrates to independent 120-month and 300-year windows and 200 visible entries',async()=>{
 const e=await engine(),old=legacyAccounts(e);
 e.load(old);let g=e.save(),a=g.companies[0].accounts;
 assert.equal(Object.keys(a.months).length,120);assert.equal(Object.keys(a.months)[0],'3481');
 assert.equal(Object.keys(a.years).length,300);assert.equal(Object.keys(a.years)[0],'1');
 assert.equal(a.years[1].income.sale,1200);assert.equal(a.years[1].expense.purchase,720);assert.equal(a.years[1].assets,5023);
 assert.equal(g.companies[0].ledger.length,200);assert.equal(g.companies[0].ledger[0].detail,'400');
 assert.equal(e.view().ledger.length,200);assert.equal(e.view().ledger[0].detail,'599');
 const saved=e.save();e.load(saved);assert.deepEqual(e.save(),saved); // Never re-add retained months to years.
 const originalAnnual=e.query({query:'accounts',annual:true}).periods;
 assert.equal(originalAnnual.length,300);assert.equal(originalAnnual[0].year,1701);
 const ship=e.cmd({action:'buyShip',kind:'wagon'});e.cmd({action:'sellShip',ship});
 assert.equal(e.save().companies[0].accounts.years[300].expense.shipPurchase,600);
 e.cmd({action:'tick',days:1});g=e.save();a=g.companies[0].accounts;
 assert.equal(Object.keys(a.months).length,120);assert.equal(Object.keys(a.months)[0],'3482');
 assert.equal(a.years[290].income.sale,1200); // A deleted month is still included in its annual total.
 assert.equal(Object.keys(a.years).length,300);assert.equal(e.view().ledger.length,200);
 assert.deepEqual(e.view().ledger,g.companies[0].ledger.toReversed());
});

test('year boundary evicts only expired annual data and keeps correct previous year-end assets',async()=>{
 const e=await engine();e.load(legacyAccounts(e,2000,12,31));
 const yearEnd=e.view().companies[0].assets;
 e.cmd({action:'tick',days:1});const g=e.save(),a=g.companies[0].accounts;
 assert.equal(Object.keys(a.months).length,120);assert.equal(Object.keys(a.months)[0],'3493');
 assert.equal(Object.keys(a.years).length,300);assert.equal(Object.keys(a.years)[0],'2');
 assert.equal(a.years[300].assets,yearEnd);assert.equal(a.years[300].income.sale,1200);
 assert.equal(a.years[301].assets,e.view().companies[0].assets);
 assert.equal(e.query({query:'accounts'}).periods[0].year,1991);
 assert.equal(e.query({query:'accounts',annual:true}).periods[0].year,1702);
 const restored=e.save();e.load(restored);assert.deepEqual(e.save(),restored);
 for(const change of [x=>x.years[300].expense.purchase=-1,x=>x.years[300].as_of=4294967295]){
  const bad=structuredClone(restored);change(bad.companies[0].accounts);assert.throws(()=>e.load(bad));assert.deepEqual(e.save(),restored);
 }
});

test('migration validates discarded records and does not invent missing monthly history',async()=>{
 const e=await engine(),before=e.save(),bad=legacyAccounts(e);
 bad.companies[0].accounts.months[0].income.sale=-1;
 assert.throws(()=>e.load(bad));assert.deepEqual(e.save(),before);
 const sparse=legacyAccounts(e);sparse.companies[0].accounts.months={3600:sparse.companies[0].accounts.months[3600]};
 e.load(sparse);assert.equal(e.query({query:'accounts'}).periods.length,1);assert.equal(e.query({query:'accounts',annual:true}).periods.length,1);
 const fresh=e.save();delete fresh.companies[0].accounts;e.load(fresh);
 assert.equal(e.query({query:'accounts'}).periods.length,1);assert.equal(e.query({query:'accounts',annual:true}).periods[0].totalIncome,0);
});


test('fourteen regional rivals start with licensed serviceable fleets, paid from tiered capital',async()=>{
 const e=await engine(),g=e.save();assert.equal(g.roster_version,5);assert.equal(g.city_version,23);assert.equal(g.companies.length,15);assert.equal(g.companies[0].cash,5000);assert.deepEqual(g.companies[0].licenses,[]);
 const expected=[
  ['オランダ西インド会社',25000,['netherlands'],[['amsterdam','willemstad']]],
  ['スペイン商館',60000,['spain'],[['cadiz','havana'],['havana','santiago','sanjuan']]],
  ['イギリス東インド会社',25000,['england'],[['bombay','madras']]],
  ['オランダ東インド会社',60000,['netherlands'],[['amsterdam','elmina','capetown','batavia','colombo','capetown','elmina']]],
  ['オスマン商人',25000,['ottoman'],[['izmir','ankara'],['aleppo','damascus']]],
  ['インド商人',25000,['mughal'],[['surat','ahmedabad'],['agra','delhi']]],
  ['清国商人',25000,['qing'],[['xian','hankou'],['suzhou','hangzhou']]],
  ['日本商人',5000,['japan'],[['osaka','nagasaki'],['osaka','edo']]],
  ['ジェノバ商人',5000,['genoa','tuscany'],[['genoa','livorno']]],
  ['ベネチア商人',5000,['venice','ottoman'],[['venice','istanbul']]],
  ['南海会社',25000,['england'],[['london','kingston']]],
  ['ポルトガル商館',25000,['portugal'],[['lisbon','luanda'],['luanda','mozambique']]],
  ['オマーン商人',25000,['oman'],[['muscat','mombasa'],['mombasa','zanzibar']]],
  ['フランス東インド会社',5000,['france','mughal'],[['pondicherry','hughli']]],
 ];
 for(const [i,[name,capital,licenses,routes]] of expected.entries()){
  const co=g.companies[i+1];assert.equal(co.name,name);assert.equal(co.initial_cash,capital);assert.deepEqual(co.licenses.map(n=>e.data.nations[n].id),licenses);assert.equal(co.friendship[co.licenses[0]],100);assert.ok(co.licenses.slice(1).every(n=>co.friendship[n]===60));
  assert.deepEqual(co.routes.map(r=>r.stops.map(n=>e.data.cities[n].id)),routes);assert.ok(co.cash>0);assert.equal(co.cash+co.ships.reduce((n,s)=>n+e.data.specs.find(k=>k.id===s.kind).price,0),capital);
  for(const r of co.routes){const ships=co.ships.filter(s=>s.route===r.id);assert.ok(ships.length>0);assert.equal(r.mode,i>=4&&i<=6?'land':'sea');assert.equal(r.started,0);assert.equal(r.active,true);
   for(const ship of ships){const q=e.query({query:'opening',kind:ship.kind,stops:r.stops});assert.ok(q.longest<=q.range);assert.ok(q.travelDays.every(d=>d>0));assert.ok(q.missing.every(n=>co.licenses.includes(n)));}
   const v=e.view().companies[i+1].routes.find(v=>v.id===r.id);assert.ok(v.interval>0);assert.ok(Math.abs(v.cycle/v.fleet.length-v.interval)<1e-8);
  }
 }
 assert.equal(e.data.rivals.length,14);assert.equal(e.data.rivals[3].nameEn,'Dutch East India Company');assert.ok(!Object.hasOwn(e.data,'starts'));e.load(g);assert.deepEqual(e.save(),g);
});

test('new roster trades on both continents and retains bounded deterministic saves',async()=>{
 const e=await engine();e.cmd({action:'new',seed:1700,events:false});const start=e.save();
 for(let i=0;i<12;i++)e.cmd({action:'tick',days:30});const year=e.save();assert.equal(year.day,360);
 for(const co of year.companies.slice(1)){assert.ok(co.routes.length<=50);assert.ok(co.ships.length<=150);assert.ok((co.totals.sale??0)>0,co.name+' must have sold cargo');assert.ok(!co.bankrupt,co.name+' must survive its first year');}
 e.load(year);assert.deepEqual(e.save(),year);e.load(start);for(let i=0;i<12;i++)e.cmd({action:'tick',days:30});assert.deepEqual(e.save(),year);
});

test('legacy three-rival saves retain their roster while invalid roster versions and counts are rejected',async()=>{
 const e=await engine(),fresh=e.save();const g=structuredClone(fresh);delete g.roster_version;g.companies.length=4;for(const [i,name]of ['Channel Company','Antilles Company','Ligurian Company'].entries())g.companies[i+1].name=name;
 e.load(g);const legacy=e.save();assert.equal(legacy.roster_version,0);assert.equal(legacy.companies.length,4);assert.equal(legacy.companies[1].name,'Channel Company');e.cmd({action:'tick',days:31});e.load(e.save());const before=e.save();
 for(const mutate of [g=>g.roster_version=6,g=>g.companies.pop(),g=>g.companies[1].id='unexpected',g=>g.roster_version=1]){const bad=structuredClone(before);mutate(bad);assert.throws(()=>e.load(bad));assert.deepEqual(e.save(),before);}
 e.cmd({action:'new',seed:1700,events:false});assert.equal(e.save().companies.length,15);
});


test('ten-rival saves rename Ottoman and Qing merchants without injecting the South Sea Company',async()=>{
 const e=await engine(),g=e.save();g.roster_version=1;g.companies.length=11;g.companies[5].name='オスマン会社';g.companies[7].name='中国商人';
 e.load(g);const expected=structuredClone(g);expected.companies[5].name='オスマン商人';expected.companies[7].name='清国商人';assert.deepEqual(e.save(),expected);assert.equal(e.view().companies.length,11);assert.ok(!e.save().companies.some(c=>c.id==='company-11'));e.load(expected);assert.deepEqual(e.save(),expected);
 g.companies[5].name='Custom Ottoman';g.companies[7].name='Custom Qing';e.load(g);assert.equal(e.save().companies[5].name,'Custom Ottoman');assert.equal(e.save().companies[7].name,'Custom Qing');e.cmd({action:'tick',days:31});e.load(e.save());
 const before=e.save(),bad=structuredClone(before);bad.roster_version=2;assert.throws(()=>e.load(bad));assert.deepEqual(e.save(),before);
 e.cmd({action:'new',seed:1700,events:false});const co=e.save().companies[11];assert.equal(co.name,'南海会社');assert.equal(co.kind,'medium');assert.equal(co.cash,14600);assert.equal(co.ships.length,2);assert.ok(co.ships.every(s=>s.kind==='brig'));assert.deepEqual(co.routes[0].stops.map(n=>e.data.cities[n].id),['london','kingston']);
});


test('eleven-rival saves retain the South Sea Company and Portuguese routes are separate on new games',async()=>{
 const e=await engine(),g=e.save();g.roster_version=2;g.companies.length=12;e.load(g);assert.deepEqual(e.save(),g);e.cmd({action:'tick',days:31});e.load(e.save());assert.equal(e.save().companies[11].name,'南海会社');assert.equal(e.save().companies.length,12);
 e.cmd({action:'new',seed:1700,events:false});const co=e.save().companies[12];assert.equal(co.name,'ポルトガル商館');assert.equal(co.kind,'medium');assert.equal(co.initial_cash,25000);assert.equal(co.cash,14600);assert.equal(co.routes.length,2);assert.equal(co.ships.length,2);assert.deepEqual(co.licenses.map(n=>e.data.nations[n].id),['portugal']);assert.equal(co.friendship[co.licenses[0]],100);
 for(const r of co.routes){assert.equal(r.mode,'sea');assert.equal(co.ships.filter(s=>s.route===r.id).length,1);const q=e.query({query:'opening',kind:'brig',stops:r.stops});assert.ok(q.longest<=5000);}
 assert.deepEqual(co.routes.map(r=>r.stops.map(n=>e.data.cities[n].id)),[['lisbon','luanda'],['luanda','mozambique']]);
});


test('twelve-rival saves remain unchanged; Omani merchants start with licensed long and short sea routes',async()=>{
 const e=await engine(),g=e.save();g.roster_version=3;g.companies.length=13;e.load(g);assert.deepEqual(e.save(),g);e.cmd({action:'tick',days:31});e.load(e.save());assert.equal(e.save().companies.length,13);assert.equal(e.save().companies[12].name,'ポルトガル商館');
 e.cmd({action:'new',seed:1700,events:false});const co=e.save().companies[13];assert.equal(co.name,'オマーン商人');assert.equal(co.kind,'medium');assert.equal(co.initial_cash,25000);assert.equal(co.cash,18000);assert.deepEqual(co.licenses.map(n=>e.data.nations[n].id),['oman']);assert.equal(co.friendship[co.licenses[0]],100);assert.deepEqual(co.routes.map(r=>r.stops.map(n=>e.data.cities[n].id)),[['muscat','mombasa'],['mombasa','zanzibar']]);assert.deepEqual(co.ships.map(s=>s.kind),['brig','sloop']);
 for(const r of co.routes){const ships=co.ships.filter(s=>s.route===r.id);assert.equal(ships.length,1);assert.equal(r.mode,'sea');const q=e.query({query:'opening',kind:ships[0].kind,stops:r.stops});assert.ok(q.longest<=q.range);assert.deepEqual(q.missing.map(n=>e.data.nations[n].id),['oman']);}
});


test('Pondicherry extends old saves without changing existing markets, companies, RNG or journeys',async()=>{
 const e=await engine(),g=e.save();assert.equal(city(e,'pondicherry'),114);const cityData=e.data.cities[114];assert.equal(e.data.nations[cityData.nation].id,'france');assert.equal(cityData.mapName,'Pondicherry');assert.equal(cityData.inland,false);
 g.roster_version=4;g.companies.length=14;delete g.city_version;g.markets.length=114*e.data.goods.length;g.development.length=114;omitUnavailableRoutes(g,114);trimLegacyWorld(g);
 const before=structuredClone(g);e.load(g);const after=e.save();assert.equal(after.city_version,23);assert.equal(after.markets.length,320*e.data.goods.length);assert.equal(after.development[114].owner,'state');assert.deepEqual(after.markets.slice(0,g.markets.length),g.markets);assert.deepEqual(after.development.slice(0,114),g.development);
 const comparison=structuredClone(after);delete comparison.city_version;comparison.markets.length=g.markets.length;comparison.development.length=114;trimLegacyWorld(comparison);assert.deepEqual(comparison,before);e.load(after);assert.deepEqual(e.save(),after);assert.ok(e.view(114).market.every(m=>m.demand>0));
 for(const change of [g=>g.city_version=24,g=>g.markets.pop(),g=>g.development.pop(),g=>g.city_version=1]){const bad=structuredClone(before);change(bad);assert.throws(()=>e.load(bad));assert.deepEqual(e.save(),after);}
 e.cmd({action:'tick',days:31});e.load(e.save());assert.equal(e.save().companies.length,14);
 e.cmd({action:'new',seed:1700,events:false});const co=e.save().companies[14];assert.equal(co.name,'フランス東インド会社');assert.equal(co.cash,3200);assert.equal(co.kind,'small');assert.deepEqual(co.licenses.map(n=>e.data.nations[n].id),['france','mughal']);assert.equal(co.friendship[nation(e,'france')],100);assert.equal(co.friendship[nation(e,'mughal')],60);assert.equal(co.ships[0].kind,'sloop');assert.deepEqual(co.routes[0].stops.map(n=>e.data.cities[n].id),['pondicherry','hughli']);
});


test('Edo is a Japanese port and 115-city saves gain only its new market and development record',async()=>{
 const e=await engine(),i=city(e,'edo');assert.equal(i,115);assert.equal(e.data.cities[i].mapName,'江戸');assert.equal(e.data.nations[e.data.cities[i].nation].id,'japan');assert.equal(e.data.cities[i].inland,false);
 const g=e.save();g.city_version=1;g.markets.length=115*e.data.goods.length;g.development.length=115;omitUnavailableRoutes(g,115);trimLegacyWorld(g);const before=structuredClone(g);e.load(g);const after=e.save();assert.equal(after.city_version,23);assert.equal(after.markets.length,320*e.data.goods.length);assert.equal(after.development[i].owner,'state');const comparable=structuredClone(after);comparable.city_version=1;comparable.markets.length=g.markets.length;comparable.development.length=115;trimLegacyWorld(comparable);assert.deepEqual(comparable,before);e.load(after);assert.deepEqual(e.save(),after);
 assert.ok(e.view(i).market.every(m=>m.demand>0));fund(e);const route=open(e,['edo','osaka']);assert.ok(route);e.cmd({action:'tick',days:30});e.load(e.save());assert.equal(e.save().companies[0].routes[0].stops[0],i);
});


test('Japanese merchants retain Osaka-Nagasaki and add an independently crewed Osaka-Edo sea route',async()=>{
 const e=await engine(),co=e.save().companies[8];assert.equal(co.kind,'small');assert.equal(co.initial_cash,5000);assert.equal(co.cash,1400);assert.deepEqual(co.licenses.map(n=>e.data.nations[n].id),['japan']);assert.deepEqual(co.routes.map(r=>r.stops.map(n=>e.data.cities[n].id)),[['osaka','nagasaki'],['osaka','edo']]);
 for(const r of co.routes){assert.equal(r.mode,'sea');const fleet=co.ships.filter(s=>s.route===r.id);assert.equal(fleet.length,1);assert.equal(fleet[0].kind,'sloop');}e.load(e.save());
});

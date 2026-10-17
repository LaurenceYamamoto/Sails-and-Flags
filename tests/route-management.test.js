import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {bridge} from '../src/wasm-bridge.js';

test('route management: safe renewal, eligibility, automatic creation and budget priorities',async t=>{
 const {instance}=await WebAssembly.instantiate(fs.readFileSync('assets/wasm/engine.wasm'));
 const call=bridge(instance),cmd=command=>call({op:'command',command}),query=request=>call({op:'query',request}),save=()=>JSON.parse(call({op:'save'})),load=g=>call({op:'load',text:JSON.stringify(g)});
 cmd({action:'new',seed:1700,events:false});const data=call({op:'catalog'}),original=save();
 const city=id=>data.cities.findIndex(c=>c.id===id),spec=id=>data.specs.find(s=>s.id===id);
 const fund=(g,cash)=>{g.companies[0].initial_cash+=cash-g.companies[0].cash;g.companies[0].cash=cash;};
 const reset=()=>{const g=structuredClone(original);fund(g,1e7);g.companies[0].licenses=data.nations.map((_,i)=>i);g.companies[0].technology[0]=30;load(g);};
 const policy=(ships=['brig','sloop'],vehicles=[{min:0,max:1,kind:'caravan'}],enabled=true)=>cmd({action:'routePolicy',policy:{enabled,ships,vehicles}});
 const automation=(reserve=1000)=>cmd({action:'automation',enabled:true,replaceLost:true,reserve,expand:0,shrink:100});
 const open=(a,b,kind='sloop')=>cmd({action:'openRoute',kind,stops:[city(a),city(b)],allowed:[0],margin:10000});
 const tick=()=>cmd({action:'tick',days:1});
 await t.test('only licensed cities may enable auto creation; old unlicensed selections are cleared on load',()=>{
  const g=structuredClone(original);fund(g,1e7);load(g);const origin=city('kyoto'),nation=data.cities[origin].nation,before=save();
  assert.equal(call({op:'view',city:origin}).autoRouteEligible,false);
  assert.throws(()=>cmd({action:'autoRoutes',city:origin,enabled:true}),/交易免許/);assert.deepEqual(save(),before);
  cmd({action:'autoRoutes',city:origin,enabled:false});cmd({action:'license',nation});
  assert.equal(call({op:'view',city:origin}).autoRouteEligible,true);cmd({action:'autoRoutes',city:origin,enabled:true});
  const enabled=save();load(enabled);assert.deepEqual(save(),enabled);assert.deepEqual(call({op:'view',city:origin}).autoRouteCities,[origin]);
  const legacy=structuredClone(enabled);legacy.companies[0].licenses=[];load(legacy);const restored=save();
  assert.equal(restored.companies[0].auto_route_cities,undefined);assert.equal(restored.companies[0].cash,legacy.companies[0].cash);
  assert.equal(call({op:'view',city:origin}).autoRouteEligible,false);cmd({action:'license',nation});assert.deepEqual(call({op:'view',city:origin}).autoRouteCities,[]);
 });
 await t.test('priority falls back for waterways and range; designs are eligible; old bulk API is removed',()=>{
  reset();open('ningbo','shanghai');open('shanghai','yangzhou');
  policy();automation();tick();let p=save().companies[0];
  assert.equal(p.routes[0].auto_type,'brig');assert.equal(p.routes[1].auto_type,'sloop');
  assert.equal(p.ships.find(s=>s.route===p.routes[0].id).kind,'brig');assert.equal(p.ships.find(s=>s.route===p.routes[1].id).kind,'sloop');
  const before=save();assert.throws(()=>cmd({action:'replace',mode:'type',source:'sloop',target:'brig'}));assert.throws(()=>query({query:'replacement',mode:'type',source:'sloop',target:'brig'}));assert.deepEqual(save(),before);
  cmd({action:'research',kind:'sloop',budgets:[0,0,0,1000,0]});const design=Object.values(save().designs)[0].id;
  policy(['brig',design]);tick();p=save().companies[0];assert.equal(p.routes[1].auto_type,design);assert.equal(p.ships.find(s=>s.route===p.routes[1].id).kind,design);
  reset();const pair=data.cities.flatMap((a,i)=>data.cities.slice(i+1).map((b,j)=>[i,i+j+1])).find(stops=>{try{const q=query({query:'connection',stops});return q.types.includes('galleon')&&!q.types.includes('sloop');}catch{return false;}});assert.ok(pair);
  cmd({action:'openRoute',kind:'galleon',stops:pair,allowed:[0],margin:10000});policy(['sloop','galleon']);automation();tick();assert.equal(save().companies[0].routes[0].auto_type,'galleon');
 });
 await t.test('vehicle bounds are inclusive and ordered; road improvement changes the choice',()=>{
  reset();const road=data.roads.find(r=>!r.retired&&r.penalty<.6&&r.km<600),stops=[road.a,road.b];
  cmd({action:'openRoute',kind:'wagon',stops,allowed:[0],margin:10000});
  const pass=query({query:'opening',kind:'wagon',stops}).roads.legs[0].passability;
  policy([],[{min:0,max:pass,kind:'caravan'},{min:pass,max:1,kind:'wagon'}]);automation();tick();assert.equal(save().companies[0].routes[0].auto_type,'caravan');
  const g=save();g.roads[data.roads.indexOf(road)].quality=100;load(g);tick();assert.equal(save().companies[0].routes[0].auto_type,'wagon');
  policy([],[]);const noMatch=save();tick();assert.equal(save().companies[0].routes[0].auto_type,noMatch.companies[0].routes[0].auto_type);
 });
 await t.test('renewal preserves cargo until delivery, reuses idle stock and respects the reserve without a monthly limit',()=>{
  reset();const route=open('ningbo','shanghai');policy();automation();let g=save(),s=g.companies[0].ships[0],r=g.companies[0].routes[0];
  s.cargo=[{good:0,quantity:1,cost:10}];s.voyage={from:r.stops[0],to:r.stops[1],total:3,remaining:3,original_cost:10,upkeep:0};load(g);
  tick();let p=save().companies[0];assert.equal(p.ships[0].kind,'sloop');assert.equal(p.ships[0].cargo.length,1);assert.equal(p.ships[0].voyage.remaining,2);
  tick();tick();tick();p=save().companies[0];assert.equal(p.ships[0].kind,'brig');assert.equal(p.ships[0].cargo.length,0);assert.equal(p.routes[0].deliveries,1);
  reset();open('ningbo','shanghai');cmd({action:'buyShip',kind:'brig'});policy();automation();g=save();const idle=g.companies[0].ships[1].id;tick();p=save().companies[0];assert.equal(p.ships.length,1);assert.equal(p.ships[0].id,idle);assert.ok(p.ships[0].route);assert.equal(p.automation.spent,0);assert.equal(p.totals.shipPurchase,g.companies[0].totals.shipPurchase);assert.equal(p.totals.shipSale,spec('sloop').price);
  reset();open('ningbo','shanghai');policy();automation(1e7);tick();assert.equal(save().companies[0].ships[0].kind,'sloop');
  g=save();g.companies[0].automation.budget=1;g.companies[0].automation.spent=1;load(g);
  automation(1000);tick();p=save().companies[0];assert.equal(p.ships[0].kind,'brig');assert.equal(p.automation.spent,1);assert.ok(p.cash>=1000);
 });
 await t.test('expansion and loss replacement ignore exhausted legacy budgets but preserve reserve',()=>{
  for(const lost of [false,true]){
   reset();open('ningbo','shanghai');automation();let g=save(),p=g.companies[0],r=p.routes[0];
   g.day=100;r.cooldown=0;r.activity={since:0,moving:500,loading:0,unloading:0,waiting:0};p.ships.forEach(s=>s.ready=10000);
   p.automation.expand=10;p.automation.budget=1;p.automation.spent=1;p.automation.month=3;
   if(lost)r.replacements=['sloop'];
   load(g);tick();let after=save().companies[0];assert.equal(after.ships.length,2);assert.ok(after.cash>=1000);assert.equal(after.automation.spent,1);
   load(g);automation(1e7);tick();assert.equal(save().companies[0].ships.length,1);
  }
 });
 await t.test('disabled and paused routes and rivals stay outside maintenance; lost vessels use selected type',()=>{
  reset();open('ningbo','shanghai');policy();automation();let g=save();g.companies[0].routes[0].auto_manage=false;load(g);tick();assert.equal(save().companies[0].ships[0].kind,'sloop');
  g=save();g.companies[0].routes[0].auto_manage=true;g.companies[0].routes[0].active=false;load(g);tick();assert.equal(save().companies[0].ships[0].kind,'sloop');
  g=save();g.companies[0].routes[0].active=true;g.companies[0].routes[0].replacements=['sloop'];load(g);tick();assert.ok(save().companies[0].ships.every(s=>s.kind==='brig'));assert.equal(save().companies[0].routes[0].replacements.length,0);assert.ok(save().companies.slice(1).every(c=>!c.route_policy));
 });
 await t.test('new routes are nearest first, duplicate-free, licensed, funded and persisted',()=>{
  reset();const kyoto=city('kyoto');let g=save();g.companies[0].licenses=[data.cities[kyoto].nation];load(g);
  policy(['sloop'],[{min:0,max:1,kind:'caravan'}],false);cmd({action:'autoRoutes',city:kyoto,enabled:true});
  const saved=save();load(saved);assert.deepEqual(save(),saved);tick();let p=save().companies[0];assert.ok(p.routes.length>0);
  const distances=p.routes.map(r=>query({query:'opening',kind:r.auto_type,stops:r.stops}).longest*(r.mode==='sea'?1.852:1));assert.deepEqual(distances,[...distances].sort((a,b)=>a-b));
  assert.ok(p.routes.every(r=>r.stops.includes(kyoto)));const count=p.routes.length;tick();assert.equal(save().companies[0].routes.length,count);
  cmd({action:'autoRoutes',city:kyoto,enabled:false});assert.deepEqual(save().companies[0].auto_route_cities,undefined);
  load(saved);g=save();g.companies[0].licenses=[];load(g);tick();assert.equal(save().companies[0].routes.length,0);
  load(saved);g=save();fund(g,1000);load(g);tick();assert.equal(save().companies[0].routes.length,0);
 });
 await t.test('automatic creation prefers sea for dual-mode pairs and deduplicates two enabled origins',()=>{
  reset();const road=data.roads.find(r=>!r.retired&&query({query:'connection',stops:[r.a,r.b]}).types.includes('sloop'));
  assert.ok(road);policy(['sloop'],[{min:0,max:1,kind:'caravan'}],false);
  cmd({action:'autoRoutes',city:road.a,enabled:true});cmd({action:'autoRoutes',city:road.b,enabled:true});tick();
  const matches=save().companies[0].routes.filter(r=>r.stops.includes(road.a)&&r.stops.includes(road.b));assert.equal(matches.length,1);assert.equal(matches[0].mode,'sea');
 });
 await t.test('scaling purchases precede new routes, then roads and development rights; all preserve reserve',()=>{
  reset();open('cairo','suez','caravan');policy([], [{min:0,max:1,kind:'caravan'}]);
  let g=save();g.companies[0].routes[0].replacements=['caravan'];g.companies[0].licenses=[data.cities[city('cairo')].nation];load(g);
  const p=query({query:'investmentPlan'}).plan;p.reserve=1000;p.roads=true;p.cities=true;p.route_only=true;p.budgets.forEach(b=>b.value=0);
  cmd({action:'investmentPlan',plan:p,automation:{enabled:true,replaceLost:true,budget:1e7,expand:0,shrink:100}});cmd({action:'autoRoutes',city:city('cairo'),enabled:true});g=save();
  tick();let co=save().companies[0];assert.ok(co.routes.length>1);assert.equal(co.ships.filter(s=>s.route===co.routes[0].id).length,2);
  let log=co.ledger.filter(l=>l.day===1);const ship=log.map((l,i)=>l.category==='shipPurchase'?i:-1).filter(i=>i>=0),road=log.findIndex(l=>l.category==='roadPurchase'),development=log.findIndex(l=>l.category==='developmentPurchase');
  assert.ok(ship.length>1);assert.ok(Math.max(...ship)<road);assert.ok(road<development);assert.ok(co.cash>=1000);
  // With only one hull affordable, the lost-vessel claim wins over every new route.
  load(g);const off=structuredClone(g);off.companies[0].automation.enabled=false;off.companies[0].auto_route_cities=[];off.companies[0].investment_plan.roads=false;off.companies[0].investment_plan.cities=false;load(off);tick();const operating=off.companies[0].cash-save().companies[0].cash;
  fund(g,1000+operating+spec('caravan').price+.01);load(g);tick();co=save().companies[0];assert.equal(co.routes.length,1);assert.equal(co.ships.length,2);assert.ok(co.cash>=1000-1e-6);
 });
 await t.test('escort settings apply immediately by mode, including paused routes, and seed automatic routes',()=>{
  reset();open('ningbo','shanghai');open('shanghai','yangzhou');open('cairo','suez','caravan');let before=save();cmd({action:'route',route:before.companies[0].routes[1].id,active:false});before=save();
  cmd({action:'bulkEscorts',mode:'sea',escorts:3});cmd({action:'bulkEscorts',mode:'land',escorts:2});let g=save();assert.equal(g.day,before.day);assert.equal(g.companies[0].cash,before.companies[0].cash);assert.deepEqual(g.companies.slice(1),before.companies.slice(1));
  assert.ok(g.companies[0].routes.every(r=>r.escorts===(r.mode==='sea'?3:2)));assert.deepEqual(g.companies[0].route_escorts,[3,2]);load(g);assert.deepEqual(save(),g);
  g.companies[0].licenses=[data.cities[city('kyoto')].nation,data.cities[city('shanghai')].nation,data.cities[city('cairo')].nation];load(g);policy(['sloop'],[{min:0,max:1,kind:'caravan'}],false);cmd({action:'autoRoutes',city:city('kyoto'),enabled:true});cmd({action:'autoRoutes',city:city('shanghai'),enabled:true});tick();
  const fresh=save().companies[0].routes.filter(r=>!before.companies[0].routes.some(old=>old.id===r.id));assert.ok(fresh.some(r=>r.mode==='sea'));assert.ok(fresh.some(r=>r.mode==='land'));assert.ok(fresh.every(r=>r.escorts===(r.mode==='sea'?3:2)));
  const valid=save(),bad=structuredClone(valid);bad.companies[0].route_escorts=[4,0];assert.throws(()=>load(bad));assert.deepEqual(save(),valid);
 });
 await t.test('malformed policies and cities roll back; old saves do not enable new automation',()=>{
  load(original);assert.equal(save().companies[0].route_policy,undefined);assert.equal(save().companies[0].auto_route_cities,undefined);
  const before=save();for(const policy of [{enabled:true,ships:['wagon'],vehicles:[]},{enabled:true,ships:['sloop','sloop'],vehicles:[]},{enabled:true,ships:[],vehicles:[{min:.8,max:.2,kind:'wagon'}]}]){assert.throws(()=>cmd({action:'routePolicy',policy}));assert.deepEqual(save(),before);const bad=structuredClone(before);bad.companies[0].route_policy=policy;assert.throws(()=>load(bad));assert.deepEqual(save(),before);}
  assert.throws(()=>cmd({action:'autoRoutes',city:9999,enabled:true}));const bad=structuredClone(before);bad.companies[0].auto_route_cities=[1,1];assert.throws(()=>load(bad));assert.deepEqual(save(),before);
 });
});

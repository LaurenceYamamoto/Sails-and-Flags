import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {bridge} from '../src/wasm-bridge.js';

test('facility reduction, bulk levels and utilization automation',async t=>{
 const call=bridge((await WebAssembly.instantiate(fs.readFileSync('assets/wasm/engine.wasm'))).instance);
 const cmd=command=>call({op:'command',command}),q=request=>call({op:'query',request}),save=()=>JSON.parse(call({op:'save'})),load=g=>call({op:'load',text:JSON.stringify(g)}),view=()=>call({op:'view'});
 cmd({action:'new',events:false,seed:1700});const initial=save(),data=call({op:'catalog'}),city=id=>data.cities.findIndex(c=>c.id===id),a=city('kyoto'),b=city('nagoya'),d=city('edo');
 const reset=()=>{const g=structuredClone(initial);g.companies[0].cash=g.companies[0].initial_cash=1e7;g.companies[0].licenses=data.nations.map((_,i)=>i);load(g);};
 const build=city=>cmd({action:'buildPost',city}),up=(city,facility)=>cmd({action:'upgradePost',city,facility}),down=(city,facility,target)=>cmd({action:'lowerPost',city,facility,target});
 const tick=days=>cmd({action:'tick',days}),policy=p=>cmd({action:'facilityPolicy',policy:p});
 const noMarket=city=>cmd({action:'postRules',city,rules:data.goods.map(()=>({buy_below:0,sell_above:0,buy:false,sell:false}))});
 const mutate=fn=>{const g=save();fn(g);load(g);};
 const roundtrip=()=>{const g=save();load(g);assert.deepEqual(save(),g);};
 await t.test('defaults, bounds and invalid settings are atomic',()=>{
  reset();const p=view().facilityPolicy;
  assert.deepEqual([p.warehouse_up,p.warehouse_down,p.handling_up,p.handling_down].map(r=>[r.enabled,r.percent,r.days]),[[false,90,10],[false,50,30],[false,100,3],[false,50,20]]);
  for(const change of [r=>r.warehouse_up.days=0,r=>r.warehouse_up.days=31,r=>r.handling_up.percent=101,r=>r.warehouse_down.percent=90,r=>r.handling_down.percent=-1]){
   const bad=structuredClone(p);change(bad);const before=save();assert.throws(()=>policy(bad));assert.deepEqual(save(),before);
  }
  roundtrip();
 });
 await t.test('bulk expansion quotes incremental costs and insufficient funds leave all posts unchanged',()=>{
  reset();build(a);build(b);up(a,'post');
  const quote=q({query:'postLevel',target:3,raise:true});assert.equal(quote.count,2);assert.equal(quote.cost,2500);
  const cash=save().companies[0].cash;cmd({action:'bulkPostLevel',target:3,raise:true});assert.equal(save().companies[0].cash,cash-2500);
  const before=save();cmd({action:'bulkPostLevel',target:2,raise:true});assert.deepEqual(save(),before);
  cmd({action:'bulkPostLevel',target:2,raise:false});assert.equal(save().companies[0].cash,cash-2500);assert.ok(Object.values(save().companies[0].posts).every(p=>p.level===2));
  mutate(g=>{g.companies[0].initial_cash-=g.companies[0].cash;g.companies[0].cash=0;});const poor=save();assert.throws(()=>cmd({action:'bulkPostLevel',target:3,raise:true}));assert.deepEqual(save(),poor);roundtrip();
 });
 await t.test('warehouse reduction sells exact excess stock, never refunds facilities, and permits removal',()=>{
  reset();build(a);up(a,'warehouse');up(a,'warehouse');up(a,'handling');
  mutate(g=>{g.companies[0].posts[a].stock=[{good:0,quantity:170,cost:1700,from:null}];g.companies[0].posts[a].handled=10;g.companies[0].posts[a].handling_demand=10;});
  const before=save(),stock=before.markets[a*data.goods.length].stock;down(a,'warehouse',1);
  let after=save();assert.equal(after.companies[0].posts[a].stock[0].quantity,100);assert.equal(after.markets[a*data.goods.length].stock,stock+70);
  assert.equal(after.companies[0].totals.postConstruction,before.companies[0].totals.postConstruction);assert.ok(after.companies[0].cash>before.companies[0].cash);
  const cash=after.companies[0].cash;down(a,'handling',0);assert.equal(save().companies[0].cash,cash);roundtrip();
  down(a,'warehouse',0);assert.equal(save().companies[0].posts[a].stock.length,0);roundtrip();
 });
 await t.test('closure removes only routes lacking a surviving endpoint post and settles cargo at cost',()=>{
  reset();build(a);build(b);
  const first=cmd({action:'openRoute',kind:'caravan',stops:[a,b],allowed:[0]}),second=cmd({action:'openRoute',kind:'caravan',stops:[a,d],allowed:[0]});
  mutate(g=>{const s=g.companies[0].ships.find(s=>s.route===second);s.next=g.companies[0].routes.find(r=>r.id===second).stops.indexOf(a);s.cargo=[{good:0,quantity:10,cost:123}];s.voyage={from:a,to:d,total:10,remaining:10,original_cost:123,upkeep:0,direct_sale:true};});
  const before=save();down(a,'post',0);const after=save(),co=after.companies[0];
  assert.equal(co.cash,before.companies[0].cash+123);assert.equal(co.routes.length,1);assert.equal(co.routes[0].id,first);assert.ok(!co.posts[a]);
  assert.equal(co.ships.filter(s=>s.route===null&&s.cargo.length===0).length,1);roundtrip();
  cmd({action:'bulkPostLevel',target:0,raise:false});assert.equal(save().companies[0].routes.length,0);assert.equal(Object.keys(save().companies[0].posts).length,0);roundtrip();
 });
 await t.test('shrinking reserves only fitting inbound cargo and sells the rest at arrival',()=>{
  reset();for(const i of [a,b]){build(i);up(i,'warehouse');noMarket(i);}up(b,'warehouse');
  const id=cmd({action:'openRoute',kind:'caravan',stops:[a,b],allowed:[0]});
  mutate(g=>{const co=g.companies[0],s=co.ships.find(s=>s.route===id),r=co.routes[0];r.active=false;s.next=r.stops.indexOf(a);s.cargo=[{good:0,quantity:20,cost:200}];s.voyage={from:a,to:b,total:1,remaining:1,original_cost:200,upkeep:0,direct_sale:false};co.posts[b].stock=[{good:0,quantity:90,cost:900,from:null}];});
  down(b,'warehouse',1);let co=save().companies[0];assert.equal(co.ships[0].voyage.warehouse_units,10);assert.equal(view().posts.find(p=>p.city===b).reserved,10);roundtrip();
  tick(8);co=save().companies[0];assert.equal(co.posts[b].stock.reduce((n,s)=>n+s.quantity,0),100);assert.ok(co.totals.sale>0);assert.equal(co.posts[b].stock.reduce((n,s)=>n+s.cost,0),1000);roundtrip();
 });
 await t.test('warehouse consecutive-day streaks reset, persist, honor reserve and change only one level',()=>{
  reset();build(a);up(a,'warehouse');noMarket(a);
  const p=view().facilityPolicy;p.warehouse_up={enabled:true,percent:90,days:3};policy(p);
  const stock=n=>mutate(g=>{g.companies[0].posts[a].stock=n?[{good:0,quantity:n,cost:n*10,from:null}]:[];});
  stock(90);tick(2);assert.equal(save().companies[0].posts[a].monitoring[0].up,2);roundtrip();stock(89);tick(1);assert.equal(save().companies[0].posts[a].monitoring[0].up,0);
  stock(90);tick(3);assert.equal(save().companies[0].posts[a].warehouse,2);assert.equal(save().companies[0].posts[a].monitoring[0].up,0);
  p.warehouse_up.days=1;mutate(g=>{g.companies[0].automation.reserve=g.companies[0].cash;g.companies[0].posts[a].stock=[{good:0,quantity:200,cost:2000,from:null}];});policy(p);tick(2);assert.equal(save().companies[0].posts[a].warehouse,2);
  mutate(g=>{g.companies[0].automation.reserve=0;});tick(1);assert.equal(save().companies[0].posts[a].warehouse,3);roundtrip();
 });
 await t.test('30-day automatic reduction retains level one and disabled rules never act',()=>{
  reset();build(a);up(a,'warehouse');up(a,'warehouse');noMarket(a);up(a,'handling');up(a,'handling');
  tick(2);assert.equal(save().companies[0].posts[a].warehouse,2);
  const p=view().facilityPolicy;p.warehouse_down.enabled=true;p.handling_down.enabled=true;p.handling_down.days=30;policy(p);
  tick(29);assert.equal(save().companies[0].posts[a].warehouse,2);assert.equal(save().companies[0].posts[a].handling,2);roundtrip();
  tick(1);assert.equal(save().companies[0].posts[a].warehouse,1);assert.equal(save().companies[0].posts[a].handling,1);tick(31);assert.equal(save().companies[0].posts[a].warehouse,1);assert.equal(save().companies[0].posts[a].handling,1);roundtrip();
 });
 await t.test('handling 100% threshold queues expansion and respects daily lock and shared reserve',()=>{
  reset();build(a);up(a,'handling');const p=view().facilityPolicy;p.handling_up={enabled:true,percent:100,days:1};
  mutate(g=>{g.companies[0].posts[a].handling_demand=10;g.companies[0].posts[a].handled=10;g.companies[0].posts[a].handling_demand=10;});const cash=save().companies[0].cash;policy(p);assert.equal(save().companies[0].posts[a].handling,1);assert.equal(save().companies[0].cash,cash);assert.equal(save().companies[0].posts[a].monitoring[1].expansion_pending,true);roundtrip();tick(1);assert.equal(save().companies[0].posts[a].handling,2);
  mutate(g=>g.companies[0].posts[a].handling_demand=100);policy(p);assert.equal(save().companies[0].posts[a].handling,2);roundtrip();
 });
 await t.test('daily handling measurements reach the default 100% threshold for three consecutive days',()=>{
  reset();build(a);up(a,'handling');
  const id=cmd({action:'openRoute',kind:'caravan',stops:[a,b],allowed:[0]});cmd({action:'buyShip',kind:'caravan'});cmd({action:'assign',route:id,ship:save().companies[0].ships.at(-1).id});
  mutate(g=>{const co=g.companies[0],r=co.routes[0];r.active=false;for(const s of co.ships){s.next=r.stops.indexOf(a);s.cargo=[{good:0,quantity:20,cost:200}];s.voyage=null;s.handling={unloading:true,rate:5,total:4,remaining:4,trip:{from:b,to:a,total:1,remaining:0,original_cost:200,upkeep:0,direct_sale:true}};}});
  const p=view().facilityPolicy;p.handling_up.enabled=true;policy(p);tick(2);assert.equal(save().companies[0].posts[a].handling,1);assert.equal(save().companies[0].posts[a].monitoring[1].up,2);roundtrip();
  tick(1);assert.equal(save().companies[0].posts[a].handling,2);assert.equal(save().companies[0].posts[a].handling_demand,10);roundtrip();
 });
 await t.test('one-day warehouse settings queue expansion and do not build absent facilities',()=>{
  reset();build(a);build(b);up(a,'warehouse');noMarket(a);
  mutate(g=>g.companies[0].posts[a].stock=[{good:0,quantity:90,cost:900,from:null}]);
  const plan=q({query:'investmentPlan'}).plan;plan.reserve=save().companies[0].cash;cmd({action:'investmentPlan',plan});
  const p=view().facilityPolicy;p.warehouse_up={enabled:true,percent:90,days:1};p.warehouse_down={enabled:true,percent:50,days:1};policy(p);assert.equal(save().companies[0].posts[a].warehouse,1);
  plan.reserve=0;cmd({action:'investmentPlan',plan});policy(p);assert.equal(save().companies[0].posts[a].warehouse,1);roundtrip();tick(1);
  assert.equal(save().companies[0].posts[a].warehouse,2);assert.equal(save().companies[0].posts[b].warehouse,0);policy(p);assert.equal(save().companies[0].posts[a].warehouse,2);
  roundtrip();
 });

 await t.test('acquisition combines daily handling demand and resets old utilization streaks',()=>{
  reset();const shared=Number(Object.keys(save().companies[1].posts)[0]);build(shared);up(shared,'handling');
  mutate(g=>{for(const co of g.companies.slice(0,2)){const p=co.posts[shared];p.handling=1;p.handled=10;p.handling_demand=12;p.monitoring[1].up=2;}});
  cmd({action:'acquire',company:1});const p=save().companies[0].posts[shared];assert.equal(p.handling,2);assert.equal(p.handled,20);assert.equal(p.handling_demand,24);assert.equal(p.monitoring[1].up,0);roundtrip();
 });

 await t.test('fleet purchases precede facility expansion, which precedes roads and posts, including one-day rules',()=>{
  for(const days of [1,3]){
   reset();build(a);up(a,'warehouse');noMarket(a);
   const id=cmd({action:'openRoute',kind:'caravan',stops:[a,b],allowed:[0],buyBelow:95,sellAbove:1000});
   const road=data.roads.findIndex(r=>!r.retired&&[r.a,r.b].includes(a)&&[r.a,r.b].includes(b));assert.ok(road>=0);
   mutate(g=>{const co=g.companies[0];co.posts[a].stock=[{good:0,quantity:90,cost:900,from:null}];co.routes[0].replacements=['caravan'];co.ships.forEach(s=>s.ready=10000);co.automation.enabled=false;g.roads[road].owner='state';});
   const base=save();tick(1);const expense=base.companies[0].cash-save().companies[0].cash;load(base);
   const plan=q({query:'investmentPlan'}).plan;plan.reserve=1000;plan.roads=true;plan.cities=true;plan.route_only=true;plan.budgets=plan.budgets.map(()=>({mode:'fixed',value:0}));
   cmd({action:'investmentPlan',plan,automation:{enabled:true,replaceLost:true,expand:0,shrink:100}});
   const price=data.specs.find(s=>s.id==='caravan').price;
   mutate(g=>{const co=g.companies[0],cash=1000+expense+price+500+1;co.initial_cash+=cash-co.cash;co.cash=cash;});
   const p=view().facilityPolicy;p.warehouse_up={enabled:true,percent:90,days};const cash=save().companies[0].cash;policy(p);assert.equal(save().companies[0].cash,cash);
   if(days>1)mutate(g=>{const m=g.companies[0].posts[a].monitoring[0];m.up=days-1;m.sampled=0;});
   roundtrip();tick(1);const after=save(),co=after.companies[0];assert.equal(co.ships.length,2);assert.equal(co.posts[a].warehouse,2);assert.equal(after.roads[road].owner,'state');assert.ok(!co.posts[b]);assert.ok(co.cash>=1000);
   const log=co.ledger.filter(e=>e.day===1);assert.ok(log.findIndex(e=>e.category==='shipPurchase')<log.findIndex(e=>e.category==='postConstruction'));
  }
 });
 await t.test('new routes consume the available budget before queued facility expansion',()=>{
  reset();build(a);up(a,'warehouse');noMarket(a);
  mutate(g=>g.companies[0].posts[a].stock=[{good:0,quantity:90,cost:900,from:null}]);
  const base=save();tick(1);const expense=base.companies[0].cash-save().companies[0].cash;load(base);
  cmd({action:'routePolicy',policy:{enabled:true,ships:[],vehicles:[{min:0,max:1,kind:'caravan'}]}});
  cmd({action:'autoRoutes',city:a,enabled:true});
  const plan=q({query:'investmentPlan'}).plan;plan.reserve=1000;plan.roads=false;plan.cities=false;plan.budgets=plan.budgets.map(()=>({mode:'fixed',value:0}));cmd({action:'investmentPlan',plan});
  mutate(g=>{const co=g.companies[0],cash=1000+expense+data.specs.find(s=>s.id==='caravan').price+1;co.initial_cash+=cash-co.cash;co.cash=cash;});
  const p=view().facilityPolicy;p.warehouse_up={enabled:true,percent:90,days:1};policy(p);assert.equal(save().companies[0].posts[a].warehouse,1);
  roundtrip();tick(1);const co=save().companies[0];assert.equal(co.routes.length,1);assert.equal(co.posts[a].warehouse,1);assert.ok(co.cash>=1000);
 });

 await t.test('legacy individual investment budgets also run after facility expansion',()=>{
  reset();build(a);up(a,'warehouse');noMarket(a);
  mutate(g=>{g.companies[0].posts[a].stock=[{good:0,quantity:90,cost:900,from:null}];g.companies[0].automation.reserve=0;});
  const base=save();tick(1);const expense=base.companies[0].cash-save().companies[0].cash;load(base);
  cmd({action:'technology',kind:0,value:500});
  mutate(g=>{const co=g.companies[0],cash=expense+501;co.initial_cash+=cash-co.cash;co.cash=cash;});
  const p=view().facilityPolicy;p.warehouse_up={enabled:true,percent:90,days:1};policy(p);tick(1);
  const co=save().companies[0];assert.equal(co.posts[a].warehouse,2);assert.equal(co.technology[0],base.companies[0].technology[0]);assert.equal(co.totals.technologyInvestment,undefined);
 });

});

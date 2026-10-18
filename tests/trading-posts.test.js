import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {execFileSync} from 'node:child_process';
import {bridge} from '../src/wasm-bridge.js';

test('trading posts, inventory transfers, handling and migration',async t=>{
 const call=bridge((await WebAssembly.instantiate(fs.readFileSync('assets/wasm/engine.wasm'))).instance);
 const cmd=command=>call({op:'command',command}),q=request=>call({op:'query',request}),save=()=>JSON.parse(call({op:'save'})),load=g=>call({op:'load',text:JSON.stringify(g)}),view=()=>call({op:'view'});
 cmd({action:'new',seed:1700,events:false});const data=call({op:'catalog'}),initial=save(),city=id=>data.cities.findIndex(c=>c.id===id);
 const a=city('kyoto'),b=city('nagoya'),d=city('edo'),goods=data.goods.length;
 const reset=()=>{const g=structuredClone(initial);g.companies[0].cash=g.companies[0].initial_cash=1e7;g.companies[0].licenses=data.nations.map((_,i)=>i);load(g);};
 const build=i=>cmd({action:'buildPost',city:i}),upgrade=(i,facility)=>cmd({action:'upgradePost',city:i,facility});
 const open=(from=a,to=b)=>cmd({action:'openRoute',kind:'caravan',stops:[from,to],allowed:[0],buyBelow:0,sellAbove:0});
 const noMarket=i=>cmd({action:'postRules',city:i,rules:data.goods.map(()=>({buy_below:0,sell_above:0,buy:false,sell:false}))});
 await t.test('licenses, endpoint posts, independent ownership, costs and expansion',()=>{
  assert.throws(()=>build(a));reset();assert.equal(q({query:'opening',kind:'caravan',stops:[a,b]}).hasPost,false);assert.throws(()=>open());
  const cash=save().companies[0].cash;build(a);assert.equal(save().companies[0].cash,cash-500);assert.throws(()=>build(a));
  let p=save().companies[0].posts[a];assert.equal(p.warehouse,0);assert.equal(p.handling,0);const before=view().posts[0].tax;upgrade(a,'post');assert.ok(view().posts[0].tax<before);
  const id=open();assert.ok(save().companies[0].routes.some(r=>r.id===id));
  const shared=Number(Object.keys(save().companies[8].posts)[0]);build(shared);assert.ok(save().companies.slice(1).some(c=>c.posts[shared]));
  const state=save();state.companies[0].initial_cash-=state.companies[0].cash;state.companies[0].cash=0;load(state);const snapshot=save();assert.throws(()=>upgrade(a,'warehouse'));assert.deepEqual(save(),snapshot);
 });
 await t.test('post count scales opening prices and every base fee, while facilities stay separate',()=>{
  reset();const starting=save().companies[0].cash;
  for(const [i,ci] of [a,b,d].entries()){
   assert.equal(view().postBuildCost,500*1.5**i);build(ci);
   for(const p of view().posts){assert.equal(p.baseUpkeep,10*2**i);assert.equal(p.scaleUpkeep,.5);assert.equal(p.fixed,p.baseUpkeep+p.scaleUpkeep);}
  }
  assert.equal(save().companies[0].cash,starting-500-750-1125);assert.equal(view().postBuildCost,1687.5);
  upgrade(a,'warehouse');upgrade(a,'handling');const facilities=view().posts.find(p=>p.city===a);assert.equal(facilities.scaleUpkeep,5.5);
  cmd({action:'tick',days:1});assert.equal(-save().companies[0].totals.postUpkeep,3*(40+.5));
  let g=save();g.companies[0].technology[6]=10;load(g);assert.equal(view().postCountMultiplier,1.25);assert.equal(view().postUpkeepMultiplier,1.5);assert.equal(view().postBuildCost,500*1.25**3);
  assert.ok(view().posts.every(p=>p.baseUpkeep===10*1.5**2));assert.equal(view().posts.find(p=>p.city===a).scaleUpkeep,5.5);
  delete g.companies[0].posts[d];load(g);assert.ok(view().posts.every(p=>p.baseUpkeep===10*1.5));
  const before=save();before.companies[0].initial_cash-=before.companies[0].cash;before.companies[0].cash=0;load(before);const rejected=save();assert.throws(()=>build(d));assert.deepEqual(save(),rejected);
 });
 await t.test('post research affects size and suitable production, and is available through shared research allocation',()=>{
  const growth=[];
  for(const level of [0,10,20]){
   reset();build(a);const g=save(),co=g.companies[0],post=co.posts[a];co.technology[7]=level;
   g.development[a].size=0;g.development[a].production.fill(0);
   const supply=JSON.parse(fs.readFileSync('wasm-core/data/world.json')).cities[a].supply;const good=supply.indexOf(Math.max(...supply));post.size_budget=100;post.production_budget[good]=100;
   load(g);assert.equal(view().postInvestmentEffect,1+.1*level);cmd({action:'tick',days:1});const after=save();
   const factor=.5*(1+.1*level);assert.ok(Math.abs(after.development[a].size-factor*.05)<1e-9);
   assert.ok(Math.abs(after.development[a].production[good]-factor*.05)<1e-9);assert.equal(-after.companies[0].totals.cityInvestment,200);growth.push(after.development[a].size);
  }
  assert.equal(growth[1],growth[0]*2);assert.ok(growth[2]>growth[1]);
  reset();cmd({action:'technology',kind:6,value:100});cmd({action:'technology',kind:7,value:100});cmd({action:'tick',days:1});assert.ok(save().companies[0].technology.slice(6).every(v=>v>0));
  const plan=q({query:'investmentPlan'}).plan;plan.budgets[2]={mode:'fixed',value:310};for(let i=0;i<8;i++)plan.weights['tech:'+i]=i>=6?1:0;
  cmd({action:'investmentPlan',plan});const rows=q({query:'investmentPlan'}).rows.filter(r=>r.category===2);assert.equal(rows.length,8);assert.ok(rows.filter(r=>r.index>=6).every(r=>r.daily===5));assert.ok(rows.filter(r=>r.index<6).every(r=>r.daily===0));
 });
 await t.test('bulk establishment quotes compound each purchase and execution matches the total',()=>{
  reset();const g=save();g.companies[0].licenses=[data.cities[a].nation];load(g);
  const options={mode:'cityPurchase',routeOnly:false,rivals:false},quote=q({query:'bulkInvestment',...options});assert.ok(quote.count>=3);
  quote.rows.forEach((r,i)=>assert.equal(r.price,500*1.5**i));const cash=save().companies[0].cash;
  cmd({action:'bulkInvestment',...options,quote});assert.ok(Math.abs(save().companies[0].cash-(cash-quote.cost))<1e-6);assert.equal(view().posts.length,quote.count);
 });
 await t.test('warehouse-only purchases and sales obey thresholds without handling fees',()=>{
  reset();build(a);upgrade(a,'warehouse');const g=save();g.markets[a*goods].stock=2000;load(g);cmd({action:'tick',days:1});let p=save().companies[0].posts[a];assert.ok(p.stock.some(s=>s.good===0));assert.ok(p.stock.reduce((n,s)=>n+s.quantity,0)<=100);assert.equal(save().companies[0].totals.handlingFee,undefined);
  const n=p.stock.filter(s=>s.good===0).reduce((n,s)=>n+s.quantity,0),s=save();s.markets[a*goods].stock=0;load(s);cmd({action:'tick',days:1});p=save().companies[0].posts[a];assert.ok(p.stock.filter(s=>s.good===0).reduce((n,s)=>n+s.quantity,0)<n);assert.ok(save().companies[0].totals.sale>0);assert.equal(save().companies[0].totals.handlingFee,undefined);
 });
 await t.test('warehouse transfers preserve stock cost, capacity reservations and in-flight saves',()=>{
  reset();for(const i of [a,b]){build(i);upgrade(i,'warehouse');noMarket(i);}
  const g=save();g.companies[0].posts[a].stock=[{good:0,quantity:80,cost:800,from:null}];load(g);open();const baseline=save().companies[0];
  for(let i=0;i<45;i++){cmd({action:'tick',days:1});const invalid=view().companies.flatMap(c=>c.posts.filter(p=>p.capacity&&p.used+p.reserved>p.capacity).map(p=>({company:c.id,city:p.city,used:p.used,reserved:p.reserved,capacity:p.capacity})));assert.deepEqual(invalid,[], 'day '+i);const s=save();load(s);assert.deepEqual(save(),s);for(const p of view().posts)assert.ok(p.used+p.reserved<=p.capacity);}
  const co=save().companies[0],qty=Object.values(co.posts).flatMap(p=>p.stock).reduce((n,s)=>n+s.quantity,0)+co.ships.flatMap(s=>s.cargo).reduce((n,s)=>n+s.quantity,0);
  assert.equal(qty,80);assert.ok(co.posts[b].stock.some(s=>s.good===0));assert.equal(co.totals.sale,baseline.totals.sale);assert.equal(co.totals.purchase,baseline.totals.purchase);assert.ok(co.totals.handlingFee<0);
  assert.ok(!co.posts[a].stock.some(s=>s.from===b));
 });
 await t.test('warehouse construction accepts oversized ongoing deliveries and preserves their market sale through reload',()=>{
  reset();build(a);build(b);const id=open();
  for(let i=0;i<5;i++){cmd({action:'buyShip',kind:'caravan'});cmd({action:'assign',route:id,ship:save().companies[0].ships.at(-1).id});}
  const g=save(),co=g.companies[0],r=co.routes[0];r.active=false;
  // 120 units exceed the first warehouse's 100 units; cover loading, travel
  // and unloading, including old preview saves without a delivery-mode field.
  for(const [i,s] of co.ships.entries()){
   s.cargo=[{good:0,quantity:20,cost:200}];s.voyage=null;s.handling=null;
   const trip={from:a,to:b,total:10,remaining:i%3===2?0:10,original_cost:200,upkeep:0};
   s.next=r.stops.indexOf(i%3===2?b:a);
   if(i%3===1)s.voyage=trip;
   else s.handling={unloading:i%3===2,rate:5,total:4,remaining:4,trip};
  }
  load(g);const before=save(),poor=structuredClone(before);poor.companies[0].initial_cash-=poor.companies[0].cash;poor.companies[0].cash=0;load(poor);
  const rejected=save();assert.throws(()=>upgrade(b,'warehouse'));assert.deepEqual(save(),rejected);load(before);
  upgrade(b,'warehouse');noMarket(b);let state=save();
  assert.equal(state.companies[0].cash,before.companies[0].cash-500);
  assert.ok(state.companies[0].ships.every(s=>(s.voyage??s.handling.trip).direct_sale));
  assert.equal(view().posts.find(p=>p.city===b).reserved,0);
  state.companies[0].posts[b].stock=[{good:1,quantity:90,cost:900,from:null}];load(state);
  // A second expansion is also safe while those deliveries remain in flight.
  upgrade(b,'warehouse');state=save();load(state);assert.deepEqual(save(),state);
  let sold=0;
  for(let i=0;i<25;i++){
   cmd({action:'tick',days:1});const snap=save();load(snap);assert.deepEqual(save(),snap);
   // The ledger retains only 200 entries; collect each day's sales before eviction.
   sold+=snap.companies[0].ledger.filter(e=>e.category==='sale'&&e.day===snap.day).reduce((n,e)=>n+Number(e.detail.split(' · ').at(-1)),0);
   const post=view().posts.find(p=>p.city===b);assert.ok(post.used+post.reserved<=post.capacity);
  }
  const result=save().companies[0];assert.equal(result.ships.flatMap(s=>s.cargo).length,0);
  assert.deepEqual(result.posts[b].stock,[{good:1,quantity:90,cost:900,from:null}]);
  assert.equal(result.routes[0].transport.deliveries,6);assert.ok(result.totals.sale>0);
  assert.equal(sold,120);
  assert.ok(Math.abs(result.cash-result.initial_cash-Object.values(result.totals).reduce((n,v)=>n+v,0))<1e-6);
 });
 await t.test('loads begun after warehouse construction reserve space instead of selling at arrival',()=>{
  reset();build(a);build(b);upgrade(b,'warehouse');noMarket(b);open();
  const g=save(),co=g.companies[0],r=co.routes[0],s=co.ships[0];
  co.posts[b].stock=[{good:1,quantity:90,cost:900,from:null}];
  g.markets[a*goods].stock=2000;s.next=r.stops.indexOf(a);s.ready=0;r.epoch=0;load(g);
  cmd({action:'tick',days:1});let state=save();
  assert.equal(state.companies[0].ships[0].handling.trip.direct_sale,false);
  assert.equal(state.companies[0].ships[0].cargo.reduce((n,c)=>n+c.quantity,0),10);
  assert.equal(view().posts.find(p=>p.city===b).reserved,10);
  state.companies[0].routes[0].active=false;load(state);
  for(let i=0;i<40;i++)cmd({action:'tick',days:1});
  const result=save().companies[0];assert.equal(result.posts[b].stock.reduce((n,c)=>n+c.quantity,0),100);
  assert.equal(result.totals.sale,undefined);assert.equal(view().posts.find(p=>p.city===b).reserved,0);
  load(save());
 });
 await t.test('route price thresholds and bulk changes reject invalid input atomically',()=>{
  reset();build(a);const r=open(),r2=open(a,d);cmd({action:'routePrices',all:true,buyBelow:20,sellAbove:30});assert.ok(save().companies[0].routes.every(r=>r.buy_below===20&&r.sell_above===30));
  cmd({action:'routePrices',route:r,buyBelow:5,sellAbove:10});assert.equal(save().companies[0].routes.find(x=>x.id===r2).buy_below,20);
  const before=save();assert.throws(()=>cmd({action:'routePrices',all:true,buyBelow:100,sellAbove:0}));assert.deepEqual(save(),before);
  build(b);const rules=data.goods.map(()=>({buy_below:15,sell_above:25,buy:true,sell:false}));cmd({action:'postRules',all:true,rules});assert.ok(Object.values(save().companies[0].posts).every(p=>JSON.stringify(p.rules)===JSON.stringify(rules)));
 });
 await t.test('bulk route prices persist as defaults for manual and automatic sea/land routes',()=>{
  reset();assert.deepEqual(view().routePrices,[0,0]);
  cmd({action:'routePrices',all:true,buyBelow:12.5,sellAbove:35});
  assert.deepEqual(save().companies[0].route_prices,[12.5,35]);assert.deepEqual(view().routePrices,[12.5,35]);
  build(a);const g=save();load(g);assert.deepEqual(save(),g);
  const id=cmd({action:'openRoute',kind:'caravan',stops:[a,b],allowed:[0]});
  assert.equal(save().companies[0].routes[0].buy_below,12.5);assert.equal(save().companies[0].routes[0].sell_above,35);
  cmd({action:'routePrices',route:id,buyBelow:5,sellAbove:10});
  assert.deepEqual(view().routePrices,[12.5,35]);
  // Adding a vehicle without explicit prices must not reset route overrides.
  cmd({action:'openRoute',kind:'caravan',stops:[a,b],allowed:[0]});assert.equal(save().companies[0].routes[0].buy_below,5);
  cmd({action:'openRoute',kind:'caravan',stops:[a,d],allowed:[0],buyBelow:0,sellAbove:0});
  assert.equal(save().companies[0].routes.find(r=>r.id!==id).buy_below,0);assert.deepEqual(view().routePrices,[12.5,35]);
  cmd({action:'routePrices',all:true,buyBelow:20,sellAbove:40});assert.ok(save().companies[0].routes.every(r=>r.buy_below===20&&r.sell_above===40));
  const state=save();state.companies[0].licenses=[data.cities[a].nation];load(state);
  const osaka=city('osaka');build(osaka);
  cmd({action:'routePolicy',policy:{enabled:false,ships:['sloop'],vehicles:[{min:0,max:1,kind:'caravan'}]}});
  cmd({action:'autoRoutes',city:a,enabled:true});cmd({action:'autoRoutes',city:osaka,enabled:true});
  const before=save();load(before);cmd({action:'tick',days:1});
  const fresh=save().companies[0].routes.filter(r=>!before.companies[0].routes.some(old=>old.id===r.id));
  assert.ok(fresh.some(r=>r.mode==='sea'));assert.ok(fresh.some(r=>r.mode==='land'));
  assert.ok(fresh.every(r=>r.buy_below===20&&r.sell_above===40));
  assert.ok(save().companies.slice(1).every(c=>c.route_prices===undefined));
  load(save());assert.deepEqual(view().routePrices,[20,40]);
 });
 await t.test('invalid saved or commanded price defaults are atomic; old saves preserve individual prices',()=>{
  reset();build(a);const id=open();cmd({action:'routePrices',route:id,buyBelow:7,sellAbove:13});
  const old=save();delete old.companies[0].route_prices;load(old);
  assert.deepEqual(view().routePrices,[0,0]);assert.equal(save().companies[0].routes[0].buy_below,7);
  const before=save();
  for(const [buy,sell] of [[-1,0],[96,0],[0,-1],[0,1001]]){
   assert.throws(()=>cmd({action:'routePrices',all:true,buyBelow:buy,sellAbove:sell}));assert.deepEqual(save(),before);
   const bad=structuredClone(before);bad.companies[0].route_prices=[buy,sell];assert.throws(()=>load(bad));assert.deepEqual(save(),before);
  }
  cmd({action:'routePrices',all:true,buyBelow:0,sellAbove:0});assert.deepEqual(view().routePrices,[0,0]);
  cmd({action:'new',seed:1700,events:false});assert.deepEqual(view().routePrices,[0,0]);assert.equal(save().companies[0].route_prices,undefined);
 });
 await t.test('daily handling capacity is shared across vessels and excess alone is outsourced',()=>{
  const fees=[];
  for(const levels of [0,1,2]){
   reset();build(a);const id=open();for(let i=0;i<levels;i++)upgrade(a,'handling');
   for(let i=0;i<2;i++){cmd({action:'buyShip',kind:'caravan'});const ship=save().companies[0].ships.at(-1);cmd({action:'assign',route:id,ship:ship.id});}
   const g=save(),co=g.companies[0],r=co.routes[0];r.active=false;
   for(const s of co.ships){s.next=r.stops.indexOf(a);s.voyage=null;s.cargo=[{good:0,quantity:15,cost:150}];s.handling={unloading:false,rate:5,total:3,remaining:3,trip:{from:a,to:b,total:10,remaining:10,original_cost:150,upkeep:0}};}
   load(g);cmd({action:'tick',days:1});const day1=save().companies[0];fees.push(Math.abs(day1.totals.handlingFee??0));
   assert.equal(day1.posts[a].handled,Math.min(levels*10,15));assert.equal(Math.abs(day1.totals.handlingUpkeep??0),4*levels);
   cmd({action:'tick',days:1});assert.equal(Math.abs(save().companies[0].totals.handlingFee??0),fees.at(-1)*2);
   load(save());
  }
  assert.deepEqual(fees,[15,5,0]);
 });
 await t.test('direct market loading requires both source and destination price conditions',()=>{
  for(const [source,target,loads]of [[2000,0,true],[2000,2000,false],[0,0,false]]){
   reset();build(a);open();const g=save(),r=g.companies[0].routes[0],s=g.companies[0].ships[0];s.next=r.stops.indexOf(a);r.epoch=0;s.ready=0;
   g.markets[a*goods].stock=source;g.markets[b*goods].stock=target;load(g);cmd({action:'tick',days:1});
   assert.equal(save().companies[0].ships[0].cargo.length>0,loads,`${source} -> ${target}`);
  }
 });
 await t.test('a warehouse hub forwards cargo without intermediate purchase or sale',()=>{
  reset();for(const i of [a,b,d]){build(i);upgrade(i,'warehouse');noMarket(i);}
  const g=save();g.companies[0].posts[a].stock=[{good:0,quantity:25,cost:250,from:null}];load(g);open();open(b,d);
  for(let i=0;i<6;i++)cmd({action:'tick',days:30});const co=save().companies[0];assert.equal(co.posts[d].stock.reduce((n,s)=>n+s.quantity,0),25);assert.equal(co.posts[d].stock[0].cost,250);assert.equal(co.totals.sale,undefined);assert.equal(co.totals.purchase,undefined);load(save());
 });
 await t.test('acquisition merges facilities and inventory and invalid post saves are atomic',()=>{
  reset();const g=save(),target=g.companies[1],shared=Number(Object.keys(target.posts)[0]);build(shared);upgrade(shared,'warehouse');
  const state=save();state.companies[0].posts[shared].stock=[{good:0,quantity:10,cost:100,from:null}];state.companies[1].posts[shared].warehouse=1;state.companies[1].posts[shared].stock=[{good:0,quantity:5,cost:50,from:null}];load(state);
  cmd({action:'acquire',company:1});const merged=save(),p=merged.companies[0].posts[shared];assert.equal(p.warehouse,2);assert.equal(p.level,2);assert.equal(p.stock[0].quantity,15);assert.equal(p.stock[0].cost,150);assert.deepEqual(merged.companies[1].posts,{});load(merged);assert.deepEqual(save(),merged);
  for(const change of [p=>p.stock[0].quantity=201,p=>p.rules[0].buy_below=100,p=>p.handled=1]){const bad=structuredClone(merged);change(bad.companies[0].posts[shared]);assert.throws(()=>load(bad));assert.deepEqual(save(),merged);}
 });
 await t.test('license revocation removes local posts and affected routes',()=>{
  reset();build(a);open();const g=save(),n=data.cities[a].nation;g.events_enabled=true;g.companies[0].friendship[n]=0;load(g);cmd({action:'tick',days:1});const co=save().companies[0];assert.equal(co.licenses.includes(n),false);assert.equal(co.posts[a],undefined);assert.equal(co.routes.length,0);load(save());
 });
 await t.test('released 3.4.5 saves are rejected atomically; new campaigns save and restore',async()=>{
  reset();build(a);upgrade(a,'warehouse');const current=save();
  const old=bridge((await WebAssembly.instantiate(execFileSync('git',['show','3.4.5:assets/wasm/engine.wasm'],{maxBuffer:30e6}))).instance);
  const legacy=JSON.parse(old({op:'save'}));assert.equal(legacy.version,1);
  assert.throws(()=>load(legacy),/旧版セーブ/);assert.deepEqual(save(),current);
  for(const mutate of [g=>g.version=1,g=>g.post_version=0,g=>delete g.post_version]){const bad=structuredClone(current);mutate(bad);assert.throws(()=>load(bad),/旧版セーブ/);assert.deepEqual(save(),current);}
  load(current);assert.deepEqual(save(),current);
  cmd({action:'new',seed:1700,events:false});const fresh=save();assert.equal(fresh.version,2);assert.equal(fresh.post_version,1);assert.equal(fresh.day,0);assert.deepEqual(fresh.companies[0].posts,{});assert.equal(fresh.companies[0].cash,5000);load(fresh);assert.deepEqual(save(),fresh);
 });
});

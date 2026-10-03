import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {bridge} from '../src/wasm-bridge.js';
const binary=fs.readFileSync(new URL('../assets/wasm/engine.wasm',import.meta.url));
async function engine(){const {instance}=await WebAssembly.instantiate(binary);const call=bridge(instance);return {call,cmd:c=>call({op:'command',command:c}),query:q=>call({op:'query',request:q}),view:city=>call({op:'view',city}),save:()=>JSON.parse(call({op:'save'})),load:g=>call({op:'load',text:JSON.stringify(g)}),data:call({op:'catalog'})};}
function fund(e,value=1e9){const g=e.save();g.companies[0].cash+=value;g.companies[0].initial_cash+=value;e.load(g);}
function city(e,id){return e.data.cities.findIndex(c=>c.id===id);}
function nation(e,id){return e.data.nations.findIndex(n=>n.id===id);}
function open(e,ids,kind='sloop'){const stops=ids.map(id=>city(e,id));for(const n of e.query({query:'opening',kind,stops}).missing)e.cmd({action:'license',nation:n});return e.cmd({action:'openRoute',kind,stops,allowed:e.data.goods.map((_,i)=>i),margin:10});}
test('Wasm owns initial state, license escalation and symmetric tax formula',async()=>{
 const e=await engine();assert.equal(e.data.cities.length,114);assert.equal(e.data.roads.length,69);assert.equal(e.view().licenses.filter(l=>l.owned).length,0);
 e.cmd({action:'license',nation:0});let v=e.view();assert.equal(v.licenses[0].friendship,100);assert.equal(v.licenses[0].tax,5);assert.equal(v.licenses[1].tax,9);assert.equal(v.licenses[1].fee,e.data.nations[1].fee*3);assert.equal(v.licenses[0].daily,e.data.nations[0].daily*10*.6);
 const g=e.save();for(const c of g.companies.slice(1))assert.ok(c.friendship.every(f=>f===60));
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
 for(const road of e.data.roads){assert.ok(e.query({query:'connection',stops:[road.a,road.b]}).types.some(k=>['wagon','camel','mule'].includes(k)));}
});
test('production suitability, nonzero demand and commodity-specific investment',async()=>{
 const e=await engine();fund(e);const london=city(e,'london'),spice=e.data.goods.findIndex(g=>g.id==='spices');const v=e.view(london);assert.ok(v.market.every(m=>m.demand>0));assert.equal(v.market[spice].production,0);
 e.cmd({action:'license',nation:nation(e,'england')});e.cmd({action:'buyDevelopment',city:london});assert.throws(()=>e.cmd({action:'cityInvestment',city:london,good:spice,value:10}));const g=v.market.find(m=>m.production>0).good;e.cmd({action:'cityInvestment',city:london,good:g,value:10});e.cmd({action:'tick',days:31});const w=e.view(london);assert.ok(w.market[g].production>v.market[g].production);assert.equal(w.market[spice].production,0);
});
test('design budgets, names, fleet replacement and automation kind',async()=>{
 const e=await engine();fund(e);const id=open(e,['kingston','havana']);const g=e.save();g.companies[0].technology[0]=30;e.load(g);e.cmd({action:'shipyard'});
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
 const e=await engine();fund(e);open(e,['kingston','havana']);for(let i=0;i<40;i++)e.cmd({action:'tick',days:31});const g=e.save();assert.equal(g.day,1240);assert.ok(g.markets.every(m=>Number.isFinite(m.stock)&&m.stock>=0));assert.ok(g.companies.every(c=>c.ledger.length<=600&&c.history.length<=365));assert.ok(g.companies.slice(1).every(c=>c.routes.length<=50));assert.ok(g.companies[0].routes[0].deliveries>0);assert.equal(e.view().wars.some(w=>Object.hasOwn(w,'until')),false);e.load(g);
});
test('automation buys the designated type, ignores unrelated inventory and shrinks preferred type',async()=>{
 const e=await engine();fund(e);e.cmd({action:'new',seed:1700,events:false});fund(e);const id=open(e,['kingston','havana']);e.cmd({action:'buyShip',kind:'galleon'});e.cmd({action:'route',route:id,kind:'brig',auto:true});
 e.cmd({action:'automation',enabled:true,replaceLost:true,budget:20000,reserve:1000,expand:25,shrink:0});
 let g=e.save();g.day=100;g.companies[0].ships.forEach(s=>s.ready=10000);let r=g.companies[0].routes[0];r.cooldown=0;r.transport={since:0,sales:10000,costs:100,upkeep:0,deliveries:2};e.load(g);e.cmd({action:'tick',days:1});let p=e.view().companies[0];assert.equal(p.ships.filter(s=>s.kind==='brig'&&s.route===id).length,1);assert.equal(p.ships.find(s=>s.kind==='galleon').route,null);
 g=e.save();g.day=200;g.companies[0].ships.forEach(s=>{s.ready=10000;s.voyage=null;s.cargo=[];});r=g.companies[0].routes[0];r.cooldown=0;r.transport={since:0,sales:100,costs:1000,upkeep:0,deliveries:2};e.load(g);e.cmd({action:'tick',days:1});p=e.view().companies[0];assert.equal(p.ships.find(s=>s.kind==='brig').route,null);assert.equal(p.ships.find(s=>s.kind==='sloop').route,id);
});
test('acquisition merges routes and transfers ships without breaking restore validation',async()=>{
 const e=await engine();fund(e);const target=e.save().companies[1],r=target.routes[0];assert.ok(r);for(const n of target.licenses)e.cmd({action:'license',nation:n});e.cmd({action:'openRoute',kind:'sloop',stops:r.stops,allowed:[0,1],margin:10});const count=e.view().companies[0].ships.length+target.ships.length;
 e.cmd({action:'acquire',company:1});assert.equal(e.view().companies.length,3);assert.equal(e.view().companies[0].ships.length,count);assert.equal(e.view().companies[0].routes.length,target.routes.length);e.load(e.save());e.cmd({action:'tick',days:31});e.save();
});
test('unprofitable return legs can reposition empty towards a profitable leg',async()=>{
 const e=await engine();e.cmd({action:'new',seed:1700,events:false});fund(e);const id=open(e,['kingston','havana']);e.cmd({action:'route',route:id,allowed:[0],margin:10});const g=e.save(),len=e.data.goods.length;g.markets[0].stock=2000;g.markets[len].stock=0;e.load(g);let empty=false;for(let i=0;i<40;i++){e.cmd({action:'tick',days:1});const s=e.view().companies[0].ships[0];if(s.voyage&&s.cargo.length===0)empty=true;}assert.ok(empty);e.save();
});
test('calendar uses real month boundaries, and malformed routes cannot trap Wasm',async()=>{
 const e=await engine();e.cmd({action:'tick',days:30});assert.equal(e.save().companies[0].automation.month,0);e.cmd({action:'tick',days:1});assert.equal(e.save().companies[0].automation.month,1);
 fund(e);open(e,['kingston','havana']);const before=e.save();for(const mutate of [r=>r.mode='land',r=>r.stops=[0,999],r=>r.stops=[0,0],r=>r.auto_type='unknown']){const g=structuredClone(before);mutate(g.companies[0].routes[0]);assert.throws(()=>e.load(g));assert.deepEqual(e.save(),before);}
});
test('rival land operations reinvest in roads within the shared investment policy',async()=>{
 const e=await engine();e.cmd({action:'new',seed:1700,events:false});fund(e);const road=e.data.roads.find(r=>r.id==='cairo_suez');const ids=[e.data.cities[road.a].id,e.data.cities[road.b].id];open(e,ids,'camel');const g=e.save(),p=g.companies[0],r=g.companies[1];g.day=58;r.routes=p.routes;r.ships=p.ships;r.licenses=p.licenses;r.cash=1e9;r.initial_cash=r.cash-Object.values(r.totals).reduce((a,b)=>a+b,0);r.kind='large';p.routes=[];p.ships=[];r.ships.forEach(s=>s.ready=10000);r.routes[0].transport={since:0,sales:100000,costs:100,upkeep:0,deliveries:3};e.load(g);e.cmd({action:'tick',days:1});const after=e.save(),owned=after.roads.filter(d=>d.owner===r.id);assert.ok(owned.length>0);assert.ok(owned.some(d=>d.road_budget>0&&d.security_budget>0));assert.ok(after.companies[1].routes.length<=50);e.cmd({action:'tick',days:31});e.save();
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

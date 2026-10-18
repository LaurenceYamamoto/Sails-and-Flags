import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {bridge} from '../src/wasm-bridge.js';
import {WATERWAYS} from '../src/waterway-data.js';
const binary=fs.readFileSync('assets/wasm/engine.wasm');
async function engine(){const {instance}=await WebAssembly.instantiate(binary);const call=bridge(instance);const e={cmd:command=>call({op:'command',command}),query:request=>call({op:'query',request}),save:()=>JSON.parse(call({op:'save'})),load:g=>call({op:'load',text:JSON.stringify(g)}),view:()=>call({op:'view'}),data:call({op:'catalog'})};e.city=id=>e.data.cities.findIndex(c=>c.id===id);return e;}
function fund(e){const g=e.save();g.companies[0].cash+=1e9;g.companies[0].initial_cash+=1e9;g.companies[0].technology[0]=30;e.load(g);}
function open(e,ids,kind='sloop'){const stops=ids.map(e.city);for(const nation of e.query({query:'opening',stops,kind}).missing)e.cmd({action:'license',nation});return e.cmd({action:'openRoute',stops,kind,allowed:e.data.goods.map((_,i)=>i),margin:10});}
// Reconstruct the two pre-waterway rival fleets, rather than falsely labeling
// a new inland-boat save as a historical road save.
function legacy(e,g){g.city_version=23;g.roads.length=353;g.markets.length=320*e.data.goods.length;g.development.length=320;for(const c of g.companies)for(const r of c.routes){if(!e.data.waterways.some(w=>r.stops.includes(w.a)&&r.stops.includes(w.b)))continue;r.mode='land';r.auto_type=c.id==='company-7'?'wagon':'caravan';for(const s of c.ships.filter(s=>s.route===r.id))s.kind=r.auto_type;}return g;}

test('Allowlisted sailing waterways preserve converted road slots and admit only Sloops, in both directions',async()=>{
 const e=await engine();assert.equal(e.data.waterways.length,10);assert.deepEqual(e.data.waterways.map(w=>w.id),Object.keys(WATERWAYS));
 for(const w of e.data.waterways){
  const r=e.data.roads.find(r=>r.id===w.id);if(r){assert.ok(r.retired&&r.retired_since===(WATERWAYS[w.id].since??24));assert.deepEqual([w.a,w.b],[r.a,r.b]);}else assert.ok(WATERWAYS[w.id].a);assert.ok(w.nm>0&&w.points.length>=3);
  for(const stops of [[w.a,w.b],[w.b,w.a]]){const q=e.query({query:'connection',stops});assert.equal(q.waterway,true);assert.deepEqual(q.types.filter(k=>!['wagon','caravan'].includes(k)),['sloop']);assert.equal(q.default,'sloop');for(const kind of ['brig','fluyt','galleon'])assert.throws(()=>e.query({query:'opening',stops,kind}));}
 }
 assert.ok(e.query({query:'connection',stops:['cairo','suez'].map(e.city)}).types.includes('caravan'));
 assert.ok(e.query({query:'connection',stops:['detroit','albany'].map(e.city)}).types.includes('caravan'));
 assert.ok(!e.data.waterways.some(w=>w.id==='tianjin_jinan'));
});

test('waterway hull provenance survives design, rename, replacement and save/load',async()=>{
 const e=await engine();fund(e);const route=open(e,['newyork','albany']);
 for(const kind of ['sloop','brig'])e.cmd({action:'research',kind,budgets:[1000,1000,1000,1000,1000]});
 const designs=Object.values(e.save().designs),small=designs.find(s=>s.baseHull==='sloop').id,large=designs.find(s=>s.baseHull==='brig').id;
 e.cmd({action:'rename',kind:'design',id:small,name:'Renamed vessel'});e.cmd({action:'rename',kind:'design',id:large,name:'Sloop'});
 const stops=['newyork','albany'].map(e.city),q=e.query({query:'connection',stops});assert.ok(q.types.includes(small));assert.ok(!q.types.includes(large));
 const originalShip=e.save().companies[0].ships[0].id;e.cmd({action:'release',ship:originalShip});e.cmd({action:'sellShip',ship:originalShip});const designed=e.cmd({action:'buyShip',kind:small});e.cmd({action:'assign',route,ship:designed});e.cmd({action:'route',route,kind:small,auto:true});
 const ship=e.cmd({action:'buyShip',kind:'brig'}),before=e.save();
 for(const command of [{action:'assign',route,ship},{action:'route',route,kind:large},{action:'replace',mode:'route',route,target:'brig',source:''},{action:'replace',mode:'automation',source:small,target:large}]){assert.throws(()=>e.cmd(command));assert.deepEqual(e.save(),before);}
 e.load(before);assert.deepEqual(e.save(),before);assert.equal(e.view().companies[0].routes[0].waterway,true);
 for(const mutate of [g=>g.companies[0].ships[0].kind='brig',g=>g.companies[0].routes[0].auto_type='brig',g=>g.companies[0].routes[0].replacements=['brig'],g=>g.designs[small].baseHull='brig',g=>delete g.designs[small].baseHull]){const bad=structuredClone(before);mutate(bad);assert.throws(()=>e.load(bad));assert.deepEqual(e.save(),before);}
 e.cmd({action:'automation',enabled:true,replaceLost:true,budget:50000,reserve:0,expand:10,shrink:30});
 const scaling=e.save();scaling.day=100;const r=scaling.companies[0].routes[0];r.cooldown=0;r.activity={since:0,moving:100,loading:20,unloading:20,waiting:0};scaling.companies[0].ships.forEach(s=>s.ready=10000);e.load(scaling);e.cmd({action:'tick',days:1});const fleet=e.save().companies[0].ships;assert.equal(fleet.filter(s=>s.route===route&&s.kind===small).length,2);assert.equal(fleet.find(s=>s.kind==='brig').route,null);
});

test('river geometry, sea/river two-city services, travel, handling and trade execute in Wasm',async()=>{
 const e=await engine();e.cmd({action:'new',seed:1700,events:false});fund(e);open(e,['newyork','albany']);open(e,['albany','boston']);
 let g=e.save();for(const c of g.companies.slice(1))for(const r of c.routes)r.active=false;
 const [a,b]=['newyork','albany'].map(e.city);for(let i=0;i<e.data.goods.length;i++){g.markets[a*e.data.goods.length+i].stock=2000;g.markets[b*e.data.goods.length+i].stock=0;}e.load(g);
 const w=e.data.waterways.find(w=>w.id==='newyork_albany'),v=e.view();assert.deepEqual(v.paths[`sea:${a}:${b}`],[w.points]);assert.deepEqual(v.paths[`sea:${b}:${a}`],[[...w.points].reverse()]);
 assert.equal(e.query({query:'opening',kind:'sloop',stops:[a,b]}).travelDays[0],Math.ceil(w.nm/e.data.specs.find(s=>s.id==='sloop').speed));
 e.cmd({action:'tick',days:60});const after=e.save();assert.ok(after.companies[0].routes[0].deliveries>0);assert.ok(after.companies[0].routes[0].activity.loading>0);assert.ok(after.companies[0].routes[0].activity.unloading>0);e.load(after);assert.deepEqual(e.save(),after);
});

test('legacy waterway conversion refunds cargo and road basis/pool exactly once and preserves hulls',async()=>{
 const e=await engine();fund(e);open(e,['newyork','albany']);const g=legacy(e,e.save()),co=g.companies[0],s=co.ships[0],r=co.routes[0];
 const index=e.data.roads.findIndex(r=>r.id==='newyork_albany');g.roads[index]={owner:'player',basis:1200,pool:50,quality:3,security:2,road_budget:20,security_budget:5};s.cargo=[{good:0,quantity:10,cost:100}];s.voyage={from:r.stops[0],to:r.stops[1],total:5,remaining:3,original_cost:100,upkeep:0};const cash=co.cash,shipId=s.id;
 e.load(g);const after=e.save(),p=after.companies[0];assert.equal(after.city_version,30);assert.equal(p.cash,cash+1350);assert.equal(p.ships[0].id,shipId);assert.equal(p.ships[0].kind,'caravan');assert.equal(p.ships[0].route,null);assert.equal(p.ships[0].voyage,null);assert.deepEqual(p.ships[0].cargo,[]);assert.equal(p.routes.length,0);assert.equal(after.roads[index].owner,'state');assert.equal(after.roads[index].basis,0);
 e.load(after);assert.deepEqual(e.save(),after);assert.throws(()=>e.cmd({action:'buyRoad',road:index}));assert.throws(()=>e.cmd({action:'roadInvestment',road:index,roadBudget:100,securityBudget:0}));
});

test('renamed legacy sea designs recover their original base using the retained hull level',async()=>{
 const e=await engine();fund(e);for(const kind of ['sloop','brig','fluyt','galleon','corvette'])e.cmd({action:'research',kind,budgets:[500,500,500,500,500]});
 const g=legacy(e,e.save()),origins=Object.values(g.designs).map(s=>[s.id,s.baseHull]);for(const s of Object.values(g.designs)){delete s.baseHull;s.name='Custom';s.nameEn='Custom';}
 e.load(g);for(const [id,base]of origins)assert.equal(e.save().designs[id].baseHull,base);
 const q=e.query({query:'connection',stops:['newyork','albany'].map(e.city)});assert.deepEqual(q.types.filter(k=>!['wagon','caravan'].includes(k)),['sloop',origins.find(([,b])=>b==='sloop')[0]]);
});

test('regional rivals retain their 3.3.10 land fleets and the 50 route cap',async()=>{
 const e=await engine();for(const id of ['company-6','company-7']){const c=e.view().companies.find(c=>c.id===id);assert.ok(c.routes.some(r=>r.mode==='land'));assert.ok(c.routes.every(r=>!r.waterway));}
 e.cmd({action:'tick',days:31});const g=e.save();assert.ok(g.companies.slice(1).every(c=>c.routes.length<=50));e.load(g);assert.deepEqual(e.save(),g);
});

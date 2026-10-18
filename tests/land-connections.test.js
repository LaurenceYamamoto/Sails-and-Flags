import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {execFileSync} from 'node:child_process';
import {bridge} from '../src/wasm-bridge.js';

test('connected land services use all intermediate roads without trading at intermediate cities',async t=>{
 const call=bridge((await WebAssembly.instantiate(fs.readFileSync('assets/wasm/engine.wasm'))).instance);
 const cmd=command=>call({op:'command',command}),query=request=>call({op:'query',request}),save=()=>JSON.parse(call({op:'save'})),load=g=>call({op:'load',text:JSON.stringify(g)});
 cmd({action:'new',seed:1700,events:false});const data=call({op:'catalog'}),original=save();
 const city=id=>data.cities.findIndex(c=>c.id===id),nation=id=>data.nations.findIndex(n=>n.id===id);
 const stops=['kyoto','edo'].map(city),quote=(points=stops,kind='caravan')=>query({query:'opening',kind,stops:points});
 const reset=()=>{const g=structuredClone(original);g.companies[0].cash=g.companies[0].initial_cash=1e9;g.companies[0].licenses=data.nations.map((_,i)=>i);load(g);};
 const open=(points=stops,margin=0)=>cmd({action:'openRoute',kind:'caravan',stops:points,allowed:data.goods.map((_,i)=>i),margin});
 await t.test('shortest indirect path is symmetric, uses cumulative range and retains direct roads',()=>{
  reset();const q=quote(),path=['edo','sunpu','nagoya','kyoto'].map(city);
  assert.equal(q.longest,535);assert.deepEqual(q.roads.legs.slice(0,3).map(l=>l.from).concat(q.roads.legs[2].to),path);
  assert.deepEqual(q.roads.legs.slice(3).map(l=>[l.from,l.to]),q.roads.legs.slice(0,3).toReversed().map(l=>[l.to,l.from]));
  assert.equal(quote(stops.toReversed()).longest,q.longest);
  assert.throws(()=>quote(['lima','quito'].map(city),'wagon'));assert.equal(quote(['lima','quito'].map(city)).longest,2030);
  const spec=data.specs.find(s=>s.id==='caravan'),days=Math.ceil(q.roads.legs.slice(0,3).reduce((n,l)=>n+l.distance/(spec.speed*l.speedFactor),0));
  assert.deepEqual(q.travelDays,[days,days]);
  const pass=q.roads.legs.slice(0,3).reduce((n,l)=>n+l.distance*l.passability,0)/q.longest;
  assert.ok(Math.abs(q.disasterRates[0]/100-(.0002+.0008*(1-pass)*(1-spec.roughness)))<1e-12);
  const improved=save();for(const l of q.roads.legs)improved.roads[l.road].quality=100;load(improved);
  assert.ok(quote().travelDays[0]<q.travelDays[0]);assert.ok(quote().disasterRates[0]<q.disasterRates[0]);
  const direct=data.roads.find(r=>!r.retired&&r.a===city('london')&&r.b===city('york'));
  assert.equal(quote([direct.a,direct.b]).longest,direct.km);assert.equal(quote([direct.a,direct.b]).roads.legs.length,2);
  assert.throws(()=>quote(['london','edo'].map(city)));assert.throws(()=>quote(['moscow','beijing'].map(city)));
  const r=query({query:'connection',stops});assert.ok(r.types.includes('caravan'));assert.ok(r.types.includes('wagon'));
 });
 await t.test('transit nations are required and all traversed roads contribute to budgets and fleet policy',()=>{
  reset();const points=['genoa','rome'].map(city),q=quote(points);const transit=new Set(q.roads.legs.flatMap(l=>data.roads[l.road].nations));
  const endpoints=new Set(points.map(i=>data.cities[i].nation)),middle=[...transit].find(n=>!endpoints.has(n));assert.notEqual(middle,undefined);
  const g=save();g.companies[0].licenses=[...endpoints];load(g);assert.ok(quote(points).missing.includes(middle));const before=save();assert.throws(()=>open(points));assert.deepEqual(save(),before);
  reset();open(stops,10000);const roads=quote().roads.legs.slice(0,3).map(l=>l.road);
  const purchase=query({query:'bulkInvestment',mode:'roadPurchase',rivals:true});assert.deepEqual(new Set(purchase.rows.map(r=>r.road)),new Set(roads));
  const state=save();for(const i of roads)state.roads[i].owner='state';load(state);
  cmd({action:'roadAuto',enabled:true,rivals:false,reserve:1000});cmd({action:'tick',days:1});assert.ok(roads.every(i=>save().roads[i].owner==='player'));
  const pass=quote().roads.legs.slice(0,3).reduce((n,l)=>n+l.distance*l.passability,0)/535;
  cmd({action:'automation',enabled:true,replaceLost:true,reserve:1000,expand:0,shrink:100});
  cmd({action:'routePolicy',policy:{enabled:true,ships:[],vehicles:[{min:0,max:1,kind:'wagon'}]}});
  cmd({action:'tick',days:1});assert.equal(save().companies[0].routes[0].auto_type,'wagon');
  cmd({action:'routePolicy',policy:{enabled:true,ships:[],vehicles:[{min:0,max:pass-.001,kind:'wagon'},{min:pass-.001,max:1,kind:'caravan'}]}});
  cmd({action:'tick',days:1});assert.equal(save().companies[0].routes[0].auto_type,'caravan');
 });
 await t.test('automatic creation includes non-adjacent land endpoints',()=>{
  reset();cmd({action:'routePolicy',policy:{enabled:true,ships:[],vehicles:[{min:0,max:1,kind:'caravan'}]}});
  cmd({action:'autoRoutes',city:city('kyoto'),enabled:true});cmd({action:'tick',days:15});
  const routes=save().companies[0].routes;assert.ok(routes.some(r=>r.mode==='land'&&stops.every(s=>r.stops.includes(s))));
  assert.ok(routes.every(r=>r.stops.length===2));
 });
 await t.test('map geometry, transit tolls, endpoint-only cargo handling and save round trips agree',()=>{
  reset();const q=quote(),roads=q.roads.legs.slice(0,3).map(l=>l.road),g=save();
  for(const i of roads)g.roads[i].owner=g.companies[1].id;
  const good=0;g.markets[stops[0]*data.goods.length+good].stock=2000;g.markets[stops[1]*data.goods.length+good].stock=0;load(g);
  const id=open();const p=save().companies[0],r=p.routes.find(r=>r.id===id),ship=p.ships.find(s=>s.route===id),view=call({op:'view'});
  const key=`land:${r.stops[0]}:${r.stops[1]}`,back=`land:${r.stops[1]}:${r.stops[0]}`;
  assert.deepEqual(view.paths[key][0],view.paths[back][0].toReversed());
  for(const l of quote(r.stops).roads.legs.slice(0,3))for(const point of data.roads[l.road].points)assert.ok(view.paths[key][0].some(p=>JSON.stringify(p)===JSON.stringify(point)));
  let progressed=false;
  for(let i=0;i<120;i++){
   cmd({action:'tick',days:1});const current=save(),co=current.companies[0],s=co.ships.find(s=>s.id===ship.id);
   for(const trip of [s.voyage,s.handling?.trip].filter(Boolean)){assert.ok(stops.includes(trip.from));assert.ok(stops.includes(trip.to));}
   if(s.handling||s.voyage){const snap=save();load(snap);assert.deepEqual(save(),snap);progressed=true;}
   if(co.routes.find(r=>r.id===id).deliveries>0)break;
  }
  assert.ok(progressed);const after=save();assert.ok(after.companies[0].routes.find(r=>r.id===id).deliveries>0);
  assert.ok(after.companies[0].totals.roadToll<0);assert.ok(roads.every(i=>after.roads[i].pool>0 || after.companies[1].ledger.some(l=>l.category==='roadIncome'&&l.detail===data.roads[i].id)));
  const snapshot=save();const bad=structuredClone(snapshot);bad.land_path_version=2;assert.throws(()=>load(bad));assert.deepEqual(save(),snapshot);
 });
 await t.test('retired direct roads remain retired while new detours survive save/load',()=>{
  reset();const points=['madrid','barcelona'].map(city),q=quote(points);assert.equal(q.roads.legs.length,4);
  assert.ok(q.roads.legs.every(l=>!data.roads[l.road].retired));open(points,10000);const snap=save();load(snap);assert.deepEqual(save(),snap);
  const legacy=structuredClone(snap);delete legacy.land_path_version;assert.throws(()=>load(legacy));assert.deepEqual(save(),snap);
 });
 await t.test('real 3.4.4 save gains only the path version and keeps the existing direct routes',async()=>{
  const oldBytes=execFileSync('git',['show','3.4.4:assets/wasm/engine.wasm'],{maxBuffer:30*1024*1024});
  const oldCall=bridge((await WebAssembly.instantiate(oldBytes)).instance);oldCall({op:'command',command:{action:'new',seed:1700,events:false}});
  const old=JSON.parse(oldCall({op:'save'}));load(old);assert.deepEqual(save(),{...old,land_path_version:1});
 });
});

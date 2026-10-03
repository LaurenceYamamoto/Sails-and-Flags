import {productionExpected} from './production-migration-expected.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import * as game from './licensed-game.js';
import * as old from '../src/legacy/engine-v12.js';
import {PORT_APPROACHES as OLD_PORTS,seaRoute as oldSeaRoute} from '../src/legacy/sea-routing-v12.js';
import {seaRoute} from '../src/sea-routing.js';
import {CROSSINGS,CROSSING_PORTS,CROSSING_ROADS,isCrossingRoad} from '../src/crossing-data.js';
import {roadBetween} from '../src/land-data.js';
import {travelDistance,routeNations} from '../src/land.js';
import {buyRoadRight,setRoadInvestment} from '../src/legacy/land-v12.js';
import {SAVE_KEYS,listSaves,saveGame} from '../src/storage.js';
import {renderMap} from '../src/map-view.js';
import {renderLand} from '../src/land-view.js';

test('crossings are complete wagon circuits with explicit national licenses and no canals',()=>{
 const s=game.createGame();
 for(const [id,stops] of Object.entries(CROSSINGS)){
  assert.ok(game.routeLegs({stops}).every(([a,b])=>roadBetween(a,b)),id);
  assert.deepEqual(routeNations({mode:'land',stops}),[id==='egypt'?'ottoman':'spain']);
  const raw=game.serialize(s);assert.ok(game.quoteCircuitOpening(s,'wagon',stops).error);
  assert.throws(()=>game.openCircuit(s,'wagon',stops));assert.equal(game.serialize(s),raw);
 }
 assert.equal(travelDistance(s,'wagon','portobelo','panama'),100);
 assert.equal(travelDistance(s,'wagon','cairo','suez'),150);
 assert.equal(travelDistance(s,'wagon','alexandria','suez'),Infinity,'Cairo must be specified');
 assert.ok(seaRoute('panama','portobelo').coordinates.some(([,lat])=>lat<-55));
 assert.ok(seaRoute('alexandria','suez').coordinates.some(([,lat])=>lat<-34));
 assert.ok(seaRoute('suez','mocha').nm<1800&&seaRoute('panama','callao').nm<1800);
 assert.ok(isCrossingRoad('panama','portobelo'));
});

test('all 2,145 existing sea routes retain their exact distance and geometry',()=>{
 const ids=Object.keys(OLD_PORTS);
 for(const [i,a] of ids.entries())for(const b of ids.slice(i+1))assert.deepEqual(seaRoute(a,b),oldSeaRoute(a,b),a+'-'+b);
});

test('v12 migration adds only crossing markets and rights while preserving voyages, cash and RNG',()=>{
 const before=old.createGame(42,{events:false});old.entry(before,'sale',10000);
 for(const n of ['spain','portugal'])old.buyLicense(before,n);
 old.openCircuit(before,'sloop',['kingston','havana']);old.openCircuit(before,'wagon',['lisbon','porto']);
 buyRoadRight(before,'lisbon_porto');setRoadInvestment(before,'lisbon_porto',2,3);old.tick(before);
 const raw=old.serialize(before),s=game.deserialize(raw),expected=productionExpected(JSON.parse(raw)),actual=JSON.parse(game.serialize(s));
 for(const id of Object.keys(CROSSING_PORTS)){delete actual.markets[id];delete actual.world.development[id];}
 for(const id of Object.keys(CROSSING_ROADS))delete actual.world.roads[id];
 for(const c of [actual,...actual.competitors])c.version=12;
 assert.deepEqual(actual,expected);assert.deepEqual(game.deserialize(game.serialize(s)),s);
 const values=new Map([[SAVE_KEYS.autoV12,raw],[SAVE_KEYS.preservedContinents,raw]]),storage={getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,v)};
 saveGame(storage,s);assert.equal(values.get(SAVE_KEYS.autoV12),raw);assert.equal(values.get(SAVE_KEYS.preservedContinents),raw);assert.equal(values.get(SAVE_KEYS.preserved),undefined);assert.ok(listSaves(storage).every(x=>x.valid));
 for(const corrupt of [v=>delete v.world.roads.cairo_suez,v=>delete v.markets.suez,v=>v.cash++]){const v=JSON.parse(game.serialize(s));corrupt(v);assert.throws(()=>game.deserialize(JSON.stringify(v)));}
});

test('crossing presets render land previews and leave configuration and purchase to the player',()=>{
 const s=game.createGame(),before=game.serialize(s),html=renderLand(s,{cash:String,decimal:String});
 for(const [id,stops] of Object.entries(CROSSINGS)){
  assert.ok(html.includes(`data-action="open-crossing" data-id="${id}"`));
  const map=renderMap(s,stops[0],null,()=> 'translate(0,0)',{plannedStops:stops,mapPlanning:true});
  assert.equal((map.match(/class="planned-route/g)??[]).length,stops.length);
 }
 assert.equal(game.serialize(s),before);
});

for(const seed of [1,42,1700])test(`sea and wagon services at both crossings trade, share markets and restore deterministically: seed ${seed}`,()=>{
 let s=game.createGame(seed,{events:false});game.entry(s,'sale',100000);
 for(const n of ['ottoman','yemen','spain'])game.buyLicense(s,n);
 const routes=[...Object.values(CROSSINGS).map(stops=>game.openCircuit(s,'wagon',stops,undefined,0)),
  ...[['suez','mocha'],['panama','callao'],['portobelo','cartagena'],['alexandria','istanbul']].map(stops=>game.openCircuit(s,'sloop',stops,undefined,0))];
 const roadQuote=game.quoteCircuitOpening(s,'wagon',CROSSINGS.panama);assert.equal(roadQuote.cost,0);assert.equal(roadQuote.existingRouteId,routes[1].id);
 // Observe actual wagon deliveries as well as cumulative route results.
 const wagon=s.ships.find(v=>v.routeId===routes[1].id);let deliveryObserved=false;
 for(let day=0;day<365;day++){
  const arriving=wagon.voyage?.remaining===1,items=arriving?structuredClone(wagon.cargo):[];
  // Normal simulation (including competitors); aggregate delivery assertions below.
  game.tick(s);
  if(arriving&&items.length)deliveryObserved=true;
  if(day===179){const copy=game.deserialize(game.serialize(s));game.tick(s);game.tick(copy);assert.deepEqual(s,copy);}
 }
 assert.ok(deliveryObserved);assert.equal(s.gameOver,false);
 for(const r of routes){assert.ok(r.deliveries>=2,r.stops.join('-'));assert.ok(r.transport.sales>0);}
 assert.ok(s.competitors.every(c=>c.routes.length<=50));
 assert.ok(Math.abs(s.cash-s.initialCash-Object.values(s.totals).reduce((a,b)=>a+b,0))<.001);
 assert.deepEqual(game.deserialize(game.serialize(s)),s);
});

 test('wagon deliveries enter the shared coastal market stock exactly once',()=>{
 const s=game.createGame(42,{events:false});game.buyLicense(s,'spain');
 const q=game.quoteCircuitOpening(s,'wagon',CROSSINGS.panama);assert.equal(q.cost,600);assert.equal(q.error,null);
 const r=game.openCircuit(s,'wagon',CROSSINGS.panama,undefined,0),v=s.ships.find(v=>v.routeId===r.id);
 for(let i=0;i<25&&v.voyage?.remaining!==1;i++)game.tick(s,{updateMarkets:false});
 assert.equal(v.voyage?.remaining,1);assert.ok(v.cargo.length);
 const to=v.voyage.to,items=structuredClone(v.cargo),before=Object.fromEntries(items.map(c=>[c.good,s.markets[to][c.good].stock]));
 game.tick(s,{updateMarkets:false});
 for(const item of items)assert.ok(Math.abs(s.markets[to][item.good].stock-before[item.good]-item.quantity)<1e-9);
 assert.equal(v.cargo.length,0);assert.equal(v.voyages,1);assert.deepEqual(game.deserialize(game.serialize(s)),s);
 });

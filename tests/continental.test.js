import {CROSSING_PORTS,CROSSING_ROADS} from '../src/crossing-data.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import * as game from '../src/engine.js';
import * as old from '../src/legacy/engine-v11.js';
import {CITIES,GOODS,NATIONS,distance} from '../src/data.js';
import {CITIES as OLD_CITIES} from '../src/legacy/data-v11.js';
import {CONTINENTAL_CITIES,CONTINENTAL_ROADS,CONTINENTAL_NATIONS,ROAD_REGIONS} from '../src/continental-data.js';
import {ROADS,WAGONS} from '../src/land-data.js';
import {buyRoadRight,setRoadInvestment} from '../src/legacy/land-v11.js';
import {roadQuote,routeNations} from '../src/land.js';
import {nauticalDistance} from '../src/world-geometry.js';
import {SAVE_KEYS,saveGame,listSaves} from '../src/storage.js';
import {renderLand} from '../src/land-view.js';
import {setLanguage,LANGUAGES} from '../src/i18n.js';

test('44 distinct inland hubs connect to existing ports through 59 realistic-length corridors',()=>{
 assert.equal(Object.keys(CONTINENTAL_CITIES).length,44);assert.equal(Object.keys(CONTINENTAL_ROADS).length,59);
 assert.equal(Object.keys(CITIES).length,114);assert.equal(Object.keys(ROADS).length,69);
 for(const [id,c] of Object.entries(CONTINENTAL_CITIES)){
  assert.ok(!OLD_CITIES[id],`new city overwrites ${id}`);assert.ok(NATIONS[c.nation]);
  const reachable=new Set([id]);let previous=-1;
  while(previous!==reachable.size){previous=reachable.size;for(const r of Object.values(ROADS))if(reachable.has(r.a)||reachable.has(r.b)){reachable.add(r.a);reachable.add(r.b);}}
  assert.ok([...reachable].some(x=>!CITIES[x].inland),`${id} has no coastal gateway`);
  assert.equal(distance(id,'london'),Infinity);
  for(const g of c.exports){const i=GOODS.findIndex(x=>x.id===g);assert.ok(i>=0);assert.ok(CITIES[id].supply[i]>CITIES[id].demand[i]);}
 }
 const pairs=new Set();for(const r of Object.values(ROADS)){
  assert.ok(CITIES[r.a]&&CITIES[r.b]);const pair=[r.a,r.b].sort().join(':');assert.ok(!pairs.has(pair));pairs.add(pair);
  assert.ok(r.nations.includes(CITIES[r.a].nation)&&r.nations.includes(CITIES[r.b].nation));
  assert.ok(r.nations.every(n=>NATIONS[n]));assert.ok(r.km>0&&r.km<=WAGONS.wagon.range);
  const a=CITIES[r.a],b=CITIES[r.b];assert.ok(r.km>=nauticalDistance([a.lon,a.lat],[b.lon,b.lat])*1.852*.98,`${pair} shorter than direct distance`);
 }
 // Cuba's existing Santiago must never be overwritten by Santiago de Chile.
 assert.deepEqual(CITIES.santiago,OLD_CITIES.santiago);assert.ok(CITIES.santiagodechile.lat<0);
});

test('v11 migration preserves all existing accounts, live journeys, markets and road investments exactly',()=>{
 const before=old.createGame(42,{events:false});old.entry(before,'sale',10000);old.buyLicense(before,'portugal');old.buyLicense(before,'spain');
 old.openCircuit(before,'wagon',['lisbon','porto']);old.openCircuit(before,'sloop',['kingston','havana']);buyRoadRight(before,'lisbon_porto');setRoadInvestment(before,'lisbon_porto',3,2);old.tick(before);
 const raw=old.serialize(before),s=game.deserialize(raw);assert.equal(s.version,13);
 for(const [i,c] of [before,...before.competitors].entries()){
  const actual=structuredClone([s,...s.competitors][i]),expected=structuredClone(c);
  for(const n of Object.keys(CONTINENTAL_NATIONS))for(const x of Object.values(actual.diplomacy))delete x[n];
  for(const x of [actual,expected])for(const key of ['markets','world','competitors','version'])delete x[key];assert.deepEqual(actual,expected);
 }
 for(const id of Object.keys(before.markets))assert.deepEqual(s.markets[id],before.markets[id]);
 const w=structuredClone(s.world);for(const id of Object.keys(CROSSING_PORTS))delete w.development[id];for(const id of Object.keys(CROSSING_ROADS))delete w.roads[id];for(const id of Object.keys(CONTINENTAL_CITIES))delete w.development[id];for(const id of Object.keys(CONTINENTAL_ROADS))delete w.roads[id];w.pairs=w.pairs.filter(p=>!CONTINENTAL_NATIONS[p.a]&&!CONTINENTAL_NATIONS[p.b]);assert.deepEqual(w,before.world);
 const storageMap=new Map([[SAVE_KEYS.v11,raw]]),storage={getItem:k=>storageMap.get(k)??null,setItem:(k,v)=>storageMap.set(k,v)};saveGame(storage,s);assert.equal(storageMap.get(SAVE_KEYS.v11),raw);assert.equal(storageMap.get(SAVE_KEYS.preserved),raw);assert.ok(listSaves(storage).every(x=>x.valid));
 const bad=JSON.parse(raw);delete bad.world.roads.nantes_paris;assert.throws(()=>game.deserialize(JSON.stringify(bad)));
 const copy=game.deserialize(game.serialize(s));for(let i=0;i<120;i++){game.tick(s);game.tick(copy);}assert.deepEqual(s,copy);
});

test('every added corridor completes trading deliveries and preserves shared markets and accounting',()=>{
 const s=game.createGame(1700,{events:false});game.entry(s,'sale',1000000);for(const n of Object.keys(NATIONS))if(!s.licenses.includes(n))game.buyLicense(s,n);
 for(const r of Object.values(CONTINENTAL_ROADS))game.openCircuit(s,'wagon',[r.a,r.b],undefined,0);
 const initial=game.serialize(s);assert.deepEqual(game.deserialize(initial),s);
 for(let day=1;day<=400;day++)game.tick(s);
 for(const r of s.routes){assert.ok(r.deliveries>=2,r.stops.join(' → '));assert.ok(r.transport.sales>0,r.stops.join(' → '));}
 assert.ok(s.routes.length>50,'player route count remains unrestricted');assert.ok(s.competitors.every(c=>c.routes.length<=50));
 assert.ok(Math.abs(s.cash-s.initialCash-Object.values(s.totals).reduce((a,b)=>a+b,0))<1e-5);
 assert.ok(s.ledger.some(e=>e.category==='roadToll'));assert.deepEqual(game.deserialize(game.serialize(s)),s);
});

test('Elmina–Kumasi requires both licenses and cannot open or buy road rights with only one',()=>{
 const s=game.createGame(42,{events:false});game.buyLicense(s,'netherlands');
 assert.deepEqual(new Set(routeNations({mode:'land',stops:['elmina','kumasi']})),new Set(['netherlands','asante']));
 assert.equal(roadQuote(s,'elmina_kumasi').eligible,false);const before=game.serialize(s);assert.throws(()=>game.openCircuit(s,'wagon',['elmina','kumasi']));assert.equal(game.serialize(s),before);
 game.buyLicense(s,'asante');assert.equal(roadQuote(s,'elmina_kumasi').eligible,true);game.openCircuit(s,'wagon',['elmina','kumasi']);assert.deepEqual(game.deserialize(game.serialize(s)),s);
});

test('road management groups every link exactly once into seven regions in every UI language',()=>{
 const s=game.createGame(),before=game.serialize(s);
 for(const lang of Object.keys(LANGUAGES)){setLanguage(lang);const html=renderLand(s,{cash:String,decimal:String});
  for(const id of Object.keys(ROAD_REGIONS))assert.ok(html.includes(`id="road-region-${id}"`));
  for(const id of Object.keys(ROADS))assert.equal(html.split(`id="road-${id}"`).length-1,1);
  assert.doesNotMatch(html,/undefined|\[object Object\]|\uFFFD/);
 }setLanguage('ja');assert.equal(game.serialize(s),before);
});

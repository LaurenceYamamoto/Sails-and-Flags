import {CROSSING_PORTS,CROSSING_ROADS} from '../src/crossing-data.js';
import {CONTINENTAL_CITIES,CONTINENTAL_ROADS,CONTINENTAL_NATIONS} from '../src/continental-data.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import {performance} from 'node:perf_hooks';
import {CITIES,NATIONS,GOODS,distance} from '../src/data.js';
import * as game from '../src/engine.js';
import * as old from '../src/legacy/engine-v10.js';
import {WORLD_PORTS,WORLD_NATIONS,WORLD_GOODS} from '../src/world-data.js';
import {PORT_APPROACHES,seaRoute,seaLines,seaPosition,waterSegment} from '../src/sea-routing.js';
import {cameraFor,zoomCamera,panCamera,cityCamera} from '../src/map-camera.js';
import {saveGame,SAVE_KEYS,listSaves} from '../src/storage.js';
import {PROFILES,runCompetitor,acquireCompany} from '../src/management.js';
import {renderCompetition} from '../src/management-view.js';
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-5,`${a} != ${b}`);

test('all 2,278 world port pairs connect over water with symmetric finite distances and precise endpoints',()=>{
 const ids=Object.keys(PORT_APPROACHES),segments=new Map();assert.equal(ids.length,68);
 for(const [i,a] of ids.entries())for(const b of ids.slice(i+1)){
  const r=seaRoute(a,b);assert.ok(Number.isFinite(r.nm)&&r.nm>0);assert.equal(r.nm,seaRoute(b,a).nm);
  for(const [port,f] of [[a,0],[b,1]]){const p=seaPosition(a,b,f);near(p.x,CITIES[port].x);near(p.y,CITIES[port].y);}
  for(let j=1;j<r.offshore.length;j++){const x=r.offshore[j-1],y=r.offshore[j];segments.set([x.join(','),y.join(',')].sort().join(':'),[x,y]);}
 }
 for(const [key,[a,b]] of segments)assert.ok(waterSegment(a,b),`land crossing: ${key}`);
});
test('Pacific wraps at the dateline; absent Panama and Suez canals force historic detours',()=>{
 const pacific=seaRoute('manila','acapulco');assert.ok(pacific.nm>7000&&pacific.nm<10000);
 const lines=seaLines('manila','acapulco');assert.equal(lines.length,2);
 for(const line of lines)for(let i=1;i<line.length;i++)assert.ok(Math.abs(line[i].x-line[i-1].x)<450);
 assert.ok(seaRoute('portobelo','acapulco').coordinates.some(([,lat])=>lat<-55));
 assert.ok(seaRoute('alexandria','muscat').coordinates.some(([,lat])=>lat<-34));
 assert.ok(distance('marseille','nantes')>2*distance('lisbon','nantes'));
});
test('v10 migration preserves finances, RNG, cargo, voyages, old markets and policies; new slots preserve the original',()=>{
 const before=old.createGame(42);old.buyLicense(before,'spain');old.openCircuit(before,'sloop',['kingston','havana']);old.tick(before);
 const raw=old.serialize(before),s=game.deserialize(raw);assert.equal(s.version,13);
 for(const [i,c] of [before,...before.competitors].entries()){
  const actual=structuredClone([s,...s.competitors][i]),expected=structuredClone(c);
  for(const n of Object.keys({...WORLD_NATIONS,...CONTINENTAL_NATIONS}))for(const values of Object.values(actual.diplomacy))delete values[n];
  for(const x of [actual,expected]){delete x.markets;delete x.world;delete x.competitors;delete x.version;}
  assert.deepEqual(actual,expected);
 }
 for(const id of Object.keys(before.markets))for(const g of Object.keys(before.markets[id]))assert.deepEqual(s.markets[id][g],before.markets[id][g]);
 const w=structuredClone(s.world);for(const id of Object.keys(CROSSING_PORTS))delete w.development[id];for(const id of Object.keys(CROSSING_ROADS))delete w.roads[id];w.pairs=w.pairs.filter(p=>!WORLD_NATIONS[p.a]&&!WORLD_NATIONS[p.b]&&!CONTINENTAL_NATIONS[p.a]&&!CONTINENTAL_NATIONS[p.b]);for(const id of Object.keys({...WORLD_PORTS,...CONTINENTAL_CITIES}))delete w.development[id];for(const id of Object.keys(CONTINENTAL_ROADS))delete w.roads[id];assert.deepEqual(w,before.world);
 assert.ok(WORLD_GOODS.every(g=>!s.routes[0].allowed.includes(g.id)));
 assert.deepEqual(game.deserialize(game.serialize(s)),s);
 const values=new Map([[SAVE_KEYS.v10,raw]]),storage={getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,v)};
 saveGame(storage,s);assert.equal(values.get(SAVE_KEYS.v10),raw);assert.equal(values.get(SAVE_KEYS.preserved),raw);assert.ok(listSaves(storage).every(x=>x.valid));
 const invalid=JSON.parse(raw);invalid.world.pairs.pop();assert.throws(()=>game.deserialize(JSON.stringify(invalid)));
});
test('each rival accepts 50 routes but rejects route 51 before buying; players have no route cap',()=>{
 assert.ok(Object.values(PROFILES).every(p=>p.maxRoutes===50));
 const s=game.createGame(42,{events:false}),c=s.competitors[0];game.entry(c,'sale',10000000);game.entry(s,'sale',10000000);
 for(const company of [s,c])for(const id of Object.keys(NATIONS))if(!company.licenses.includes(id))game.buyLicense(company,id);
 const ids=Object.keys(PORT_APPROACHES);let next;
 outer:for(const [i,a] of ids.entries())for(const b of ids.slice(i+1))if(distance(a,b)<=10000){
  if(c.routes.some(r=>game.circuitKey(r.stops)===game.circuitKey([a,b])))continue;
  if(c.routes.length===50){next=[a,b];break outer;}game.openCircuit(c,'galleon',[a,b]);game.openCircuit(s,'galleon',[a,b]);
 }
 assert.equal(c.routes.length,50);const raw=game.serialize(s);
 assert.match(game.quoteCircuitOpening(c,'galleon',next).error,/50/);assert.throws(()=>game.openCircuit(c,'galleon',next));assert.equal(game.serialize(s),raw);
 game.openCircuit(s,'galleon',next);game.openCircuit(s,'sloop',['cadiz','lisbon']);game.openCircuit(s,'sloop',['cadiz','porto']);assert.ok(s.routes.length>50);
 const ship=game.buyShip(c,'galleon'),before=game.serialize(s);assert.throws(()=>game.setCircuit(c,ship.id,next));assert.equal(game.serialize(s),before);
 c.day=31;runCompetitor(c);assert.ok(c.routes.length<=50);c.day=s.day;c.strategy.lastMonth='1700-01';c.managementLog=[];
 // Quote and validator both protect the limit, including crafted imports.
 const bad=JSON.parse(game.serialize(s));bad.competitors[0].routes.push({...bad.competitors[0].routes[0],id:'route-99999'});assert.throws(()=>game.deserialize(JSON.stringify(bad)));
});
test('camera zoom anchors, limits and pans remain bounded; city jump exposes every city',()=>{
 const c=cameraFor('world'),anchor={x:300,y:200},z=zoomCamera(c,2,anchor);
 near((anchor.x-c[0])/c[2],(anchor.x-z[0])/z[2]);near((anchor.y-c[1])/c[3],(anchor.y-z[1])/z[3]);
 assert.deepEqual(zoomCamera(c,.01),c);assert.equal(zoomCamera(c,100).at(2),37.5);
 assert.deepEqual(panCamera(z,-9999,-9999),[0,0,450,225]);assert.deepEqual(panCamera(z,9999,9999),[450,225,450,225]);
 for(const city of Object.values(CITIES)){const [x,y,w,h]=cityCamera(city);assert.ok(city.x>=x&&city.x<=x+w&&city.y>=y&&city.y<=y+h);}
});
test('buyouts remain available in the UI and preserve saves above 200 player ships',()=>{
 const s=game.createGame(42,{events:false});game.entry(s,'sale',1000000);
 for(let i=0;i<201;i++)game.buyShip(s,'sloop');
 const html=renderCompetition(s,null,{cash:String,signed:String});
 assert.match(html,/data-action="acquire" data-id="0" >/);
 acquireCompany(s,0);assert.equal(s.ships.length,202);assert.deepEqual(game.deserialize(game.serialize(s)),s);
});
test('twenty-commodity loading has bounded work, profitable feasible cargo and deterministic results',()=>{
 const s=game.createGame();for(const g of GOODS){s.markets.kingston[g.id].stock=350;s.markets.havana[g.id].stock=50;}
 const start=performance.now(),plan=game.optimizeLoad(s,'kingston','havana',100,2400,GOODS.map(g=>g.id),10);
 assert.ok(performance.now()-start<1000);assert.ok(plan.profit>0&&plan.cost<=2400);assert.ok(plan.cargo.reduce((n,c)=>n+c.quantity,0)<=100);
 assert.deepEqual(game.optimizeLoad(s,'kingston','havana',100,2400,GOODS.map(g=>g.id),10),plan);
});
test('Pacific galleon and Asian regional services trade and recover deterministically for three years',()=>{
 for(const seed of [1,42,1700]){
  const s=game.createGame(seed);game.entry(s,'sale',30000);for(const n of ['spain','qing'])game.buyLicense(s,n);
  game.openCircuit(s,'galleon',['manila','acapulco']);game.openCircuit(s,'sloop',['guangzhou','xiamen']);
  for(let day=1;day<=1095;day++){const restored=day%365===0?game.deserialize(game.serialize(s)):null;game.tick(s);assert.equal(s.gameOver,false,`seed ${seed} day ${day}`);if(restored){game.tick(restored);assert.deepEqual(restored,s);}}
  assert.ok(s.routes.every(r=>r.deliveries>=5));assert.ok((s.totals.sale??0)>30000);assert.deepEqual(game.deserialize(game.serialize(s)),s);
  console.log('World campaign',JSON.stringify({seed,day:s.day,cash:s.cash,deliveries:s.routes.map(r=>r.deliveries)}));
 }
});

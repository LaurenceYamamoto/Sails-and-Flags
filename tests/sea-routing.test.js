import {WORLD_PORTS} from '../src/world-data.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import {LAND} from '../assets/maps/land.js';
import {CITIES,distance,SHIPS} from '../src/data.js';
import {project} from '../src/geography.js';
import {PORT_APPROACHES,seaRoute,seaPosition,nauticalDistance} from '../src/sea-routing.js';
import * as old from '../src/legacy/engine-v8.js';
import * as game from '../src/engine.js';
import {replaceFleet} from '../src/fleet.js';
import {setRouteAutomationShip,acquireCompany} from '../src/management.js';
import {renderRoutes} from '../src/routes-view.js';
import {renderMap} from '../src/map-view.js';
import {SAVE_KEYS,saveGame,listSaves} from '../src/storage.js';
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-7,`${a} != ${b}`);
const ports=Object.keys(PORT_APPROACHES).filter(id=>!WORLD_PORTS[id]);
// Independent ray casting samples every offshore segment; port approaches are
// separately declared because the generalized land omits navigable estuaries.
function inside(p,ring){let yes=false;for(let i=0,j=ring.length-1;i<ring.length;j=i++){const a=ring[i],b=ring[j];if((a[1]>p[1])!==(b[1]>p[1])&&p[0]<(b[0]-a[0])*(p[1]-a[1])/(b[1]-a[1])+a[0])yes=!yes;}return yes;}
test('all sea pairs avoid land offshore, have symmetric route-derived distances and exact port endpoints',()=>{
 for(const a of ports)for(const b of ports)if(a<b){
  const path=seaRoute(a,b),reverse=seaRoute(b,a);assert.equal(path.nm,reverse.nm);assert.deepEqual(path.coordinates,[...reverse.coordinates].reverse());
  const total=path.coordinates.slice(1).reduce((n,p,i)=>n+nauticalDistance(path.coordinates[i],p),0);assert.equal(distance(a,b),Math.ceil(total));
  assert.deepEqual(seaPosition(a,b,0),project(CITIES[a].lon,CITIES[a].lat));const end=seaPosition(a,b,1);near(end.x,CITIES[b].x);near(end.y,CITIES[b].y);
  for(let i=1;i<path.offshore.length;i++){const x=path.offshore[i-1],y=path.offshore[i],steps=Math.ceil(nauticalDistance(x,y)/5);for(let j=0;j<=steps;j++){const p=x.map((v,k)=>v+(y[k]-v)*j/steps);assert.ok(!LAND.some(poly=>inside(p,poly[0])&&!poly.slice(1).some(r=>inside(p,r))),`${a}-${b}: land at ${p}`);}}
 }
 assert.equal(distance('madrid','nantes'),Infinity);assert.equal(distance('unknown','nantes'),Infinity);assert.equal(distance('london','london'),Infinity);
});
test('Marseille–Nantes goes through Gibraltar and is much longer than Lisbon–Nantes; Cuba and Britain also require detours',()=>{
 assert.ok(distance('marseille','nantes')>2*distance('lisbon','nantes'));
 const r=seaRoute('marseille','nantes');assert.ok(r.coordinates.some(([lon,lat])=>lon<-5&&lon>-6&&lat>35&&lat<36.5));assert.ok(r.coordinates.some(([lon,lat])=>lon<-9&&lat>40));
 assert.ok(distance('kingston','havana')>nauticalDistance([-76.793,17.971],[-82.366,23.113])*1.5);
 assert.ok(seaRoute('london','lisbon').coordinates.some(([lon,lat])=>lon<-5&&lat>48));
 const s=game.createGame(42,{events:false});game.buyLicense(s,'france');const raw=game.serialize(s);
 assert.match(game.quoteCircuitOpening(s,'sloop',['marseille','london']).error,/航続/);assert.equal(game.serialize(s),raw);
});
function legacy(){const s=old.createGame(42,{events:false});old.entry(s,'sale',100000);old.buyLicense(s,'france');old.openCircuit(s,'sloop',['marseille','london']);old.tick(s);return s;}
test('v8 migration preserves cargo, cash and arrival dates, pauses insufficient range and resumes after deliberate replacement',()=>{
 const before=legacy(),s=game.deserialize(old.serialize(before)),r=s.routes[0],v=s.ships[0];
 assert.equal(s.cash,before.cash);assert.equal(s.rng,before.rng);assert.deepEqual(v.cargo,before.ships[0].cargo);assert.equal(v.voyage.remaining,before.ships[0].voyage.remaining);assert.equal(v.voyage.seaDistanceVersion,8);
 assert.equal(r.active,false);assert.equal(r.rangeReview,true);assert.throws(()=>game.toggleRoute(s,r.id),/航続/);
 const remaining=v.voyage.remaining;for(let i=0;i<remaining;i++)game.tick(s);assert.equal(v.voyage,null);assert.equal(r.deliveries,1);
 const money=s.cash;game.tick(s);assert.equal(v.voyage,null);assert.ok(s.cash<money);
 const html=renderRoutes(s,{cash:String,decimal:String,signed:String,tone:()=>''});assert.match(html,/航続距離が不足/);assert.match(html,/航続距離不足/);
 replaceFleet(s,{mode:'route',routeId:r.id,target:'brig'});setRouteAutomationShip(s,r.id,'brig');game.toggleRoute(s,r.id);assert.equal(s.routes[0].rangeReview,undefined);
 // Replacement validates on a cloned state, so inspect the current objects.
 const resumed=s.routes[0];assert.equal(resumed.active,true);for(let i=0;i<50&&!s.ships[0].voyage;i++)game.tick(s);
 const voyage=s.ships[0].voyage;assert.ok(voyage);assert.equal(voyage.total,Math.ceil(distance(voyage.from,voyage.to)/SHIPS.brig.speed));assert.equal(voyage.seaDistanceVersion,undefined);
 assert.deepEqual(game.deserialize(game.serialize(s)),s);
});
test('pending replacements and acquisition of a paused legacy service stay safe without buying incompatible ships',()=>{
 const before=legacy(),r=before.routes[0];before.ships=[];r.pendingReplacements=['sloop'];const s=game.deserialize(old.serialize(before));
 assert.equal(s.routes[0].rangeReview,true);assert.deepEqual(game.deserialize(game.serialize(s)),s);
 game.assignShip(s,r.id,game.buyShip(s,'brig').id);setRouteAutomationShip(s,r.id,'brig');game.toggleRoute(s,r.id);assert.equal(s.routes[0].pendingReplacements.length,0);
 const source=old.createGame(42,{events:false}),c=source.competitors[0];old.buyLicense(c,'england');old.openCircuit(c,'sloop',['marseille','london']);
 const acquired=game.deserialize(old.serialize(source));game.entry(acquired,'sale',200000);game.buyLicense(acquired,'france');game.openCircuit(acquired,'brig',['marseille','london']);acquireCompany(acquired,0);
 const merged=acquired.routes.find(route=>route.stops.includes('marseille'));assert.equal(merged.rangeReview,true);assert.equal(merged.active,false);assert.deepEqual(game.deserialize(game.serialize(acquired)),acquired);
});
test('old slots are preserved, v9 reload is idempotent, invalid legacy timing and active range-review routes are rejected',()=>{
 const raw=old.serialize(legacy()),map=new Map([[SAVE_KEYS.v8,raw]]),storage={getItem:k=>map.get(k)??null,setItem:(k,v)=>map.set(k,v)},s=listSaves(storage)[0].state;
 saveGame(storage,s);assert.equal(map.get(SAVE_KEYS.v8),raw);assert.equal(map.get(SAVE_KEYS.preserved),undefined);assert.deepEqual(listSaves(storage).find(v=>v.slot==='manual').state,s);
 for(const mutate of [v=>v.ships[0].voyage.total++,v=>v.ships[0].voyage.seaDistanceVersion=7,v=>v.routes[0].active=true]){const copy=JSON.parse(game.serialize(s));mutate(copy);assert.throws(()=>game.deserialize(JSON.stringify(copy)));}
 const copy=game.deserialize(game.serialize(s));for(let i=0;i<90;i++){game.tick(s);game.tick(copy);}assert.deepEqual(s,copy);
 const rendered=renderMap(s,'marseille',s.routes[0].id,()=> 'translate(0,0)');assert.match(rendered,/<polyline[^>]*class="route-line/);assert.doesNotMatch(rendered,/<line[^>]*class="route-line/);
});

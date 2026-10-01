import test from 'node:test';
import assert from 'node:assert/strict';
import { buyLicense, buyShip, setCircuit, routeSchedule, routeLegs, nextDeparture, tick, serialize, deserialize, trade, toggleRoute, releaseShip, assignShip } from '../src/engine.js';
import {createGame} from './baseline.js';
import { renderMap } from '../src/map-view.js';
const stops=['cadiz','lisbon','sanjuan','santodomingo','sanjuan','lisbon'];
function fixture() {
  const s=createGame(); trade(s,'kingston','food',30000,'sell');
  buyLicense(s,'spain');buyLicense(s,'portugal');
  const ship=buyShip(s,'brig'),route=setCircuit(s,ship.id,[...stops,'cadiz']);
  return {s,ship,route};
}
test('requested round trip revisits each port in order for two cycles and restores at every step',()=>{
  const {s,ship,route}=fixture(),arrivals=[];
  assert.deepEqual(route.stops,stops);
  assert.deepEqual(routeLegs(route),stops.map((a,i)=>[a,stops[(i+1)%6]]));
  for(let day=0;day<500 && arrivals.length<12;day++) {
    // Guarantee a profitable next leg without changing travel or scheduling rules.
    if(!ship.voyage){const to=stops[(ship.nextStop+1)%6];s.markets[ship.nextFrom].rum.stock=500;s.markets[to].rum.stock=5;}
    const prior=ship.voyage?{...ship.voyage}:null;
    const restored=deserialize(serialize(s));
    tick(s,{updateMarkets:false,runCompetitors:false});
    tick(restored,{updateMarkets:false,runCompetitors:false});
    // Competitors intentionally idle in this fixture; their clocks remain aligned.
    for(const state of [s,restored])for(const c of state.competitors)c.day=state.day;
    assert.deepEqual(restored,s);
    if(prior?.remaining===1){arrivals.push(ship.nextFrom);assert.equal(ship.nextStop,arrivals.length%6);assert.equal(ship.cargo.length,0);}
    if(ship.voyage && !prior)assert.equal(ship.voyage.to,stops[(ship.nextStop+1)%6]);
  }
  assert.deepEqual(arrivals,[...stops.slice(1),'cadiz',...stops.slice(1),'cadiz']);
});
test('revisited calls have distinct timetable slots and rotated circuits share one fleet',()=>{
  const {s,ship,route}=fixture();
  const second=buyShip(s,'brig');
  assert.equal(setCircuit(s,second.id,[...stops.slice(4),...stops.slice(0,4)]),route);
  assert.equal(s.routes.length,1);
  const {cycle,stopOffsets}=routeSchedule(s,route);
  assert.equal(stopOffsets.length,6);assert.ok(stopOffsets[4]>stopOffsets[2]);assert.ok(stopOffsets[5]>stopOffsets[1]);
  for(let i=0;i<6;i++){
    for(const vessel of [ship,second]){vessel.nextStop=i;vessel.nextFrom=stops[i];}
    assert.equal(nextDeparture(s,route,ship),route.scheduleEpoch+stopOffsets[i]);
    assert.equal(nextDeparture(s,route,second)-nextDeparture(s,route,ship),Math.floor(cycle/2));
  }
  toggleRoute(s,route.id);toggleRoute(s,route.id);
  assert.equal(nextDeparture(s,route,ship),1);
  assert.deepEqual(deserialize(serialize(s)),s);
  releaseShip(s,second.id);assert.equal(second.nextStop,undefined);
  assignShip(s,route.id,second.id);assert.equal(second.nextStop,0);
});
test('invalid repeated-stop inputs and corrupt or ambiguous saved cursors are rejected',()=>{
  const {s,ship,route}=fixture(),idle=buyShip(s,'brig');
  const before=serialize(s);
  for(const ports of [['cadiz','cadiz'],['cadiz','lisbon','lisbon'],Array.from({length:14},(_,i)=>i%2?'lisbon':'cadiz')]){
    assert.throws(()=>setCircuit(s,idle.id,ports));assert.equal(serialize(s),before);
  }
  for(const cursor of [undefined,null,-1,6,1.5,1]){
    const copy=JSON.parse(serialize(s));copy.ships[0].nextStop=cursor;
    assert.throws(()=>deserialize(JSON.stringify(copy)));
  }
  // Same port, different visit: a voyage must agree with that visit's next leg.
  ship.nextStop=2;ship.nextFrom='sanjuan';s.markets.sanjuan.rum.stock=500;s.markets.santodomingo.rum.stock=5;
  toggleRoute(s,route.id);toggleRoute(s,route.id);tick(s);
  assert.equal(ship.voyage.to,'santodomingo');
  const copy=JSON.parse(serialize(s));copy.ships[0].nextStop=4;
  assert.throws(()=>deserialize(JSON.stringify(copy)));
});
test('old v3 unique-port saves need no cursor and map labels show all visit numbers',()=>{
  const s=createGame();buyLicense(s,'spain');const ship=buyShip(s,'sloop');setCircuit(s,ship.id,['kingston','havana']);
  tick(s);delete ship.nextStop;
  const copy=deserialize(serialize(s));assert.deepEqual(copy,s);
  for(let i=0;i<20;i++){tick(s);tick(copy);}assert.deepEqual(copy,s);
  const html=renderMap(s,'cadiz',null,()=>'',{plannedStops:[...stops,'cadiz'],mapPlanning:true});
  assert.match(html,/Lisbon 〔2,6〕/);assert.match(html,/San Juan 〔3,5〕/);
  assert.equal((html.match(/class="planned-route /g)||[]).length,6);
  assert.equal((html.match(/class="planned-route return-leg"/g)||[]).length,1);
});

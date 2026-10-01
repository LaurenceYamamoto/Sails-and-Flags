import test from 'node:test';
import assert from 'node:assert/strict';
import { GOODS,CITIES,NATIONS,SHIPS,distance,daysFor } from '../src/data.js';
import { buyLicense,buyShip,setCircuit,assignShip,routeSchedule,routeLegs,nextDeparture,tick,serialize,deserialize,trade,quote } from '../src/engine.js';
import {createGame} from './baseline.js';
import * as old from '../src/legacy/engine-v2.js';
import { saveGame,listSaves,SAVE_KEYS } from '../src/storage.js';
import { ja,en,setLanguage,nameOf } from '../src/i18n.js';
import { renderRoutes } from '../src/routes-view.js';
const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-6,`${a} != ${b}`);
function funded(seed=1700) {const s=createGame(seed);trade(s,'kingston','food',30000,'sell');for(const id of Object.keys(NATIONS))if(!s.licenses.includes(id))buyLicense(s,id);return s;}
const ports=['kingston','havana','santiago'];
function forceMarkets(s) {
  // Three independent profitable legs, so timetable tests cannot hide skipped slots.
  const goods=['rum','sugar','tobacco'];
  ports.forEach((from,i)=>{s.markets[from][goods[i]].stock=400;s.markets[ports[(i+1)%3]][goods[i]].stock=40;});
}
test('P2 data is complete: 12 ports, 5 nations, 9 goods, 3 ships and symmetric distances',()=>{
  assert.equal(Object.keys(CITIES).length,12);assert.equal(Object.keys(NATIONS).length,5);assert.equal(GOODS.length,9);assert.equal(Object.keys(SHIPS).length,3);
  for(const [a,c] of Object.entries(CITIES)){assert.ok(NATIONS[c.nation]);for(const key of ['stocks','supply','demand'])assert.equal(c[key].length,9);for(const b of Object.keys(CITIES))if(a!==b){assert.ok(Number.isFinite(distance(a,b))&&distance(a,b)>0);assert.equal(distance(a,b),distance(b,a));}}
  assert.equal(NATIONS.england.color,'#ef4444');assert.equal(NATIONS.spain.color,'#facc15');
});
test('circuits deduplicate rotations, distinguish reverse direction and validate closing leg atomically',()=>{
  const s=funded(),r=setCircuit(s,buyShip(s,'sloop').id,ports),copy=setCircuit(s,buyShip(s,'sloop').id,['santiago','kingston','havana']);assert.equal(copy,r);assert.equal(s.routes.length,1);
  setCircuit(s,buyShip(s,'sloop').id,[...ports].reverse());assert.equal(s.routes.length,2);
  const ship=buyShip(s,'sloop'),before=serialize(s);
  for(const invalid of [['kingston','kingston'],['havana','kingston','london'],['havana'],['missing','havana']]){assert.throws(()=>setCircuit(s,ship.id,invalid));assert.equal(serialize(s),before);}
  // A future shorter-range vessel must also reject an over-range closing leg.
  const range=SHIPS.sloop.range;
  try { SHIPS.sloop.range=1200; assert.ok(distance('havana','kingston')<=1200 && distance('kingston','bridgetown')<=1200 && distance('bridgetown','havana')>1200); assert.throws(()=>setCircuit(s,ship.id,['havana','kingston','bridgetown'])); assert.equal(serialize(s),before); }
  finally { SHIPS.sloop.range=range; }
});
test('each intermediate port sells once, clears cargo, then buys separately for the next leg',()=>{
  const s=funded(),ship=buyShip(s,'sloop'),r=setCircuit(s,ship.id,ports),seen=[];
  for(let i=0;i<100&&seen.length<6;i++){
    forceMarkets(s);const prior=structuredClone(ship.voyage),cargo=structuredClone(ship.cargo),day=s.day+1;
    tick(s);
    if(prior?.remaining===1){seen.push(prior.to);assert.equal(ship.voyage,null);assert.equal(ship.cargo.length,0);const sales=s.ledger.filter(e=>e.day===day&&e.routeId===r.id&&e.category==='sale');assert.equal(sales.length,cargo.length);for(const item of cargo)close(sales.find(e=>e.good===item.good).quantity,item.quantity);assert.equal(s.ledger.filter(e=>e.day===day&&e.routeId===r.id&&e.category==='purchase').length,0);}
    if(ship.voyage&&!prior){assert.equal(ship.voyage.to,routeLegs(r).find(([a])=>a===ship.nextFrom)[1]);assert.ok(s.ledger.some(e=>e.day===day&&e.city===ship.nextFrom&&e.category==='purchase'));}
  }
  assert.deepEqual(seen,['havana','santiago','kingston','havana','santiago','kingston']);
});
test('multiport fleets have evenly rounded recurring slots at every port and preserve cargo on addition',()=>{
  const s=funded(),r=setCircuit(s,buyShip(s,'sloop').id,ports);for(let i=0;i<2;i++)assignShip(s,r.id,buyShip(s,'sloop').id);
  const {cycle,offsets}=routeSchedule(s,r),events=[];assert.equal(cycle,routeLegs(r).reduce((n,[a,b])=>n+daysFor('sloop',a,b)+1,0));assert.equal(Object.keys(offsets).length,3);
  for(let i=0;i<cycle*6;i++){forceMarkets(s);tick(s);for(const ship of s.ships)if(ship.voyage?.remaining===ship.voyage?.total&&ship.voyage)events.push({from:ship.voyage.from,day:s.day});}
  for(const port of ports){const days=events.filter(e=>e.from===port).map(e=>e.day);assert.ok(days.length>=12);assert.ok(days.slice(1).every((d,i)=>[Math.floor(cycle/3),Math.ceil(cycle/3)].includes(d-days[i])));}
  const voyages=s.ships.map(v=>structuredClone(v.voyage));assignShip(s,r.id,buyShip(s,'sloop').id);assert.deepEqual(s.ships.slice(0,3).map(v=>v.voyage),voyages);
  assert.deepEqual(deserialize(serialize(s)),s);
});
test('competitors share stock, pay normal integrated prices and survive restore deterministically',()=>{
  const s=createGame(),control=createGame();control.competitors=[];tick(s);tick(control);
  assert.ok(s.competitors.every(c=>c.markets===s.markets));assert.notDeepEqual(s.markets,control.markets);
  for(const c of s.competitors){const purchase=c.ledger.find(e=>e.category==='purchase');assert.ok(purchase);const quantity=purchase.quantity,prior=control.markets[purchase.city][purchase.good].stock;close(-purchase.amount,quote(purchase.good,prior,quantity,'buy').value);close(c.initialCash+Object.values(c.totals).reduce((a,b)=>a+b,0),c.cash);}
  const copy=deserialize(serialize(s));for(let i=0;i<100;i++){tick(s);tick(copy);}assert.deepEqual(copy,s);assert.ok(copy.competitors.every(c=>c.markets===copy.markets));
});
test('v2 migration preserves balances, five original markets, cargo and arrival timing',()=>{
  const legacy=old.createGame();old.buyLicense(legacy,'spain');old.setRoute(legacy,old.buyShip(legacy,'sloop').id,'kingston','havana');old.tick(legacy);
  const raw=old.serialize(legacy),s=deserialize(raw);assert.equal(s.version,6);assert.equal(s.cash,legacy.cash);assert.deepEqual(s.ships,legacy.ships);assert.deepEqual(s.routes[0].stops,['kingston','havana']);
  for(const [city,goods]of Object.entries(legacy.markets))for(const [good,market]of Object.entries(goods))assert.deepEqual(s.markets[city][good],market);
  assert.deepEqual(s,deserialize(serialize(s)));assert.equal(JSON.parse(raw).version,2);
  legacy.cash++;assert.throws(()=>deserialize(old.serialize(legacy)));
});
test('bankruptcy and corrupt circuit/rival saves are handled without accepting invalid state',()=>{
  const s=createGame();while(!s.gameOver)tick(s);assert.ok(s.day>0);assert.deepEqual(deserialize(serialize(s)),s);
  const valid=funded();setCircuit(valid,buyShip(valid,'sloop').id,ports);
  for(const mutation of [x=>x.routes[0].stops.push('kingston'),x=>x.ships[0].nextFrom='london',x=>x.competitors[0].cash++,x=>x.competitors[0].competitors.push(x.competitors[1])]){const copy=deserialize(serialize(valid));mutation(copy);assert.throws(()=>deserialize(serialize(copy)));}
});
test('ten years of multiport trading across seeds remains live, finite and reproducible after restore',()=>{
  for(const seed of [1,1700,2026]){
    let s=createGame(seed);buyLicense(s,'spain');setCircuit(s,buyShip(s,'sloop').id,ports);
    for(let day=1;day<=3650;day++){tick(s);assert.equal(s.day,day);assert.equal(s.gameOver,false);if(day%365===0){const copy=deserialize(serialize(s));assert.deepEqual(copy,s);s=copy;for(const city of Object.values(s.markets))for(const m of Object.values(city))assert.ok(Number.isFinite(m.stock)&&m.stock>=0);}}
    assert.ok(s.routes[0].deliveries>100);assert.ok(s.competitors.every(c=>c.routes[0].deliveries>0));
  }
});
function memoryStore(){const map=new Map();return{getItem:k=>map.get(k)??null,setItem:(k,v)=>map.set(k,v),map};}
test('save slots preserve legacy data, rotate valid backup and expose corrupt saves for recovery',()=>{
  const storage=memoryStore(),s=createGame();storage.setItem(SAVE_KEYS.v2,old.serialize(old.createGame()));saveGame(storage,s);tick(s);saveGame(storage,s,'auto');tick(s);saveGame(storage,s,'auto');
  const saves=listSaves(storage);assert.equal(saves.find(v=>v.slot==='manual').day,0);assert.equal(saves.find(v=>v.slot==='backup').day,1);assert.equal(saves.find(v=>v.slot==='auto').day,2);assert.equal(JSON.parse(storage.getItem(SAVE_KEYS.v2)).version,2);
  storage.setItem(SAVE_KEYS.auto,'corrupt');assert.equal(listSaves(storage).find(v=>v.slot==='auto').valid,false);saveGame(storage,s,'auto');assert.equal(deserialize(storage.getItem(SAVE_KEYS.backup)).day,1);
});
test('failed storage write and invalid import never destroy the previous save',()=>{
  const storage=memoryStore(),s=createGame();saveGame(storage,s);const before=storage.getItem(SAVE_KEYS.manual);storage.setItem=()=>{throw new Error('Quota exceeded');};tick(s);assert.throws(()=>saveGame(storage,s));assert.equal(storage.getItem(SAVE_KEYS.manual),before);assert.throws(()=>deserialize('invalid'));assert.equal(storage.getItem(SAVE_KEYS.manual),before);
});
test('import validation rejects unexpected markets and unsafe ledger labels',()=>{
  const s=funded();
  for(const mutate of [x=>x.markets.kingston.unknown={stock:1,production:1,demand:1},x=>x.markets.unknown=x.markets.kingston,x=>x.ledger[0].shipId='ship-<img onerror=alert(1)>',x=>x.ledger[0].nation='missing']){
    const copy=deserialize(serialize(s));mutate(copy);assert.throws(()=>deserialize(serialize(copy)));
  }
});
test('English catalog covers all keys and circuit details localize commodity and port names',()=>{
  assert.deepEqual(Object.keys(ja).sort(),Object.keys(en).sort());setLanguage('en');
  for(const entity of [...GOODS,...Object.values(CITIES),...Object.values(NATIONS),...Object.values(SHIPS)])assert.doesNotMatch(nameOf(entity),/[\u3000-\u9fff]/);
  const s=funded();setCircuit(s,buyShip(s,'sloop').id,ports);const html=renderRoutes(s,{decimal:String,cash:String,signed:String,tone:()=>''});assert.doesNotMatch(html,/[\u3000-\u9fff]/);setLanguage('ja');
});

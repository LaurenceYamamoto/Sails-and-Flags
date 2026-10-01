import test from 'node:test';
import assert from 'node:assert/strict';
import {createGame,buyLicense,buyShip,quoteCircuitOpening,openCircuit,serialize,deserialize,trade,entry,releaseShip,tick} from '../src/engine.js';
import {renderOpeningQuote} from '../src/route-setup-view.js';
import {setLanguage} from '../src/i18n.js';
const ports=['kingston','havana'];
function company(){const s=createGame();buyLicense(s,'spain');return s;}
function funded(){const s=company();trade(s,'kingston','food',30000,'sell');return s;}
test('opening without an inventory buys the selected ship once and preserves accounting',()=>{
  const s=company(),before=serialize(s),q=quoteCircuitOpening(s,'sloop',ports);
  assert.equal(serialize(s),before);assert.equal(q.cost,1800);assert.equal(q.remaining,2950);assert.equal(q.error,null);
  const r=openCircuit(s,'sloop',ports);assert.equal(s.cash,2950);assert.equal(s.ships.length,1);assert.equal(s.ships[0].routeId,r.id);
  assert.equal(r.autoShipType,'sloop');assert.equal(s.ledger.filter(e=>e.category==='shipPurchase').length,1);assert.equal(s.automation.spent,0);
  assert.deepEqual(deserialize(serialize(s)),s);const restored=deserialize(serialize(s));for(let i=0;i<60;i++){tick(s);tick(restored);}assert.deepEqual(restored,s);
});
test('opening reuses exactly the selected idle type and leaves other vessels untouched',()=>{
  const s=funded(),large=buyShip(s,'fluyt'),idle=buyShip(s,'brig'),q=quoteCircuitOpening(s,'brig',ports),cash=s.cash;
  assert.equal(q.shipId,idle.id);assert.equal(q.cost,0);const r=openCircuit(s,'brig',ports);
  assert.equal(s.ships.length,2);assert.equal(idle.routeId,r.id);assert.equal(large.routeId,null);assert.equal(s.cash,cash);
  const second=openCircuit(s,'brig',['havana','santiago']);assert.equal(s.ships.length,3);assert.equal(s.ships[2].type,'brig');assert.equal(s.ships[2].routeId,second.id);assert.equal(idle.routeId,r.id);
});
test('insufficient funds and invalid opening conditions cause no partial purchase or mutation',()=>{
  const cases=[
    [company(),'brig',ports],
    [createGame(),'sloop',ports],
    [company(),'sloop',['kingston','cadiz']],
    [company(),'unknown',ports],
    [company(),'sloop',['kingston','kingston']],
    [company(),'sloop',['unknown','havana']],
    [company(),'sloop',ports,[]],
    [company(),'sloop',ports,undefined,-1],
  ];
  for(const [s,type,stops,allowed,margin] of cases){const before=serialize(s);assert.ok(quoteCircuitOpening(s,type,stops,allowed,margin).error);assert.throws(()=>openCircuit(s,type,stops,allowed,margin));assert.equal(serialize(s),before);}
  const s=company();const q=quoteCircuitOpening(s,'brig',ports);assert.equal(q.cost,5200);assert.equal(q.remaining,-450);
  const bankrupt=company();entry(bankrupt,'upkeep',-5000);const before=serialize(bankrupt);assert.throws(()=>openCircuit(bankrupt,'sloop',ports));assert.equal(serialize(bankrupt),before);
});
test('opening accepts exact funds, zero-cost reuse, and rechecks cash at submission',()=>{
  const s=company();entry(s,'upkeep',-(s.cash-1800));assert.equal(quoteCircuitOpening(s,'sloop',ports).remaining,0);openCircuit(s,'sloop',ports);assert.equal(s.cash,0);
  releaseShip(s,s.ships[0].id);assert.equal(quoteCircuitOpening(s,'sloop',ports).cost,0);openCircuit(s,'sloop',ports);assert.equal(s.cash,0);
  const other=company();assert.equal(quoteCircuitOpening(other,'sloop',ports).error,null);entry(other,'upkeep',-4000);const before=serialize(other);assert.throws(()=>openCircuit(other,'sloop',ports));assert.equal(serialize(other),before);
});
test('fleet cap forbids a purchase but still allows reuse of a matching idle ship',()=>{
  const s=funded();trade(s,'kingston','food',300000,'sell');for(let i=0;i<200;i++)buyShip(s,'sloop');
  const before=serialize(s);assert.match(quoteCircuitOpening(s,'brig',ports).error,/200/);assert.throws(()=>openCircuit(s,'brig',ports));assert.equal(serialize(s),before);
  const r=openCircuit(s,'sloop',ports);assert.equal(s.ships.length,200);assert.equal(s.ships[0].routeId,r.id);
});
test('existing circuits open their details without buying, adding ships or changing policy',()=>{
  const s=company(),r=openCircuit(s,'sloop',ports),before=serialize(s);
  const q=quoteCircuitOpening(s,'brig',[...ports].reverse());assert.equal(q.cost,0);assert.equal(q.existingRouteId,r.id);
  assert.equal(openCircuit(s,'brig',[...ports].reverse()),r);assert.equal(serialize(s),before);
});
test('multiport opening supports repeated stops and validates every leg before buying',()=>{
  const s=funded();buyLicense(s,'portugal');const stops=['cadiz','lisbon','sanjuan','santodomingo','sanjuan','lisbon','cadiz'];
  const before=serialize(s);assert.throws(()=>openCircuit(s,'sloop',stops));assert.equal(serialize(s),before);
  const r=openCircuit(s,'brig',stops);assert.deepEqual(r.stops,stops.slice(0,-1));assert.equal(r.autoShipType,'brig');assert.deepEqual(deserialize(serialize(s)),s);
});
test('opening quote shows cost, cash, shortage and reuse in Japanese and English',()=>{
  const s=company();setLanguage('ja');let html=renderOpeningQuote(s,'brig',quoteCircuitOpening(s,'brig',ports),String);
  assert.match(html,/開設時の必要資金/);assert.match(html,/5200/);assert.match(html,/4750/);assert.match(html,/資金不足: 450/);
  setLanguage('en');html=renderOpeningQuote(s,'brig',quoteCircuitOpening(s,'brig',ports),String);assert.doesNotMatch(html,/[\u3000-\u9fff]/);assert.match(html,/Insufficient cash: 450/);
  const ship=buyShip(s,'sloop');html=renderOpeningQuote(s,'sloop',quoteCircuitOpening(s,'sloop',ports),String);assert.match(html,new RegExp(`Use idle Sloop #${ship.id.split('-')[1]}`));assert.match(html,/<b>0<\/b>/);setLanguage('ja');
});

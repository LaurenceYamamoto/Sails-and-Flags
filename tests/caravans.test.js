import {productionExpected} from './production-migration-expected.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import * as game from '../src/engine.js';
import * as old from '../src/legacy/engine-v13.js';
import {roadDays as oldDays} from '../src/legacy/land-v13.js';
import {ROADS,WAGONS} from '../src/land-data.js';
import {roadDays,buyRoadRight,setRoadInvestment} from '../src/land.js';
import {shipDaily} from '../src/industry.js';
import {setAutomation,setRouteAutomationShip,runAutomation,PROFILES} from '../src/management.js';
import {replaceFleet} from '../src/fleet.js';
import {resolveAttack,runReplacements} from '../src/security.js';
import {SAVE_KEYS,saveGame,listSaves} from '../src/storage.js';
import {renderTransportComparison} from '../src/land-transport-view.js';
import {renderOpeningQuote} from '../src/route-setup-view.js';
import {LANGUAGES,setLanguage,catalog} from '../src/i18n.js';
const funded=(seed=42)=>{const s=game.createGame(seed,{events:false});game.entry(s,'sale',100000);for(const n of ['ottoman','spain','france'])game.buyLicense(s,n);return s;};
const automate=s=>setAutomation(s,{enabled:true,replaceLost:true,monthlyBudget:5000,minCash:1000,expandThreshold:25,shrinkThreshold:0});

test('terrain gives each land transport a role; road investment preserves old wagon times',()=>{
 const s=funded(),before=old.createGame();
 for(const r of Object.values(ROADS))for(const q of [0,5,20,100]){
  assert.equal(roadDays(s,'wagon',r.a,r.b,q),oldDays(before,'wagon',r.a,r.b,q));
  for(const type of Object.keys(WAGONS))assert.ok(roadDays(s,type,r.a,r.b,q)>0);
 }
 for(const [type,a,b]of [['wagon','nantes','paris'],['camel','cairo','suez'],['mule','portobelo','panama']]){
  const days=roadDays(s,type,a,b);assert.ok(Object.keys(WAGONS).filter(t=>t!==type).every(t=>days<roadDays(s,t,a,b)));
 }
 for(const type of Object.keys(WAGONS))assert.ok(roadDays(s,type,'nantes','paris',20)<roadDays(s,type,'nantes','paris',0));
 const daily=shipDaily(s,'camel');s.industry.technology.land=50;assert.ok(shipDaily(s,'camel')<daily);
 assert.ok(roadDays(s,'wagon','nantes','paris',20)<roadDays(s,'mule','nantes','paris',20));
});

test('opening uses the selected caravan, reuses idle inventory and rejects invalid or unaffordable routes atomically',()=>{
 for(const type of ['camel','mule']){
  const s=funded(),v=game.buyShip(s,type),cash=s.cash;
  assert.equal(game.quoteCircuitOpening(s,type,['cairo','suez']).cost,0);const r=game.openCircuit(s,type,['cairo','suez']);assert.equal(s.cash,cash);assert.equal(v.routeId,r.id);
  const q=game.quoteCircuitOpening(s,type,['portobelo','panama']);assert.equal(q.cost,WAGONS[type].price);game.openCircuit(s,type,['portobelo','panama']);assert.equal(s.cash,cash-WAGONS[type].price);
  const raw=game.serialize(s);assert.throws(()=>game.openCircuit(s,type,['london','cadiz']));assert.equal(game.serialize(s),raw);
  assert.deepEqual(game.deserialize(game.serialize(s)),s);
  const poor=game.createGame();game.buyLicense(poor,'ottoman');game.entry(poor,'shipPurchase',-(poor.cash-WAGONS[type].price+1));const saved=game.serialize(poor);assert.throws(()=>game.openCircuit(poor,type,['cairo','suez']));assert.equal(game.serialize(poor),saved);
 }
});

test('v13 migration preserves the complete company including existing land voyages and investments',()=>{
 const before=old.createGame(42,{events:false});old.buyLicense(before,'ottoman');old.openCircuit(before,'wagon',['cairo','suez']);old.tick(before);
 assert.ok(before.ships[0].voyage);const raw=old.serialize(before),s=game.deserialize(raw),actual=JSON.parse(game.serialize(s));
 for(const c of [actual,...actual.competitors])c.version=13;assert.deepEqual(actual,productionExpected(JSON.parse(raw)));
 const m=new Map([[SAVE_KEYS.v13,raw]]),storage={getItem:k=>m.get(k)??null,setItem:(k,v)=>m.set(k,v)};saveGame(storage,s);assert.equal(m.get(SAVE_KEYS.v13),raw);assert.equal(m.get(SAVE_KEYS.preserved),undefined);assert.ok(listSaves(storage).every(v=>v.valid));
 const invalid=JSON.parse(raw);invalid.ships[0].type='camel';assert.throws(()=>game.deserialize(JSON.stringify(invalid)),'old format must not accept new types');
});

test('automation buys the specified caravan and shrinks it before smaller wagons',()=>{
 const s=funded(),r=game.openCircuit(s,'wagon',['cairo','suez']);setRouteAutomationShip(s,r.id,'camel');automate(s);
 s.day=100;r.transport={since:0,sales:5000,costs:1000,upkeep:0,deliveries:2};const cash=s.cash;runAutomation(s);
 assert.equal(s.ships.length,2);assert.equal(s.ships[1].type,'camel');assert.equal(cash-s.cash,900);assert.equal(s.automation.spent,900);
 r.cooldownUntil=0;r.transport={since:0,sales:100,costs:1000,upkeep:0,deliveries:2};runAutomation(s);
 assert.equal(s.ships.find(v=>v.type==='camel').routeId,null);assert.equal(s.ships.find(v=>v.type==='wagon').routeId,r.id);
 r.cooldownUntil=0;r.transport={since:0,sales:5000,costs:1000,upkeep:0,deliveries:2};const remaining=s.cash;runAutomation(s);assert.equal(s.cash,remaining);assert.equal(s.ships.find(v=>v.type==='camel').routeId,r.id);
});

test('in-transit replacement retains departure cargo and duration; losses replace the exact caravan type',()=>{
 const s=funded(),r=game.openCircuit(s,'camel',['cairo','suez']);game.tick(s);const v=s.ships.find(v=>v.routeId===r.id),journey=structuredClone(v.voyage),cargo=structuredClone(v.cargo);assert.ok(journey);
 replaceFleet(s,{mode:'route',routeId:r.id,target:'mule'});const replaced=s.ships.find(x=>x.id===v.id);assert.equal(replaced.type,'mule');assert.equal(replaced.voyage.departureType,'camel');assert.equal(replaced.voyage.total,journey.total);assert.deepEqual(replaced.cargo,cargo);
 assert.deepEqual(game.deserialize(game.serialize(s)),s);const route=s.routes.find(x=>x.id===r.id);automate(s);resolveAttack(s,route,replaced,1,0);assert.deepEqual(route.pendingReplacements,['mule']);runReplacements(s);assert.equal(s.ships.find(v=>v.routeId===r.id).type,'mule');assert.equal(route.pendingReplacements.length,0);assert.deepEqual(game.deserialize(game.serialize(s)),s);
});

test('comparison and purchase text render all three land types in all six languages',()=>{
 const s=funded(),raw=game.serialize(s);for(const lang of Object.keys(LANGUAGES)){setLanguage(lang);const html=renderTransportComparison(s,['cairo','suez'],'camel',String);assert.equal((html.match(/<tr /g)??[]).length,3);assert.match(html,/chosen-transport/);assert.doesNotMatch(html,/undefined|NaN|Infinity|\uFFFD/);for(const type of ['camel','mule'])assert.doesNotMatch(renderOpeningQuote(s,type,game.quoteCircuitOpening(s,type,['cairo','suez']),String),/\{transport\}/);}
 for(const name of ['Camel caravan','Mule caravan'])assert.equal(catalog[name].length,4);setLanguage('ja');assert.equal(game.serialize(s),raw);
 for(const p of Object.values(PROFILES)){assert.ok(p.types.includes('camel')&&p.types.includes('mule'));assert.equal(p.maxRoutes,50);}
});

for(const seed of [1,42,1700])test(`caravans and mixed fleets run three years with investment and annual restore: ${seed}`,()=>{
 let s=funded(seed);const a=game.openCircuit(s,'camel',['cairo','suez'],undefined,0),b=game.openCircuit(s,'mule',['portobelo','panama'],undefined,0);game.assignShip(s,a.id,game.buyShip(s,'wagon').id);
 buyRoadRight(s,'cairo_suez');setRoadInvestment(s,'cairo_suez',.2,.1);
 for(let day=1;day<=1095;day++){game.tick(s);if(day%365===0){const copy=game.deserialize(game.serialize(s));assert.deepEqual(copy,s);game.tick(s);game.tick(copy);assert.deepEqual(copy,s);s=copy;}}
 assert.ok(!s.gameOver);for(const r of s.routes)assert.ok(r.deliveries>5&&r.transport.sales>0);assert.ok(s.competitors.every(c=>c.routes.length<=50));assert.ok(Math.abs(s.cash-s.initialCash-Object.values(s.totals).reduce((n,v)=>n+v,0))<.001);
});

import {withoutSeaVersion} from './baseline.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import * as game from '../src/engine.js';
import * as old from '../src/legacy/engine-v6.js';
import {ROADS,WAGONS,INLAND} from '../src/land-data.js';
import {CITIES,NATIONS} from '../src/data.js';
import {roadDays,roadToll,roadSafety,roadQuote,buyRoadRight,setRoadInvestment,roadAssets,canServe,advanceRoads} from '../src/land.js';
import {sailingDays,shipDaily,advanceIndustry,setTechnologyInvestment} from '../src/industry.js';
import {setAutomation,runAutomation,acquireCompany,acquisitionQuote,automationShipTypes} from '../src/management.js';
import {revokeLicense,riskFor,resolveAttack,runReplacements} from '../src/security.js';
import {quoteFleetReplacement} from '../src/fleet.js';
import {saveGame,listSaves,SAVE_KEYS} from '../src/storage.js';
import {renderLand,renderLandRoute} from '../src/land-view.js';
import {LANGUAGES,setLanguage} from '../src/i18n.js';
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-6,`${a} != ${b}`);
function funded(seed=42,events=false){const s=game.createGame(seed,{events});game.entry(s,'sale',100000);for(const n of Object.keys(NATIONS))if(!s.licenses.includes(n))game.buyLicense(s,n);return s;}
function enabled(s){setAutomation(s,{enabled:true,replaceLost:true,monthlyBudget:6000,minCash:1000,expandThreshold:25,shrinkThreshold:0});}
const advance=(s,n)=>{for(let i=0;i<n;i++)game.tick(s);};

test('inland hubs and roads support land-only, sea-only and connected market trade',()=>{
 assert.equal(Object.keys(INLAND).length,46);assert.equal(Object.keys(ROADS).length,69);
 const s=funded(),sea=game.openCircuit(s,'sloop',['lisbon','cadiz']),land=game.openCircuit(s,'wagon',['lisbon','porto']);
 assert.equal(sea.mode,'sea');assert.equal(land.mode,'land');assert.equal(game.openCircuit(s,'wagon',['porto','lisbon']),land);
 const before=s.markets.lisbon.food.stock;advance(s,120);assert.ok(sea.deliveries>0&&land.deliveries>0);assert.notEqual(s.markets.lisbon.food.stock,before);
 assert.ok(s.ledger.some(e=>e.routeId===sea.id&&e.city==='lisbon'));assert.ok(s.ledger.some(e=>e.routeId===land.id&&e.city==='lisbon'));
 near(s.initialCash+Object.values(s.totals).reduce((a,b)=>a+b,0),s.cash);assert.deepEqual(game.deserialize(game.serialize(s)),s);
});
test('opening reuses the exact idle wagon or buys it, rejects no road, wrong mode, missing license and insufficient funds atomically',()=>{
 const s=funded(),v=game.buyShip(s,'wagon'),before=s.cash,q=game.quoteCircuitOpening(s,'wagon',['lisbon','porto']);assert.equal(q.cost,0);assert.equal(q.shipId,v.id);game.openCircuit(s,'wagon',['lisbon','porto']);assert.equal(s.cash,before);
 const another=game.openCircuit(s,'wagon',['paris','marseille']);near(s.cash,before-WAGONS.wagon.price);assert.equal(another.mode,'land');
 for(const [type,stops]of [['sloop',['cadiz','madrid']],['wagon',['london','cadiz']],['wagon',['lisbon','porto','paris']]]){const raw=game.serialize(s);assert.throws(()=>game.openCircuit(s,type,stops));assert.equal(game.serialize(s),raw);}
 const fresh=game.createGame();assert.ok(game.quoteCircuitOpening(fresh,'wagon',['cadiz','madrid']).error);game.buyLicense(fresh,'portugal');game.entry(fresh,'purchase',-4300);const raw=game.serialize(fresh);assert.throws(()=>game.openCircuit(fresh,'wagon',['lisbon','porto']));assert.equal(game.serialize(fresh),raw);
 const ship=game.buyShip(s,'sloop');assert.throws(()=>game.assignShip(s,another.id,ship.id));assert.deepEqual(automationShipTypes(another,s),['wagon','camel','mule']);assert.ok(quoteFleetReplacement(s,{mode:'type',source:'wagon',target:'sloop'}).error);
});
test('multi-stop land service revisits towns and preserves even slots and its cursor across restore',()=>{
 const s=funded(),stops=['lisbon','porto','madrid','cadiz','madrid','porto','lisbon'],r=game.openCircuit(s,'wagon',stops);game.assignShip(s,r.id,game.buyShip(s,'wagon').id);
 assert.deepEqual(r.stops,stops.slice(0,-1));const schedule=game.routeSchedule(s,r),departures=game.routeShips(s,r).map(v=>game.nextDeparture(s,r,v));assert.ok(Math.abs(departures[1]-departures[0]-schedule.interval)<=1);
 advance(s,27);const copy=game.deserialize(game.serialize(s));advance(s,200);advance(copy,200);assert.deepEqual(copy,s);assert.ok(r.deliveries>=6);
});
test('road improvement is diminishing, terrain remains material and in-transit arrival times stay fixed',()=>{
 const s=funded(),id='cadiz_madrid',r=game.openCircuit(s,'wagon',['cadiz','madrid']);game.tick(s);const v=game.routeShips(s,r)[0],total=v.voyage.total;
 buyRoadRight(s,id);setRoadInvestment(s,id,100,0);advance(s,5);assert.ok(s.world.roads[id].quality>0);assert.equal(v.voyage.total,total);assert.equal(v.voyage.remaining,total-5);assert.ok(sailingDays(s,'wagon','cadiz','madrid')<total);assert.deepEqual(game.deserialize(game.serialize(s)),s);
 const d=s.world.roads[id],level=d.quality;advanceRoads(s);const gain=d.quality-level;d.quality=100;advanceRoads(s);assert.ok(d.quality-100<gain);assert.ok(roadDays(s,'wagon','cadiz','madrid',1e9)>Math.ceil(ROADS[id].km/(40*2)));
});
test('tolls affect actual cash, route results and transport margin once; own roads cannot mint toll income',()=>{
 const s=funded(),r=game.openCircuit(s,'wagon',['lisbon','porto']);game.tick(s);const v=game.routeShips(s,r)[0],toll=roadToll(s,'lisbon','porto'),journey=structuredClone(v.voyage);near(s.totals.roadToll,-toll);near(r.transport.costs,toll);assert.equal(v.voyage.toll,toll);
 advance(s,journey.total);near(r.lastActual,r.transport.sales-r.transport.costs-journey.total*shipDaily(s,'wagon'));assert.equal(s.totals.roadToll,-toll);
 buyRoadRight(s,'lisbon_porto');assert.equal(roadToll(s,'lisbon','porto'),0);advance(s,20);assert.equal(s.world.roads.lisbon_porto.tollPool,0);assert.equal(s.totals.roadIncome,undefined);
});
test('rights transfer pays the actual owner, rival traffic shares tolls, investments skip without funds, acquisition transfers road assets',()=>{
 const s=funded(),c=s.competitors[0],id='nantes_paris';game.entry(c,'sale',20000);buyRoadRight(s,id,c);setRoadInvestment(c,id,3,2);assert.equal(roadQuote(s,id).cost,Math.ceil((500+385*2)*1.5));
 const r=game.openCircuit(s,'wagon',['nantes','paris']);game.tick(s);assert.ok(c.totals.roadIncome>0);assert.ok(s.totals.roadToll<0);assert.ok(c.totals.roadIncome<=-s.totals.roadToll*.2+1e-8);
 const sum=s.cash+c.cash,pool=s.world.roads[id].tollPool;buyRoadRight(s,id);near(s.cash+c.cash,sum+pool);assert.equal(s.world.roads[id].dailyRoad,0);assert.equal(s.world.roads[id].owner,'player');
 buyRoadRight(s,'paris_marseille',c);setRoadInvestment(c,'paris_marseille',5e11,5e11);const before=c.cash;advanceRoads(c);assert.equal(c.cash,before);
 const assets=game.assets(s),target=game.assets(c),q=acquisitionQuote(s,0);acquireCompany(s,0);near(game.assets(s),assets-q.price-q.licenseCost+target);assert.equal(s.world.roads.paris_marseille.owner,'player');assert.equal(s.world.roads.paris_marseille.dailyRoad,0);assert.ok(roadAssets(s)>0);assert.deepEqual(game.deserialize(game.serialize(s)),s);
});
test('land technology reduces wagon upkeep only, safety and escorts reduce bandits, lost wagons use normal replacement budgets',()=>{
 const s=funded(42,true),r=game.openCircuit(s,'wagon',['lisbon','porto']),daily=shipDaily(s,'wagon'),sea=shipDaily(s,'sloop');setTechnologyInvestment(s,'land',100);advanceIndustry(s);assert.ok(shipDaily(s,'wagon')<daily);assert.equal(shipDaily(s,'sloop'),sea);
 const base=riskFor(s,r,'wagon');buyRoadRight(s,'lisbon_porto');setRoadInvestment(s,'lisbon_porto',0,100);advanceIndustry(s);assert.ok(roadSafety(s,'lisbon','porto')>ROADS.lisbon_porto.safety);assert.ok(riskFor(s,r,'wagon').daily<base.daily);r.escorts=2;assert.ok(riskFor(s,r,'wagon').lossFraction<base.lossFraction);
 game.tick(s);const v=game.routeShips(s,r)[0];assert.ok(v.voyage);assert.equal(resolveAttack(s,r,v,1,0),true);assert.equal(s.ships.length,0);assert.deepEqual(r.pendingReplacements,['wagon']);enabled(s);runReplacements(s);assert.equal(s.ships[0].type,'wagon');assert.equal(s.automation.spent,600);assert.deepEqual(game.deserialize(game.serialize(s)),s);
});
test('land auto-expansion buys only wagons, observes capital, shrinks into inventory and leaves ships untouched',()=>{
 const s=funded(),r=game.openCircuit(s,'wagon',['lisbon','porto']);game.buyShip(s,'brig');enabled(s);s.day=60;r.transport={since:0,sales:1000,costs:100,upkeep:10,deliveries:2};runAutomation(s);assert.equal(game.routeShips(s,r).length,2);assert.equal(s.ships.find(v=>v.type==='brig').routeId,null);assert.equal(s.automation.spent,600);
 s.day=120;r.transport={since:0,sales:0,costs:100,upkeep:10,deliveries:2};r.cooldownUntil=0;runAutomation(s);assert.equal(game.routeShips(s,r).length,1);assert.ok(s.ships.some(v=>v.type==='wagon'&&!v.routeId));
});
test('revocation removes a cross-border land circuit and confiscates rights and cargo without compensation',()=>{
 const s=funded(),r=game.openCircuit(s,'wagon',['lisbon','porto','madrid','porto']);buyRoadRight(s,'porto_madrid');setRoadInvestment(s,'porto_madrid',10,10);game.tick(s);assert.ok(s.ships[0].voyage);const cash=s.cash;revokeLicense(s,'spain');assert.equal(s.routes.length,0);assert.equal(s.ships[0].routeId,null);assert.deepEqual(s.ships[0].cargo,[]);assert.equal(s.ships[0].voyage,null);assert.equal(s.world.roads.porto_madrid.owner,'state');assert.equal(s.world.roads.porto_madrid.invested,0);assert.equal(s.cash,cash);assert.deepEqual(game.deserialize(game.serialize(s)),s);
});
test('v6 migration preserves existing markets, capital, ships, designs, voyages and random state, and keeps original save slots',()=>{
 const v6=old.createGame(42);old.buyLicense(v6,'spain');old.openCircuit(v6,'sloop',['kingston','havana']);old.tick(v6);const raw=old.serialize(v6),s=game.deserialize(raw);assert.equal(s.version,14);assert.equal(s.cash,v6.cash);assert.deepEqual(withoutSeaVersion(s.ships),v6.ships);assert.equal(s.rng,v6.rng);assert.deepEqual(s.world.designs,v6.world.designs);for(const id of Object.keys(v6.markets))assert.deepEqual(Object.fromEntries(Object.keys(v6.markets[id]).map(g=>[g,s.markets[id][g]])),v6.markets[id]);assert.equal(s.industry.technology.land,0);
 const map=new Map([[SAVE_KEYS.v6,raw]]),storage={getItem:k=>map.get(k)??null,setItem:(k,v)=>map.set(k,v)};assert.ok(listSaves(storage).find(v=>v.slot==='v6').valid);saveGame(storage,s);assert.equal(map.get(SAVE_KEYS.v6),raw);assert.equal(map.get(SAVE_KEYS.preserved),raw);const restored=game.deserialize(game.serialize(s));advance(s,60);advance(restored,60);assert.deepEqual(s,restored);
});
test('corrupt road owners, amounts, modes, inland sea routes and departure conditions are rejected',()=>{
 const s=funded();game.openCircuit(s,'wagon',['lisbon','porto']);game.tick(s);
 for(const corrupt of [c=>delete c.world.roads.lisbon_porto,c=>c.world.roads.lisbon_porto.owner='intruder',c=>c.world.roads.lisbon_porto.quality=-1,c=>c.routes[0].mode='sea',c=>c.ships[0].voyage.roadQuality=-1,c=>c.ships[0].voyage.total++,c=>c.ships[0].voyage.toll=-1,c=>c.routes[0].autoShipType='brig',c=>c.routes[0].pendingReplacements=['sloop'],c=>c.ledger[0].road='unknown']){const copy=JSON.parse(game.serialize(s));corrupt(copy);assert.throws(()=>game.deserialize(JSON.stringify(copy)));}
});
test('land panels and service details render in six languages without changing simulation state',()=>{
 const s=funded(),r=game.openCircuit(s,'wagon',['lisbon','porto']),before=game.serialize(s),fmt={cash:String,decimal:String,signed:String,tone:()=>''};
 for(const lang of Object.keys(LANGUAGES)){setLanguage(lang);const html=renderLand(s,fmt)+renderLandRoute(s,r,fmt);assert.doesNotMatch(html,/undefined|\[object Object\]|\uFFFD/);assert.match(html,/Porto/);if(!['en','ja'].includes(lang))assert.doesNotMatch(html,/Road improvement per day|Land trade technology/);assert.equal(game.serialize(s),before);}setLanguage('ja');
});
test('three seeds run ten years with sea/land networks, roads, bandits, AI and deterministic annual recovery',()=>{
 for(const seed of [1,42,1700]){
  let s=funded(seed,true),rivalLandSeen=false;game.openCircuit(s.competitors[0],'wagon',['nantes','paris']);game.openCircuit(s,'sloop',['kingston','havana']);game.openCircuit(s,'wagon',['lisbon','porto']);game.openCircuit(s,'wagon',['lisbon','porto','madrid','cadiz','madrid','porto']);buyRoadRight(s,'lisbon_porto');setRoadInvestment(s,'lisbon_porto',.5,.5);setTechnologyInvestment(s,'land',.5);enabled(s);
  for(let day=1;day<=3650;day++){game.tick(s);rivalLandSeen ||= s.competitors.some(c=>c.routes.some(r=>r.mode==='land'));assert.ok(!s.gameOver,`seed ${seed}, day ${day}`);if(day%365===0){const copy=game.deserialize(game.serialize(s));game.tick(copy);const probe=game.deserialize(game.serialize(s));game.tick(probe);assert.deepEqual(copy,probe);s=game.deserialize(game.serialize(s));}}
  assert.equal(s.day,3650);assert.ok(s.routes.some(r=>r.mode==='land'&&r.deliveries>100));assert.ok(rivalLandSeen,'the mixed-network fixture must exercise rival land traffic');assert.ok(s.industry.technology.land>0);near(s.initialCash+Object.values(s.totals).reduce((a,b)=>a+b,0),s.cash);
 }
});

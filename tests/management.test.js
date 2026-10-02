import {withoutSeaVersion} from './baseline.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import {buyLicense, buyShip, setCircuit, tick, assets, serialize, deserialize, trade, routeSchedule, assignShip, toggleRoute} from '../src/engine.js';
import {createGame} from './baseline.js';
import {initializeRoute, initializeManagement, transportMargin, setAutomation, setRouteAutomationShip, automationShipTypes, runAutomation, runCompetitor, monthFor, rankings, recordRank, acquisitionQuote, acquireCompany} from '../src/management.js';
import * as v3 from '../src/legacy/engine-v3.js';
import {SHIPS} from '../src/data.js';
import {SAVE_KEYS,saveGame,listSaves} from '../src/storage.js';
import {renderAutomation,renderCompetition,renderAcquisition,routeAutomation} from '../src/management-view.js';
import {setLanguage} from '../src/i18n.js';
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-6,`${a} != ${b}`);
function funded(){const s=createGame();trade(s,'kingston','food',30000,'sell');buyLicense(s,'spain');return s;}
function service(s,ports=['kingston','havana']){return setCircuit(s,buyShip(s,'sloop').id,ports);}
function observed(s,r,sales=2000,costs=1000){s.day=30;for(const c of s.competitors)c.day=s.day;r.transport={since:0,sales,costs,upkeep:0,deliveries:2};}
function settings(s,extra={}){setAutomation(s,{enabled:true,monthlyBudget:3600,minCash:1000,expandThreshold:25,shrinkThreshold:0,...extra});}
test('transport margin includes taxes and ship costs, excludes incomplete cargo and company overhead',()=>{
  const s=funded(),r=service(s);tick(s);
  assert.equal(r.transport.costs,0);assert.equal(r.transport.sales,0);
  while(r.deliveries<1)tick(s);
  const completed=s.ledger.filter(e=>e.routeId===r.id&&['purchase','sale','tax','upkeep'].includes(e.category));
  const income=completed.filter(e=>e.amount>0).reduce((n,e)=>n+e.amount,0),expenses=-completed.filter(e=>e.amount<0).reduce((n,e)=>n+e.amount,0);
  near(r.transport.sales,income);near(r.transport.costs+r.transport.upkeep,expenses);
  near(transportMargin(r),(income-expenses)/expenses*100);
  const ratio=transportMargin(r);s.totals.licenseDaily=-1e6;assert.equal(transportMargin(r),ratio);
  initializeRoute(r,s.day);assert.equal(transportMargin(r),null);
});
test('automation prioritizes higher margins, shares the monthly budget and observes one-cycle cooldown',()=>{
  const s=funded(),low=service(s),high=service(s,['havana','santiago']);observed(s,low,1500);observed(s,high,2500);settings(s,{monthlyBudget:1800});
  const before=s.cash;runAutomation(s);
  assert.equal(s.ships.filter(v=>v.routeId===high.id).length,2);assert.equal(s.ships.filter(v=>v.routeId===low.id).length,1);
  near(before-s.cash,1800);assert.equal(s.automation.spent,1800);
  assert.equal(high.cooldownUntil,s.day+routeSchedule(s,high).cycle);
  high.transport={since:0,sales:5000,costs:1000,upkeep:0,deliveries:3};runAutomation(s);assert.equal(s.ships.length,3);
  assert.ok(s.managementLog.some(e=>e.reason==='cooldown'));assert.ok(s.managementLog.some(e=>e.reason==='budget'));
});
test('reserve, calendar rollover, idle reuse and settings changes never bypass spending limits',()=>{
  const s=funded(),r=service(s);observed(s,r);settings(s,{minCash:s.cash});runAutomation(s);assert.equal(s.ships.length,1);assert.equal(s.managementLog.at(-1).reason,'reserve');
  settings(s,{monthlyBudget:1800});runAutomation(s);assert.equal(s.automation.spent,1800);
  assert.throws(()=>settings(s,{monthlyBudget:1799}));
  const spent=s.automation.spent;setAutomation(s,{...s.automation,enabled:false});assert.equal(s.automation.spent,spent);
  s.day=31;runAutomation(s);assert.equal(monthFor(s.day),'1700-02');assert.equal(s.automation.spent,0);
  const idle=buyShip(s,'sloop');r.cooldownUntil=0;r.transport={since:0,sales:2000,costs:1000,upkeep:0,deliveries:2};settings(s,{monthlyBudget:0});const cash=s.cash;runAutomation(s);
  assert.equal(idle.routeId,r.id);assert.equal(s.cash,cash);assert.equal(s.automation.spent,0);
  const before=serialize(s);for(const extra of [{expandThreshold:-2,shrinkThreshold:0},{monthlyBudget:-1},{minCash:NaN},{expandThreshold:Infinity}]){assert.throws(()=>settings(s,extra));assert.equal(serialize(s),before);}
});
test('contraction waits for ships at sea, releases cargo-free ships and never removes the last ship',()=>{
  const s=funded(),r=service(s);assignShip(s,r.id,buyShip(s,'sloop').id);
  const ship=s.ships[0];tick(s);assert.ok(ship.voyage);observed(s,r,100,1000);settings(s);
  runAutomation(s);assert.ok(ship.routeId);assert.equal(s.ships[1].routeId,null);assert.equal(s.routes.length,1);
  r.cooldownUntil=0;r.transport={since:0,sales:100,costs:1000,upkeep:0,deliveries:2};runAutomation(s);assert.equal(s.managementLog.at(-1).reason,'minimumFleet');
  assignShip(s,r.id,s.ships[1].id);const other=s.ships[1];other.voyage=structuredClone(ship.voyage);other.status=ship.status;other.nextFrom=ship.nextFrom;other.nextStop=ship.nextStop;
  runAutomation(s);assert.equal(s.managementLog.at(-1).reason,'sailing');assert.ok(s.ships.every(v=>v.routeId));
});
test('paused and opted-out routes do not auto-expand and zero-expense samples are skipped',()=>{
  const s=funded(),r=service(s);observed(s,r);settings(s);toggleRoute(s,r.id);runAutomation(s);assert.equal(s.ships.length,1);
  toggleRoute(s,r.id);r.autoManage=false;runAutomation(s);assert.equal(s.ships.length,1);r.autoManage=true;r.transport.costs=0;r.transport.upkeep=0;runAutomation(s);assert.equal(s.managementLog.at(-1).reason,'sample');
});
test('acquisition conserves market, cargo, travel and assets while merging rotated services',()=>{
  const s=funded();buyLicense(s,'france');buyLicense(s,'netherlands');
  const r=service(s,['amsterdam','nantes']);tick(s);
  const target=s.competitors[0],q=acquisitionQuote(s,0),beforeAssets=assets(s),beforeCash=s.cash,markets=structuredClone(s.markets),voyages=target.ships.map(v=>structuredClone(v.voyage)),cargo=target.ships.map(v=>structuredClone(v.cargo));
  assert.ok(voyages[0]);const count=s.ships.length;acquireCompany(s,0);
  assert.equal(s.competitors.length,1);assert.equal(s.routes.length,1);assert.equal(s.ships.length,count+1);
  const imported=s.ships.at(-1);assert.equal(imported.routeId,r.id);assert.equal(imported.nextStop,1);assert.deepEqual(imported.voyage,voyages[0]);assert.deepEqual(imported.cargo,cargo[0]);
  assert.deepEqual(s.markets,markets);near(s.cash,beforeCash-q.price-q.licenseCost+q.cash);near(assets(s),beforeAssets-q.price-q.licenseCost+q.assets);
  assert.equal(new Set([...s.ships,...s.routes].map(v=>v.id)).size,s.ships.length+s.routes.length);
  near(s.initialCash+Object.values(s.totals).reduce((a,b)=>a+b,0),s.cash);
  const restored=deserialize(serialize(s));for(let i=0;i<100;i++){tick(s);tick(restored);}assert.deepEqual(restored,s);
});
test('buyout adds missing licenses, handles debt, and cannot partially mutate an unaffordable company',()=>{
  const poor=createGame(),before=serialize(poor);assert.throws(()=>acquireCompany(poor,0));assert.equal(serialize(poor),before);
  const s=funded(),c=s.competitors[0];
  // A failed business still has physical ships, and its liabilities transfer too.
  const loss=c.cash+10;c.cash-=loss;c.totals.upkeep=(c.totals.upkeep||0)-loss;c.gameOver=true;
  const q=acquisitionQuote(s,0),cash=s.cash;assert.equal(q.cash,-10);assert.ok(q.licenseCost>0);acquireCompany(s,0);
  near(s.cash,cash-q.price-q.licenseCost-10);assert.ok(s.licenses.includes('france')&&s.licenses.includes('netherlands'));assert.deepEqual(deserialize(serialize(s)),s);
});
test('ranking records the first sole lead once, survives restore and continues simulation',()=>{
  const s=createGame();assert.notEqual(rankings(s)[0].id,'player');recordRank(s);assert.equal(s.firstRankDay,null);
  trade(s,'kingston','food',30000,'sell');tick(s);assert.equal(s.firstRankDay,1);assert.equal(s.managementLog.filter(e=>e.reason==='firstRank').length,1);
  const copy=deserialize(serialize(s));for(let i=0;i<50;i++)tick(copy);assert.equal(copy.firstRankDay,1);assert.equal(copy.managementLog.filter(e=>e.reason==='firstRank').length,1);assert.equal(copy.day,51);
});
test('monthly competitor decisions are deterministic, spend their own cash and expand services',()=>{
  const s=createGame(),c=s.competitors[0],before=c.cash;assert.equal(c.strategy.kind,'large');assert.equal(s.competitors[1].strategy.kind,'small');
  s.day=c.day=31;c.automation.month=monthFor(31);runCompetitor(c);
  assert.ok(c.ships.length>1);assert.ok(c.cash<before);assert.ok(c.cash>=6000);assert.ok(c.routes.length>1);assert.ok(c.managementLog.some(e=>e.reason==='rivalExpanded'));
  const count=c.ships.length;runCompetitor(c);assert.equal(c.ships.length,count);
  near(c.initialCash+Object.values(c.totals).reduce((a,b)=>a+b,0),c.cash);
});
test('v3 repeated-stop saves migrate without rewriting capital, voyages or old slots',()=>{
  const old=v3.createGame();v3.trade(old,'kingston','food',30000,'sell');v3.buyLicense(old,'spain');v3.buyLicense(old,'portugal');v3.setCircuit(old,v3.buyShip(old,'brig').id,['cadiz','lisbon','sanjuan','santodomingo','sanjuan','lisbon']);v3.tick(old);
  const raw=v3.serialize(old),s=deserialize(raw);assert.equal(s.version,9);assert.deepEqual(withoutSeaVersion(s.ships),old.ships);assert.equal(s.cash,old.cash);assert.equal(s.competitors[0].cash,old.competitors[0].cash);assert.equal(s.automation.enabled,false);assert.deepEqual(s.routes[0].stops,old.routes[0].stops);
  const map=new Map([[SAVE_KEYS.autoV3,raw]]),storage={getItem:k=>map.get(k)??null,setItem:(k,v)=>map.set(k,v)};assert.ok(listSaves(storage).find(x=>x.slot==='autoV3').valid);saveGame(storage,s,'auto');assert.equal(map.get(SAVE_KEYS.autoV3),raw);assert.equal(JSON.parse(map.get(SAVE_KEYS.auto)).version,9);
  const broken=JSON.parse(raw);broken.cash++;assert.throws(()=>deserialize(JSON.stringify(broken)));
});
test('corrupt management data is rejected and new UI is localized in both languages',()=>{
  const s=funded();service(s);
  for(const mutate of [x=>x.automation.spent=100,x=>x.automation.expandThreshold=-10,x=>x.firstRankDay=999,x=>x.routes[0].transport.costs=-1,x=>x.competitors[0].strategy.kind='missing',x=>x.managementLog.push({day:0,reason:'<img>',routeId:null,cost:0})]){const copy=JSON.parse(serialize(s));mutate(copy);assert.throws(()=>deserialize(JSON.stringify(copy)));}
  const fmt={cash:String,signed:String};setLanguage('en');const html=renderAutomation(s,fmt)+renderCompetition(s,null,fmt)+renderAcquisition(s,0,String);assert.doesNotMatch(html,/[\u3000-\u9fff]/);assert.match(html,/Minimum cash reserve/);setLanguage('ja');assert.match(renderAutomation(s,fmt),/最低保有資金/);
});
test('ten years with automation stays within budgets and resumes deterministically',()=>{
  let s=createGame(2026);buyLicense(s,'spain');service(s,['kingston','havana','santiago']);settings(s,{monthlyBudget:1800,minCash:2500});
  for(let i=0;i<3650;i++){
    tick(s);assert.equal(s.gameOver,false);assert.ok(s.automation.spent<=s.automation.monthlyBudget);
    if(i%365===0){const restored=deserialize(serialize(s));tick(s);tick(restored);assert.deepEqual(restored,s);s=restored;i++;}
  }
  assert.equal(s.day,3650);assert.ok(s.ships.length>1);assert.ok(s.competitors.every(c=>c.routes.length>1));
  near(s.initialCash+Object.values(s.totals).reduce((a,b)=>a+b,0),s.cash);
});
test('all companies can be acquired once without ghost routes or duplicate assets',()=>{
  const s=funded();tick(s);const initial=assets(s);let change=0;
  while(s.competitors.length){const q=acquisitionQuote(s,0);change+=q.assets-q.price-q.licenseCost;acquireCompany(s,0);}
  near(assets(s),initial+change);const before=serialize(s);assert.throws(()=>acquireCompany(s,0));assert.equal(serialize(s),before);
  tick(s);assert.deepEqual(deserialize(serialize(s)),s);assert.equal(rankings(s).length,1);
});

test('expansion ignores other idle types and buys only the route-selected type',()=>{
  for(const type of ['sloop','brig']) {
    const s=funded(),r=service(s),wrong=buyShip(s,'fluyt');
    assert.equal(r.autoShipType,'sloop');setRouteAutomationShip(s,r.id,type);
    observed(s,r);settings(s,{monthlyBudget:SHIPS[type].price});const cash=s.cash;
    runAutomation(s);
    assert.equal(wrong.routeId,null);assert.equal(s.ships.at(-1).type,type);assert.equal(s.ships.at(-1).routeId,r.id);
    near(cash-s.cash,SHIPS[type].price);assert.equal(s.automation.spent,SHIPS[type].price);
    assert.equal(s.managementLog.at(-1).reason,'expanded');assert.deepEqual(deserialize(serialize(s)),s);
  }
});
test('selected idle type is reused without spending or stealing assigned ships',()=>{
  const s=funded(),r=service(s),other=service(s,['havana','santiago']);other.autoManage=false;
  const wrong=buyShip(s,'fluyt'),idle=buyShip(s,'brig');setRouteAutomationShip(s,r.id,'brig');
  observed(s,r);settings(s,{monthlyBudget:0});const cash=s.cash,count=s.ships.length;runAutomation(s);
  assert.equal(idle.routeId,r.id);assert.equal(wrong.routeId,null);assert.equal(s.ships[1].routeId,other.id);
  assert.equal(s.ships.length,count);assert.equal(s.cash,cash);assert.equal(s.automation.spent,0);assert.equal(s.managementLog.at(-1).reason,'reused');
});
test('selected-type purchase respects budget and reserve even with other idle ships',()=>{
  for(const reason of ['budget','reserve']) {
    const s=funded(),r=service(s),wrong=buyShip(s,'sloop');setRouteAutomationShip(s,r.id,'brig');observed(s,r);
    settings(s,{monthlyBudget:reason==='budget'?5199:5200,minCash:reason==='reserve'?s.cash-5199:0});
    const cash=s.cash,ships=structuredClone(s.ships);runAutomation(s);
    assert.equal(s.cash,cash);assert.deepEqual(s.ships,ships);assert.equal(wrong.routeId,null);assert.equal(s.automation.spent,0);assert.equal(s.managementLog.at(-1).reason,reason);
  }
});
test('contraction prefers the designated type and otherwise the lowest capacity',()=>{
  for(const selected of ['brig','fluyt']) {
    const s=funded(),r=service(s),small=s.ships[0],large=buyShip(s,'brig');assignShip(s,r.id,large.id);setRouteAutomationShip(s,r.id,selected);
    observed(s,r,100);settings(s);const cash=s.cash;runAutomation(s);
    assert.equal((selected==='brig'?large:small).routeId,null);assert.equal((selected==='brig'?small:large).routeId,r.id);
    assert.equal(s.cash,cash);assert.equal(s.ships.length,2);assert.equal(s.managementLog.at(-1).reason,'shrunk');
  }
});
test('contraction waits for the preferred or smallest ship to arrive without dropping cargo',()=>{
  for(const selected of ['sloop','fluyt']) {
    const s=funded(),r=service(s),small=s.ships[0];tick(s);assert.ok(small.voyage);
    const large=buyShip(s,'brig');assignShip(s,r.id,large.id);setRouteAutomationShip(s,r.id,selected);
    observed(s,r,0,100000);settings(s);const cargo=structuredClone(small.cargo);runAutomation(s);
    assert.equal(s.managementLog.at(-1).reason,'sailing');assert.equal(large.routeId,r.id);assert.deepEqual(small.cargo,cargo);
    // Keep the larger ship in port while the priority candidate completes its voyage.
    r.minMargin=1000;
    const deadline=s.day+small.voyage.remaining;
    while(s.day<deadline)tick(s);
    assert.equal(small.routeId,null);assert.equal(small.voyage,null);assert.deepEqual(small.cargo,[]);assert.equal(large.routeId,r.id);
    assert.deepEqual(deserialize(serialize(s)),s);
  }
});
test('ship type updates validate range and preserve observation, cooldown and spending',()=>{
  const s=funded();buyLicense(s,'portugal');const r=setCircuit(s,buyShip(s,'brig').id,['lisbon','sanjuan']);
  assert.equal(r.autoShipType,'brig');assert.ok(!automationShipTypes(r).includes('sloop'));
  const before=serialize(s);
  for(const type of ['sloop','missing',null,{},'constructor'])assert.throws(()=>setRouteAutomationShip(s,r.id,type));
  assert.throws(()=>setRouteAutomationShip(s,'route-999','brig'));assert.equal(serialize(s),before);
  setRouteAutomationShip(s,r.id,'fluyt');const expected=JSON.parse(before);expected.routes[0].autoShipType='fluyt';assert.equal(serialize(s),JSON.stringify(expected));
  assert.equal(deserialize(serialize(s)).routes[0].autoShipType,'fluyt');
  for(const type of ['sloop','missing',null]){const copy=JSON.parse(before);copy.routes[0].autoShipType=type;assert.throws(()=>deserialize(JSON.stringify(copy)));}
  setLanguage('en');const html=routeAutomation(r,s,String);assert.doesNotMatch(html,/[\u3000-\u9fff]/);assert.doesNotMatch(html,/value="sloop"/);assert.match(html,/value="fluyt" selected/);assert.match(html,/Ship type for automation/);
  setLanguage('ja');assert.match(routeAutomation(r,s,String),/自動増減用の船種/);
});
test('old v4 saves infer fleet type without resetting existing management state',()=>{
  const s=funded(),r=service(s);observed(s,r);settings(s,{monthlyBudget:1800});runAutomation(s);tick(s);
  const old=JSON.parse(serialize(s));
  for(const c of [old,...old.competitors])for(const route of c.routes)delete route.autoShipType;
  const restored=deserialize(JSON.stringify(old));assert.deepEqual(restored,s);
  const legacy=v3.createGame();v3.buyLicense(legacy,'spain');v3.setCircuit(legacy,v3.buyShip(legacy,'sloop').id,['kingston','havana']);
  assert.equal(deserialize(v3.serialize(legacy)).routes[0].autoShipType,'sloop');
});
test('acquisition preserves selected types on new services and the player policy on merges',()=>{
  const s=funded();buyLicense(s,'france');buyLicense(s,'netherlands');
  const r=service(s,['amsterdam','nantes']);setRouteAutomationShip(s,r.id,'fluyt');
  acquireCompany(s,0);assert.equal(s.routes.find(v=>v.id===r.id).autoShipType,'fluyt');
  const types=new Map(s.competitors[0].routes.map(v=>[v.stops.join(':'),v.autoShipType]));
  acquireCompany(s,0);for(const [stops,type] of types)assert.equal(s.routes.find(v=>v.stops.join(':')===stops).autoShipType,type);
  assert.deepEqual(deserialize(serialize(s)),s);
});

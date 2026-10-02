import {withoutSeaVersion} from './baseline.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import {createGame,buyLicense,buyShip,openCircuit,tick,serialize,deserialize,assets,trade,routeSchedule,assignShip,entry,price} from '../src/engine.js';
import {setAutomation,runAutomation,acquireCompany,acquisitionQuote} from '../src/management.js';
import {RULES,licenseTerms,recordTrade,advanceDiplomacy,advanceWorld,donate,setDiplomacyInvestment,setEscort,riskFor,resolveAttack,runReplacements,checkAttack,demandMultiplier} from '../src/security.js';
import {renderDiplomacy,renderNotices,routeProtection} from '../src/security-view.js';
import {setLanguage} from '../src/i18n.js';
import {SHIPS} from '../src/data.js';
import * as legacy from '../src/legacy/engine-v4.js';
import {SAVE_KEYS,listSaves,saveGame} from '../src/storage.js';
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-6,`${a} != ${b}`);
function funded(seed=1700){const s=createGame(seed);trade(s,'kingston','food',30000,'sell');buyLicense(s,'spain');return s;}
function sailing(){const s=funded(),r=openCircuit(s,'sloop',['kingston','havana']);tick(s);const v=s.ships[0];assert.ok(v.voyage);return {s,r,v};}
function automation(s,extra={}){setAutomation(s,{enabled:true,replaceLost:true,monthlyBudget:1800,minCash:1000,expandThreshold:25,shrinkThreshold:0,...extra});}
test('friendship affects fees and taxes, while same-day split trades remain equivalent',()=>{
  const s=createGame(),other=createGame();trade(s,'kingston','rum',18,'sell');trade(other,'kingston','rum',7,'sell');trade(other,'kingston','rum',11,'sell');near(s.cash,other.cash);near(s.diplomacy.tradeToday.england,other.diplomacy.tradeToday.england);
  const base=licenseTerms(s,'england');advanceDiplomacy(s);assert.ok(s.diplomacy.friendship.england>60);assert.ok(licenseTerms(s,'england').tax<base.tax);
  s.diplomacy.friendship.spain=29;const before=serialize(s);assert.throws(()=>buyLicense(s,'spain'));assert.equal(serialize(s),before);
  s.diplomacy.friendship.spain=30;assert.ok(licenseTerms(s,'spain').fee>250);buyLicense(s,'spain');assert.ok(s.licenses.includes('spain'));
});
test('war warns through events without instantly revoking licenses and boosts weapons demand',()=>{
  const s=createGame(1);buyLicense(s,'spain');s.day=366;for(const c of s.competitors)c.day=366;
  for(const p of s.world.pairs){p.cooldownUntil=0;p.relation=0;p.base=0;}
  const before={...s.diplomacy.friendship};advanceWorld(s);for(let i=0;i<12&&!s.world.events.length;i++){s.day+=31;advanceWorld(s);}
  assert.ok(s.world.events.some(e=>e.kind==='war'));assert.deepEqual(s.diplomacy.friendship,before);assert.ok(s.licenses.includes('spain'));
  const pair=s.world.pairs.find(p=>p.until!==null);assert.ok(pair.until>=s.day+730&&pair.until<=s.day+3650);assert.equal(demandMultiplier(s,pair.a,'weapons'),1.8);assert.equal(demandMultiplier(s,pair.a,'rum'),1);
  s.day=pair.until;advanceWorld(s);assert.ok(s.world.events.some(e=>e.kind==='peace'));assert.equal(pair.until,null);assert.equal(pair.cooldownUntil,s.day+365);
});
test('warning precedes revocation and funded continuous investment can offset wartime trade damage',()=>{
  const s=funded();const pair=s.world.pairs.find(p=>[p.a,p.b].includes('england')&&[p.a,p.b].includes('spain'));pair.until=1000;
  s.diplomacy.tradeToday.england=5000;s.diplomacy.tradeToday.spain=0;s.diplomacy.friendship.spain=35.01;
  advanceDiplomacy(s);assert.ok(s.incidents.some(e=>e.kind==='warning'&&e.nation==='spain'));assert.ok(s.licenses.includes('spain'));
  setDiplomacyInvestment(s,'spain',25);const before=s.diplomacy.friendship.spain,cash=s.cash;recordTrade(s,'england',5000);advanceDiplomacy(s);assert.ok(s.diplomacy.friendship.spain>before);near(s.cash,cash-25);
  const old=s.diplomacy.friendship.spain;donate(s,'spain',1000);near(s.diplomacy.friendship.spain,old+10);
  setDiplomacyInvestment(s,'spain',s.cash+1);const protectedCash=s.cash;advanceDiplomacy(s);near(s.cash,protectedCash);setDiplomacyInvestment(s,'spain',0);
  const raw=serialize(s);assert.throws(()=>donate(s,'spain',s.cash+1));assert.throws(()=>setDiplomacyInvestment(s,'spain',-1));assert.equal(serialize(s),raw);
});
test('wartime weapons demand raises prices through stock consumption without changing base production',()=>{
  const peace=createGame(),war=deserialize(serialize(peace));war.world.pairs.find(p=>p.a==='england'&&p.b==='spain').until=1000;
  tick(peace,{runCompetitors:false});tick(war,{runCompetitors:false});
  const a=peace.markets.kingston.weapons,b=war.markets.kingston.weapons;assert.ok(b.stock<a.stock);assert.ok(price('weapons',b.stock)>price('weapons',a.stock));assert.equal(a.production,b.production);
});
test('license revocation at sea forfeits cargo once and returns surviving ships to inventory',()=>{
  const {s,r,v}=sailing(),untouched=openCircuit(s,'sloop',['kingston','bridgetown']);const originalCash=s.cash,cost=v.cargo.reduce((n,c)=>n+c.total,0);s.diplomacy.friendship.spain=19;
  advanceDiplomacy(s);assert.equal(s.cash,originalCash);assert.ok(!s.licenses.includes('spain'));assert.ok(!s.routes.includes(r));assert.ok(s.routes.includes(untouched));assert.equal(v.routeId,null);assert.equal(v.voyage,null);assert.deepEqual(v.cargo,[]);
  near(s.incidents.at(-1).cargoCost,cost);const raw=serialize(s);assert.deepEqual(deserialize(raw),s);advanceDiplomacy(s);assert.equal(s.incidents.filter(e=>e.kind==='revoked').length,1);
  const peacefulRisk=riskFor(s,untouched,'sloop');s.diplomacy.friendship.spain=5;
  const hostileRisk=riskFor(s,untouched,'sloop');assert.equal(hostileRisk.hostile,true);assert.ok(hostileRisk.daily>peacefulRisk.daily);
  tick(s);assert.ok(s.routes.includes(untouched));assert.equal(riskFor(s,untouched,'sloop').hostile,true);
});
test('escort, merchant speed and guns mitigate raids; escort cost is outside transport margin',()=>{
  const {s,r,v}=sailing(),base=riskFor(s,r,'sloop');setEscort(s,r.id,2);const escorted=riskFor(s,r,'sloop');assert.ok(escorted.daily<base.daily);assert.ok(escorted.lossFraction<base.lossFraction);assert.ok(escorted.sinkChance<base.sinkChance);
  assert.ok(riskFor(s,r,'brig').lossFraction<riskFor(s,r,'fluyt').lossFraction);
  s.diplomacy.friendship.spain=5;assert.ok(riskFor(s,r,'sloop').hostile);assert.ok(riskFor(s,r,'sloop').daily>escorted.daily);s.diplomacy.friendship.spain=60;
  const before=r.transport.upkeep,profit=r.profit;tick(s);near(r.transport.upkeep-before,SHIPS[v.type].daily);near(r.profit-profit,-SHIPS[v.type].daily-8);assert.equal(s.ledger.filter(e=>e.category==='escort').at(-1).amount,-8);
  const raw=serialize(s);assert.throws(()=>setEscort(s,r.id,4));assert.equal(serialize(s),raw);
});
test('cargo loss preserves remaining cost, cash and saved voyage, without duplicate sale or expense',()=>{
  const {s,r,v}=sailing(),cash=s.cash,original=v.cargo.reduce((n,c)=>n+c.total,0),transport=r.transport.costs;
  assert.equal(resolveAttack(s,r,v,1,1),false);const lost=s.incidents.at(-1).cargoCost;assert.ok(lost>0&&lost<original);near(s.cash,cash);near(v.cargo.reduce((n,c)=>n+c.total,0)+lost,original);near(v.voyage.cost+lost,original);near(r.transport.costs-transport,lost);
  const revenueBefore=r.revenue,days=v.voyage.total;r.active=false;
  const midVoyage=deserialize(serialize(s));while(v.voyage){tick(s);tick(midVoyage);}assert.deepEqual(midVoyage,s);
  const arrivalTax=s.ledger.filter(e=>e.day===s.day&&e.routeId===r.id&&e.category==='tax').reduce((sum,e)=>sum+e.amount,0);
  near(r.lastActual,r.revenue-revenueBefore+arrivalTax-original-days*SHIPS[v.type].daily);
  const restored=deserialize(serialize(s));for(let i=0;i<20;i++){tick(s);tick(restored);}assert.deepEqual(restored,s);
});
test('last ship loss keeps a valid empty route and replacement runs before profitable expansion',()=>{
  const {s,r,v}=sailing();resolveAttack(s,r,v,0,0);assert.equal(s.ships.length,0);assert.deepEqual(r.pendingReplacements,['sloop']);assert.ok(routeSchedule(s,r).cycle>0);assert.deepEqual(deserialize(serialize(s)),s);
  const other=openCircuit(s,'sloop',['havana','santiago']);s.day=30;for(const c of s.competitors)c.day=30;other.transport={since:0,sales:3000,costs:1000,upkeep:0,deliveries:2};
  automation(s);const cash=s.cash;runReplacements(s);runAutomation(s);assert.equal(s.ships.length,2);assert.equal(r.pendingReplacements.length,0);near(cash-s.cash,1800);assert.equal(s.automation.spent,1800);assert.ok(s.managementLog.some(e=>e.reason==='replaced'));assert.ok(s.managementLog.some(e=>e.reason==='budget'));assert.deepEqual(deserialize(serialize(s)),s);
});
test('replacement respects reserve and monthly budget and reuses only the lost type',()=>{
  const {s,r,v}=sailing();resolveAttack(s,r,v,0,0);buyShip(s,'brig');automation(s,{monthlyBudget:1799});runReplacements(s);assert.equal(r.pendingReplacements.length,1);
  automation(s,{minCash:s.cash});runReplacements(s);assert.equal(r.pendingReplacements.length,1);
  const idle=buyShip(s,'sloop');automation(s,{monthlyBudget:0,minCash:0});const cash=s.cash;runReplacements(s);assert.equal(idle.routeId,r.id);assert.equal(s.ships[0].routeId,null);assert.equal(s.cash,cash);assert.equal(s.automation.spent,0);
});
test('raid grace does not consume random numbers or damage ships',()=>{
  const {s,r,v}=sailing(),before=serialize(s);assert.equal(checkAttack(s,r,v),false);assert.equal(serialize(s),before);
});
test('v4 migration preserves voyages, budgets and existing markets, and leaves v4 slots untouched',()=>{
  const old=legacy.createGame();legacy.buyLicense(old,'spain');legacy.openCircuit(old,'sloop',['kingston','havana']);legacy.tick(old);const raw=legacy.serialize(old),s=deserialize(raw);
  assert.equal(s.version,9);assert.equal(s.cash,old.cash);assert.deepEqual(withoutSeaVersion(s.ships),old.ships);assert.equal(s.automation.spent,old.automation.spent);assert.equal(s.world.graceUntil,old.day+60);
  for(const [id,m]of Object.entries(old.markets))for(const [good,value]of Object.entries(m))assert.deepEqual(s.markets[id][good],value);
  const map=new Map([[SAVE_KEYS.autoV4,raw]]),storage={getItem:k=>map.get(k)??null,setItem:(k,v)=>map.set(k,v)};assert.ok(listSaves(storage).find(x=>x.slot==='autoV4').valid);saveGame(storage,s);assert.equal(map.get(SAVE_KEYS.autoV4),raw);assert.deepEqual(deserialize(serialize(s)),s);
});
test('corrupt security saves and invalid settings are rejected',()=>{
  const {s}=sailing();for(const corrupt of [x=>x.world.rng=-1,x=>x.ships[0].voyage.lostCost=-1,x=>x.world.events.push({kind:'war',day:99,a:'england',b:'spain'}),x=>x.world.pairs[1]=x.world.pairs[0],x=>x.diplomacy.friendship.spain=-1,x=>x.diplomacy.investment.spain=-1,x=>x.routes[0].escorts=9,x=>x.routes[0].pendingReplacements=['unknown'],x=>x.incidents.push({day:0,kind:'<img>'}),x=>x.automation.replaceLost=1]){const raw=JSON.parse(serialize(s));corrupt(raw);assert.throws(()=>deserialize(JSON.stringify(raw)));}
});
test('buyout keeps shared diplomacy world and merged replacement claims without duplicating assets',()=>{
  const s=funded();for(const n of ['france','netherlands'])buyLicense(s,n);const r=openCircuit(s,'sloop',['nantes','amsterdam']),c=s.competitors[0];tick(s);const rv=c.ships[0];resolveAttack(c,c.routes[0],rv,0,0);const price=acquisitionQuote(s,0).price,before=assets(s),targetAssets=assets(c);acquireCompany(s,0);
  near(assets(s),before-price+targetAssets);assert.equal(s.routes.find(v=>v.id===r.id).pendingReplacements.length,1);assert.ok(s.competitors.every(c=>c.world===s.world));assert.deepEqual(deserialize(serialize(s)),s);
});
test('P4 UI is localized and exposes risk, mitigation, safety margins and event details',()=>{
  const {s,r,v}=sailing();resolveAttack(s,r,v,1,1);setLanguage('en');const fmt={cash:String,decimal:String},html=renderDiplomacy(s,fmt)+routeProtection(s,r,fmt)+renderNotices(s);assert.doesNotMatch(html,/[\u3000-\u9fff]/);assert.match(html,/Revocation margin/);assert.match(html,/Maximum raid chance/);assert.match(html,/Raid \/ cargo loss/);setLanguage('ja');
});
test('full P4 survives ten years across seeds and yearly restores reproduce wars, losses and accounts',()=>{
  for(const seed of [1,42,1700]){
    let s=createGame(seed);buyLicense(s,'spain');const r=openCircuit(s,'sloop',['kingston','havana']);setEscort(s,r.id,1);automation(s,{monthlyBudget:5200,minCash:1500});
    for(let i=0;i<3650;i++){
      tick(s);assert.equal(s.gameOver,false,`bankrupt seed ${seed} day ${s.day}`);assert.ok(s.automation.spent<=s.automation.monthlyBudget);
      if(i%365===0){const copy=deserialize(serialize(s));tick(s);tick(copy);assert.deepEqual(copy,s);s=copy;i++;}
    }
    assert.equal(s.day,3650);assert.ok(s.world.events.some(e=>e.kind==='war'));assert.ok(s.incidents.some(e=>['raided','shipLost'].includes(e.kind)));near(s.initialCash+Object.values(s.totals).reduce((a,b)=>a+b,0),s.cash);
  }
});

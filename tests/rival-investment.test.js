import test from 'node:test';
import assert from 'node:assert/strict';
import {createGame,entry,openCircuit,buyLicense,tick,serialize,deserialize} from '../src/engine.js';
import {runCompetitor,acquireCompany} from '../src/management.js';
import {advanceIndustry,industryDaily,buyDevelopmentRight,marketFactors} from '../src/industry.js';
import {buyRoadRight,roadDays} from '../src/land.js';
import {advanceDiplomacy} from '../src/security.js';
import {INVESTMENT_POLICY,rivalInvestmentBudget,planRivalInvestment,guardRivalInvestment} from '../src/rival-investment.js';
import {renderRivalInvestment} from '../src/rival-investment-view.js';
import {setLanguage,LANGUAGES} from '../src/i18n.js';

const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-6,`${a} != ${b}`);
// Accelerated profit/cash observations isolate decision boundaries, not game balance.
function prepared(index=0){
 const s=createGame(42,{events:false}),c=s.competitors[index];
 entry(c,'sale',1e6);if(!c.licenses.includes('france'))buyLicense(c,'france');
 openCircuit(c,'wagon',['nantes','paris']);
 for(const company of [s,...s.competitors])company.day=60;
 for(const r of c.routes)r.transport={since:0,sales:60000,costs:6000,upkeep:600,deliveries:10};
 return {s,c};
}
const owned=(s,c,key)=>Object.entries(s.world[key]).filter(([,d])=>d.owner===c.industry.id);

test('profitable rivals buy only used rights within their size limits and pay real costs',()=>{
 for(const index of [0,1]){
  const {s,c}=prepared(index),policy=INVESTMENT_POLICY[c.strategy.kind],before=c.cash;
  planRivalInvestment(c);
  assert.equal(owned(s,c,'development').length+owned(s,c,'roads').length,1);
  const purchase=c.ledger.filter(e=>['developmentPurchase','roadPurchase'].includes(e.category)).at(-1);
  near(c.cash,before+purchase.amount);assert.ok(c.cash>=rivalInvestmentBudget(c).reserve);
  for(let i=0;i<10;i++)planRivalInvestment(c);
  assert.ok(owned(s,c,'development').length<=policy.cities);
  assert.ok(owned(s,c,'roads').length<=policy.roads);
  assert.ok(owned(s,c,'roads').some(([id])=>id==='nantes_paris'));
  for(const [id]of owned(s,c,'development'))assert.ok(c.routes.some(r=>r.stops.includes(id)));
  assert.ok(industryDaily(c)>0&&industryDaily(c)<=policy.daily+1e-9);
  assert.ok(c.industry.investment.seafaring>0&&c.industry.investment.land>0);
  assert.deepEqual(deserialize(serialize(s)),s);
 }
});

test('rival investments debit their own accounts and improve shared cities and roads',()=>{
 const {s,c}=prepared();for(let i=0;i<5;i++)planRivalInvestment(c);
 const [city]=owned(s,c,'development')[0],d=s.world.development[city],road=s.world.roads.nantes_paris;
 const before={cash:c.cash,playerCash:s.cash,size:d.size,quality:road.quality,demand:marketFactors(s,city,'food').demand,days:roadDays(s,'wagon','nantes','paris')};
 const daily=industryDaily(c);advanceIndustry(c);
 const income=(c.totals.developmentIncome??0)+(c.totals.roadIncome??0);
 near(c.cash,before.cash-daily+income);assert.equal(s.cash,before.playerCash);
 assert.ok(d.size>before.size&&road.quality>before.quality);
 assert.ok(c.industry.technology.land>0&&c.industry.technology.seafaring>0);
 assert.ok(marketFactors(s,city,'food').demand>before.demand);
 assert.ok(roadDays(s,'wagon','nantes','paris')<=before.days);
 assert.strictEqual(c.world,s.world);assert.deepEqual(deserialize(serialize(s)),s);
});

test('cash reserve and unprofitable or insufficient observations prevent investments',()=>{
 for(const situation of ['cash','loss','young','noDeliveries']){
  const {s,c}=prepared();
  if(situation==='cash')entry(c,'purchase',rivalInvestmentBudget(c).reserve-c.cash);
  for(const r of c.routes){if(situation==='loss')r.transport.sales=0;if(situation==='young')r.transport.since=45;if(situation==='noDeliveries')r.transport.deliveries=0;}
  const before=c.cash;planRivalInvestment(c);
  assert.equal(industryDaily(c),0);assert.equal(c.cash,before);
  assert.equal(owned(s,c,'development').length+owned(s,c,'roads').length,0);
 }
});

test('daily guard scales or pauses before spending, and never modifies player settings',()=>{
 const {s,c}=prepared();planRivalInvestment(c);
 const reserve=rivalInvestmentBudget(c).reserve;
 entry(c,'purchase',reserve+180-c.cash);guardRivalInvestment(c);
 assert.ok(industryDaily(c)<=1);assert.ok(industryDaily(c)>0);
 entry(c,'purchase',reserve-c.cash);const before=c.cash;guardRivalInvestment(c);
 assert.equal(industryDaily(c),0);advanceIndustry(c);assert.ok(c.cash>=before);
 assert.equal(c.industry.log.at(-1).kind,'skipped');
 s.industry.investment.seafaring=100;guardRivalInvestment(s);planRivalInvestment(s);assert.equal(s.industry.investment.seafaring,100);
 // Exercise actual tick ordering: plans remain paused until a future month.
 c.strategy.lastMonth='1700-03';c.industry.investment.seafaring=18;
 const technology=c.industry.technology.seafaring;tick(c,{updateMarkets:false,runCompetitors:false});
 assert.equal(c.industry.technology.seafaring,technology);
});

test('rivals leave player and other companies rights intact',()=>{
 const {s,c}=prepared();entry(s,'sale',1e6);buyLicense(s,'france');buyLicense(s,'netherlands');
 for(const id of new Set(c.routes.flatMap(r=>r.stops)))buyDevelopmentRight(s,id);
 const other=s.competitors[1];entry(other,'sale',1e6);buyLicense(other,'france');buyRoadRight(s,'nantes_paris',other);
 const before=structuredClone(s.world),playerCash=s.cash,otherCash=other.cash;
 planRivalInvestment(c);
 assert.deepEqual(s.world,before);assert.equal(s.cash,playerCash);assert.equal(other.cash,otherCash);
 assert.equal(owned(s,c,'development').length+owned(s,c,'roads').length,0);
 assert.ok(c.industry.investment.seafaring>0);
});

test('sub-cent rounding noise does not unnecessarily reduce a funded daily budget',()=>{
 const {c}=prepared();c.industry.investment.seafaring=18.000000000000004;
 assert.equal(rivalInvestmentBudget(c).daily,18);guardRivalInvestment(c);
 assert.equal(c.industry.investment.seafaring,18.000000000000004);
});

test('monthly reassessment stops abandoned services and does not run twice in one month',()=>{
 const {s,c}=prepared();runCompetitor(c);const before=serialize(s);runCompetitor(c);assert.equal(serialize(s),before);
 for(const r of c.routes)r.active=false;planRivalInvestment(c);assert.equal(industryDaily(c),0);
});

test('rights acquired by AI transfer with budgets stopped and survive confiscation/save validation',()=>{
 const {s,c}=prepared();for(let i=0;i<5;i++)planRivalInvestment(c);
 const cities=owned(s,c,'development').map(([id])=>id),roads=owned(s,c,'roads').map(([id])=>id);
 const confiscated=deserialize(serialize(s)),rival=confiscated.competitors[0];
 confiscated.world.enabled=true;rival.diplomacy.friendship.france=19;advanceDiplomacy(rival);
 assert.equal(confiscated.world.roads.nantes_paris.owner,'state');assert.equal(confiscated.world.roads.nantes_paris.dailyRoad,0);
 assert.doesNotThrow(()=>deserialize(serialize(confiscated)));
 entry(s,'sale',3e6);acquireCompany(s,0);
 for(const id of cities){assert.equal(s.world.development[id].owner,'player');assert.equal(s.world.development[id].dailySize+s.world.development[id].dailyProduction,0);}
 for(const id of roads){assert.equal(s.world.roads[id].owner,'player');assert.equal(s.world.roads[id].dailyRoad+s.world.roads[id].dailySecurity,0);}
 assert.deepEqual(deserialize(serialize(s)),s);
});

test('three natural simulation years produce bounded investment and deterministic restored progress',()=>{
 const s=createGame(42,{events:false});for(let i=0;i<730;i++)tick(s);
 const copy=deserialize(serialize(s));for(let i=0;i<365;i++){tick(s);tick(copy);}
 assert.deepEqual(copy,s);
 for(const c of s.competitors){
  const policy=INVESTMENT_POLICY[c.strategy.kind];
  assert.ok(c.industry.technology.seafaring>0&&c.industry.technology.land>0);
  assert.ok(owned(s,c,'development').length>0&&owned(s,c,'development').length<=policy.cities);
  assert.ok(owned(s,c,'roads').length>0&&owned(s,c,'roads').length<=policy.roads);
  assert.ok(c.routes.length<=50&&industryDaily(c)<=policy.daily+1e-9);
 }
});

test('investment details show owned cities, roads, budgets and technology in six locales without mutation',()=>{
 const {s,c}=prepared();for(let i=0;i<5;i++)planRivalInvestment(c);advanceIndustry(c);const before=serialize(s);
 for(const lang of Object.keys(LANGUAGES)){
  setLanguage(lang);const html=renderRivalInvestment(c,{cash:n=>String(n)});
  assert.match(html,/Nantes.*Paris/);assert.doesNotMatch(html,/undefined|NaN|\uFFFD|\[object Object\]/);
  if(!['en','ja'].includes(lang))assert.doesNotMatch(html,/Competitor investment|Seafaring technology/);
  assert.equal(serialize(s),before);
 }setLanguage('ja');
});

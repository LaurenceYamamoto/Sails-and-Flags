import {withoutSeaVersion} from './baseline.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import {createGame,buyLicense,buyShip,openCircuit,tick,serialize,deserialize,assets,trade,routeSchedule,assignShip} from '../src/engine.js';
import {setAutomation,runAutomation,setRouteAutomationShip,acquireCompany,acquisitionQuote} from '../src/management.js';
import {resolveAttack,runReplacements,advanceDiplomacy} from '../src/security.js';
import {initializeIndustry,shipSpec,shipDaily,sailingDays,designQuote,researchDesign,buyShipyard,setTechnologyInvestment,advanceIndustry,developmentQuote,buyDevelopmentRight,setCityInvestment,marketFactors,recordCityTax,rightsAssets} from '../src/industry.js';
import {renderIndustry,renderDevelopment} from '../src/industry-view.js';
import {renderRoutes} from '../src/routes-view.js';
import {setLanguage} from '../src/i18n.js';
import * as old from '../src/legacy/engine-v5.js';
import {SAVE_KEYS,saveGame,listSaves} from '../src/storage.js';
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-6,`${a} != ${b}`);
function funded(seed=1700,events=false){const s=createGame(seed,{events});trade(s,'kingston','food',100000,'sell');return s;}
function prepared(){const s=funded();s.industry.technology.shipbuilding=30;buyShipyard(s);buyLicense(s,'spain');return s;}
const settings={cargo:500,speed:800,guns:300,range:400,upkeep:600};
test('technology starts at zero, accepts uncapped finite investments and provides diminishing affordable progress',()=>{
 const a=funded(),b=deserialize(serialize(a));assert.equal(a.industry.technology.shipbuilding,0);assert.throws(()=>buyShipyard(a));assert.throws(()=>researchDesign(a,'sloop',settings));
 setTechnologyInvestment(a,'shipbuilding',100);setTechnologyInvestment(b,'shipbuilding',400);const before=assets(a);advanceIndustry(a);advanceIndustry(b);near(b.industry.technology.shipbuilding,2*a.industry.technology.shipbuilding);near(assets(a),before-100);
 setTechnologyInvestment(a,'shipbuilding',1e13);const raw=serialize(a);advanceIndustry(a);assert.equal(a.cash,JSON.parse(raw).cash);setTechnologyInvestment(a,'shipbuilding',0);const level=a.industry.technology.shipbuilding;advanceIndustry(a);assert.equal(a.industry.technology.shipbuilding,level);
 assert.throws(()=>setTechnologyInvestment(a,'seafaring',Infinity));assert.throws(()=>setTechnologyInvestment(a,'seafaring',-1));
});
test('design research has hull gates, continuous soft caps and competing capacity, speed, guns and operating cost',()=>{
 const s=prepared(),base=designQuote(s,'sloop',{cargo:0,speed:0,guns:0,range:0,upkeep:0}),cargo=designQuote(s,'sloop',{cargo:3600,speed:0,guns:0,range:0,upkeep:0}),speed=designQuote(s,'sloop',{cargo:0,speed:3600,guns:0,range:0,upkeep:0}),guns=designQuote(s,'sloop',{cargo:0,speed:0,guns:3600,range:0,upkeep:0});
 assert.ok(cargo.spec.capacity>base.spec.capacity&&cargo.spec.speed<base.spec.speed);assert.ok(speed.spec.speed>base.spec.speed&&speed.spec.capacity<base.spec.capacity);assert.ok(guns.spec.guns>base.spec.guns&&guns.spec.capacity<base.spec.capacity);assert.ok(guns.spec.daily>base.spec.daily);
 const soft=designQuote(s,'sloop',{cargo:1e6,speed:0,guns:0,range:0,upkeep:0});assert.ok(soft.spec.capacity<base.spec.capacity*2);assert.ok(designQuote(s,'sloop',{cargo:0,speed:810,guns:0,range:0,upkeep:0}).spec.speed>designQuote(s,'sloop',{cargo:0,speed:800,guns:0,range:0,upkeep:0}).spec.speed);
 s.industry.technology.shipbuilding=29;assert.throws(()=>researchDesign(s,'corvette',settings));s.industry.technology.shipbuilding=30;assert.ok(researchDesign(s,'corvette',settings));
});
test('researched ships open and run a circuit, freeze their specifications and survive in-transit saves',()=>{
 const s=prepared(),before=assets(s),researchCost=designQuote(s,'brig',settings).researchCost,id=researchDesign(s,'brig',settings),spec=structuredClone(shipSpec(s,id));near(assets(s),before-researchCost);const r=openCircuit(s,id,['kingston','havana']);near(assets(s),before-researchCost);assert.equal(s.ships[0].type,id);assert.equal(routeSchedule(s,r).cycle,2*(sailingDays(s,id,'kingston','havana')+1));
 tick(s);assert.ok(s.ships[0].voyage);s.industry.technology.shipbuilding=60;assert.deepEqual(shipSpec(s,id),spec);const copy=deserialize(serialize(s));for(let i=0;i<30;i++){tick(s);tick(copy);}assert.deepEqual(copy,s);assert.ok(r.deliveries>0);
});
test('automation and lost-ship replacement use the researched design and shared budget',()=>{
 const s=prepared(),id=researchDesign(s,'sloop',settings),r=openCircuit(s,id,['kingston','havana']);setRouteAutomationShip(s,r.id,id);tick(s);resolveAttack(s,r,s.ships[0],0,0);assert.deepEqual(r.pendingReplacements,[id]);
 setAutomation(s,{enabled:true,replaceLost:true,monthlyBudget:shipSpec(s,id).price,minCash:0,expandThreshold:25,shrinkThreshold:0});runReplacements(s);assert.equal(s.ships[0].type,id);assert.equal(s.automation.spent,shipSpec(s,id).price);assert.deepEqual(deserialize(serialize(s)),s);
 s.day=50;for(const c of s.competitors)c.day=50;r.transport={since:0,sales:5000,costs:100,upkeep:0,deliveries:2};runAutomation(s);assert.ok(s.ships.every(v=>v.type===id));
});
test('seafaring technology lowers actual upkeep without changing existing ship speed or asset value',()=>{
 const s=funded(),v=buyShip(s,'sloop'),before=assets(s);s.industry.technology.seafaring=50;near(shipDaily(s,v.type),2.625);tick(s);near(s.totals.upkeep,-2.625);assert.equal(shipSpec(s,v.type).speed,150);assert.ok(assets(s)<before);
});
test('rights acquired from state and prior owners use distinct prices and conserve intercompany cash',()=>{
 const s=funded();buyLicense(s,'spain');assert.equal(developmentQuote(s,'kingston').cost,2000);assert.equal(developmentQuote(s,'havana').cost,3000);const before=assets(s);buyDevelopmentRight(s,'kingston');near(assets(s),before);assert.equal(rightsAssets(s),2000);
 const c=s.competitors[0];buyDevelopmentRight(s,'nantes',c);buyLicense(s,'france');const total=s.cash+c.cash,q=developmentQuote(s,'nantes');buyDevelopmentRight(s,'nantes');near(s.cash+c.cash,total);assert.equal(c.totals.developmentSale,q.cost);assert.equal(s.world.development.nantes.owner,'player');assert.deepEqual(deserialize(serialize(s)),s);
});
test('city investment grows without supplies and changes demand and local-specialty production with smaller European effects',()=>{
 const s=funded();buyDevelopmentRight(s,'kingston');for(const m of Object.values(s.markets.kingston))m.stock=0;setCityInvestment(s,'kingston',100,100);const before=assets(s);advanceIndustry(s);const d=s.world.development.kingston;assert.ok(d.size>0&&d.production>0);near(assets(s),before-200+.15);assert.ok(marketFactors(s,'kingston','rum').production>marketFactors(s,'kingston','cloth').production);assert.ok(marketFactors(s,'kingston','rum').demand>1);
 Object.assign(s.world.development.london,{size:d.size,production:d.production});assert.ok(marketFactors(s,'kingston','rum').demand>marketFactors(s,'london','rum').demand);setCityInvestment(s,'kingston',0,0);const level=d.size;advanceIndustry(s);assert.equal(d.size,level);
});
test('city tax income is small plus a share of real transaction tax, with no duplicate collection after restore',()=>{
 const s=funded();buyDevelopmentRight(s,'kingston');const before=s.cash;const tx=trade(s,'kingston','rum',10,'sell'),tax=-s.ledger.at(-1).amount;near(s.world.development.kingston.taxPool,tax*.15);const copy=deserialize(serialize(s));advanceIndustry(s);advanceIndustry(copy);assert.deepEqual(copy,s);near(s.cash,before+tx.total+.15+tax*.15);const cash=s.cash;advanceIndustry(s);near(s.cash,cash+.15);
});
test('revocation confiscates rights and development without paying compensation or losing shipyard assets',()=>{
 const s=prepared();s.world.enabled=true;buyDevelopmentRight(s,'havana');setCityInvestment(s,'havana',25,25);advanceIndustry(s);const before=s.cash,valued=s.world.development.havana.basis;s.diplomacy.friendship.spain=19;advanceDiplomacy(s);assert.equal(s.cash,before);assert.equal(s.world.development.havana.owner,'state');assert.equal(s.world.development.havana.invested,0);assert.equal(s.world.development.havana.dailySize,0);assert.equal(rightsAssets(s),4000);assert.ok(s.industry.log.some(e=>e.kind==='confiscated'&&e.cost>=valued));assert.deepEqual(deserialize(serialize(s)),s);
});
test('acquisition transfers rights, investments, shipyard and designs with in-flight ships and unique design ids',()=>{
 const s=prepared(),c=s.competitors[0];c.industry.technology.shipbuilding=10;buyShipyard(c);const id=researchDesign(c,'sloop',settings);buyDevelopmentRight(s,'nantes',c);setCityInvestment(c,'nantes',1,2);buyLicense(c,'england');const r=openCircuit(c,id,['nantes','london']);tick(s);assert.ok(c.ships.find(v=>v.type===id).voyage);const before=assets(s),target=assets(c),q=acquisitionQuote(s,0);acquireCompany(s,0);near(assets(s),before-q.price-q.licenseCost+target);assert.ok(s.industry.designIds.includes(id));assert.ok(s.industry.shipyard);assert.equal(s.world.development.nantes.owner,'player');assert.equal(s.world.development.nantes.dailySize,0);assert.ok(s.ships.find(v=>v.type===id).voyage);assert.deepEqual(deserialize(serialize(s)),s);
});
test('v5 migration preserves voyages, random streams, diplomacy and legacy slots without resetting the world',()=>{
 const legacy=old.createGame();old.buyLicense(legacy,'spain');old.openCircuit(legacy,'sloop',['kingston','havana']);old.tick(legacy);const raw=old.serialize(legacy),s=deserialize(raw);assert.equal(s.version,10);assert.equal(s.cash,legacy.cash);assert.deepEqual(withoutSeaVersion(s.ships),legacy.ships);assert.equal(s.world.rng,legacy.world.rng);assert.equal(s.world.graceUntil,legacy.world.graceUntil);for(const key of Object.keys(legacy.diplomacy))assert.deepEqual(Object.fromEntries(Object.keys(legacy.diplomacy[key]).map(n=>[n,s.diplomacy[key][n]])),legacy.diplomacy[key]);assert.equal(s.industry.technology.shipbuilding,0);
 const map=new Map([[SAVE_KEYS.manual,serialize(s)],[SAVE_KEYS.v5,raw]]),storage={getItem:k=>map.get(k)??null,setItem:(k,v)=>map.set(k,v)};saveGame(storage,s);assert.equal(map.get(SAVE_KEYS.v5),raw);assert.ok(listSaves(storage).some(x=>x.slot==='v5'&&x.valid));assert.deepEqual(deserialize(serialize(s)),s);
});
test('invalid industry saves and unaffordable research/right acquisition leave live state intact',()=>{
 const s=prepared(),id=researchDesign(s,'sloop',settings);for(const corrupt of [x=>x.industry.technology.shipbuilding=-1,x=>x.world.designs[id].spec.capacity+=100,x=>x.industry.designIds.push('missing'),x=>x.world.development.kingston.owner='missing',x=>x.world.development.kingston.dailySize=-1,x=>x.world.nextDesign=0]){const copy=JSON.parse(serialize(s));corrupt(copy);assert.throws(()=>deserialize(JSON.stringify(copy)));}
 const low=createGame(),before=serialize(low);assert.throws(()=>researchDesign(low,'sloop',settings));assert.throws(()=>buyDevelopmentRight(low,'nantes'));assert.equal(serialize(low),before);
});
test('P5 renders localized technology, design, city and custom-fleet controls without changing state',()=>{
 const s=prepared(),id=researchDesign(s,'sloop',settings);openCircuit(s,id,['kingston','havana']);buyDevelopmentRight(s,'kingston');const before=serialize(s);setLanguage('en');const fmt={cash:String,decimal:String,signed:String,tone:()=>''},html=renderIndustry(s,fmt)+renderDevelopment(s,'kingston',fmt)+renderRoutes(s,fmt);assert.doesNotMatch(html,/[\u3000-\u9fff]/);assert.doesNotMatch(html,/<form[^>]*data-city=/);assert.match(html,/data-development-city=/);assert.match(html,/Research this design/);assert.match(html,/Sloop design/);assert.equal(serialize(s),before);setLanguage('ja');
});

test('P5 investment, custom ships and development run for ten years across seeds with yearly deterministic restoration',()=>{
 for(const seed of [1,42,1700]){
  let s=createGame(seed);buyLicense(s,'spain');openCircuit(s,'sloop',['kingston','havana']);setTechnologyInvestment(s,'shipbuilding',6);setTechnologyInvestment(s,'seafaring',2);
  let built=false,developed=false;
  for(let day=0;day<3650;day++){
   tick(s);assert.equal(s.gameOver,false,`seed ${seed} day ${s.day}`);
   if(!s.industry.shipyard&&s.industry.technology.shipbuilding>=5&&s.cash>14000)buyShipyard(s);
   if(s.industry.shipyard&&!built&&s.cash>18000){const id=researchDesign(s,'sloop',settings);assignShip(s,s.routes[0].id,buyShip(s,id).id);built=true;}
   if(!developed&&s.cash>22000){buyDevelopmentRight(s,'kingston');setCityInvestment(s,'kingston',1,1);developed=true;}
   if(day%365===0){const copy=deserialize(serialize(s));tick(s);tick(copy);assert.deepEqual(copy,s);s=copy;day++;}
  }
  assert.equal(s.day,3650);assert.ok(built&&developed);assert.ok(s.industry.technology.shipbuilding>5);assert.ok(s.world.development.kingston.size>0);near(s.initialCash+Object.values(s.totals).reduce((a,b)=>a+b,0),s.cash);assert.deepEqual(deserialize(serialize(s)),s);
 }
});
test('ten-year city-only income and investment do not outperform active trading from equal starting capital',()=>{
 const passive=createGame(42),active=createGame(42);buyDevelopmentRight(passive,'kingston');setCityInvestment(passive,'kingston',.25,0);buyLicense(active,'spain');openCircuit(active,'sloop',['kingston','havana']);
 for(let i=0;i<3650;i++){tick(passive);tick(active);}assert.ok(!passive.gameOver&&!active.gameOver);assert.ok(assets(active)>assets(passive)*2);assert.ok(passive.totals.developmentIncome<active.totals.sale+active.totals.purchase);console.log(JSON.stringify({passiveAssets:assets(passive),activeAssets:assets(active),passiveIncome:passive.totals.developmentIncome}));
});
